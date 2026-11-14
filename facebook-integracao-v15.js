/* Central Leal + Jokar | Redes sociais v18 (arquivo mantém o nome v15)
   Publicação no Facebook e/ou Instagram da Jokar SOMENTE por ação explícita do admin:
   escolher as redes + marcar a autorização + confirmar. Tokens da Meta ficam no Supabase. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const editor = $('editor'), button = $('publishAutomatic'), company = $('company'), vehicle = $('vehicle');
  if (!editor || !button || !company || !vehicle) return;

  const BUCKET = 'veiculos-jokar';
  const IG_MAX_LEGENDA = 2200;
  const REDES = {
    facebook: { nome: 'Facebook', funcao: 'publicar-facebook-jokar', link: /^https:\/\/(www\.)?facebook\.com\//i },
    instagram: { nome: 'Instagram', funcao: 'publicar-instagram-jokar', link: /^https:\/\/(www\.)?instagram\.com\//i }
  };

  const card = document.createElement('div');
  card.id = 'fbPublishCard';
  card.style.cssText = 'margin:16px 0;padding:17px;border-radius:12px;background:#ecf7f2;border:1px solid #c3ddd1';
  card.innerHTML = '<h3 style="margin:0 0 8px">Publicação oficial · Jokar Automóveis</h3>' +
    '<p class="muted" style="margin:0 0 12px">Escolha onde publicar. A publicação sai no feed público da Jokar. Confira as fotos, a descrição e o preço antes de confirmar.</p>' +
    '<div style="display:flex;gap:10px;flex-wrap:wrap;margin:0 0 12px" role="group" aria-label="Redes sociais">' +
    '<label style="display:flex;align-items:center;gap:8px;background:#fff;border:1px solid #c3ddd1;border-radius:10px;padding:9px 13px;font-weight:650;cursor:pointer">' +
    '<input type="checkbox" id="redeFacebook" checked style="width:18px;height:18px"> Facebook</label>' +
    '<label style="display:flex;align-items:center;gap:8px;background:#fff;border:1px solid #c3ddd1;border-radius:10px;padding:9px 13px;font-weight:650;cursor:pointer">' +
    '<input type="checkbox" id="redeInstagram" style="width:18px;height:18px"> Instagram</label></div>' +
    '<label style="display:flex;align-items:flex-start;gap:10px;font-weight:650;line-height:1.4">' +
    '<input type="checkbox" id="fbPublishConsent" style="width:20px;height:20px;flex:none;margin-top:2px">' +
    '<span>Revisei todos os dados e autorizo a publicação deste veículo nas redes selecionadas.</span></label>' +
    '<p id="fbPublishHelp" class="muted" aria-live="polite" style="margin:12px 0 0"></p>' +
    '<div id="fbPublishResult" role="status" aria-live="polite" style="margin-top:8px"></div>';
  const actionRow = button.closest('.actions');
  if (actionRow && actionRow.parentNode) actionRow.parentNode.insertBefore(card, actionRow);
  else editor.appendChild(card);

  const consent = $('fbPublishConsent'), help = $('fbPublishHelp'), result = $('fbPublishResult');
  const check = { facebook: $('redeFacebook'), instagram: $('redeInstagram') };
  let car = null; // veículo atual (com caminhos das fotos), enviado por facebook-publicacoes.js
  document.addEventListener('fb:veiculo', e => { car = e.detail || null; });

  const getPayload = () => ({
    produto_id: vehicle.value,
    foto_indices: [...document.querySelectorAll('input[data-photo]:checked')]
      .map(x => Number(x.value)).filter(x => Number.isInteger(x) && x >= 1 && x <= 10),
    legenda: ($('caption')?.value || '').trim()
  });
  const redesEscolhidas = () => Object.keys(check).filter(k => check[k].checked);
  const nomes = lista => lista.map(k => REDES[k].nome).join(' e ');
  const fingerprint = p => JSON.stringify([p.produto_id, p.foto_indices, p.legenda]);
  let publishing = false;
  const attempts = {}; // um request_id por rede

  function status() {
    const p = getPayload(), jokar = company.value === 'jokar', redes = redesEscolhidas();
    const igLonga = check.instagram.checked && p.legenda.length > IG_MAX_LEGENDA;
    const ready = jokar && redes.length > 0 && !!p.produto_id && p.foto_indices.length > 0 && p.legenda.length >= 5 && !igLonga && consent.checked;
    button.disabled = publishing || !ready;
    button.textContent = publishing ? 'Publicando…' : !jokar ? 'Publicação da Leal indisponível' :
      redes.length ? 'Publicar no ' + nomes(redes) + ' da Jokar' : 'Escolha uma rede social';
    button.title = jokar ? 'Publicação real mediante confirmação do administrador' : 'As redes da Leal ainda não estão integradas';
    Object.values(check).forEach(c => { c.disabled = publishing || !jokar; });
    help.textContent = !jokar ? 'O envio automático está disponível somente para a Jokar. A Leal pode usar as ferramentas manuais.' :
      !redes.length ? 'Marque Facebook, Instagram ou os dois.' :
      !p.produto_id ? 'Selecione um veículo da Jokar.' :
      !p.foto_indices.length ? 'Selecione pelo menos uma foto do veículo.' :
      !p.legenda || p.legenda.length < 5 ? 'Escreva a legenda antes de publicar.' :
      igLonga ? 'A legenda tem ' + p.legenda.length + ' caracteres; o Instagram aceita até 2.200. Encurte o texto ou desmarque o Instagram.' :
      !consent.checked ? 'Marque a caixa de autorização para liberar o botão.' :
      'Pronto para publicar no ' + nomes(redes) + '. Haverá mais uma confirmação antes do envio.';
  }
  function invalidate() {
    consent.checked = false;
    Object.keys(attempts).forEach(k => delete attempts[k]);
    result.replaceChildren();
    status();
  }
  company.addEventListener('change', invalidate);
  vehicle.addEventListener('change', invalidate);
  $('photos')?.addEventListener('change', invalidate);
  $('caption')?.addEventListener('input', invalidate);
  $('regenerate')?.addEventListener('click', invalidate);
  Object.values(check).forEach(c => c.addEventListener('change', () => { consent.checked = false; status(); }));
  consent.addEventListener('change', status);
  new MutationObserver(status).observe($('photos'), { childList: true });

  // ---------- Fotos para o Instagram: JPEG, proporção entre 4:5 e 1,91:1, bordas brancas ----------
  async function blobToImage(blob) {
    if (window.createImageBitmap) return await createImageBitmap(blob);
    const url = URL.createObjectURL(blob);
    try { const img = new Image(); img.src = url; await img.decode(); return img; } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
  }
  function toJpeg(canvas, quality) { return new Promise((ok, fail) => canvas.toBlob(b => b ? ok(b) : fail(Error('Falha ao converter foto')), 'image/jpeg', quality)); }
  async function prepararFotosInstagram(client, slots) {
    if (!car) throw Error('Veículo não carregado. Selecione o veículo novamente.');
    const imagens = [];
    for (const slot of slots) {
      const path = car['foto_' + slot];
      if (!path) throw Error('Foto ' + slot + ' não está disponível.');
      const signed = await client.storage.from(BUCKET).createSignedUrl(path, 300);
      if (signed.error || !signed.data?.signedUrl) throw Error('Não foi possível acessar a foto ' + slot + '.');
      const resp = await fetch(signed.data.signedUrl);
      if (!resp.ok) throw Error('Falha ao baixar a foto ' + slot + '.');
      imagens.push(await blobToImage(await resp.blob()));
    }
    // Carrossel: todas as fotos na mesma proporção (a da primeira, dentro do limite do Instagram).
    const clamp = r => Math.min(1.91, Math.max(0.8, r));
    const ratio = clamp(imagens[0].width / imagens[0].height);
    const W = Math.min(1440, Math.max(640, imagens[0].width)), H = Math.round(W / ratio);
    const files = [];
    for (let i = 0; i < imagens.length; i++) {
      const img = imagens[i], canvas = document.createElement('canvas');
      canvas.width = W; canvas.height = H;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
      const s = Math.min(W / img.width, H / img.height), dw = img.width * s, dh = img.height * s;
      ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);
      let q = 0.9, blob = await toJpeg(canvas, q);
      while (blob.size > 7.5 * 1024 * 1024 && q > 0.5) { q -= 0.1; blob = await toJpeg(canvas, q); }
      files.push(new File([blob], 'foto-' + slots[i] + '.jpg', { type: 'image/jpeg' }));
      if (img.close) img.close();
    }
    return files;
  }

  // ---------- Envio para uma rede ----------
  async function publicarEm(rede, p, client, token) {
    const sig = fingerprint(p);
    if (!attempts[rede] || attempts[rede].sig !== sig) attempts[rede] = { sig, id: crypto.randomUUID() };
    const url = CONFIG.SUPABASE_URL.replace(/\/$/, '') + '/functions/v1/' + REDES[rede].funcao;
    const headers = { Authorization: 'Bearer ' + token, apikey: CONFIG.SUPABASE_KEY };
    let body;
    if (rede === 'instagram') {
      const files = await prepararFotosInstagram(client, p.foto_indices);
      body = new FormData();
      body.set('produto_id', p.produto_id); body.set('request_id', attempts[rede].id);
      body.set('legenda', p.legenda); body.set('foto_indices', JSON.stringify(p.foto_indices));
      files.forEach((f, i) => body.set('foto_' + i, f, f.name));
    } else {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify({ ...p, request_id: attempts[rede].id });
    }
    let response;
    try { response = await fetch(url, { method: 'POST', headers, body }); }
    catch (netErr) {
      // Sem resposta: o servidor pode ter publicado. Mantemos o mesmo request_id para não duplicar.
      throw Error('Sem resposta do servidor (conexão). Tentar de novo é seguro: o mesmo pedido não será publicado duas vezes.');
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) {
      delete attempts[rede]; // o servidor respondeu: a próxima tentativa é um pedido novo
      throw Error(data.error || data.message || ('A função do Supabase respondeu com erro HTTP ' + response.status + '.'));
    }
    delete attempts[rede];
    return data;
  }

  function linha(rede, ok, texto, data) {
    const box = document.createElement('div'); box.style.margin = '6px 0';
    const p = document.createElement('p'); p.className = ok ? 'success' : 'error'; p.style.margin = '0';
    p.textContent = (ok ? '✓ ' : '✗ ') + REDES[rede].nome + ': ' + texto;
    box.append(p);
    if (ok && data?.post_url && REDES[rede].link.test(data.post_url)) {
      const a = document.createElement('a'); a.textContent = 'Abrir publicação no ' + REDES[rede].nome + ' ↗';
      a.href = data.post_url; a.target = '_blank'; a.rel = 'noopener noreferrer'; box.append(a);
    }
    if (data?.aviso) { const m = document.createElement('p'); m.className = 'muted'; m.style.margin = '2px 0 0'; m.textContent = data.aviso; box.append(m); }
    result.append(box);
  }

  button.addEventListener('click', async () => {
    if (publishing || button.disabled) return;
    const p = getPayload(), redes = redesEscolhidas();
    if (company.value !== 'jokar' || !consent.checked || !redes.length || !p.produto_id || !p.foto_indices.length) return;
    if (!window.confirm('ATENÇÃO: Publicar ' + p.foto_indices.length + ' foto(s) e a legenda no FEED PÚBLICO da JOKAR AUTOMÓVEIS no ' + nomes(redes).toUpperCase() + '?')) return;
    publishing = true;
    status();
    result.replaceChildren();
    const aviso = document.createElement('p'); aviso.textContent = 'Publicando. Não feche esta página.'; result.append(aviso);
    let client = null, token = null;
    try {
      if (!window.supabase || !window.CONFIG) throw Error('Conexão com Supabase indisponível.');
      client = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);
      const session = await client.auth.getSession();
      token = session.data?.session?.access_token;
      if (!token || session.error) throw Error('Sessão expirada. Entre novamente na Central.');
    } catch (e) {
      result.replaceChildren(); const m = document.createElement('p'); m.className = 'error'; m.textContent = e?.message || String(e); result.append(m);
      publishing = false; status(); return;
    }
    let falhou = false;
    for (const rede of redes) {
      aviso.textContent = 'Publicando no ' + REDES[rede].nome + (rede === 'instagram' ? ' (preparando as fotos)' : '') + '… Não feche esta página.';
      try {
        const data = await publicarEm(rede, p, client, token);
        linha(rede, true, 'publicação confirmada pela Meta.', data);
        check[rede].checked = false; // evita repetir sem querer a rede que já saiu
      } catch (e) {
        falhou = true;
        linha(rede, false, e?.message || String(e));
      }
    }
    aviso.remove();
    consent.checked = false;
    if (falhou && redesEscolhidas().length) {
      const m = document.createElement('p'); m.className = 'muted'; m.style.margin = '8px 0 0';
      m.textContent = 'As redes que já publicaram foram desmarcadas. Para tentar de novo só a que falhou, marque a autorização outra vez.';
      result.append(m);
    }
    publishing = false; status();
  });
  status();
})();
