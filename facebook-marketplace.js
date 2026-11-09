/* Central Leal + Jokar | Marketplace (manual assistido) v1
   O Facebook não permite publicar veículos no Marketplace por API.
   Este módulo apenas prepara os campos para o vendedor copiar e colar no formulário
   do Marketplace. Não envia nada ao Facebook e não grava nada no banco. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const editor = $('editor');
  if (!editor) return;

  const MARKETPLACE_URL = 'https://www.facebook.com/marketplace/create/vehicle';
  const names = { jokar: 'Jokar Automóveis', leal: 'Leal Veículos' };
  let car = null;

  const onlyDigits = v => String(v ?? '').replace(/\D/g, '');
  const modelYear = ano => { const m = String(ano ?? '').match(/\d{4}/g); return m ? m[m.length - 1] : ''; };
  const priceText = v => (v == null || v === '' || isNaN(Number(v))) ? '' : String(Math.round(Number(v)));
  const kmText = v => (v == null || v === '' || isNaN(Number(v))) ? '' : String(Math.round(Number(v)));

  function descriptionFor(v) {
    const linhas = [
      [v.marca, v.modelo].filter(Boolean).join(' ') + (v.ano ? ' ' + v.ano : ''),
      v.quilometragem != null ? Number(v.quilometragem).toLocaleString('pt-BR') + ' km' : '',
      v.cor ? 'Cor: ' + v.cor : '',
      '',
      (v.descricao_publica || '').trim(),
      v.descricao_publica ? '' : null,
      'Veículo ' + (names[v.empresa] || '') + '. Chame no Messenger para mais informações, fotos e condições de pagamento.',
      'Disponibilidade e condições sujeitas a confirmação.'
    ];
    return linhas.filter(x => x !== null).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  // ---------- Interface ----------
  const card = document.createElement('div');
  card.className = 'card';
  card.id = 'marketplaceCard';
  const h2 = document.createElement('h2'); h2.textContent = 'Anunciar no Marketplace';
  const intro = document.createElement('p'); intro.className = 'muted';
  intro.textContent = 'O Facebook não permite publicação automática de veículos no Marketplace. Use os botões abaixo para copiar cada campo e colar no formulário do Marketplace (pelo celular é mais rápido). Nada é enviado automaticamente.';
  const empty = document.createElement('p'); empty.className = 'muted'; empty.textContent = 'Selecione um veículo acima.';
  const grid = document.createElement('div'); grid.className = 'grid';
  const descLabel = document.createElement('label'); descLabel.className = 'field'; descLabel.style.marginTop = '14px';
  descLabel.append(document.createTextNode('Descrição para o Marketplace'));
  const desc = document.createElement('textarea'); desc.id = 'mpDescricao'; desc.maxLength = 5000;
  descLabel.append(desc);
  const actions = document.createElement('div'); actions.className = 'actions'; actions.style.marginTop = '12px';
  const status = document.createElement('p'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const steps = document.createElement('ol'); steps.className = 'muted'; steps.style.lineHeight = '1.6';
  [
    'Baixe ou compartilhe as fotos escolhidas (botões da seção acima).',
    'Toque em "Abrir Marketplace" e escolha a Página/perfil e o tipo "Carro/caminhonete".',
    'Copie e cole cada campo: ano, marca, modelo, quilometragem, preço e descrição.',
    'Anexe as fotos, revise e publique pelo próprio Facebook.'
  ].forEach(t => { const li = document.createElement('li'); li.textContent = t; steps.append(li); });

  const body = document.createElement('div');
  body.append(grid, descLabel, actions, steps, status);
  card.append(h2, intro, empty, body);
  editor.append(card);

  function message(text, error) { status.className = error ? 'error' : 'success'; status.textContent = text; }

  async function copy(text, label) {
    if (!text) { message(label + ': campo vazio no cadastro.', true); return; }
    try { await navigator.clipboard.writeText(text); message('Copiado: ' + label + '. Cole no Marketplace.'); }
    catch {
      // Fallback para navegadores sem permissão de clipboard
      const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.append(ta); ta.select();
      let ok = false; try { ok = document.execCommand('copy'); } catch { /* ignore */ }
      ta.remove();
      ok ? message('Copiado: ' + label + '. Cole no Marketplace.') : message('Não foi possível copiar automaticamente. Selecione o texto e copie manualmente.', true);
    }
  }

  function field(label, value, hint) {
    const box = document.createElement('div'); box.className = 'field';
    const title = document.createElement('span'); title.textContent = label; title.style.fontWeight = '600';
    const row = document.createElement('div'); row.style.cssText = 'display:flex;gap:8px;align-items:center';
    const out = document.createElement('input'); out.readOnly = true; out.value = value || '';
    out.placeholder = 'não cadastrado';
    out.style.cssText = 'flex:1;min-width:0;padding:10px;border:1px solid #becbbc;border-radius:8px;background:#f7f9f6';
    const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'secondary'; btn.textContent = 'Copiar';
    btn.disabled = !value;
    btn.onclick = () => copy(value, label);
    row.append(out, btn); box.append(title, row);
    if (hint) { const s = document.createElement('small'); s.textContent = hint; box.append(s); }
    return box;
  }

  function render() {
    grid.replaceChildren(); actions.replaceChildren(); status.textContent = '';
    empty.hidden = !!car; body.hidden = !car;
    if (!car) { desc.value = ''; return; }
    grid.append(
      field('Ano', modelYear(car.ano), car.ano && String(car.ano) !== modelYear(car.ano) ? 'Cadastro: ' + car.ano + ' (use o ano do modelo)' : ''),
      field('Marca', car.marca || ''),
      field('Modelo', car.modelo || ''),
      field('Quilometragem', kmText(car.quilometragem), 'Somente números'),
      field('Preço', priceText(car.valor), car.valor == null ? 'Sem preço cadastrado' : 'Somente números, sem R$'),
      field('Cor', car.cor || '')
    );
    desc.value = descriptionFor(car);

    const copyDesc = document.createElement('button'); copyDesc.type = 'button'; copyDesc.textContent = 'Copiar descrição';
    copyDesc.onclick = () => copy(desc.value.trim(), 'Descrição');
    const copyAll = document.createElement('button'); copyAll.type = 'button'; copyAll.className = 'secondary'; copyAll.textContent = 'Copiar resumo completo';
    copyAll.onclick = () => copy([
      'Ano: ' + modelYear(car.ano), 'Marca: ' + (car.marca || ''), 'Modelo: ' + (car.modelo || ''),
      'Quilometragem: ' + kmText(car.quilometragem), 'Preço: ' + priceText(car.valor), 'Cor: ' + (car.cor || ''),
      '', desc.value.trim()
    ].join('\n'), 'Resumo');
    const open = document.createElement('a'); open.className = 'btn secondary'; open.textContent = 'Abrir Marketplace ↗';
    open.href = MARKETPLACE_URL; open.target = '_blank'; open.rel = 'noopener noreferrer';
    actions.append(copyDesc, copyAll, open);
  }

  document.addEventListener('fb:veiculo', e => { car = e.detail || null; render(); });
  render();
})();
