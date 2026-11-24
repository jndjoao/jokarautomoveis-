/* Catálogo → lead no CRM antes de abrir o WhatsApp.
   Pede nome e WhatsApp, registra o lead (função protegida catalogo_registrar_lead, dono = admin)
   e abre a conversa. O cliente pode pular e abrir o WhatsApp direto. Se algo falhar, o WhatsApp abre do mesmo jeito. */
(function () {
  'use strict';
  const supa = window.supabase && window.CONFIG && CONFIG.SUPABASE_URL && CONFIG.SUPABASE_KEY
    ? window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY, { auth: { persistSession: false } }) : null;
  const LOJAS = { jokar: 'Jokar Automóveis', leal: 'Leal Veículos' };
  const KEY = 'catalogoLeadCliente';
  const css = `.cl-ovl{position:fixed;inset:0;background:rgba(0,0,0,.6);-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px);display:flex;align-items:flex-end;justify-content:center;z-index:2000}
.cl-ovl[hidden]{display:none}
@media(min-width:700px){.cl-ovl{align-items:center}}
.cl-card{background:var(--dark,#111511);color:#f2f5ef;border:1px solid rgba(255,255,255,.12);border-radius:22px 22px 0 0;width:100%;max-width:440px;padding:22px 20px calc(26px + env(safe-area-inset-bottom,0px));box-shadow:0 -10px 40px rgba(0,0,0,.4);position:relative;font-family:inherit}
@media(min-width:700px){.cl-card{border-radius:22px;padding-bottom:24px}}
.cl-x{position:absolute;top:14px;right:14px;border:0;background:rgba(255,255,255,.1);color:#fff;border-radius:10px;width:34px;height:34px;font-size:15px;cursor:pointer}
.cl-card h3{margin:0 40px 0 0;font-size:19px;color:#fff}.cl-card p{margin:6px 0 0;color:rgba(255,255,255,.7);font-size:13px;line-height:1.45}
.cl-car{display:flex;gap:12px;align-items:center;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:14px;padding:10px;margin:12px 0 4px}
.cl-car img,.cl-car .cl-ph{width:64px;height:48px;border-radius:9px;object-fit:cover;flex:none;background:rgba(255,255,255,.1)}
.cl-car b{display:block;font-size:14px;color:#fff}.cl-car span{font-size:12px;color:rgba(255,255,255,.7)}
.cl-card label{display:block;font-size:12px;font-weight:700;color:rgba(255,255,255,.85);margin:14px 0 6px}
.cl-card input{width:100%;box-sizing:border-box;min-height:48px;border-radius:12px;border:1px solid rgba(255,255,255,.18);background:rgba(0,0,0,.35);color:#fff;padding:10px 13px;font:inherit;font-size:16px}
.cl-card input:focus{outline:2px solid var(--lime,#19a95c);outline-offset:1px}
.cl-err{min-height:16px;color:#ffb4b4!important;font-size:12.5px!important}
.cl-go{width:100%;margin-top:12px;min-height:50px;border:0;border-radius:13px;background:#19a95c;color:#fff;font:inherit;font-weight:800;font-size:15px;cursor:pointer}
.cl-go:disabled{opacity:.7;cursor:wait}
.cl-skip{display:block;width:100%;margin-top:10px;background:none;border:0;color:rgba(255,255,255,.7);font:inherit;font-size:12.5px;text-decoration:underline;cursor:pointer}
.cl-lgpd{font-size:11px!important;color:rgba(255,255,255,.5)!important;margin-top:12px!important;text-align:center}`;
  const st = document.createElement('style'); st.textContent = css; document.head.append(st);

  const ovl = document.createElement('div');
  ovl.className = 'cl-ovl'; ovl.hidden = true;
  ovl.setAttribute('role', 'dialog'); ovl.setAttribute('aria-modal', 'true'); ovl.setAttribute('aria-labelledby', 'clTitle');
  ovl.innerHTML = '<div class="cl-card"><button type="button" class="cl-x" aria-label="Fechar">✕</button>' +
    '<h3 id="clTitle"></h3><p>Deixe seu nome e WhatsApp para um vendedor te atender sobre este veículo.</p>' +
    '<div class="cl-car"><span class="cl-ph"></span><div><b class="cl-car-nome"></b><span class="cl-car-info"></span></div></div>' +
    '<label for="clNome">Seu nome *</label><input id="clNome" type="text" maxlength="80" autocomplete="name" placeholder="Como podemos te chamar?">' +
    '<label for="clTel">Seu WhatsApp *</label><input id="clTel" type="tel" inputmode="tel" maxlength="20" autocomplete="tel" placeholder="(62) 9 9999-9999">' +
    '<p class="cl-err" role="alert"></p>' +
    '<button type="button" class="cl-go">💬 Continuar no WhatsApp</button>' +
    '<button type="button" class="cl-skip">Prefiro não informar, abrir o WhatsApp direto</button>' +
    '<p class="cl-lgpd"></p></div>';
  document.body.append(ovl);
  const q = s => ovl.querySelector(s), nome = q('#clNome'), tel = q('#clTel'), err = q('.cl-err'), go = q('.cl-go');
  let atual = null; // { href, id, empresa }

  const digits = v => String(v || '').replace(/\D/g, '');
  function mask(v) {
    let d = digits(v); if (d.startsWith('55') && d.length > 11) d = d.slice(2); d = d.slice(0, 11);
    if (d.length <= 2) return d; if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 3)} ${d.slice(3, 7)}-${d.slice(7)}`;
  }
  tel.addEventListener('input', () => { tel.value = mask(tel.value); err.textContent = ''; });
  nome.addEventListener('input', () => { err.textContent = ''; });

  function abrirWhatsApp(win) {
    if (!atual) return;
    if (win && !win.closed) win.location.href = atual.href; else window.location.href = atual.href;
  }
  function fechar() { ovl.hidden = true; atual = null; }

  function abrir(link) {
    const nomeCarro = link.dataset.leadNome || 'Veículo', empresa = link.dataset.leadEmpresa || '';
    atual = { href: link.href, id: link.dataset.leadCar, empresa };
    const loja = LOJAS[empresa] || 'loja';
    q('#clTitle').textContent = 'Falar com a ' + loja.split(' ')[0] + ' no WhatsApp';
    q('.cl-car-nome').textContent = nomeCarro;
    q('.cl-car-info').textContent = link.dataset.leadInfo || '';
    const img = link.closest('article, .modal, [role="dialog"]')?.querySelector('img');
    const ph = q('.cl-car .cl-ph, .cl-car img');
    if (img && img.src) { const i = document.createElement('img'); i.src = img.src; i.alt = ''; ph.replaceWith(i); }
    else if (ph.tagName === 'IMG') { const s = document.createElement('span'); s.className = 'cl-ph'; ph.replaceWith(s); }
    q('.cl-lgpd').textContent = 'Ao continuar, você autoriza a ' + loja + ' a entrar em contato sobre este veículo.';
    err.textContent = ''; go.disabled = false;
    try { const salvo = JSON.parse(localStorage.getItem(KEY) || 'null'); if (salvo) { nome.value = salvo.nome || ''; tel.value = mask(salvo.tel || ''); } } catch (e) { /* opcional */ }
    ovl.hidden = false;
    setTimeout(() => (nome.value ? tel : nome).focus(), 30);
  }

  // Intercepta só os botões de WhatsApp dos veículos (que trazem data-lead-car).
  document.addEventListener('click', e => {
    const link = e.target.closest('a.whats[data-lead-car]');
    if (!link || !link.href) return;
    e.preventDefault();
    abrir(link);
  }, true);

  q('.cl-x').onclick = fechar;
  ovl.addEventListener('click', e => { if (e.target === ovl) fechar(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !ovl.hidden) fechar(); });
  q('.cl-skip').onclick = () => { const win = window.open(atual.href, '_blank', 'noopener'); if (!win) abrirWhatsApp(null); fechar(); };

  go.onclick = async () => {
    const n = nome.value.trim().replace(/\s+/g, ' '); let t = digits(tel.value);
    if (t.startsWith('55') && (t.length === 12 || t.length === 13)) t = t.slice(2);
    if (n.length < 2) { err.textContent = 'Informe seu nome.'; nome.focus(); return; }
    if (t.length !== 10 && t.length !== 11) { err.textContent = 'Informe seu WhatsApp com DDD.'; tel.focus(); return; }
    // Abre a aba já no clique (evita bloqueio de pop-up no celular).
    const win = window.open('about:blank', '_blank');
    go.disabled = true; err.textContent = '';
    try { localStorage.setItem(KEY, JSON.stringify({ nome: n, tel: t })); } catch (e) { /* opcional */ }
    try {
      if (supa && atual && atual.id) {
        // Não deixa o cliente esperando: no máximo 4 s; se falhar, segue para o WhatsApp mesmo assim.
        await Promise.race([
          supa.rpc('catalogo_registrar_lead', { p_produto_id: atual.id, p_nome: n, p_telefone: t }),
          new Promise(r => setTimeout(r, 4000))
        ]);
      }
    } catch (e) { console.warn('Lead do catálogo não registrado:', e); }
    abrirWhatsApp(win);
    fechar();
  };
})();
