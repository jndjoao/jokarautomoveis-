/* Central LJ | Painel Executivo V10 — complemento independente do CRM V9.
   Segurança: NÃO consulta crm_contatos_privados nem dados de telefone/e-mail.
   A autorização real passa por public.is_admin() no Supabase ANTES de toda consulta gerencial. */
(function(){
  'use strict';
  var $g=function(id){return document.getElementById(id)};
  var html=function(s){return String(s===null||s===undefined?'':s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})};
  var money=function(n){return typeof n==='number'&&Number.isFinite(n)?n.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}):'—'};
  var number=function(n){return Number(n||0).toLocaleString('pt-BR')};
  var percentage=function(n){return Number.isFinite(n)?n.toLocaleString('pt-BR',{maximumFractionDigits:1})+'%':'—'};
  var companyNames={leal:'Leal Veículos',jokar:'Jokar Automóveis'};
  var currentUid=null,checking=false,adminReady=false,dataLoaded=false,roleAttempt=0;
  var data={leads:[],sales:[],movements:[],vehicles:[],interactions:[]};
  var filters={company:'',period:'current',start:'',end:''};
  var cachedSession=null;
  var tableCap=10000;

  function todayLocal(){var d=new Date();return new Date(d.getFullYear(),d.getMonth(),d.getDate())}
  function localYMD(d){var x=new Date(d);if(Number.isNaN(x.getTime()))return '';return String(x.getFullYear())+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0')}
  function brazilDay(value){if(!value)return '';var v=String(value);if(/^\d{4}-\d{2}-\d{2}$/.test(v))return v;var d=new Date(value);if(Number.isNaN(d.getTime()))return '';return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(d)}
  function friendlyDate(s){var x=String(s||'').slice(0,10);return /^\d{4}-\d{2}-\d{2}$/.test(x)?x.slice(8,10)+'/'+x.slice(5,7)+'/'+x.slice(0,4):'—'}
  function seller(v){return String(v||'').trim().toLowerCase()}
  function sellerName(v){var x=String(v||'Sem vendedor');return x.includes('@')?x.split('@')[0]:x.length>30?x.slice(0,30):x}
  function periodBounds(){
    var now=todayLocal(),beg,end;
    if(filters.period==='all')return null;
    if(filters.period==='previous'){beg=new Date(now.getFullYear(),now.getMonth()-1,1);end=new Date(now.getFullYear(),now.getMonth(),0)}
    else if(filters.period==='90'){beg=new Date(now);beg.setDate(beg.getDate()-89);end=now}
    else if(filters.period==='custom'){return{start:filters.start||'0000-01-01',end:filters.end||'9999-12-31'}}
    else{beg=new Date(now.getFullYear(),now.getMonth(),1);end=now}
    return{start:localYMD(beg),end:localYMD(end)};
  }
  function inPeriod(value,bounds){if(!bounds)return true;var date=brazilDay(value);return !!date&&date>=bounds.start&&date<=bounds.end}
  function filterCompany(rows){return rows.filter(function(x){return !filters.company||x.empresa===filters.company})}
  function byPeriod(rows,field,bounds){return rows.filter(function(x){return inPeriod(x[field],bounds)})}
  function isOpen(l){return l.etapa!=='ganho'&&l.etapa!=='perdido'}
  function dueKind(l,now){if(!isOpen(l)||!l.proximo_contato)return '';return l.proximo_contato<now?'late':l.proximo_contato===now?'today':''}
  function sum(rows,key){return rows.reduce(function(acc,x){var value=Number(x[key]);return acc+(Number.isFinite(value)?value:0)},0)}
  function leadKey(l){return seller(l.criado_por)||'usuario:'+String(l.owner_uid||'sem-id')}
  function saleKey(v){return seller(v.criado_por)||'sem vendedor'}
  function escCap(x){return html(String(x).slice(0,200))}
  function empty(t){return '<div class="gx-empty">'+html(t)+'</div>'}
  function kpi(label,value,caption,cls){return '<div class="gx-kpi '+(cls||'')+'"><span>'+html(label)+'</span><b>'+html(value)+'</b><small>'+html(caption||'')+'</small></div>'}

  function inject(){
    var app=$g('app'),desktop=document.querySelector('.topnav'),mobile=document.querySelector('.mobile-nav'),crm=$g('v4');
    if(!app||!desktop||!mobile||!crm)return false;
    if(!$g('t5')) desktop.insertAdjacentHTML('beforeend','<button id="t5" type="button" title="Indicadores de administrador">Gestão</button>');
    if(!$g('t5m')) mobile.insertAdjacentHTML('beforeend','<button id="t5m" type="button" title="Indicadores de administrador"><span class="nav-glyph">▥</span><span>Gestão</span></button>');
    if(!$g('v5')) crm.insertAdjacentHTML('afterend',
      '<section id="v5" class="hide gx-root" aria-label="Dashboard executivo exclusivo do administrador">'
      +'<div class="gx-head"><div><span class="gx-kicker">Leal + Jokar • Central do Gestor</span><h2>Dashboard executivo</h2>'
      +'<p>Acompanhe vendas, equipe, funil de negociação e pendências comerciais em um só lugar.</p></div>'
      +'<div class="gx-head-actions"><button class="gx-action primary" id="gxRefresh" type="button">↻ Atualizar indicadores</button></div></div>'
      +'<div class="gx-panel gx-panel-dark"><div class="gx-dark-intro"><div><small>VISÃO GERENCIAL • ACESSO RESTRITO</small><h3>Performance comercial das duas lojas</h3></div><span class="gx-admin-mark">ADMIN</span></div>'
      +'<div id="gxSnapshot" class="gx-mini-row" style="margin-top:12px"></div><div class="gx-privacy">Dados consolidados sem telefones e e-mails. Os contatos privados seguem restritos ao vendedor cadastrador no CRM.</div></div>'
      +'<div class="gx-panel gx-controls">'
      +'<div class="gx-field"><label for="gxCompany">Empresa</label><select id="gxCompany"><option value="">Leal + Jokar</option><option value="leal">Leal Veículos</option><option value="jokar">Jokar Automóveis</option></select></div>'
      +'<div class="gx-field"><label for="gxPeriod">Período comercial</label><select id="gxPeriod"><option value="current">Este mês</option><option value="previous">Mês anterior</option><option value="90">Últimos 90 dias</option><option value="all">Todo o histórico</option><option value="custom">Escolher datas</option></select></div>'
      +'<div class="gx-field gx-custom"><label for="gxStart">Data inicial</label><input id="gxStart" type="date"></div>'
      +'<div class="gx-field gx-custom"><label for="gxEnd">Data final</label><input id="gxEnd" type="date"></div>'
      +'<div class="gx-field"><label>Última leitura</label><div id="gxUpdated" style="font-size:12px;color:#637264;min-height:42px;display:flex;align-items:center">—</div></div></div>'
      +'<p id="gxStatus" class="gx-status" role="status">Carregando indicadores…</p>'
      +'<div class="gx-kpis" id="gxSalesKpis"></div><div class="gx-kpis" id="gxCrmKpis"></div>'
      +'<div class="gx-duo"><div class="gx-panel"><div class="gx-section-title"><h3>Funil comercial do CRM</h3><small>Etapa atual dos leads captados no período</small></div><div id="gxFunnel" class="gx-funnel"></div></div>'
      +'<div class="gx-panel"><div class="gx-section-title"><h3>Faturamento mensal</h3><small>Últimos 6 meses · vendas efetivas</small></div><div id="gxChart" class="gx-month-bars"></div></div></div>'
      +'<div class="gx-duo gx-duo-even"><div class="gx-panel"><div class="gx-section-title"><h3>Comparativo por loja</h3><small>Período selecionado</small></div><div id="gxCompanies" class="gx-split"></div></div>'
      +'<div class="gx-panel"><div class="gx-section-title"><h3>Retornos que exigem atenção</h3><small>Todas as negociações abertas, mesmo antigas</small></div><div id="gxAlerts" class="gx-alerts"></div></div></div>'
      +'<div class="gx-panel"><div class="gx-section-title"><h3>Desempenho da equipe</h3><small>Leads e vendas atribuídos ao responsável por cada registro</small></div><div class="gx-teams"><table class="gx-table"><thead><tr><th>Vendedor</th><th>Leads</th><th>Visitas</th><th>Propostas</th><th>Ganhos CRM</th><th>Atendimentos</th><th>Vendas</th><th>Faturamento</th><th>Pendências</th></tr></thead><tbody id="gxTeam"></tbody></table></div></div>'
      +'<p class="gx-footnote">Os indicadores de CRM e as vendas confirmadas são medidos separadamente: marcar um lead como “Fechado no CRM” não registra uma venda no financeiro. Margem bruta estimada = valor das vendas menos custo de aquisição registrado na venda; não inclui despesas extras. Os retornos atrasados consideram todo o estoque de negociações abertas, independente do período escolhido.</p>'
      +'</section>');
    var oldTab=window.tab;
    if(typeof oldTab!=='function')return false;
    window.tab=function(n){
      if(n===5&&!adminReady)return;
      oldTab(n);
      var panel=$g('v5'),nav=$g('t5'),navm=$g('t5m');
      if(panel)panel.classList.toggle('hide',n!==5);
      if(nav)nav.classList.toggle('on',n===5);
      if(navm)navm.classList.toggle('on',n===5);
      if(n===5)void loadDashboard();
    };
    $g('t5').onclick=function(){window.tab(5)};
    $g('t5m').onclick=function(){window.tab(5)};
    // A navegação legada 1–3 chama tab() diretamente; escondemos esta aba também nesses cliques.
    ['t1','t2','t3','t1m','t2m','t3m'].forEach(function(id){
      var nav=$g(id);if(nav)nav.addEventListener('click',function(){
        if($g('v5'))$g('v5').classList.add('hide');
        if($g('t5'))$g('t5').classList.remove('on');
        if($g('t5m'))$g('t5m').classList.remove('on');
      });
    });
    ['gxCompany','gxPeriod','gxStart','gxEnd'].forEach(function(id){$g(id).addEventListener('change',function(){filters.company=$g('gxCompany').value;filters.period=$g('gxPeriod').value;filters.start=$g('gxStart').value;filters.end=$g('gxEnd').value;$g('v5').classList.toggle('gx-custom-active',filters.period==='custom');if(dataLoaded)render();})});
    $g('gxRefresh').onclick=function(){void loadDashboard(true)};
    return true;
  }
  function remove(){
    adminReady=false;dataLoaded=false;currentUid=null;
    data={leads:[],sales:[],movements:[],vehicles:[],interactions:[]};
    if($g('v5')&&!$g('v5').classList.contains('hide'))window.tab(1);
    ['t5','t5m','v5'].forEach(function(id){var e=$g(id);if(e)e.remove()});
  }
  async function authorization(){
    if(!window.sb||checking)return;
    checking=true;
    var attempt=++roleAttempt;
    try{
      var session=await sb.auth.getSession();
      var user=session.data&&session.data.session&&session.data.session.user;
      if(!user){remove();return}
      var result=await sb.rpc('is_admin');
      if(result.error||result.data!==true){remove();return}
      if(attempt!==roleAttempt)return;
      if(currentUid!==user.id){remove();currentUid=user.id;adminReady=true;inject()}
      else if(!$g('v5')){adminReady=true;inject()}
      adminReady=true;
    }catch(e){console.warn('Gestão: falha ao confirmar o administrador',e);remove()}
    finally{checking=false}
  }
  async function selectAll(table,columns){
    var results=[];
    for(var start=0;start<tableCap;start+=1000){
      var res=await sb.from(table).select(columns).order('id',{ascending:true}).range(start,start+999);
      if(res.error)throw new Error(table+': '+res.error.message);
      var batch=res.data||[];results.push.apply(results,batch);
      if(batch.length<1000)return results;
    }
    throw new Error('Limite de 10 mil registros atingido em '+table+'. É necessário implementar consulta paginada no servidor antes de exibir números completos.');
  }
  async function loadDashboard(force){
    if(!adminReady||!currentUid||!$g('v5'))return;
    var check=await sb.rpc('is_admin');
    if(check.error||check.data!==true){remove();return}
    var getSession=await sb.auth.getSession(),uid=getSession.data&&getSession.data.session&&getSession.data.session.user&&getSession.data.session.user.id;
    if(uid!==currentUid){remove();return}
    var btn=$g('gxRefresh');if(btn)btn.disabled=true;
    $g('gxStatus').textContent='Atualizando dados do gestor…';
    try{
      // Intencionalmente não consulta a tabela crm_contatos_privados nem observações livres dos leads.
      var result=await Promise.all([
        selectAll('crm_leads','id,owner_uid,criado_por,empresa,nome,etapa,valor_proposta,proximo_contato,created_at,updated_at'),
        selectAll('vendas','id,empresa,criado_por,valor,custo_snapshot,data'),
        selectAll('movimentos','id,empresa,tipo,valor,data'),
        selectAll('produtos','id,empresa,status,valor,created_at'),
        selectAll('crm_interacoes','id,lead_id,autor_uid,tipo,created_at')
      ]);
      var again=await sb.auth.getSession(),sessionUser=again.data&&again.data.session&&again.data.session.user&&again.data.session.user.id;
      if(sessionUser!==currentUid){remove();return}
      data={leads:result[0],sales:result[1],movements:result[2],vehicles:result[3],interactions:result[4]};
      dataLoaded=true;
      $g('gxUpdated').textContent=new Date().toLocaleString('pt-BR',{hour:'2-digit',minute:'2-digit',day:'2-digit',month:'2-digit'});
      $g('gxStatus').textContent='Indicadores atualizados. '+number(data.leads.length)+' leads e '+number(data.sales.length)+' vendas analisados.';
      render();
    }catch(e){$g('gxStatus').textContent='Não foi possível carregar os indicadores: '+String(e&&e.message||e);$g('gxStatus').classList.add('gx-error');if(!dataLoaded){['gxSalesKpis','gxCrmKpis','gxFunnel','gxChart','gxCompanies','gxAlerts','gxTeam'].forEach(function(id){var x=$g(id);if(x)x.innerHTML='';})}}
    finally{if($g('gxRefresh'))$g('gxRefresh').disabled=false}
  }
  function render(){
    if(!dataLoaded||!adminReady||!$g('v5'))return;
    var bounds=periodBounds();
    var leadsAll=filterCompany(data.leads),leads=byPeriod(leadsAll,'created_at',bounds);
    var sales=byPeriod(filterCompany(data.sales),'data',bounds),movements=byPeriod(filterCompany(data.movements),'data',bounds);
    var vehicles=filterCompany(data.vehicles),open=leadsAll.filter(isOpen),now=localYMD(todayLocal());
    var late=open.filter(function(l){return dueKind(l,now)==='late'}),due=open.filter(function(l){return dueKind(l,now)==='today'});
    var noSchedule=open.filter(function(l){return !l.proximo_contato});
    var revenue=sum(sales,'valor'),costKnown=sales.filter(function(x){return x.custo_snapshot!==null&&x.custo_snapshot!==undefined});
    var costMissing=sales.length-costKnown.length,knownRevenue=sum(costKnown,'valor'),margin=knownRevenue-sum(costKnown,'custo_snapshot');
    var entries=sum(movements.filter(function(x){return x.tipo==='entrada'}),'valor'),exits=sum(movements.filter(function(x){return x.tipo==='saida'}),'valor');
    var won=leads.filter(function(l){return l.etapa==='ganho'}),lost=leads.filter(function(l){return l.etapa==='perdido'});
    var visited=leads.filter(function(l){return l.etapa==='visita'});
    var proposal=leads.filter(function(l){return l.etapa==='proposta'}),proposalAmount=sum(proposal,'valor_proposta');
    var conversion=leads.length?won.length/leads.length*100:0;
    var leadIds=new Set(leads.map(function(l){return l.id}));
    var interactions=byPeriod(data.interactions,'created_at',bounds).filter(function(i){return leadIds.has(i.lead_id)});
    $g('gxSnapshot').innerHTML='<span>'+number(vehicles.filter(function(v){return v.status==='disponivel'}).length)+' disponíveis</span>'
      +'<span>'+number(open.length)+' negociações ativas</span>'
      +'<span>'+number(late.length)+' retornos atrasados</span>'
      +'<span>'+number(due.length)+' retornos hoje</span>';
    $g('gxSalesKpis').innerHTML=[
      kpi('Faturamento de vendas',money(revenue),'Vendas efetivadas no período','gold'),
      kpi('Vendas realizadas',number(sales.length),'Em ambas as lojas ou no filtro','green'),
      kpi('Ticket médio',sales.length?money(revenue/sales.length):'—','Valor médio por venda','blue'),
      kpi('Margem bruta estimada',costKnown.length?money(margin):'—',costMissing?'Parcial — '+costMissing+' venda(s) sem custo':'Sem despesas extras deduzidas','green'),
    ].join('');
    $g('gxCrmKpis').innerHTML=[
      kpi('Leads recebidos',number(leads.length),number(interactions.length)+' interações registradas · leads criados no período','blue'),
      kpi('Visitas agendadas',number(visited.length),'Etapa atual do funil','gold'),
      kpi('Propostas abertas',money(proposalAmount),number(proposal.length)+' proposta(s) em aberto','blue'),
      kpi('Fechamentos no CRM',number(won.length),percentage(conversion)+' dos leads captados no período','green'),
      kpi('Follow-ups atrasados',number(late.length),'Pendentes em todo o CRM','red'),
      kpi('Follow-ups hoje',number(due.length),'Negociações em aberto','gold'),
      kpi('Sem retorno marcado',number(noSchedule.length),'Negociações abertas sem data','red'),
      kpi('Fluxo de caixa',money(entries-exits),'Entradas '+money(entries)+' · saídas '+money(exits),'blue')
    ].join('');
    renderFunnel(leads);
    renderChart(filterCompany(data.sales));
    renderCompanies(bounds);
    renderAlerts(late,due);
    renderTeam(leads,sales,late,interactions);
  }
  function renderFunnel(leads){
    var stages=[['Interessados',leads.filter(function(l){return l.etapa==='novo'||l.etapa==='contato'}).length],['Visitas agendadas',leads.filter(function(l){return l.etapa==='visita'}).length],['Propostas',leads.filter(function(l){return l.etapa==='proposta'}).length],['Ganhos no CRM',leads.filter(function(l){return l.etapa==='ganho'}).length]];
    var max=Math.max(1,...stages.map(function(x){return x[1]}));
    $g('gxFunnel').innerHTML=stages.map(function(x){return '<div class="gx-funnel-row"><span class="gx-funnel-name">'+html(x[0])+'</span><div class="gx-track"><div class="gx-fill" style="width:'+Math.round(x[1]/max*100)+'%"></div></div><span class="gx-funnel-count">'+number(x[1])+'</span></div>'}).join('');
  }
  function renderChart(sales){
    var now=todayLocal(),months=[];
    for(var i=5;i>=0;i--){var d=new Date(now.getFullYear(),now.getMonth()-i,1);months.push({key:localYMD(d).slice(0,7),label:d.toLocaleDateString('pt-BR',{month:'short'}).replace('.',''),value:0})}
    sales.forEach(function(v){var key=brazilDay(v.data).slice(0,7),match=months.find(function(m){return m.key===key});if(match)match.value+=Number(v.valor||0)});
    var max=Math.max(1,...months.map(function(m){return m.value}));
    $g('gxChart').innerHTML=months.map(function(m){return '<div class="gx-month"><span class="gx-amount" title="'+html(money(m.value))+'">'+(m.value>=1000?number(Math.round(m.value/1000))+' mil':number(m.value))+'</span><div class="gx-barspace"><div class="gx-bar" style="height:'+Math.round(m.value/max*100)+'%"></div></div><span>'+html(m.label)+'</span></div>'}).join('');
  }
  function renderCompanies(bounds){
    var companies=filters.company?[filters.company]:['leal','jokar'];
    $g('gxCompanies').innerHTML=companies.map(function(c){
      var leads=byPeriod(data.leads.filter(function(l){return l.empresa===c}),'created_at',bounds);
      var sales=byPeriod(data.sales.filter(function(s){return s.empresa===c}),'data',bounds);
      var open=data.leads.filter(function(l){return l.empresa===c&&isOpen(l)}).length;
      return '<div class="gx-company '+c+'"><h4>'+html(companyNames[c])+'</h4><ul>'
        +'<li>Faturamento <b>'+money(sum(sales,'valor'))+'</b></li>'
        +'<li>Vendas <b>'+number(sales.length)+'</b></li>'
        +'<li>Leads captados <b>'+number(leads.length)+'</b></li>'
        +'<li>Negociações ativas <b>'+number(open)+'</b></li>'
        +'<li>Fechamentos CRM <b>'+number(leads.filter(function(l){return l.etapa==='ganho'}).length)+'</b></li>'
        +'</ul></div>';
    }).join('');
  }
  function renderAlerts(late,today){
    var items=late.slice().sort(function(a,b){return String(a.proximo_contato).localeCompare(String(b.proximo_contato))}).concat(today);
    var root=$g('gxAlerts');if(!items.length){root.innerHTML=empty('Nenhum follow-up atrasado ou previsto para hoje.');return}
    root.innerHTML=items.slice(0,20).map(function(l){
      var isLate=l.proximo_contato<localYMD(todayLocal());
      return '<div class="gx-alert"><div><strong>'+escCap(l.nome||'Lead')+'</strong><small>'+html(companyNames[l.empresa]||'Loja')+' · '+escCap(sellerName(l.criado_por))+'</small></div><span class="gx-date">'+(isLate?'Atrasado · ':'Hoje · ')+friendlyDate(l.proximo_contato)+'</span></div>';
    }).join('')+(items.length>20?'<div class="gx-status">Mais '+number(items.length-20)+' pendências não exibidas. Consulte o CRM para gerenciar todos os retornos.</div>':'');
  }
  function renderTeam(leads,sales,late,interactions){
    var people={};
    function get(k){if(!people[k])people[k]={label:k,leads:0,visits:0,proposals:0,wins:0,contacts:0,sales:0,revenue:0,late:0};return people[k]}
    leads.forEach(function(l){var p=get(leadKey(l));p.leads++;if(l.etapa==='visita')p.visits++;if(l.etapa==='proposta')p.proposals++;if(l.etapa==='ganho')p.wins++});
    sales.forEach(function(v){var p=get(saleKey(v));p.sales++;p.revenue+=Number(v.valor||0)});
    late.forEach(function(l){get(leadKey(l)).late++});
    var uidMap={};data.leads.forEach(function(l){if(l.owner_uid&&l.criado_por)uidMap[String(l.owner_uid)]=seller(l.criado_por)});
    interactions.forEach(function(i){if(['contato','visita','nota','proposta'].includes(i.tipo)){get(uidMap[String(i.autor_uid)]||String(i.autor_uid||'sem vendedor')).contacts++}});
    var rows=Object.values(people).sort(function(a,b){return b.revenue-a.revenue||b.sales-a.sales||b.leads-a.leads||b.late-a.late});
    $g('gxTeam').innerHTML=rows.length?rows.map(function(p){return '<tr><td><strong>'+escCap(sellerName(p.label))+'</strong><small>'+escCap(p.label)+'</small></td>'
      +'<td class="gx-num">'+number(p.leads)+'</td><td class="gx-num">'+number(p.visits)+'</td><td class="gx-num">'+number(p.proposals)+'</td>'
      +'<td class="gx-num">'+number(p.wins)+'</td><td class="gx-num">'+number(p.contacts)+'</td><td class="gx-num">'+number(p.sales)+'</td><td class="gx-num"><strong>'+money(p.revenue)+'</strong></td>'
      +'<td class="gx-num '+(p.late?'gx-warn':'')+'">'+number(p.late)+'</td></tr>'}).join(''):'<tr><td colspan="8">Nenhuma movimentação no período selecionado.</td></tr>';
  }
  function start(){
    if(!window.sb||!document.querySelector('.topnav'))return;
    // A autorização é consultada novamente quando o usuário abre esta aba.
    void authorization();
    if(sb.auth&&sb.auth.onAuthStateChange){sb.auth.onAuthStateChange(function(event){
      // Evita usar chamadas async do Supabase diretamente dentro do callback.
      if(event==='SIGNED_OUT'){roleAttempt++;remove();return}
      if(event==='SIGNED_IN'||event==='INITIAL_SESSION'||event==='TOKEN_REFRESHED'){
        setTimeout(function(){void authorization()},50);
      }
    })}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
