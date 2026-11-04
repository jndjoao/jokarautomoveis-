import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors = { "Access-Control-Allow-Origin": "https://jndjoao.github.io", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const graphVersion = Deno.env.get("META_GRAPH_VERSION") || "v25.0";
const photoField = (slot: number) => "foto_" + slot;
async function graph(path: string, form: FormData) {
  const res = await fetch("https://graph.facebook.com/" + graphVersion + "/" + path, { method:"POST", body:form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.id) throw new Error("Meta: " + (data.error?.message || "erro HTTP " + res.status));
  return data.id as string;
}
Deno.serve(async req => {
  if(req.method === "OPTIONS") return new Response(null,{status:204,headers:cors});
  if(req.method !== "POST") return response({ok:false,error:"Método não permitido"},405);
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!supabaseUrl || !anonKey || !serviceRole) return response({ok:false,error:"Configuração do Supabase incompleta"},503);
  const bearer = req.headers.get("authorization") || "";
  if(!bearer.startsWith("Bearer "))return response({ok:false,error:"Autenticação obrigatória"},401);
  const userClient = createClient(supabaseUrl,anonKey,{global:{headers:{Authorization:bearer}},auth:{persistSession:false}});
  const user = await userClient.auth.getUser(bearer.slice(7));
  if(user.error||!user.data.user)return response({ok:false,error:"Sessão inválida"},401);
  const check = await userClient.rpc("is_admin");
  if(check.error||check.data!==true)return response({ok:false,error:"Apenas administradores podem publicar"},403);
  let input:Record<string,unknown>;
  try{input=await req.json()}catch{return response({ok:false,error:"JSON inválido"},400)}
  const vehicleId=String(input.vehicle_id||"");
  const slots=input.photo_slots;
  const message=String(input.message||"").trim();
  if(!/^[0-9a-f]{8}-[0-9a-f-]{27,36}$/i.test(vehicleId) || !Array.isArray(slots) || slots.length<1 || slots.length>10 ||
      slots.some(s=>!Number.isInteger(s)||s<1||s>10) || new Set(slots).size!==slots.length || !message || message.length>5000)
    return response({ok:false,error:"Seleção inválida"},400);
  const admin=createClient(supabaseUrl,serviceRole,{auth:{persistSession:false}});
  const fields=["id","empresa","status",...Array.from({length:10},(_,i)=>photoField(i+1))].join(",");
  const vehicle=await admin.from("produtos").select(fields).eq("id",vehicleId).single();
  if(vehicle.error||!vehicle.data)return response({ok:false,error:"Veículo não encontrado"},404);
  const v=vehicle.data as Record<string,any>;
  if(v.empresa!=="leal"&&v.empresa!=="jokar"||v.status!=="disponivel")return response({ok:false,error:"Veículo indisponível"},409);
  if(slots.some(s=>!v[photoField(s)]))return response({ok:false,error:"Foto selecionada não existe"},400);
  const token=Deno.env.get(v.empresa==="jokar"?"META_JOKAR_PAGE_TOKEN":"META_LEAL_PAGE_TOKEN");
  const pageId=Deno.env.get(v.empresa==="jokar"?"META_JOKAR_PAGE_ID":"META_LEAL_PAGE_ID");
  if(!token || !pageId || !/^\d+$/.test(pageId))return response({ok:false,error:"A página "+v.empresa+" ainda não foi configurada na Meta"},503);
  // Reserva no banco ANTES de qualquer chamada à Meta; nunca repetir automaticamente resultado incerto.
  const claimed=await userClient.rpc("facebook_claim_publicacao",{p_vehicle_id:vehicleId,p_empresa:v.empresa,p_photo_slots:slots,p_message:message});
  if(claimed.error)return response({ok:false,error:claimed.error.message},409);
  if(!claimed.data)return response({ok:false,error:"Publicação existente ou aguardando revisão. Verifique o histórico antes de tentar novamente."},409);
  try{
    const uploaded:string[]=[];
    for(const slot of slots){
      const path=v[photoField(slot)] as string;
      const downloaded=await admin.storage.from("veiculos-jokar").download(path);
      if(downloaded.error||!downloaded.data)throw new Error("Não foi possível ler a foto "+slot);
      const blob=downloaded.data;
      if(blob.size>10*1024*1024)throw new Error("Foto "+slot+" excede 10 MB");
      const form=new FormData();
      form.set("access_token",token);form.set("published","false");
      form.set("source",blob,"veiculo-"+slot+".jpg");
      uploaded.push(await graph(pageId+"/photos",form));
    }
    const post=new FormData();post.set("access_token",token);post.set("message",message);
    uploaded.forEach((id,i)=>post.set("attached_media["+i+"]",JSON.stringify({media_fbid:id})));
    const postId=await graph(pageId+"/feed",post);
    const saved=await admin.from("facebook_publicacoes").update({status:"publicado",facebook_post_id:postId,updated_at:new Date().toISOString(),last_error:null}).eq("vehicle_id",vehicleId).eq("status","enviando");
    if(saved.error)throw new Error("Post enviado, mas o registro local falhou. Confirme na página antes de repetir.");
    return response({ok:true,post_id:postId});
  }catch(e){
    const msg=e instanceof Error?e.message:"Erro desconhecido";
    // Revisão manual obrigatória, inclusive se o envio pode ter sido efetivado pela Meta.
    await admin.from("facebook_publicacoes").update({status:"revisao",last_error:msg.slice(0,1000),updated_at:new Date().toISOString()}).eq("vehicle_id",vehicleId).eq("status","enviando");
    return response({ok:false,error:msg+" Verifique a página e o histórico antes de qualquer nova tentativa."},502);
  }
});
