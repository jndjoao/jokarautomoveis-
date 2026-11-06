/* CENTRAL LJ — Agenda V14. Complemento isolado de CRM V11 e Gestão V10.
   Apple Calendar: exportação .ics (um sentido); notificações navegador somente com página aberta. */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const html=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=()=>window.CURRENT_UID||null;
const store={tasks:[],leads:[],adminNames:{},user:null,admin:false,month:new Date(),day:new Date(),loaded:false,pending:false,leadForDetails:null,adminMonth:'',adminOwner:'',adminTasks:[]};
const now=()=>new Date();
const dateKey=d=>{const z=new Date(d);return z.getFullYear()+'-'+String(z.getMonth()+1).padStart(2,'0')+'-'+String(z.getDate()).padStart(2,'0')};
const monthKey=d=>dateKey(new Date(d.getFullYear(),d.getMonth(),1)).slice(0,7);
const readable=d=>new Date(d).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'});
const shortDay=d=>new Date(d).toLocaleDateString('pt-BR',{dateStyle:'full'});
const inputLocal=d=>{if(!d)return '';const x=new Date(d);return dateKey(x)+'T'+String(x.getHours()).padStart(2,'0')+':'+String(x.getMinutes()).padStart(2,'0')};
const fromInput=d=>d?new Date(d).toISOString():null;
const monthName=d=>new Date(d.getFullYear(),d.getMonth(),1).toLocaleString('pt-BR',{month:'long',year:'numeric'});
function isOpen(){return !$('v6')?.classList.contains('hide')}
const mine=l=>l.owner_uid===uid();
const active=t=>t.status==='pendente';
const late=t=>active(t)&&new Date(t.inicio).getTime()<Date.now();
function labelLead(id){const l=store.leads.find(x=>x.id===id);return l?l.nome:'Lead não disponível'}
function message(s,err=false){const x=$('agMsg');if(x){x.textContent=s;x.classList.toggle('err',err)}}
function verifyAuth(){return !!(window.sb&&uid()&&!$('app')?.classList.contains('hide'))}
async function adminCheck(){if(!verifyAuth())return false;const r=await sb.rpc('is_admin');return !r.error&&r.data===true}
function escapeICS(s){return String(s||'').replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,')}
function isoICS(d){return new Date(d).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'')}
function icsContent(tasks){const nowStr=isoICS(now());return ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Central Leal Jokar//Agenda V14//PT-BR','CALSCALE:GREGORIAN','METHOD:PUBLISH',...tasks.flatMap(t=>{
const begin=new Date(t.inicio),end=t.fim?new Date(t.fim):new Date(begin.getTime()+30*60000);
const reminder=Number(t.lembrete_minutos)||0;
return ['BEGIN:VEVENT','UID:'+t.id+'@central-lj','DTSTAMP:'+nowStr,'DTSTART:'+isoICS(begin),'DTEND:'+isoICS(end),
'SUMMARY:'+escapeICS(t.titulo),'DESCRIPTION:'+escapeICS((t.descricao||'')+(t.lead_id?' | Lead: '+labelLead(t.lead_id):'')),
'STATUS:'+(t.status==='cancelada'?'CANCELLED':'CONFIRMED'),
...(reminder>0?['BEGIN:VALARM','ACTION:DISPLAY','DESCRIPTION:Compromisso CRM','TRIGGER:-PT'+reminder+'M','END:VALARM']:[]),
'END:VEVENT'];}), 'END:VCALENDAR'].join('\r\n')+'\r\n'}
function exportICS(items){if(!items.length){alert('Não há compromissos para exportar.');return}const b=new Blob([icsContent(items)],{type:'text/calendar;charset=utf-8'});const url=URL.createObjectURL(b),a=document.createElement('a');a.href=url;a.download='agenda-leal-jokar.ics';document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(url);a.remove()},600)}
function agendaSkeleton(){const v3=$('v3'),topnav=document.querySelector('.topnav'),mobile=document.querySelector('.mobile-nav');if(!v3||!topnav||!mobile||$('v6'))return;
topnav.insertAdjacentHTML('beforeend','<button id="t6" type="button">Agenda</button>');
mobile.insertAdjacentHTML('beforeend','<button id="t6m" type="button"><span class="nav-glyph">▦</span><span>Agenda</span></button>');
v3.insertAdjacentHTML('afterend',`<section id="v6" class="hide ag-root" aria-label="Minha agenda de tarefas e follow-ups">
 <div class="ag-header"><div><span class="eyebrow">ORGANIZAÇÃO COMERCIAL</span><h2>Minha Agenda</h2><p>Compromissos, tarefas e próximos retornos dos seus clientes.</p></div>
  <div class="ag-actions"><button type="button" class="ag-btn" id="agNotify">Ativar alertas</button><button type="button" class="ag-btn" id="agICS">Apple Agenda (.ics)</button><button type="button" class="ag-btn primary" id="agAdd">+ Nova tarefa</button></div></div>
 <div class="ag-banner">A agenda é pessoal: outros vendedores não visualizam suas tarefas. O administrador tem uma visão gerencial separada. A exportação Apple (.ics) é manual, sem sincronização automática contínua.</div>
 <div class="ag-stats" id="agStats"></div>
 <div class="ag-layout"><div>
   <div class="ag-panel"><div class="ag-toolbar"><div class="ag-month-title" id="agMonthTitle"></div><div class="ag-nav"><button type="button" class="ag-btn" id="agPrev" aria-label="Mês anterior">‹</button><button type="button" class="ag-btn" id="agToday">Hoje</button><button type="button" class="ag-btn" id="agNext" aria-label="Mês seguinte">›</button></div></div><div class="ag-grid" id="agCalendar"></div></div>
   <div class="ag-panel"><h3 class="ag-day-header" id="agDayTitle"></h3><div id="agDaily" class="ag-events"></div></div>
 </div><div><div class="ag-panel" id="agFormPanel"><h3 style="margin:0 0 12px">Nova tarefa ou follow-up</h3>
 <form id="agForm" autocomplete="off"><input type="hidden" id="agTaskId"><div class="ag-form">
   <div class="wide"><label for="agTitle">Título *</label><input id="agTitle" maxlength="160" required placeholder="Ex.: retornar cliente, verificar transferência"></div>
   <div><label for="agType">Tipo</label><select id="agType"><option value="tarefa">Tarefa personalizada</option><option value="followup">Follow-up</option><option value="visita">Visita / test-drive</option><option value="ligacao">Ligação</option><option value="reuniao">Reunião</option><option value="outro">Outro</option></select></div>
   <div><label for="agLead">Vincular lead (opcional)</label><select id="agLead"><option value="">Nenhum lead</option></select></div>
   <div><label for="agStart">Início *</label><input id="agStart" type="datetime-local" required></div>
   <div><label for="agEnd">Término (opcional)</label><input id="agEnd" type="datetime-local"></div>
   <div><label for="agReminder">Lembrete para Apple</label><select id="agReminder"><option value="0">No horário</option><option value="15">15 minutos antes</option><option value="30" selected>30 minutos antes</option><option value="60">1 hora antes</option><option value="1440">1 dia antes</option></select></div>
   <div class="wide"><label for="agDescription">Descrição</label><textarea id="agDescription" rows="3" maxlength="3000" placeholder="Observações sobre a tarefa"></textarea></div>
 </div><div class="ag-form-actions"><button type="submit" class="ag-btn primary" id="agSave">Salvar compromisso</button><button type="button" class="ag-btn" id="agClear">Limpar</button><span class="ag-msg" id="agMsg" role="status"></span></div></form></div>
 <div class="ag-panel"><h3 style="margin:0 0 9px">Pendências próximas</h3><div class="ag-events" id="agUpcoming"></div></div></div></div>
 </section>`);
const old=window.tab;window.tab=function(n){old(n);$('v6').classList.toggle('hide',n!==6);$('t6').classList.toggle('on',n===6);$('t6m').classList.toggle('on',n===6);if(n===6)void loadData()};
$('t6').onclick=() => window.tab(6);$('t6m').onclick=()=>window.tab(6);
$('agPrev').onclick=()=>{store.month=new Date(store.month.getFullYear(),store.month.getMonth()-1,1);render()};
$('agNext').onclick=()=>{store.month=new Date(store.month.getFullYear(),store.month.getMonth()+1,1);render()};
$('agToday').onclick=()=>{store.day=now();store.month=now();render()};
$('agAdd').onclick=()=>{clearForm();$('agTitle').focus();$('agFormPanel').scrollIntoView({behavior:'smooth'})};
$('agClear').onclick=clearForm;
$('agICS').onclick=()=>exportICS(store.tasks.filter(t=>t.status!=='cancelada'));
$('agForm').onsubmit=e=>{e.preventDefault();void saveTask()};
$('agCalendar').onclick=e=>{const b=e.target.closest('button[data-date]');if(!b)return;store.day=new Date(b.dataset.date+'T12:00:00');store.month=new Date(store.day);$('agStart').value=b.dataset.date+'T09:00';render()};
$('v6').addEventListener('click',e=>{const b=e.target.closest('button[data-ag-act]');if(!b)return;const id=b.dataset.agId;if(b.dataset.agAct==='done')void setStatus(id,'concluida');if(b.dataset.agAct==='edit')editTask(id);if(b.dataset.agAct==='delete')void deleteTask(id);if(b.dataset.agAct==='ics'){const t=store.tasks.find(x=>x.id===id);if(t)exportICS([t])}});
$('agNotify').onclick=async()=>{if(!('Notification' in window)){alert('Este navegador não oferece notificações.');return}if(!window.isSecureContext){alert('Alertas exigem HTTPS.');return}const p=await Notification.requestPermission();alert(p==='granted'?'Alertas permitidos. Eles aparecerão enquanto o sistema estiver aberto.':'Permissão não concedida. Você pode usar os lembretes na Apple Agenda.');};
clearForm();
}
function clearForm(){if(!$('agForm'))return;$('agForm').reset();$('agTaskId').value='';$('agStart').value=inputLocal(new Date(new Date(store.day).setHours(9,0,0,0)));$('agEnd').value='';message('')}
function myTasks(){return store.tasks.filter(t=>t.owner_uid===uid())}
function virtualFollowups(){const existing=new Set(myTasks().filter(x=>x.lead_id&&x.tipo==='followup').map(x=>x.lead_id+':'+dateKey(x.inicio)));return store.leads.filter(mine).filter(l=>l.proximo_contato&& !['ganho','perdido'].includes(l.etapa)).filter(l=>!existing.has(l.id+':'+l.proximo_contato)).map(l=>({id:'legacy-'+l.id,lead_id:l.id,owner_uid:l.owner_uid,tipo:'followup',titulo:'Follow-up · '+l.nome,inicio:l.proximo_contato+'T12:00:00',status:'pendente',legacy:true,descricao:'Retorno agendado anteriormente no CRM'}))}
function allMine(){return [...myTasks(),...virtualFollowups()]}
async function loadData(){if(!verifyAuth()){return}if(store.pending)return;store.pending=true;try{const user=uid();store.user=user;const [tasks,leads]=await Promise.all([
  sb.from('crm_agenda').select('id,owner_uid,lead_id,tipo,titulo,descricao,inicio,fim,status,concluida_em,lembrete_minutos,criado_em').eq('owner_uid',user).order('inicio',{ascending:true}).limit(3000),
  sb.from('crm_leads').select('id,owner_uid,nome,empresa,etapa,proximo_contato').eq('owner_uid',user).limit(1500)
]);if(tasks.error)throw tasks.error;if(leads.error)throw leads.error;
store.tasks=tasks.data||[];store.leads=leads.data||[];store.loaded=true;populateLeads();render();notifyChecks()}
catch(e){if($('agDaily'))$('agDaily').innerHTML='<div class="ag-empty">Não foi possível carregar a agenda: '+html(e.message||e)+'. Execute o arquivo SQL V14 no Supabase.</div>';console.warn('Agenda V14',e)}finally{store.pending=false}}
function populateLeads(){const sel=$('agLead');if(!sel)return;const v=sel.value;sel.innerHTML='<option value="">Nenhum lead</option>'+store.leads.filter(mine).map(l=>`<option value="${html(l.id)}">${html(l.nome)}</option>`).join('');if(store.leads.some(l=>l.id===v))sel.value=v}
function render(){if(!store.loaded||!$('v6'))return;const tasks=allMine(),day=dateKey(store.day),n=now(),start=new Date(n.getFullYear(),n.getMonth(),n.getDate());
const stats={late:tasks.filter(t=>late(t)).length,today:tasks.filter(t=>active(t)&&dateKey(t.inicio)===dateKey(n)).length,next:tasks.filter(t=>active(t)&&new Date(t.inicio)>n).length,done:tasks.filter(t=>t.status==='concluida').length};
$('agStats').innerHTML=`<div class="ag-stat bad"><b>${stats.late}</b><small>Em atraso</small></div><div class="ag-stat today"><b>${stats.today}</b><small>Para hoje</small></div><div class="ag-stat next"><b>${stats.next}</b><small>Próximas tarefas</small></div><div class="ag-stat done"><b>${stats.done}</b><small>Concluídas</small></div>`;
$('agMonthTitle').textContent=monthName(store.month);const year=store.month.getFullYear(),month=store.month.getMonth(),first=new Date(year,month,1),offset=(first.getDay()+6)%7,days=new Date(year,month+1,0).getDate();
let out=['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'].map(s=>`<div class="ag-weekday">${s}</div>`).join('');
for(let i=0;i<42;i++){const d=new Date(year,month,1-offset+i),key=dateKey(d),list=tasks.filter(t=>dateKey(t.inicio)===key);out+=`<button type="button" class="ag-day ${d.getMonth()!==month?'out':''} ${key===dateKey(now())?'today':''} ${key===day?'selected':''}" data-date="${key}" aria-label="${key}, ${list.length} compromissos"><strong>${d.getDate()}</strong>${list.slice(0,2).map(t=>`<span class="ag-dot ${t.tipo==='followup'?'followup':''} ${late(t)?'late':''}" title="${html(t.titulo)}">${html(t.titulo)}</span>`).join('')}${list.length>2?`<span class="ag-more">+${list.length-2} mais</span>`:''}</button>`}
$('agCalendar').innerHTML=out;
$('agDayTitle').textContent=shortDay(store.day);const daily=tasks.filter(t=>dateKey(t.inicio)===day).sort((a,b)=>new Date(a.inicio)-new Date(b.inicio));$('agDaily').innerHTML=daily.length?daily.map(eventCard).join(''):'<div class="ag-empty">Nenhum compromisso neste dia.</div>';
const upcoming=tasks.filter(active).sort((a,b)=>new Date(a.inicio)-new Date(b.inicio)).slice(0,8);$('agUpcoming').innerHTML=upcoming.length?upcoming.map(eventCard).join(''):'<div class="ag-empty">Nenhuma pendência.</div>';
}
function eventCard(t){const legacy=!!t.legacy;return `<article class="ag-event ${late(t)?'overdue':''} ${t.status==='concluida'?'completed':''}"><div class="ag-event-head"><b>${html(t.titulo)}</b><small>${html(readable(t.inicio))}</small></div><small>${html(t.tipo.toUpperCase())}${t.lead_id?' · '+html(labelLead(t.lead_id)):''} · ${t.status==='concluida'?'Concluída':late(t)?'ATRASADA':t.status==='pendente'?'Pendente':'Cancelada'}</small>${t.descricao?`<div style="font-size:12px;white-space:pre-wrap">${html(t.descricao)}</div>`:''}<div class="ag-event-actions">${active(t)?`<button data-ag-act="done" data-ag-id="${html(t.id)}">Concluir</button>`:''}${!legacy?`<button data-ag-act="edit" data-ag-id="${html(t.id)}">Editar</button><button data-ag-act="delete" data-ag-id="${html(t.id)}">Excluir</button><button data-ag-act="ics" data-ag-id="${html(t.id)}">Apple .ics</button>`:'<small>Retorno antigo do CRM</small>'}</div></article>`}
async function saveTask(){const id=$('agTaskId').value,title=$('agTitle').value.trim(),inicio=$('agStart').value,fim=$('agEnd').value,lead=$('agLead').value;const button=$('agSave');if(!title||!inicio){message('Preencha o título e a data.',true);return}if(fim&&new Date(fim)<new Date(inicio)){message('O término precisa ser posterior ao início.',true);return}
const data={titulo:title,tipo:$('agType').value,lead_id:lead||null,inicio:fromInput(inicio),fim:fromInput(fim),lembrete_minutos:Number($('agReminder').value),descricao:$('agDescription').value.trim()||null};button.disabled=true;message('Salvando…');
try{const q=id?sb.from('crm_agenda').update(data).eq('id',id).eq('owner_uid',uid()):sb.from('crm_agenda').insert(data);const r=await q.select('id').single();if(r.error)throw r.error;
if(data.tipo==='followup'&&lead){const l=store.leads.find(x=>x.id===lead);if(l&&mine(l)){const u=await sb.from('crm_leads').update({proximo_contato:inicio.slice(0,10)}).eq('id',lead).eq('owner_uid',uid());if(u.error)console.warn('CRM: data antiga não sincronizada',u.error)}}
clearForm();await loadData();message('Compromisso salvo. Use Apple .ics para adicioná-lo à agenda do iPhone/Mac.');}
catch(e){message('Erro ao salvar: '+(e.message||e),true)}finally{button.disabled=false}}
function editTask(id){const t=store.tasks.find(x=>x.id===id&&x.owner_uid===uid());if(!t)return;$('agTaskId').value=t.id;$('agTitle').value=t.titulo;$('agType').value=t.tipo;$('agLead').value=t.lead_id||'';$('agStart').value=inputLocal(t.inicio);$('agEnd').value=inputLocal(t.fim);$('agReminder').value=String(t.lembrete_minutos||0);$('agDescription').value=t.descricao||'';message('Editando compromisso.');$('agFormPanel').scrollIntoView({behavior:'smooth'})}
async function setStatus(id,status){let t=store.tasks.find(x=>x.id===id&&x.owner_uid===uid());try{
if(id.startsWith('legacy-')){const lead=store.leads.find(l=>l.id===id.slice(7)&&mine(l));if(!lead)return;const r=await sb.from('crm_agenda').insert({lead_id:lead.id,titulo:'Follow-up · '+lead.nome,tipo:'followup',inicio:lead.proximo_contato+'T12:00:00',status:'concluida',descricao:'Retorno do CRM anterior concluído'});if(r.error)throw r.error;}
else{if(!t)return;const r=await sb.from('crm_agenda').update({status}).eq('id',id).eq('owner_uid',uid());if(r.error)throw r.error;}
await loadData();}catch(e){alert('Erro ao concluir: '+(e.message||e))}}
async function deleteTask(id){if(!window.confirm('Excluir esta tarefa da sua agenda?'))return;const t=store.tasks.find(x=>x.id===id&&x.owner_uid===uid());if(!t)return;const r=await sb.from('crm_agenda').delete().eq('id',id).eq('owner_uid',uid());if(r.error)alert(r.error.message);else await loadData()}
function notifyChecks(){if(!verifyAuth()||!('Notification' in window)||Notification.permission!=='granted')return;const tasks=allMine().filter(t=>late(t));for(const t of tasks){const key='ag-v14-alert-'+uid()+'-'+t.id+'-'+dateKey(now());if(sessionStorage.getItem(key))continue;try{new Notification('Compromisso atrasado · Central LJ',{body:t.titulo+' — '+readable(t.inicio),tag:'central-lj-'+t.id});sessionStorage.setItem(key,'1')}catch(e){console.warn('Notificação indisponível',e)}}}
function attachCRM(){const detail=$('crmDetails');if(!detail||detail.dataset.agReady)return;detail.dataset.agReady='1';
const anchor=$('crmDetailContact');if(!anchor)return;
anchor.insertAdjacentHTML('afterend',`<div id="agCrmBox" class="ag-crm-next"><h4>Concluir follow-up e agendar o próximo</h4><p style="font-size:12px;margin:0 0 9px;color:#536c48">Registre o contato realizado e programe a próxima conversa com o interessado. O histórico permanece na agenda.</p><div class="ag-inline"><input id="agCrmNext" type="datetime-local" aria-label="Data e horário do próximo follow-up"><button type="button" class="ag-action-button" id="agCrmSchedule">Concluir e agendar próximo</button><span class="ag-msg" id="agCrmMsg" role="status"></span></div><div id="agCrmHistory" style="font-size:12px;margin-top:10px"></div></div>`);
$('agCrmSchedule').onclick=()=>void nextFollowup();
const crm=$('v4');crm.addEventListener('click',e=>{const btn=e.target.closest('button[data-crm-details]');if(!btn)return;store.leadForDetails=btn.dataset.crmDetails;setTimeout(()=>{void decorateDetails()},120)});
// Os botões de administração do CRM são injetados somente após validação do servidor.
}
async function decorateDetails(){const id=store.leadForDetails,box=$('agCrmBox');if(!id||!box)return;
if(!verifyAuth())return;
const r=await sb.from('crm_leads').select('id,nome,owner_uid,empresa,etapa,valor_proposta,proximo_contato').eq('id',id).maybeSingle();if(r.error||!r.data)return;
const l=r.data;const own=mine(l);box.style.display=own?'':'none';
if(own){const q=await sb.from('crm_agenda').select('id,inicio,status').eq('lead_id',id).eq('owner_uid',uid()).eq('tipo','followup').order('inicio',{ascending:false}).limit(10);$('agCrmHistory').innerHTML='<b>Retornos registrados:</b> '+((q.data||[]).length?q.data.map(t=>html(readable(t.inicio))+' ('+html(t.status)+')').join(' · '):'Primeiro acompanhamento');}
if(store.admin)injectAdminLeadButtons(l);}
async function nextFollowup(){const lead=store.leadForDetails,date=$('agCrmNext').value,out=$('agCrmMsg');if(!date||new Date(date)<=new Date()){out.textContent='Escolha uma data futura.';return}if(!verifyAuth())return;const r=await sb.from('crm_leads').select('id,nome,owner_uid,proximo_contato').eq('id',lead).single();if(r.error||!r.data||!mine(r.data)){out.textContent='Este lead não pertence à sua conta.';return}
$('agCrmSchedule').disabled=true;out.textContent='Salvando…';try{let pending=await sb.from('crm_agenda').select('id,inicio,status').eq('lead_id',lead).eq('owner_uid',uid()).eq('tipo','followup').eq('status','pendente').order('inicio',{ascending:false}).limit(1);
if(pending.error)throw pending.error;
if(pending.data?.length){const done=await sb.from('crm_agenda').update({status:'concluida'}).eq('id',pending.data[0].id).eq('owner_uid',uid());if(done.error)throw done.error;}
else if(r.data.proximo_contato){const completed=await sb.from('crm_agenda').insert({lead_id:lead,tipo:'followup',titulo:'Follow-up realizado · '+r.data.nome,inicio:r.data.proximo_contato+'T12:00:00',status:'concluida',descricao:'Retorno antigo realizado no CRM'});if(completed.error)throw completed.error;}
const created=await sb.from('crm_agenda').insert({lead_id:lead,tipo:'followup',titulo:'Follow-up · '+r.data.nome,inicio:fromInput(date),lembrete_minutos:30,status:'pendente'});if(created.error)throw created.error;
const u=await sb.from('crm_leads').update({proximo_contato:date.slice(0,10)}).eq('id',lead).eq('owner_uid',uid());if(u.error)throw u.error;
const log=await sb.from('crm_interacoes').insert({lead_id:lead,tipo:'contato',descricao:'Follow-up concluído; próximo contato marcado para '+readable(fromInput(date))});if(log.error)console.warn(log.error);
out.textContent='Agendado com sucesso. Confira na aba Agenda.';await loadData();await decorateDetails();
}catch(e){out.textContent='Erro: '+(e.message||e)}finally{$('agCrmSchedule').disabled=false}}
function injectAdminLeadButtons(l){const box=$('crmDetails');if(!box||!store.admin)return;let div=$('agAdminActions');if(!div){const title=$('crmDetailContact');title.insertAdjacentHTML('beforebegin','<div class="ag-admin-actions" id="agAdminActions"></div>');div=$('agAdminActions');}
div.innerHTML=`<button type="button" id="agAdmEditProposal">Editar proposta (admin)</button><button type="button" id="agAdmDelProposal" class="danger">Excluir proposta (admin)</button><button type="button" id="agAdmDelLead" class="danger">Excluir negociação (admin)</button>`;
$('agAdmEditProposal').onclick=async()=>{const s=prompt('Novo valor da proposta (R$, use vírgula para centavos):',l.valor_proposta??'');if(s===null)return;const n=Number(s.replace(/\./g,'').replace(',','.').replace(/[^0-9.-]/g,''));if(!Number.isFinite(n)||n<=0){alert('Valor inválido.');return}const r=await sb.rpc('crm_admin_editar_proposta_v14',{p_lead:l.id,p_valor:n});if(r.error)alert(r.error.message);else{alert('Proposta atualizada.');$('crmRefresh')?.click();}};
$('agAdmDelProposal').onclick=async()=>{if(!confirm('Remover a proposta atual? O histórico será mantido.'))return;const r=await sb.rpc('crm_admin_excluir_proposta_v14',{p_lead:l.id});if(r.error)alert(r.error.message);else{$('crmRefresh')?.click();alert('Proposta removida.')}};
$('agAdmDelLead').onclick=async()=>{if(!confirm('EXCLUIR DEFINITIVAMENTE a negociação e seu histórico?'))return;const r=await sb.rpc('crm_admin_excluir_negociacao_v14',{p_lead:l.id});if(r.error)alert(r.error.message);else{$('crmCloseDetails')?.click();$('crmRefresh')?.click();alert('Negociação excluída.')}};
}
async function adminLoad(){if(!store.admin||!verifyAuth()||!$('agAdminBox'))return;const r=await sb.from('crm_agenda').select('id,owner_uid,lead_id,tipo,titulo,descricao,inicio,status,concluida_em').order('inicio',{ascending:false}).limit(3000);
if(r.error){$('agAdminBody').innerHTML='<tr><td colspan="5">Erro: '+html(r.error.message)+'</td></tr>';return}store.adminTasks=r.data||[];const names=await sb.from('crm_leads').select('owner_uid,criado_por').limit(3000);store.adminNames={};if(!names.error){(names.data||[]).forEach(l=>{if(l.owner_uid&&l.criado_por)store.adminNames[l.owner_uid]=l.criado_por})}adminRender()}
function adminRender(){const rows=store.adminTasks,sel=$('agAdminUser'),filter=$('agAdminFilter').value,month=$('agAdminMonth').value;let owner=sel.value;const owners=[...new Set(rows.map(x=>x.owner_uid))].sort();
sel.innerHTML='<option value="">Todos os vendedores</option>'+owners.map(u=>`<option value="${html(u)}">${html(store.adminNames[u]||u.slice(0,8)+'…')}</option>`).join('');sel.value=owners.includes(owner)?owner:'';owner=sel.value;
const visible=rows.filter(x=>(!owner||x.owner_uid===owner)&&(!filter||x.status===filter)&&(!month||dateKey(x.inicio).startsWith(month)));
$('agAdminStats').innerHTML=`<span>${visible.length} compromissos</span><span>${visible.filter(late).length} atrasados</span><span>${visible.filter(t=>t.status==='concluida').length} concluídos</span>`;
$('agAdminBody').innerHTML=visible.length?visible.map(x=>`<tr><td>${html(store.adminNames[x.owner_uid]||x.owner_uid.slice(0,8)+'…')}</td><td>${html(x.titulo)}${x.lead_id?'<br><small>Lead vinculado</small>':''}</td><td>${html(x.tipo)}</td><td>${html(readable(x.inicio))}</td><td>${html(x.status)}${late(x)?' ⚠':''}</td></tr>`).join(''):'<tr><td colspan="5">Nenhum compromisso encontrado.</td></tr>'}
function setupAdminBox(){if(!store.admin||!$('v5')||$('agAdminBox'))return;const section=$('v5');section.insertAdjacentHTML('beforeend',`<div class="ag-admin-box" id="agAdminBox"><h3>Agendas da equipe comercial</h3><p>Visão geral exclusiva para administradores. Os vendedores acessam somente a própria agenda; esta consulta não inclui telefones nem e-mails privados.</p><div class="ag-admin-filters"><select id="agAdminUser"><option value="">Todos os vendedores</option></select><select id="agAdminFilter"><option value="">Todos os status</option><option value="pendente">Pendentes</option><option value="concluida">Concluídos</option><option value="cancelada">Cancelados</option></select><input id="agAdminMonth" type="month" aria-label="Mês da agenda"><button type="button" id="agAdminReload" class="ag-btn">Atualizar</button></div><div id="agAdminStats" class="ag-admin-stats"></div><div class="sc" style="margin-top:10px"><table><thead><tr><th>Vendedor</th><th>Tarefa</th><th>Tipo</th><th>Data</th><th>Status</th></tr></thead><tbody id="agAdminBody"></tbody></table></div></div>`);
$('agAdminUser').onchange=adminRender;$('agAdminFilter').onchange=adminRender;$('agAdminMonth').onchange=adminRender;$('agAdminReload').onclick=()=>void adminLoad();
const old=window.tab;window.tab=function(n){old(n);if(n===5)void adminLoad()};
}
async function checkRole(){if(!verifyAuth()){store.admin=false;return}store.admin=await adminCheck();document.documentElement.classList.toggle('ag-admin-confirmed',store.admin);if(store.admin)setupAdminBox();
// Edição de leads: vendedores podem editar os próprios. O CRM aplica a regra por owner_uid;
// operações administrativas de excluir negociação/alterar proposta seguem restritas ao Supabase.
}
async function onInit(){agendaSkeleton();attachCRM();if(!verifyAuth())return;await checkRole();if(store.admin)setupAdminBox();if(isOpen())await loadData()}
const observer=new MutationObserver(()=>{if(verifyAuth()){if(!$('v6'))agendaSkeleton();if(!$('agCrmBox'))attachCRM();if($('v5')&&!$('agAdminBox')&&store.admin)setupAdminBox()}});
function start(){onInit();observer.observe(document.body,{childList:true,subtree:true});setInterval(()=>{if(verifyAuth()&&document.visibilityState==='visible'){if(store.user!==uid()){store.user=uid();void checkRole()}notifyChecks();if(isOpen())void loadData()}},60000);
window.addEventListener('focus',()=>{if(verifyAuth()){void checkRole();if(isOpen())void loadData()}});
document.addEventListener('click',e=>{if(e.target.closest('#li'))setTimeout(()=>void onInit(),1200);if(e.target.closest('#lo')){store.tasks=[];store.leads=[];store.admin=false;store.loaded=false;document.documentElement.classList.remove('ag-admin-confirmed')}});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
