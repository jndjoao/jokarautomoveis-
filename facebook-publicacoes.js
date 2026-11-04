/* UI de autorização. Publicação real ocorre SOMENTE via Edge Function. */
(function(){
"use strict";
const $=id=>document.getElementById(id);
const sb=window.supabase&&window.CONFIG?window.supabase.createClient(CONFIG.SUPABASE_URL,CONFIG.SUPABASE_KEY):null;
const names={jokar:"Jokar Automóveis",leal:"Leal Veículos"};
const BUCKET="veiculos-jokar";
let cars=[],current=null,photoPaths=[],urls={};
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const money=n=>n==null?"Preço sob consulta":Number(n).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const setStatus=(message,error=false)=>{$("status").textContent=message;$("status").className="card "+(error?"error":"")};
function selected(){return [...document.querySelectorAll('input[data-photo]:checked')].map(x=>Number(x.value)).sort((a,b)=>a-b)}
function captionFor(v){return ["🚗 "+[v.marca,v.modelo].filter(Boolean).join(" ") + (v.ano?" | "+v.ano:""),v.quilometragem!=null?"📍 "+Number(v.quilometragem).toLocaleString("pt-BR")+" km":"",v.cor?"🎨 Cor: "+v.cor:"","💰 "+money(v.valor),"","Confira os detalhes e fale com a "+names[v.empresa]+".", "📲 Chame nossa equipe para saber mais.","","*Disponibilidade e condições sujeitas a confirmação."].filter((x,i)=>x||i===4||i===7).join("\n")}
function preview(){$("preview").textContent=$("caption").value+"\n\n"+selected().length+" foto(s) selecionada(s)";$("photoCount").textContent=selected().length+" foto(s) selecionada(s)";$("publish").disabled=!current||!selected().length||!$("caption").value.trim()||current.status!=="disponivel"}
async function selectCar(){
 current=cars.find(x=>String(x.id)===$("vehicle").value)||null;
 $("photos").replaceChildren();$("result").textContent="";urls={};
 if(!current){$("caption").value="";preview();return}
 photoPaths=Array.from({length:10},(_,i)=>current["foto_"+(i+1)]||null);
 const paths=photoPaths.filter(Boolean);
 if(paths.length){
   const r=await sb.storage.from(BUCKET).createSignedUrls(paths,1800);
   if(r.error){$("result").textContent="Não foi possível carregar as fotos: "+r.error.message;return}
   (r.data||[]).forEach((f,i)=>{if(f&&f.signedUrl)urls[paths[i]]=f.signedUrl});
 }
 photoPaths.forEach((path,i)=>{
   if(!path)return;
   const label=document.createElement("label");label.className="photo";
   const img=document.createElement("img");img.alt="Foto "+(i+1);img.src=urls[path]||"";
   const span=document.createElement("span");
   const input=document.createElement("input");input.type="checkbox";input.value=String(i+1);input.dataset.photo="1";input.checked=true;input.onchange=preview;
   span.append(input,document.createTextNode(" Foto "+(i+1)));
   label.append(img,span);$("photos").append(label);
 });
 if(!paths.length)$("photos").textContent="Veículo sem fotos cadastradas.";
 $("caption").value=captionFor(current);preview();
}
function fill(){
 const company=$("company").value;
 const list=cars.filter(v=>v.empresa===company&&v.status==="disponivel");
 $("vehicle").innerHTML='<option value="">Selecione um veículo</option>'+list.map(v=>'<option value="'+esc(v.id)+'">'+esc([v.marca,v.modelo,v.ano].filter(Boolean).join(" ")||v.nome||v.id)+'</option>').join("");
 selectCar();
}
async function start(){
 if(!sb){setStatus("Configuração do Supabase indisponível.",true);return}
 const session=await sb.auth.getSession();
 if(!session.data?.session){setStatus("Entre no sistema de gestão antes de abrir esta página.",true);return}
 const admin=await sb.rpc("is_admin");
 if(admin.error||admin.data!==true){setStatus("Somente administradores podem autorizar publicações.",true);return}
 const r=await sb.from("produtos").select("id,nome,marca,modelo,ano,quilometragem,cor,valor,status,empresa,foto_1,foto_2,foto_3,foto_4,foto_5,foto_6,foto_7,foto_8,foto_9,foto_10").order("created_at",{ascending:false});
 if(r.error){setStatus("Falha ao carregar veículos: "+r.error.message,true);return}
 cars=r.data||[];setStatus("Prévia disponível. A publicação depende da configuração da Meta e da função segura no Supabase.");
 $("editor").classList.remove("hide");fill();
}
$("company").onchange=fill;
$("vehicle").onchange=selectCar;
$("regenerate").onclick=()=>{if(current){$("caption").value=captionFor(current);preview()}};
$("caption").oninput=preview;
$("publish").onclick=async()=>{
 if(!current||current.status!=="disponivel"||!selected().length)return;
 const company=names[current.empresa];
 if(!confirm("Autorizar publicação de "+(current.nome||current.modelo)+" na página "+company+" com "+selected().length+" foto(s)?"))return;
 $("publish").disabled=true;$("result").textContent="Enviando publicação…";
 try{
  const r=await sb.functions.invoke("facebook-publicar",{body:{vehicle_id:current.id,photo_slots:selected(),message:$("caption").value.trim()}});
  if(r.error)throw Error(r.error.message||"Erro ao chamar a função");
  if(!r.data?.ok)throw Error(r.data?.error||"O Facebook não confirmou a publicação");
  $("result").className="success";$("result").textContent="Publicado na página "+company+". ID: "+r.data.post_id;
 }catch(e){$("result").className="error";$("result").textContent="Publicação não realizada: "+e.message}
 finally{preview()}
};
start().catch(e=>setStatus(e.message,true));
})();