// Edge Function: publicar-facebook-jokar
// Publica fotos + legenda de um veículo na Página do Facebook da empresa (Graph API).
// O token da Meta fica SOMENTE nos Secrets do Supabase; nunca no site.
//
// Entrada (POST JSON, com Authorization: Bearer <token do usuário logado>):
//   { produto_id: string, foto_indices: number[1..10], legenda: string, request_id: uuid }
// Saída:
//   { ok: true, post_id, post_url, aviso? }  |  { ok: false, error }
//
// Secrets necessários (Supabase > Edge Functions > Secrets):
//   META_JOKAR_PAGE_ID, META_JOKAR_PAGE_TOKEN
//   (opcional) META_LEAL_PAGE_ID, META_LEAL_PAGE_TOKEN
//   (opcional) META_GRAPH_VERSION   padrão v25.0
//   (opcional) ALLOWED_ORIGINS      padrão https://jndjoao.github.io  (separar por vírgula)
// SUPABASE_URL, SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY já são fornecidos pelo Supabase.

import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const BUCKET = "veiculos-jokar";
const MAX_FOTO_BYTES = 10 * 1024 * 1024;
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

async function graphPost(path: string, form: FormData): Promise<string> {
  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${path}`, { method: "POST", body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.id) {
    const err = data?.error || {};
    // Mensagem original da Meta (sem o token) ajuda a diagnosticar a causa exata.
    const detalhe = " [Meta " + (err.code ?? res.status) + (err.error_subcode ? "/" + err.error_subcode : "") + ": " +
      String(err.message || "erro HTTP " + res.status).replace(/EAA[A-Za-z0-9]+/g, "[TOKEN]").slice(0, 300) + "]";
    if (err.code === 190) throw new MetaError("Token da Página expirado ou inválido. Gere um novo Page Token e atualize o Secret no Supabase." + detalhe);
    if (err.code === 10 || err.code === 200) throw new MetaError("O token não tem permissão para publicar na Página (pages_manage_posts)." + detalhe);
    throw new MetaError("Falha na Meta." + detalhe);
  }
  return String(data.id);
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

  // 2. Validação da entrada
  let input: Record<string, unknown>;
  try { input = await req.json(); } catch { return reply({ ok: false, error: "JSON inválido" }, 400); }
  const produtoId = String(input.produto_id ?? "").trim();
  const requestId = String(input.request_id ?? "");
  const legenda = String(input.legenda ?? "").trim();
  const fotos = input.foto_indices;
  if (!produtoId || produtoId.length > 64 || !UUID_RE.test(requestId) ||
      !Array.isArray(fotos) || fotos.length < 1 || fotos.length > 10 ||
      fotos.some((s) => !Number.isInteger(s) || s < 1 || s > 10) || new Set(fotos).size !== fotos.length ||
      legenda.length < 5 || legenda.length > 5000) {
    return reply({ ok: false, error: "Dados da publicação inválidos" }, 400);
  }
  const slots = fotos as number[];

  // 3. Veículo lido do banco (não confiar no navegador)
  const admin = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } });
  const campos = ["id", "empresa", "status", ...Array.from({ length: 10 }, (_, i) => "foto_" + (i + 1))].join(",");
  const veiculo = await admin.from("produtos").select(campos).eq("id", produtoId).maybeSingle();
  if (veiculo.error || !veiculo.data) return reply({ ok: false, error: "Veículo não encontrado" }, 404);
  const v = veiculo.data as Record<string, any>;
  if (v.status !== "disponivel") return reply({ ok: false, error: "Veículo não está disponível" }, 409);
  const caminhos = slots.map((s) => v["foto_" + s] as string | null);
  if (caminhos.some((c) => !c)) return reply({ ok: false, error: "Uma das fotos selecionadas não existe mais no cadastro" }, 400);

  const prefixo = v.empresa === "jokar" ? "META_JOKAR" : v.empresa === "leal" ? "META_LEAL" : null;
  const pageId = prefixo ? Deno.env.get(prefixo + "_PAGE_ID") : null;
  const pageToken = prefixo ? Deno.env.get(prefixo + "_PAGE_TOKEN") : null;
  if (!pageId || !/^\d+$/.test(pageId) || !pageToken) {
    return reply({ ok: false, error: "A Página do Facebook da empresa '" + v.empresa + "' ainda não foi configurada no Supabase" }, 503);
  }

  // 4. Reserva no banco ANTES de chamar a Meta (trava contra duplicidade)
  const reserva = await userClient.rpc("facebook_reservar_publicacao", {
    p_request_id: requestId, p_produto_id: produtoId, p_foto_indices: slots, p_legenda: legenda,
  });
  if (reserva.error) return reply({ ok: false, error: reserva.error.message }, 409);
  const r = reserva.data as { reservado: boolean; id: string; status?: string; facebook_post_id?: string };
  if (!r.reservado) {
    if (r.status === "publicado" && r.facebook_post_id) {
      return reply({ ok: true, post_id: r.facebook_post_id, post_url: "https://www.facebook.com/" + r.facebook_post_id,
        aviso: "Este pedido já tinha sido publicado; nada foi enviado de novo." });
    }
    return reply({ ok: false, error: "Este pedido já foi processado (status: " + r.status + "). Verifique o histórico." }, 409);
  }

  // 5. Envio à Meta: fotos não publicadas + um post com todas elas
  let enviandoFeed = false;
  try {
    const mediaIds: string[] = [];
    for (let i = 0; i < slots.length; i++) {
      const arquivo = await admin.storage.from(BUCKET).download(caminhos[i]!);
      if (arquivo.error || !arquivo.data) throw new Error("Não foi possível ler a foto " + slots[i]);
      if (arquivo.data.size > MAX_FOTO_BYTES) throw new Error("Foto " + slots[i] + " é maior que 10 MB");
      const form = new FormData();
      form.set("access_token", pageToken);
      form.set("published", "false");
      form.set("source", arquivo.data, "veiculo-foto-" + slots[i] + ".jpg");
      mediaIds.push(await graphPost(pageId + "/photos", form));
    }

    const post = new FormData();
    post.set("access_token", pageToken);
    post.set("message", legenda);
    mediaIds.forEach((id, i) => post.set(`attached_media[${i}]`, JSON.stringify({ media_fbid: id })));
    enviandoFeed = true;
    const postId = await graphPost(pageId + "/feed", post);

    const salvo = await admin.from("facebook_publicacoes")
      .update({ status: "publicado", facebook_post_id: postId, ultimo_erro: null, atualizado_em: new Date().toISOString() })
      .eq("id", r.id);
    const resposta: Record<string, unknown> = { ok: true, post_id: postId, post_url: "https://www.facebook.com/" + postId };
    if (salvo.error) resposta.aviso = "Post publicado, mas o histórico não foi atualizado. Avise o responsável técnico (id " + r.id + ").";
    return reply(resposta);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    // Erro antes do POST /feed, ou recusa explícita da Meta: nada saiu no feed
    // (fotos com published=false não aparecem) -> libera nova tentativa.
    // Falha de rede DURANTE o POST /feed: o post pode ter saído -> revisão manual.
    const seguro = !enviandoFeed || e instanceof MetaError;
    await admin.from("facebook_publicacoes")
      .update({ status: seguro ? "cancelado" : "revisao", ultimo_erro: msg.slice(0, 1000), atualizado_em: new Date().toISOString() })
      .eq("id", r.id);
    return reply({ ok: false, error: msg + (seguro ? " Nada foi publicado; você pode tentar de novo." :
      " Confira a Página da Jokar antes de tentar de novo (registro em revisão: " + r.id + ").") }, 502);
  }
});
