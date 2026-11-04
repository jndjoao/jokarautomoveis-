/* Central Leal + Jokar — CRM V9. Módulo isolado; estoque, vendas e catálogo permanecem intactos. */
(function(){
  'use strict';
  const $c=id=>document.getElementById(id);
  const safe=value=>String(value==null?'':value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const STAGES={novo:'Novo interessado',contato:'Em contato',visita:'Visita agendada',proposta:'Proposta enviada',ganho:'Fechado no CRM',perdido:'Não convertido'};
  const BUSINESSES={leal:'Leal Veículos',jokar:'Jokar Automóveis'};
  const SOURCES=['WhatsApp','Instagram','Facebook','Indicação','Loja física','Catálogo','Outro'];
  const CLOSED=['ganho','perdido'];
  const state={uid:null,loaded:false,busy:false,leads:[],contacts:[],interactions:[],detailId:null,editingId:null,search:'',company:'',stage:'',due:'',error:''};
  const app=$c('app'), oldNav=document.querySelector('.topnav'), mobileNav=document.querySelector('.mobile-nav'), v3=$c('v3');
  if(!app||!oldNav||!mobileNav||!v3||!window.sb){console.warn('CRM V9: aguardando estrutura do sistema.');return}
  oldNav.insertAdjacentHTML('beforeend','<button id="t4" type="button">CRM</button>');
  mobileNav.insertAdjacentHTML('beforeend','<button id="t4m" type="button"><span class="nav-glyph">☷</span><span>CRM</span></button>');
  v3.insertAdjacentHTML('afterend',`<section id="v4" class="hide crm-root" aria-label="CRM Comercial">
    <div class="crm-head"><div><span class="crm-kicker">Central LJ · V9</span><h2>CRM comercial</h2><p>Acompanhe interessados, propostas e retornos de cada loja. Os contatos privados pertencem ao cadastrador.</p></div>
      <div class="crm-head-actions"><button id="crmRefresh" type="button" class="crm-button">↻ Atualizar</button><button id="crmNew" type="button" class="crm-button crm-button-primary">＋ Novo interessado</button></div></div>
    <div id="crmSetup" class="crm-setup crm-hide" role="alert"></div>
    <div id="crmMetrics" class="crm-metrics" aria-live="polite"></div><div id="crmFunnel" class="crm-funnel" aria-label="Funil por etapa"></div>
    <section id="crmForm" class="crm-panel crm-form hide" aria-label="Cadastro de interessado">
      <h3 id="crmFormTitle">Novo interessado</h3><p class="crm-sub">As informações de contato serão armazenadas com acesso restrito ao usuário que cadastrar.</p>
      <div class="crm-form-grid">
        <div><label for="crmName">Nome do interessado *</label><input id="crmName" maxlength="120" autocomplete="name" placeholder="Nome completo"></div>
        <div><label for="crmCompany">Empresa responsável *</label><select id="crmCompany"><option value="leal">Leal Veículos</option><option value="jokar">Jokar Automóveis</option></select></div>
        <div><label for="crmPhone">WhatsApp / telefone (privado)</label><input id="crmPhone" type="tel" inputmode="tel" maxlength="24" placeholder="(62) 99999-9999"></div>
        <div><label for="crmEmail">E-mail (privado)</label><input id="crmEmail" type="email" maxlength="180" placeholder="cliente@exemplo.com"></div>
        <div><label for="crmVehicle">Veículo de interesse</label><select id="crmVehicle"><option value="">Interesse geral / ainda não definido</option></select></div>
        <div><label for="crmSource">Origem do contato</label><select id="crmSource">${SOURCES.map(x=>`<option>${x}</option>`).join('')}</select></div>
        <div><label for="crmStage">Etapa da negociação</label><select id="crmStage">${Object.entries(STAGES).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></div>
        <div><label for="crmNext">Próximo contato</label><input id="crmNext" type="date"></div>
        <div class="crm-form-wide"><label for="crmInterest">Interesse / preferências</label><input id="crmInterest" maxlength="250" placeholder="Ex.: procura hatch até R$ 45 mil ou quer avaliar uma troca"></div>
        <div class="crm-form-wide"><label for="crmNotes">Observações internas</label><textarea id="crmNotes" maxlength="2500" rows="3" placeholder="Detalhes relevantes da negociação (evite duplicar números de telefone aqui)"></textarea></div>
      </div>
      <div id="crmPrivateHint" class="crm-info">O telefone e o e-mail só poderão ser consultados pelo cadastrador. O administrador visualiza as etapas e os resultados.</div>
      <div class="crm-actions"><button type="button" id="crmSave" class="crm-button crm-button-primary">Salvar interessado</button><button type="button" id="crmCancel" class="crm-button">Cancelar</button><span id="crmFormMsg" class="crm-msg" role="status"></span></div>
    </section>
    <section id="crmDetails" class="crm-panel crm-detail hide" aria-label="Detalhes da negociação">
      <div class="crm-detail-head"><div><h3 id="crmDetailTitle">Negociação</h3><p id="crmDetailDesc" class="crm-sub"></p></div><button id="crmCloseDetails" class="crm-button" type="button">Fechar detalhes ✕</button></div>
      <div id="crmDetailContact" class="crm-info"></div>
      <div class="crm-detail-grid">
        <div class="crm-detail-box"><h4>Registrar atendimento</h4><label for="crmActivityType">Tipo de interação</label>
          <select id="crmActivityType"><option value="contato">Contato realizado</option><option value="visita">Visita / test-drive</option><option value="nota">Nota interna</option></select>
          <label for="crmActivityText" style="margin-top:12px">Resumo do atendimento *</label><textarea id="crmActivityText" maxlength="2000" placeholder="Ex.: Cliente pediu avaliação do veículo de troca"></textarea>
          <div class="crm-actions"><button id="crmAddActivity" type="button" class="crm-button crm-button-primary">Salvar atendimento</button></div>
        </div>
        <div class="crm-detail-box"><h4>Registrar proposta comercial</h4>
          <label for="crmProposal">Valor proposto (R$) *</label><input id="crmProposal" type="text" inputmode="decimal" autocomplete="off" placeholder="R$ 0,00" maxlength="24">
          <label for="crmProposalNotes" style="margin-top:12px">Condições da proposta</label><textarea id="crmProposalNotes" maxlength="2000" placeholder="Ex.: Entrada de R$ 10 mil + veículo na troca"></textarea>
          <div class="crm-actions"><button id="crmAddProposal" type="button" class="crm-button crm-button-primary">Registrar proposta</button></div>
          <p class="crm-sub" style="margin:10px 0 0">A proposta não registra venda no financeiro. Para vender, utilize o painel de veículos.</p>
        </div>
      </div>
      <div class="crm-detail-box" style="margin-top:14px"><h4>Histórico da negociação</h4><div id="crmTimeline" class="crm-timeline"></div></div>
      <div id="crmDetailMsg" class="crm-msg" role="status" style="margin-top:11px"></div>
    </section>
    <section class="crm-panel" aria-label="Filtros e interessados">
      <div class="crm-filters">
        <div><label for="crmSearch">Buscar interessado ou veículo</label><input id="crmSearch" type="search" placeholder="Nome, modelo, origem ou vendedor..."></div>
        <div><label for="crmFilterCompany">Empresa</label><select id="crmFilterCompany"><option value="">Ambas as lojas</option><option value="leal">Leal Veículos</option><option value="jokar">Jokar Automóveis</option></select></div>
        <div><label for="crmFilterStage">Etapa</label><select id="crmFilterStage"><option value="">Todas as etapas</option>${Object.entries(STAGES).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></div>
        <div><label for="crmFilterDue">Próximo contato</label><select id="crmFilterDue"><option value="">Todos os prazos</option><option value="atrasado">Atrasados</option><option value="hoje">Para hoje</option><option value="futuro">Futuros</option><option value="sem">Sem data</option></select></div>
      </div>
      <p id="crmListCaption" class="crm-sub" style="margin:14px 0 12px"></p><div id="crmGrid" class="crm-grid"><div class="crm-empty">Carregando interessados…</div></div>
    </section>
  </section>`);
  const section=$c('v4');
  const previousTab=window.tab;
  window.tab=function(n){previousTab(n);section.classList.toggle('hide',n!==4);$c('t4').classList.toggle('on',n===4);$c('t4m').classList.toggle('on',n===4);if(n===4)void openCRM()};
  $c('t4').onclick=()=>window.tab(4);$c('t4m').onclick=()=>window.tab(4);
  const getLead=id=>state.leads.find(x=>x.id===id);
  const getContact=id=>state.contacts.find(x=>x.lead_id===id);
  const vehicleLabel=id=>{const v=(window.D?.veiculos||[]).find(v=>v.id===id);return v?[v.marca||v.nome,v.modelo,v.ano].filter(Boolean).join(' · '):id?'Veículo não encontrado':'Sem veículo específico'};
  const todayStr=()=>{const t=new Date(),local=new Date(t.getTime()-t.getTimezoneOffset()*60000);return local.toISOString().slice(0,10)};
  const prettyDate=s=>s?String(s).slice(0,10).split('-').reverse().join('/'):'—';
  const asBRL=n=>n==null||n===''?'—':Number(n).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const cleanPhone=s=>String(s||'').replace(/\D/g,'');
  const waURL=(lead,contact)=>{let p=cleanPhone(contact&&contact.telefone);if(p.startsWith('55')&&(p.length===12||p.length===13))p=p.slice(2);if(p.length!==10&&p.length!==11)return '';const msg=`Olá, ${lead.nome}! Sou da ${BUSINESSES[lead.empresa]||'loja'}, sobre ${vehicleLabel(lead.produto_id)}. Podemos conversar?`;return `https://wa.me/55${p}?text=${encodeURIComponent(msg)}`};
  const openStage=x=>!CLOSED.includes(x.etapa);
  const dateClass=l=>{const day=String(l.proximo_contato||'').slice(0,10),now=todayStr();if(!day||!openStage(l))return '';return day<now?'crm-due-overdue':day===now?'crm-due-today':''};
  const dateLabel=l=>{const k=dateClass(l);return k==='crm-due-overdue'?'⚠ Atrasado':k==='crm-due-today'?'● Hoje':'Retorno'};
  function showSetup(msg){const el=$c('crmSetup');el.classList.remove('crm-hide');el.innerHTML=`<h3>CRM ainda não ativado no Supabase</h3><p>${safe(msg||'Execute o arquivo 01-crm-v9.sql no SQL Editor do mesmo Supabase utilizado pelo sistema.')}</p><p>Os módulos de estoque, catálogo e financeiro não dependem do CRM e continuam funcionando.</p>`}
  function clearSetup(){$c('crmSetup').classList.add('crm-hide')}
  function reset(){state.uid=null;state.loaded=false;state.leads=[];state.contacts=[];state.interactions=[];state.detailId=null;state.editingId=null;section.classList.add('hide');$c('crmDetails').classList.add('hide');$c('crmForm').classList.add('hide');$c('crmMetrics').innerHTML='';$c('crmGrid').innerHTML=''}
  if(sb&&sb.auth){sb.auth.onAuthStateChange((ev)=>{if(ev==='SIGNED_OUT')reset()})}
  async function openCRM(){
    if(!window.CURRENT_UID||!window.sb){showSetup('Entre com sua conta para utilizar o CRM.');return}
    if(state.uid!==window.CURRENT_UID){state.loaded=false;state.uid=window.CURRENT_UID;state.leads=[];state.contacts=[];state.detailId=null;$c('crmDetails').classList.add('hide');$c('crmForm').classList.add('hide')}
    if(!state.loaded)await reload();else{render();fillVehicles()}
  }
  async function reload(){
    if(state.busy)return;
    if(!window.sb||!window.CURRENT_UID)return;
    state.busy=true;$c('crmRefresh').disabled=true;$c('crmGrid').innerHTML='<div class="crm-empty">Carregando interessados…</div>';
    try{
      const [a,b]=await Promise.all([
        sb.from('crm_leads').select('id,owner_uid,criado_por,empresa,nome,produto_id,origem,interesse,etapa,valor_proposta,proximo_contato,observacoes,created_at,updated_at').order('updated_at',{ascending:false}).limit(1000),
        sb.from('crm_contatos_privados').select('lead_id,owner_uid,telefone,email')
      ]);
      if(a.error||b.error)throw (a.error||b.error);
      state.leads=a.data||[];state.contacts=b.data||[];state.loaded=true;clearSetup();render();fillVehicles();
      if(state.detailId){if(getLead(state.detailId))await loadDetails(state.detailId);else closeDetails()}
    }catch(e){state.loaded=false;showSetup(e.message||String(e));$c('crmGrid').innerHTML='<div class="crm-empty"><b>Não foi possível carregar o CRM.</b>Confirme que o SQL da V9 foi executado no Supabase.</div>';
    }finally{state.busy=false;$c('crmRefresh').disabled=false}
  }
  function render(){
    const now=todayStr(),companyLeads=state.leads.filter(l=>!state.company||l.empresa===state.company),open=companyLeads.filter(openStage),overdue=open.filter(l=>l.proximo_contato&&l.proximo_contato<now).length,dueToday=open.filter(l=>l.proximo_contato===now).length;
    const metrics=[['Interessados',companyLeads.length,''],['Negociações abertas',open.length,''],['Retornos atrasados',overdue,'crm-alert'],['Retornos de hoje',dueToday,'']];
    $c('crmMetrics').innerHTML=metrics.map(([label,num,cls])=>`<div class="crm-metric ${cls}"><strong>${num}</strong><span>${label}</span></div>`).join('');
    $c('crmFunnel').innerHTML=Object.entries(STAGES).map(([k,label])=>`<button type="button" class="crm-funnel-item ${state.stage===k?'on':''}" data-crm-filter-stage="${k}"><b>${companyLeads.filter(l=>l.etapa===k).length}</b><span>${safe(label)}</span></button>`).join('');
    const q=state.search.toLocaleLowerCase('pt-BR');
    let rows=state.leads.filter(l=>{
      if(state.company&&l.empresa!==state.company)return false;if(state.stage&&l.etapa!==state.stage)return false;
      if(state.due==='sem'&&l.proximo_contato)return false;
      if(state.due==='atrasado'&&(!openStage(l)||!l.proximo_contato||l.proximo_contato>=now))return false;
      if(state.due==='hoje'&&(!openStage(l)||l.proximo_contato!==now))return false;
      if(state.due==='futuro'&&(!openStage(l)||!l.proximo_contato||l.proximo_contato<=now))return false;
      const search=[l.nome,l.origem,l.interesse,l.criado_por,vehicleLabel(l.produto_id)].join(' ').toLocaleLowerCase('pt-BR');return !q||search.includes(q)
    });
    rows.sort((a,b)=>{const rank=x=>!openStage(x)?3:(!x.proximo_contato?2:x.proximo_contato<now?0:x.proximo_contato===now?1:2);return rank(a)-rank(b)||String(b.updated_at||'').localeCompare(String(a.updated_at||''))});
    $c('crmListCaption').textContent=`${rows.length} interessado(s) exibido(s). ${window.ADM?'Administrador: todas as negociações visíveis; contatos privados somente do cadastrador.':'Você vê somente as negociações que cadastrou.'}`;
    $c('crmGrid').innerHTML=rows.length?rows.map(l=>{
      const contact=getContact(l.id),mine=l.owner_uid===window.CURRENT_UID,wa=mine?waURL(l,contact):'',due=l.proximo_contato&&openStage(l)?`<span class="crm-due ${dateClass(l)}">${dateLabel(l)}: ${prettyDate(l.proximo_contato)}</span>`:'',stg=STAGES[l.etapa]||l.etapa;
      return `<article class="crm-card"><div class="crm-card-top"><div><h3>${safe(l.nome)}</h3><p>${safe(vehicleLabel(l.produto_id))}</p></div><span class="crm-chip crm-chip-${safe(l.empresa)}">${safe(BUSINESSES[l.empresa]||'Loja')}</span></div>
        <div class="crm-card-meta"><span class="crm-status crm-status-${safe(l.etapa)}">${safe(stg)}</span>${due}</div>
        <div class="crm-card-meta"><span class="crm-meta-item">Origem: ${safe(l.origem||'Não informada')}</span>${l.valor_proposta!=null?`<span class="crm-meta-item">Proposta: <b>${safe(asBRL(l.valor_proposta))}</b></span>`:''}</div>
        ${l.interesse?`<p>${safe(l.interesse)}</p>`:''}
        ${window.ADM?`<p style="font-size:11px">Cadastrado por: ${safe(l.criado_por||'Usuário')}</p>`:''}
        <div class="crm-card-stage"><label for="crm-stage-${safe(l.id)}">Etapa</label><select id="crm-stage-${safe(l.id)}" data-crm-stage="${safe(l.id)}">${Object.entries(STAGES).map(([k,v])=>`<option value="${k}" ${l.etapa===k?'selected':''}>${v}</option>`).join('')}</select></div>
        <div class="crm-card-bottom"><button type="button" class="crm-button" data-crm-details="${safe(l.id)}">Histórico / proposta</button><button type="button" class="crm-button" data-crm-edit="${safe(l.id)}">Editar</button>
          ${wa?`<a class="crm-button crm-button-primary" target="_blank" rel="noopener noreferrer" href="${safe(wa)}" style="text-decoration:none;display:inline-flex;align-items:center">WhatsApp ↗</a>`:`<span class="crm-private">${mine?'WhatsApp não informado':'Contato restrito'}</span>`}</div></article>`
    }).join(''):'<div class="crm-empty"><b>Nenhum interessado encontrado.</b>Cadastre um novo lead ou ajuste os filtros.</div>';
  }
  function fillVehicles(){const select=$c('crmVehicle'),selected=select.value,vs=(window.D&&D.veiculos)||[];select.innerHTML='<option value="">Interesse geral / ainda não definido</option>'+vs.slice().sort((a,b)=>String(a.marca||a.nome).localeCompare(String(b.marca||b.nome))).map(v=>`<option value="${safe(v.id)}">${safe([v.marca||v.nome,v.modelo,v.ano].filter(Boolean).join(' · '))} (${safe(BUSINESSES[v.empresa]||'Loja')}${v.status==='vendido'?' · Vendido':''})</option>`).join('');if(vs.some(v=>v.id===selected))select.value=selected}
  function formMessage(s,error=false){const x=$c('crmFormMsg');x.textContent=s;x.classList.toggle('crm-error',error)}
  function detailMessage(s,error=false){const x=$c('crmDetailMsg');x.textContent=s;x.classList.toggle('crm-error',error)}
  function beginForm(id){
    const l=id?getLead(id):null;state.editingId=l?l.id:null;fillVehicles();$c('crmFormTitle').textContent=l?'Editar interessado':'Novo interessado';formMessage('');
    $c('crmName').value=l?.nome||'';$c('crmCompany').value=l?.empresa||'leal';$c('crmVehicle').value=l?.produto_id||'';$c('crmSource').value=l?.origem||'WhatsApp';$c('crmStage').value=l?.etapa||'novo';$c('crmNext').value=l?.proximo_contato||'';$c('crmInterest').value=l?.interesse||'';$c('crmNotes').value=l?.observacoes||'';
    const own=!l||l.owner_uid===window.CURRENT_UID,c=l&&own?getContact(l.id):null;
    $c('crmPhone').value=c?.telefone||'';$c('crmEmail').value=c?.email||'';$c('crmPhone').disabled=!own;$c('crmEmail').disabled=!own;
    $c('crmPrivateHint').textContent=own?'Telefone e e-mail acessíveis somente à conta que cadastrou este interessado.':'Este contato foi cadastrado por outra pessoa. Telefone e e-mail permanecem protegidos.';
    $c('crmForm').classList.remove('hide');$c('crmName').focus();$c('crmForm').scrollIntoView({behavior:'smooth',block:'start'});
  }
  async function saveForm(){
    const nome=$c('crmName').value.trim(),empresa=$c('crmCompany').value,lead=state.editingId?getLead(state.editingId):null,own=!lead||lead.owner_uid===window.CURRENT_UID;
    const telefone=cleanPhone($c('crmPhone').value),email=$c('crmEmail').value.trim().toLowerCase();
    if(!nome){formMessage('Informe o nome do interessado.',true);$c('crmName').focus();return}
    if(!BUSINESSES[empresa]){formMessage('Selecione uma empresa válida.',true);return}
    if(own&&!telefone&&!email){formMessage('Informe um telefone ou um e-mail para retorno.',true);return}
    if(own&&telefone&&!(telefone.length===10||telefone.length===11||telefonoBrazil(telefone))){formMessage('Informe um telefone com DDD (10 ou 11 dígitos).',true);return}
    if(own&&email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){formMessage('Confira o e-mail do interessado.',true);return}
    const notes=$c('crmNotes').value.trim(),data={nome,empresa,produto_id:$c('crmVehicle').value||null,origem:$c('crmSource').value||'Outro',interesse:$c('crmInterest').value.trim()||null,etapa:$c('crmStage').value,proximo_contato:$c('crmNext').value||null,observacoes:notes||null};
    const button=$c('crmSave');button.disabled=true;formMessage('Salvando…');
    try{
      let id=lead?.id;
      if(lead){const r=await sb.from('crm_leads').update(data).eq('id',id).select('id').single();if(r.error)throw r.error}
      else{const r=await sb.from('crm_leads').insert(data).select('id').single();if(r.error)throw r.error;id=r.data.id}
      if(own){const raw=$c('crmPhone').value.trim();const phone=telefonoBrazil(telefone)?telefone.slice(2):telefone;
        const c=await sb.from('crm_contatos_privados').upsert({lead_id:id,telefone:phone||null,email:email||null},{onConflict:'lead_id'});
        if(c.error){formMessage('O interessado foi salvo, mas houve erro ao salvar o contato privado: '+c.error.message,true);await reload();return}
      }
      $c('crmForm').classList.add('hide');state.editingId=null;await reload();
    }catch(e){formMessage('Não foi possível salvar: '+(e.message||String(e)),true)}finally{button.disabled=false}
  }
  function telefonoBrazil(p){return p.startsWith('55')&&(p.length===12||p.length===13)}
  async function changeStage(id,value){
    if(!STAGES[value])return;
    const l=getLead(id);if(!l)return;
    if(value==='ganho'&&!window.confirm('Fechar no CRM NÃO registra a venda no Financeiro. Confirma que esta negociação foi concluída no CRM?')){render();return}
    const r=await sb.from('crm_leads').update({etapa:value}).eq('id',id).select('id').single();
    if(r.error){alert('Erro ao atualizar etapa: '+r.error.message);render();return}
    const log=await sb.from('crm_interacoes').insert({lead_id:id,tipo:'etapa',descricao:'Etapa alterada de '+(STAGES[l.etapa]||l.etapa)+' para '+STAGES[value]});
    if(log.error)console.warn('CRM: etapa salva, mas histórico não registrado',log.error);
    await reload();
  }
  function closeDetails(){state.detailId=null;$c('crmDetails').classList.add('hide')}
  async function loadDetails(id){
    const l=getLead(id);if(!l)return;
    state.detailId=id;$c('crmDetails').classList.remove('hide');$c('crmDetailTitle').textContent=l.nome;$c('crmDetailDesc').textContent=[BUSINESSES[l.empresa],vehicleLabel(l.produto_id),'Etapa: '+(STAGES[l.etapa]||l.etapa)].filter(Boolean).join(' • ');detailMessage('');
    const mine=l.owner_uid===window.CURRENT_UID,c=mine?getContact(id):null,url=mine?waURL(l,c):'';
    $c('crmDetailContact').innerHTML=mine?`Contato do cadastrador: ${c?.telefone?safe(c.telefone):'Sem telefone'}${c?.email?' · '+safe(c.email):''}${url?` · <a href="${safe(url)}" target="_blank" rel="noopener noreferrer">Abrir WhatsApp ↗</a>`:''}`:'Telefone e e-mail privados — somente quem cadastrou pode visualizar.';
    $c('crmProposal').value=l.valor_proposta!=null?exibirMoeda(l.valor_proposta):'';$c('crmProposalNotes').value='';
    const r=await sb.from('crm_interacoes').select('id,tipo,descricao,valor,created_at').eq('lead_id',id).order('created_at',{ascending:false}).limit(100);
    if(r.error){$c('crmTimeline').textContent='Não foi possível carregar o histórico: '+r.error.message;return}
    $c('crmTimeline').innerHTML=(r.data||[]).length?(r.data||[]).map(a=>`<div class="crm-activity"><b>${safe(({contato:'Contato',visita:'Visita / test-drive',nota:'Nota interna',proposta:'Proposta',etapa:'Mudança de etapa'})[a.tipo]||a.tipo)}${a.valor!=null?' · '+safe(asBRL(a.valor)):''}</b><time>${safe(new Date(a.created_at).toLocaleString('pt-BR'))}</time><p>${safe(a.descricao||'—')}</p></div>`).join(''):'<p style="font-size:12px;color:#687967">Ainda não há atendimentos registrados.</p>';
  }
  async function showDetails(id){await loadDetails(id);$c('crmDetails').scrollIntoView({behavior:'smooth',block:'start'})}
  async function addActivity(){
    if(!state.detailId)return;const txt=$c('crmActivityText').value.trim(),type=$c('crmActivityType').value;if(!txt){detailMessage('Descreva o atendimento antes de salvar.',true);return}
    $c('crmAddActivity').disabled=true;detailMessage('Salvando atendimento…');
    try{const r=await sb.from('crm_interacoes').insert({lead_id:state.detailId,tipo:type,descricao:txt});if(r.error)throw r.error;$c('crmActivityText').value='';await loadDetails(state.detailId);detailMessage('Atendimento registrado.')}
    catch(e){detailMessage('Erro ao registrar: '+(e.message||e),true)}finally{$c('crmAddActivity').disabled=false}
  }
  async function addProposal(){
    if(!state.detailId)return;const value=valorEmReais($c('crmProposal').value);if(value===null||!Number.isFinite(value)||value<=0){detailMessage('Informe um valor de proposta válido.',true);return}
    $c('crmAddProposal').disabled=true;detailMessage('Registrando proposta…');
    try{const id=state.detailId;const r=await sb.rpc('crm_registrar_proposta',{p_lead_id:id,p_valor:value,p_descricao:$c('crmProposalNotes').value.trim()});if(r.error)throw r.error;await reload();detailMessage('Proposta registrada e etapa atualizada. Não houve lançamento financeiro.')}
    catch(e){detailMessage('Erro ao registrar proposta: '+(e.message||e),true)}finally{$c('crmAddProposal').disabled=false}
  }
  $c('crmNew').addEventListener('click',()=>beginForm(null));$c('crmCancel').onclick=()=>{$c('crmForm').classList.add('hide');state.editingId=null};
  $c('crmSave').onclick=()=>void saveForm();$c('crmRefresh').onclick=()=>void reload();
  $c('crmCloseDetails').onclick=closeDetails;$c('crmAddActivity').onclick=()=>void addActivity();$c('crmAddProposal').onclick=()=>void addProposal();
  $c('crmSearch').oninput=e=>{state.search=e.target.value.trim();render()};
  $c('crmFilterCompany').onchange=e=>{state.company=e.target.value;render()};
  $c('crmFilterStage').onchange=e=>{state.stage=e.target.value;render()};
  $c('crmFilterDue').onchange=e=>{state.due=e.target.value;render()};
  $c('crmVehicle').onchange=e=>{const v=(window.D?.veiculos||[]).find(x=>x.id===e.target.value);if(v)$c('crmCompany').value=v.empresa||'leal'};
  $c('crmProposal').oninput=function(){const i=this.selectionStart||this.value.length;this.value=formatarMoedaDigitando(this.value);try{this.setSelectionRange(this.value.length,this.value.length)}catch(e){}};
  $c('crmProposal').onblur=function(){const n=valorEmReais(this.value);if(n!=null&&Number.isFinite(n))this.value=exibirMoeda(n)};
  section.addEventListener('click',e=>{const button=e.target.closest('button');if(!button)return;
    if(button.dataset.crmFilterStage){state.stage=state.stage===button.dataset.crmFilterStage?'':button.dataset.crmFilterStage;$c('crmFilterStage').value=state.stage;render();return}
    const id=button.dataset.crmDetails||button.dataset.crmEdit;if(!id)return;
    if(button.dataset.crmDetails)void showDetails(id);else beginForm(id);
  });
  section.addEventListener('change',e=>{if(e.target.matches('[data-crm-stage]'))void changeStage(e.target.dataset.crmStage,e.target.value)});
  console.info('Central LJ · CRM V9 carregado. Tabelas CRM são ativadas pelo SQL 01-crm-v9.sql.');
})();
