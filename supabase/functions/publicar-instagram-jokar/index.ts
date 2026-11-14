// Edge Function: publicar-instagram-jokar
// Publica fotos + legenda de um veículo no feed do Instagram profissional da Jokar (Graph API).
// As fotos chegam JÁ PREPARADAS pelo navegador do admin (JPEG, proporção aceita pelo Instagram),
// porque o Supabase limita o tempo de CPU de cada chamada. Aqui só há upload temporário e chamadas à Meta.
//
// Entrada (POST multipart/form-data, com Authorization: Bearer <token do usuário logado>):
//   produto_id, request_id (uuid), legenda (até 2200), foto_indices (JSON ex. [1,3]),
//   foto_0 … foto_N (image/jpeg, na mesma ordem de foto_indices)
// Saída:
//   { ok: true, post_id, post_url, aviso? }  |  { ok: false, error }
//
// Secrets (Supabase > Edge Functions > Secrets):
//   META_JOKAR_IG_ID        id da conta profissional do Instagram (instagram_business_account)
//   META_JOKAR_PAGE_TOKEN   Page Token com instagram_basic + instagram_content_publish (o mesmo do Facebook)
//   (opcional) META_GRAPH_VERSION, ALLOWED_ORIGINS

import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const BUCKET = "veiculos-jokar";
const TMP_PREFIX = "instagram-tmp";
const MAX_FOTO_BYTES = 8 * 1024 * 1024; // limite do Instagram para imagens
const GRAPH_VERSION = Deno.env.get("META_GRAPH_VERSION") || "v25.0";
const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") || "https://jndjoao.github.io")
  .split(",").map((s) => s.trim()).filter(Boolean);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

class MetaError extends Error {}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function metaFail(data: any, status: number): never {
  const err = data?.error || {};
  const detalhe = " [Meta " + (err.code ?? status) + (err.error_subcode ? "/" + err.error_subcode : "") + ": " +
    String(err.error_user_msg || err.message || "erro HTTP " + status).replace(/EAA[A-Za-z0-9]+/g, "[TOKEN]").slice(0, 300) + "]";
  if (err.code === 190) throw new MetaError("Token expirado ou inválido. Gere um novo Page Token e atualize o Secret no Supabase." + detalhe);
  if (err.code === 10 || err.code === 200) throw new MetaError("O token não tem permissão para publicar no Instagram (instagram_content_publish)." + detalhe);
  if (err.code === 9 || err.code === 4 || err.code === 32) throw new MetaError("Limite de publicações da Meta atingido. Tente mais tarde." + detalhe);
  throw new MetaError("Falha na Meta." + detalhe);
}

