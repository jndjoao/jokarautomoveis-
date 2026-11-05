/* Central Leal + Jokar | Facebook v15
   Publicação somente por ação explícita do admin; token Meta fica no Supabase. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const editor = $('editor'), button = $('publishAutomatic'), company = $('company'), vehicle = $('vehicle');
  if (!editor || !button || !company || !vehicle) return;

  const card = document.createElement('div');
  card.id = 'fbPublishCard';
  card.style.cssText = 'margin:16px 0;padding:17px;border-radius:12px;background:#f0f7ec;border:1px solid #c9ddc3';
  card.innerHTML = '<h3 style="margin:0 0 8px">Publicação oficial · Jokar Automóveis</h3>' +
    '<p class="muted" style="margin:0 0 12px">Esta ação publicará no feed público da Página Jokar. Confira as fotos, a descrição e o preço antes de confirmar.</p>' +
    '<label style="display:flex;align-items:flex-start;gap:10px;font-weight:650;line-height:1.4">' +
    '<input type="checkbox" id="fbPublishConsent" style="width:20px;height:20px;flex:none;margin-top:2px">' +
    '<span>Revisei todos os dados e autorizo a publicação deste veículo no Facebook.</span></label>' +
    '<p id="fbPublishHelp" class="muted" aria-live="polite" style="margin:12px 0 0"></p>' +
    '<div id="fbPublishResult" role="status" aria-live="polite" style="margin-top:8px"></div>';
  const actionRow = button.closest('.actions');
  if (actionRow && actionRow.parentNode) actionRow.parentNode.insertBefore(card, actionRow);
  else editor.appendChild(card);

  const consent = $('fbPublishConsent'), help = $('fbPublishHelp'), result = $('fbPublishResult');
  const getPayload = () => ({
    produto_id: vehicle.value,
    foto_indices: [...document.querySelectorAll('input[data-photo]:checked')]
      .map(x => Number(x.value)).filter(x => Number.isInteger(x) && x >= 1 && x <= 10),
    legenda: ($('caption')?.value || '').trim()
  });
  const fingerprint = p => JSON.stringify([p.produto_id, p.foto_indices, p.legenda]);
  let publishing = false, attempt = null;

  function status() {
    const p = getPayload(), jokar = company.value === 'jokar';
    const ready = jokar && !!p.produto_id && p.foto_indices.length > 0 && p.legenda.length >= 5 && consent.checked;
    button.disabled = publishing || !ready;
    button.textContent = publishing ? 'Publicando no Facebook…' : jokar ? 'Publicar no Facebook da Jokar' : 'Publicação da Leal indisponível';
    button.title = jokar ? 'Publicação real mediante confirmação do administrador' : 'A Página da Leal ainda não está integrada';
    help.textContent = !jokar ? 'O envio automático está disponível somente para a Jokar. A Leal pode usar as ferramentas manuais.' :
      !p.produto_id ? 'Selecione um veículo da Jokar.' :
      !p.foto_indices.length ? 'Selecione pelo menos uma foto do veículo.' :
      !p.legenda || p.legenda.length < 5 ? 'Escreva a legenda antes de publicar.' :
      !consent.checked ? 'Marque a caixa de autorização para liberar o botão.' :
      'Pronto para publicar. Haverá mais uma confirmação antes do envio.';
  }
  function invalidate() {
    consent.checked = false;
    attempt = null;
    result.replaceChildren();
    status();
  }
  company.addEventListener('change', invalidate);
  vehicle.addEventListener('change', invalidate);
  $('photos')?.addEventListener('change', invalidate);
  $('caption')?.addEventListener('input', invalidate);
  $('regenerate')?.addEventListener('click', invalidate);
  consent.addEventListener('change', status);
  new MutationObserver(status).observe($('photos'), { childList: true });

  button.addEventListener('click', async () => {
    if (publishing || button.disabled) return;
    const p = getPayload();
    if (company.value !== 'jokar' || !consent.checked || !p.produto_id || !p.foto_indices.length) return;
    if (!window.confirm('ATENÇÃO: Publicar ' + p.foto_indices.length + ' foto(s) e a legenda no FEED PÚBLICO da Página JOKAR AUTOMÓVEIS?')) return;
    publishing = true;
    status();
    result.textContent = 'Enviando as fotos para o Facebook. Não feche esta página.';
    try {
      if (!window.supabase || !window.CONFIG) throw Error('Conexão com Supabase indisponível.');
      const client = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);
      const session = await client.auth.getSession();
      const token = session.data?.session?.access_token;
      if (!token || session.error) throw Error('Sessão expirada. Entre novamente na Central.');
      const sig = fingerprint(p);
      if (!attempt || attempt.sig !== sig) attempt = { sig, id: crypto.randomUUID() };
      const url = CONFIG.SUPABASE_URL.replace(/\/$/, '') + '/functions/v1/publicar-facebook-jokar';
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token, apikey: CONFIG.SUPABASE_KEY },
        body: JSON.stringify({ ...p, request_id: attempt.id })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) throw Error(data.error || 'A função do Supabase não confirmou a publicação.');
      result.replaceChildren();
      const success = document.createElement('p');
      success.className = 'success';
      success.textContent = 'Publicação confirmada pela Meta! ID: ' + data.post_id;
      result.append(success);
      if (data.post_url && /^https:\/\/(www\.)?facebook\.com\//i.test(data.post_url)) {
        const a = document.createElement('a'); a.textContent = 'Abrir publicação no Facebook ↗';
        a.href = data.post_url; a.target = '_blank'; a.rel = 'noopener noreferrer'; result.append(a);
      }
      if (data.aviso) { const p = document.createElement('p'); p.className = 'muted'; p.textContent = data.aviso; result.append(p); }
      attempt = null; consent.checked = false;
    } catch (e) {
      result.replaceChildren();
      const p = document.createElement('p'); p.className = 'error';
      p.textContent = (e?.message || String(e)) + ' Confira o feed da Jokar e a tabela facebook_publicacoes antes de tentar novamente.';
      result.append(p);
    } finally { publishing = false; status(); }
  });
  status();
})();
