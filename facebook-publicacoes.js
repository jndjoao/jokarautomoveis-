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
function preview(){$("preview").textContent=$("caption").value+"\n\n"+selected().length+" foto(s) selecionada(s)";$("photoCount").textContent=selected().length+" foto(s) selecionada(s)";$("shareManual").disabled=!current||!selected().length||!$("caption").value.trim();$("downloadSelected").disabled=!current||!selected().length;$("copyCaption").disabled=!$("caption").value.trim()}
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
 cars=r.data||[];setStatus("Modo manual ativo: nenhuma publicação automática será realizada. Escolha um veículo e prepare sua postagem.");
 $("editor").classList.remove("hide");fill();
}
$("company").onchange=fill;
$("vehicle").onchange=selectCar;
$("regenerate").onclick=()=>{if(current){$("caption").value=captionFor(current);preview()}};
$("caption").oninput=preview;
function result(message,error=false){$("result").className=error?"error":"success";$("result").textContent=message}
function getFileName(slot){return "carro-"+String(current?.id||"veiculo").slice(0,8)+"-foto-"+slot+".jpg"}
async function selectedFiles(){
 if(!current)throw Error("Selecione um veículo.");
 const files=[];
 for(const slot of selected()){
   const path=photoPaths[slot-1];
   if(!path)throw Error("Foto "+slot+" não está disponível.");
   // Cria URL assinada no momento da exportação para evitar links expirados.
   const signed=await sb.storage.from(BUCKET).createSignedUrl(path,120);
   if(signed.error||!signed.data?.signedUrl)throw Error("Não foi possível acessar foto "+slot+".");
   const response=await fetch(signed.data.signedUrl);
   if(!response.ok)throw Error("Falha ao obter foto "+slot+".");
   const blob=await response.blob();
   if(!blob.type.startsWith("image/"))throw Error("Formato de foto inválido.");
   files.push(new File([blob],getFileName(slot),{type:blob.type||"image/jpeg"}));
 }
 return files;
}
function saveFile(file){
 const url=URL.createObjectURL(file);
 const a=document.createElement("a");a.href=url;a.download=file.name;document.body.append(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),60000);
}
$("copyCaption").onclick=async()=>{
 try{await navigator.clipboard.writeText($("caption").value);result("Legenda copiada! Cole no Facebook ao publicar.")}catch{result("Não foi possível copiar automaticamente. Selecione o texto da legenda e copie manualmente.",true)}
};
$("downloadSelected").onclick=async()=>{
 if(!selected().length)return;
 $("downloadSelected").disabled=true;result("Preparando fotos selecionadas…");
 try{
   const files=await selectedFiles();
   // A maioria dos navegadores restringe downloads múltiplos. Criamos um botão por foto.
   $("downloads").replaceChildren();
   files.forEach(file=>{
      const button=document.createElement("button");button.type="button";button.className="secondary";button.textContent="Salvar "+file.name;
      button.onclick=()=>saveFile(file);
      $("downloads").append(button);
   });
   result(files.length+" foto(s) pronta(s). Use os botões de salvar abaixo.");
 }catch(e){result("Erro ao preparar fotos: "+e.message,true)}
 finally{$("downloadSelected").disabled=false}
};
$("shareManual").onclick=async()=>{
 if(!current||!selected().length)return;
 $("shareManual").disabled=true;result("Preparando compartilhamento…");
 try{
   const files=await selectedFiles(),message=$("caption").value.trim();
   if(typeof navigator.share!=="function")throw Error("Compartilhamento nativo indisponível neste navegador. Use Copiar legenda e Baixar fotos.");
   if(!navigator.canShare?.({files}))throw Error("O navegador não permite compartilhar estas fotos. Use Baixar fotos e Copiar legenda.");
   await navigator.share({files,text:message,title:"Veículo "+(current.modelo||current.nome||"")});
   result("Conteúdo entregue ao menu de compartilhamento. Confira a publicação no Facebook; o sistema não confirma que foi postado.");
 }catch(e){if(e?.name==="AbortError")result("Compartilhamento cancelado.");else result(e.message||String(e),true)}
 finally{preview()}
};
start().catch(e=>setStatus(e.message,true));
})();