async function graph(method: "GET" | "POST", path: string, token: string, params: Record<string, string> = {}) {
  const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/${path}`);
  let body: URLSearchParams | undefined;
  if (method === "GET") { for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v); url.searchParams.set("access_token", token); }
  else body = new URLSearchParams({ ...params, access_token: token });
  const res = await fetch(url, { method, body });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.error) metaFail(data, res.status);
  return data;
}

// Aguarda o Instagram terminar de baixar/processar o contêiner de mídia.
async function esperarContainer(id: string, token: string) {
  for (let i = 0; i < 20; i++) {
    const s = await graph("GET", id, token, { fields: "status_code,status" });
    if (s.status_code === "FINISHED") return;
    if (s.status_code === "ERROR" || s.status_code === "EXPIRED") {
      throw new MetaError("O Instagram recusou uma das fotos (" + (s.status || s.status_code) + ").");
    }
    await sleep(1500);
  }
  throw new MetaError("O Instagram demorou demais para processar as fotos. Nada foi publicado; tente de novo.");
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req);
  const reply = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return reply({ ok: false, error: "Método não permitido" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRole) return reply({ ok: false, error: "Configuração do Supabase incompleta" }, 503);

  // 1. Usuário autenticado e administrador
  const authHeader = req.headers.get("authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return reply({ ok: false, error: "Autenticação obrigatória" }, 401);
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const user = await userClient.auth.getUser(authHeader.slice(7));
  if (user.error || !user.data.user) return reply({ ok: false, error: "Sessão expirada. Entre novamente na Central." }, 401);
  const isAdmin = await userClient.rpc("is_admin");
  if (isAdmin.error || isAdmin.data !== true) return reply({ ok: false, error: "Apenas administradores podem publicar" }, 403);

  // 2. Entrada
  let form: FormData;
  try { form = await req.formData(); } catch { return reply({ ok: false, error: "Envio inválido" }, 400); }
  const produtoId = String(form.get("produto_id") ?? "").trim();
  const requestId = String(form.get("request_id") ?? "");
  const legenda = String(form.get("legenda") ?? "").trim();
  let slots: number[] = [];
  try { slots = JSON.parse(String(form.get("foto_indices") ?? "[]")); } catch { /* validado abaixo */ }
  if (!produtoId || produtoId.length > 64 || !UUID_RE.test(requestId) ||
      !Array.isArray(slots) || slots.length < 1 || slots.length > 10 ||
      slots.some((s) => !Number.isInteger(s) || s < 1 || s > 10) || new Set(slots).size !== slots.length ||
      legenda.length < 5 || legenda.length > 2200) {
    return reply({ ok: false, error: "Dados da publicação inválidos (a legenda do Instagram aceita até 2.200 caracteres)" }, 400);
  }
  const arquivos: File[] = [];
  for (let i = 0; i < slots.length; i++) {
    const f = form.get("foto_" + i);
    if (!(f instanceof File) || f.type !== "image/jpeg" || f.size < 1000 || f.size > MAX_FOTO_BYTES) {
      return reply({ ok: false, error: "Foto " + slots[i] + " inválida (precisa ser JPEG de até 8 MB)" }, 400);
    }
    arquivos.push(f);
  }

  // 3. Veículo lido do banco
  const admin = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } });
  const campos = ["id", "empresa", "status", ...Array.from({ length: 10 }, (_, i) => "foto_" + (i + 1))].join(",");
  const veiculo = await admin.from("produtos").select(campos).eq("id", produtoId).maybeSingle();
  if (veiculo.error || !veiculo.data) return reply({ ok: false, error: "Veículo não encontrado" }, 404);
  const v = veiculo.data as Record<string, any>;
  if (v.empresa !== "jokar") return reply({ ok: false, error: "Somente veículos da Jokar podem ser publicados no Instagram" }, 400);
  if (v.status !== "disponivel") return reply({ ok: false, error: "Veículo não está disponível" }, 409);
  if (slots.some((s) => !v["foto_" + s])) return reply({ ok: false, error: "Uma das fotos selecionadas não existe mais no cadastro" }, 400);

  const igId = Deno.env.get("META_JOKAR_IG_ID");
  const token = Deno.env.get("META_JOKAR_PAGE_TOKEN");
  if (!igId || !/^\d+$/.test(igId) || !token) {
    return reply({ ok: false, error: "O Instagram da Jokar ainda não foi configurado no Supabase (META_JOKAR_IG_ID)" }, 503);
  }

  // 4. Reserva no banco ANTES de chamar a Meta
  const reserva = await userClient.rpc("facebook_reservar_publicacao", {
    p_request_id: requestId, p_produto_id: produtoId, p_foto_indices: slots, p_legenda: legenda, p_plataforma: "instagram",
  });
  if (reserva.error) return reply({ ok: false, error: reserva.error.message }, 409);
  const r = reserva.data as { reservado: boolean; id: string; status?: string; facebook_post_id?: string };
  if (!r.reservado) {
    if (r.status === "publicado" && r.facebook_post_id) {
      return reply({ ok: true, post_id: r.facebook_post_id, post_url: null,
        aviso: "Este pedido já tinha sido publicado; nada foi enviado de novo." });
    }
    return reply({ ok: false, error: "Este pedido já foi processado (status: " + r.status + "). Verifique o histórico." }, 409);
  }

  // 5. Fotos temporárias (URL assinada para o Instagram baixar) + publicação
  const tmpPaths = arquivos.map((_, i) => `${TMP_PREFIX}/${requestId}/${i + 1}.jpg`);
  let publicando = false;
  try {
    const urls: string[] = [];
    for (let i = 0; i < arquivos.length; i++) {
      const up = await admin.storage.from(BUCKET).upload(tmpPaths[i], arquivos[i], { contentType: "image/jpeg", upsert: true });
      if (up.error) throw new Error("Não foi possível preparar a foto " + slots[i] + " para o Instagram");
      const signed = await admin.storage.from(BUCKET).createSignedUrl(tmpPaths[i], 3600);
      if (signed.error || !signed.data?.signedUrl) throw new Error("Não foi possível gerar o link da foto " + slots[i]);
      urls.push(signed.data.signedUrl);
    }

    let creationId: string;
    if (urls.length === 1) {
      const c = await graph("POST", igId + "/media", token, { image_url: urls[0], caption: legenda });
      creationId = String(c.id);
    } else {
      const filhos: string[] = [];
      for (const url of urls) {
        const c = await graph("POST", igId + "/media", token, { image_url: url, is_carousel_item: "true" });
        filhos.push(String(c.id));
      }
      for (const id of filhos) await esperarContainer(id, token);
      const c = await graph("POST", igId + "/media", token, { media_type: "CAROUSEL", children: filhos.join(","), caption: legenda });
      creationId = String(c.id);
    }
    await esperarContainer(creationId, token);

    publicando = true;
    const pub = await graph("POST", igId + "/media_publish", token, { creation_id: creationId });
    const mediaId = String(pub.id);

    let permalink: string | null = null;
    try { permalink = (await graph("GET", mediaId, token, { fields: "permalink" })).permalink || null; } catch { /* opcional */ }

    const salvo = await admin.from("facebook_publicacoes")
      .update({ status: "publicado", facebook_post_id: mediaId, ultimo_erro: null, atualizado_em: new Date().toISOString() })
      .eq("id", r.id);
    const resposta: Record<string, unknown> = { ok: true, post_id: mediaId, post_url: permalink };
    if (salvo.error) resposta.aviso = "Post publicado, mas o histórico não foi atualizado (id " + r.id + ").";
    return reply(resposta);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    // Antes do media_publish (ou recusa explícita da Meta): nada saiu no feed -> libera nova tentativa.
    // Falha de rede DURANTE o media_publish: o post pode ter saído -> revisão manual.
    const seguro = !publicando || e instanceof MetaError;
    await admin.from("facebook_publicacoes")
      .update({ status: seguro ? "cancelado" : "revisao", ultimo_erro: msg.slice(0, 1000), atualizado_em: new Date().toISOString() })
      .eq("id", r.id);
    return reply({ ok: false, error: msg + (seguro ? " Nada foi publicado no Instagram; você pode tentar de novo." :
      " Confira o Instagram da Jokar antes de tentar de novo (registro em revisão: " + r.id + ").") }, 502);
  } finally {
    // As fotos temporárias não são mais necessárias depois da publicação (ou da falha).
    await admin.storage.from(BUCKET).remove(tmpPaths).catch(() => {});
  }
});
