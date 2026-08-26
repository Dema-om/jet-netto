/* app.js · wizard a 3 step + risultato. Stato minimale, DOM diretto. */
(function () {
  'use strict';
  const { TAX_2026, calcolaNetto } = window.JetNetto;

  const state = {
    step: 1,
    regioneId: null,
    comuneNome: null,
    comuneAliquota: null,
    comuneEsenzione: null,
    comuneScaglioni: null,
    ral: null,
    mensilita: 13,
    vista: 'dip',
    contratto: 'ind',
    lastResult: null,
  };

  const $ = (sel) => document.querySelector(sel);
  // Su schermi touch niente autofocus (aprirebbe la tastiera) e i chip la chiudono
  const TOUCH = window.matchMedia('(pointer: coarse)').matches;
  const fmtEur = (n, dec = 0) =>
    n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR', minimumFractionDigits: dec, maximumFractionDigits: dec });
  const fmtPct = (n) => (n * 100).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';

  /* ── Progress (gli step completati sono cliccabili: si può sempre tornare indietro) ── */
  function renderProgress() {
    document.querySelectorAll('.p-step').forEach((el, i) => {
      const n = i + 1;
      el.classList.toggle('is-active', n === state.step);
      el.classList.toggle('is-done', n < state.step);
      const clickable = n < state.step;
      el.setAttribute('role', 'button');
      el.setAttribute('tabindex', clickable ? '0' : '-1');
      el.setAttribute('aria-disabled', String(!clickable));
    });
  }

  function bindProgressNav() {
    document.querySelectorAll('.p-step').forEach((el, i) => {
      const go = () => {
        const n = i + 1;
        if (n >= state.step || n > 3) return;
        if (n === 2) renderCity();
        goTo(n);
      };
      el.addEventListener('click', go);
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); }
      });
    });
  }

  function goTo(step) {
    state.step = step;
    document.querySelectorAll('.step').forEach((el) => {
      el.classList.toggle('is-visible', Number(el.dataset.step) === step);
    });
    renderProgress();
    const h = document.querySelector(`.step[data-step="${step}"] h1`);
    if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: false }); }
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  /* ── Step 1: mappa ── */
  const svgNS = 'http://www.w3.org/2000/svg';
  function buildMap() {
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', window.ITALY_MAP.viewBox);
    svg.setAttribute('role', 'listbox');
    svg.setAttribute('aria-label', 'Mappa delle regioni italiane');
    for (const loc of window.ITALY_MAP.locations) {
      if (!TAX_2026.regioni[loc.id]) continue;
      const p = document.createElementNS(svgNS, 'path');
      p.setAttribute('d', loc.path);
      p.dataset.id = loc.id;
      p.setAttribute('role', 'option');
      p.setAttribute('tabindex', '0');
      p.setAttribute('aria-selected', 'false');
      const reg = TAX_2026.regioni[loc.id];
      const aliq = etichettaRegione(reg).replace(/<[^>]+>/g, '');
      p.setAttribute('aria-label', `${reg.nome}, addizionale regionale ${aliq}`);
      p.addEventListener('click', () => selectRegion(loc.id));
      p.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectRegion(loc.id); }
      });
      p.addEventListener('mouseenter', () => showHint(loc.id));
      p.addEventListener('focus', () => showHint(loc.id));
      svg.appendChild(p);
    }
    // Uscendo dalla mappa il riquadro torna alla regione selezionata
    svg.addEventListener('mouseleave', () => { if (state.regioneId) showHint(state.regioneId); });
    $('#map-slot').appendChild(svg);
  }

  // Etichetta sintetica dell'addizionale regionale, costruita dalla
  // struttura vera (aliquota unica, scaglioni, fasce, ridotta sotto soglia)
  function etichettaRegione(reg) {
    const compatta = (x) => fmtPct(x).replace(',00%', '%');
    if (reg.fasceIntero) {
      const prima = reg.fasceIntero[0];
      const ultima = reg.fasceIntero[reg.fasceIntero.length - 1];
      return prima.aliquota === 0
        ? `esente fino a ${fmtEur(prima.fino)}, poi ${compatta(ultima.aliquota)} su tutto`
        : `${compatta(prima.aliquota)} – ${compatta(ultima.aliquota)} per fasce, sull'intero imponibile`;
    }
    if (reg.flatFino) {
      const max = reg.scaglioni[reg.scaglioni.length - 1].aliquota;
      return `${compatta(reg.flatFino.aliquota)} fino a ${fmtEur(reg.flatFino.soglia)}, poi a scaglioni fino al ${compatta(max)}`;
    }
    if (reg.scaglioni) {
      const aliquote = reg.scaglioni.map((s) => s.aliquota);
      return `a scaglioni: ${compatta(Math.min(...aliquote))} – ${compatta(Math.max(...aliquote))}`;
    }
    return compatta(reg.aliquota);
  }

  const TIP_ADDIZIONALE = 'Una piccola percentuale del tuo reddito che va alla regione, in aggiunta all\'IRPEF nazionale. La decide ogni regione.';

  function showHint(id) {
    const reg = TAX_2026.regioni[id];
    const term = `<span class="tip" tabindex="0" data-tip="${TIP_ADDIZIONALE}">addizionale regionale</span>`;
    const aliq = `${term}: ${etichettaRegione(reg)}`;
    $('#geo-hint').innerHTML = `<strong>${reg.nome}</strong>${aliq}`;
  }

  function selectRegion(id) {
    state.regioneId = id;
    const reg = TAX_2026.regioni[id];
    document.querySelectorAll('#map-slot path').forEach((p) => {
      const sel = p.dataset.id === id;
      p.classList.toggle('is-selected', sel);
      p.setAttribute('aria-selected', String(sel));
      // In SVG l'ultimo elemento vince sui bordi condivisi: porto in cima la
      // regione selezionata, così il contorno nero resta intero
      if (sel) p.parentNode.appendChild(p);
    });
    $('#region-select').value = id;
    showHint(id);
    // Precompila il comune col capoluogo: i dati li risolve applyComune dall'elenco AdE
    state.comuneNome = reg.capoluogo;
    $('#step1-next').disabled = false;
  }

  function buildRegionSelect() {
    const sel = $('#region-select');
    const ids = Object.keys(TAX_2026.regioni).sort((a, b) =>
      TAX_2026.regioni[a].nome.localeCompare(TAX_2026.regioni[b].nome, 'it'));
    for (const id of ids) {
      const o = document.createElement('option');
      o.value = id;
      o.textContent = TAX_2026.regioni[id].nome;
      sel.appendChild(o);
    }
    sel.addEventListener('change', () => selectRegion(sel.value));
    // La tendina è l'alternativa alla mappa: nascosta finché non serve
    $('#region-alt-toggle').addEventListener('click', () => {
      const box = $('#region-alt');
      const show = box.hidden;
      box.hidden = !show;
      $('#region-alt-toggle').setAttribute('aria-expanded', String(show));
      if (show) sel.focus();
    });
  }

  /* ── Step 2: comune (dati ufficiali AdE per ogni comune, ricerca con suggerimenti) ── */
  function findComune(nome) {
    const lista = (window.COMUNI && window.COMUNI[state.regioneId]) || [];
    return lista.find((c) => c[0] === nome) || null;
  }

  function applyComune(nome) {
    state.comuneNome = nome;
    const c = findComune(nome); // [nome, aliquota|aliquote[], esenzione, tipologia, flagMancante?]
    if (c && !c[4]) {
      const [, a, esenzione, tipologia] = c;
      if (Array.isArray(a)) {
        state.comuneScaglioni = window.JetNetto.comuneScaglioni(tipologia, a);
        state.comuneAliquota = a[a.length - 1] / 100; // per il campo manuale
        $('#city-aliquota').textContent = `${fmtPct(a[0] / 100)} – ${fmtPct(a[a.length - 1] / 100)} a scaglioni`;
      } else {
        state.comuneScaglioni = null;
        state.comuneAliquota = a / 100;
        $('#city-aliquota').textContent = fmtPct(state.comuneAliquota);
      }
      state.comuneEsenzione = esenzione;
      $('#city-source').textContent = 'Aliquota e soglia dall\'elenco ufficiale dell\'Agenzia delle Entrate (fonte 10).';
    } else {
      state.comuneScaglioni = null;
      state.comuneAliquota = TAX_2026.comuneDefault.aliquota;
      state.comuneEsenzione = TAX_2026.comuneDefault.esenzione;
      $('#city-aliquota').textContent = fmtPct(state.comuneAliquota);
      $('#city-source').textContent = 'Comune non presente nell\'elenco AdE (istituzione recente): valore tipico 0,80%, correggilo se serve.';
    }
    if (state.comuneEsenzione > 0) {
      // La soglia di legge vale sull'imponibile: la traduciamo in RAL
      const soglRal = Math.round(state.comuneEsenzione / (1 - TAX_2026.inps.aliquota) / 100) * 100;
      $('#city-esenzione').textContent = 'con una RAL fino a ~' + fmtEur(soglRal);
    } else {
      $('#city-esenzione').textContent = 'nessuno: si paga sempre';
    }
  }

  function renderCity() {
    const lista = (window.COMUNI && window.COMUNI[state.regioneId]) || [];
    const regNome = TAX_2026.regioni[state.regioneId].nome;
    $('#city-search-hint').textContent = `${lista.length.toLocaleString('it-IT')} comuni in ${regNome} (elenco ISTAT), aliquote dall'elenco ufficiale AdE. Proposto il capoluogo.`;
    $('#city-input').value = state.comuneNome || '';
    applyComune(state.comuneNome);
  }

  /* Autocomplete: al focus il campo si svuota e suggerisce, frecce + Invio per scegliere. */
  function bindCitySearch() {
    const input = $('#city-input');
    const list = $('#ac-list');
    let items = [];
    let active = -1;
    let savedValue = '';

    const close = () => {
      list.hidden = true;
      input.setAttribute('aria-expanded', 'false');
      active = -1;
    };

    const select = (nome) => {
      input.value = nome;
      applyComune(nome);
      close();
    };

    const renderList = (query) => {
      const lista = ((window.COMUNI && window.COMUNI[state.regioneId]) || []).map((c) => c[0]);
      const q = query.trim().toLowerCase();
      const inizia = [];
      const contiene = [];
      for (const n of lista) {
        const ln = n.toLowerCase();
        if (q === '' || ln.startsWith(q)) inizia.push(n);
        else if (ln.includes(q)) contiene.push(n);
        if (inizia.length >= 8) break;
      }
      items = inizia.concat(contiene).slice(0, 8);
      active = -1;
      if (!items.length) { close(); return; }
      list.innerHTML = items.map((n, i) =>
        `<li role="option" id="ac-opt-${i}" data-nome="${n}">${n}</li>`).join('');
      list.hidden = false;
      input.setAttribute('aria-expanded', 'true');
    };

    const highlight = () => {
      [...list.children].forEach((li, i) => li.classList.toggle('is-active', i === active));
      if (active >= 0) list.children[active].scrollIntoView({ block: 'nearest' });
    };

    input.addEventListener('focus', () => {
      // Come sugli altri siti: il valore proposto si toglie e si ricomincia a scrivere
      savedValue = input.value;
      input.value = '';
      renderList('');
    });

    input.addEventListener('input', () => renderList(input.value));

    input.addEventListener('keydown', (e) => {
      if (list.hidden) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(active + 1, items.length - 1); highlight(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(active - 1, 0); highlight(); }
      else if (e.key === 'Enter') {
        if (active >= 0) { e.preventDefault(); e.stopPropagation(); select(items[active]); }
        else if (items.length === 1) { e.preventDefault(); e.stopPropagation(); select(items[0]); }
      }
      else if (e.key === 'Escape') { input.value = savedValue; close(); }
    });

    list.addEventListener('mousedown', (e) => {
      const li = e.target.closest('li[data-nome]');
      if (li) { e.preventDefault(); select(li.dataset.nome); }
    });

    input.addEventListener('blur', () => {
      setTimeout(() => {
        if (!list.hidden) close();
        const lista = ((window.COMUNI && window.COMUNI[state.regioneId]) || []).map((c) => c[0]);
        const match = lista.find((n) => n.toLowerCase() === input.value.trim().toLowerCase());
        if (match) select(match);
        else if (!input.value.trim()) { input.value = savedValue; }
      }, 120);
    });
  }

  /* ── Step 3: RAL ── */
  function parseRal(raw) {
    const clean = String(raw).replace(/[^\d]/g, '');
    return clean ? parseInt(clean, 10) : NaN;
  }

  function bindRal() {
    const input = $('#ral-input');
    input.addEventListener('input', () => {
      document.querySelectorAll('.chip.is-active').forEach((x) => x.classList.remove('is-active'));
      const n = parseRal(input.value);
      if (Number.isFinite(n)) {
        input.value = n.toLocaleString('it-IT');
        state.ral = n;
      } else {
        state.ral = null;
      }
      validateRal(false);
    });
    input.addEventListener('blur', () => validateRal(true));

    const chips = document.querySelectorAll('.chip[data-ral]');
    chips.forEach((c) => {
      c.addEventListener('click', () => {
        input.value = Number(c.dataset.ral).toLocaleString('it-IT');
        state.ral = Number(c.dataset.ral);
        chips.forEach((x) => x.classList.toggle('is-active', x === c));
        validateRal(true);
        // Su touch il chip chiude la tastiera; su desktop lascia il campo pronto
        if (TOUCH) input.blur(); else input.focus();
      });
    });

    document.querySelectorAll('.mensilita .seg button').forEach((b) => {
      b.addEventListener('click', () => {
        document.querySelectorAll('.mensilita .seg button').forEach((x) => x.setAttribute('aria-pressed', 'false'));
        b.setAttribute('aria-pressed', 'true');
        state.mensilita = Number(b.dataset.m);
      });
    });
  }

  function validateRal(showError) {
    const input = $('#ral-input');
    const err = $('#ral-error');
    let msg = '';
    if (state.ral == null) msg = showError ? 'Inserisci la tua RAL per continuare.' : '';
    else if (state.ral < 1000) msg = 'Una RAL annua sotto i 1.000 € non sembra realistica.';
    else if (state.ral > 1000000) msg = 'Oltre il milione la proiezione perde senso: il prototipo si ferma prima.';
    const valid = state.ral != null && state.ral >= 1000 && state.ral <= 1000000;
    input.classList.toggle('is-invalid', Boolean(msg) && showError);
    err.textContent = showError || valid ? msg : '';
    $('#calc-btn').disabled = !valid;
    return valid;
  }

  /* ── Risultato ── */
  function rowHTML(name, sub, amount, sign, barPct) {
    // '-' trattenuta (rosso), '+' a favore (verde), 'add' voce di costo che si somma (neutra)
    const cls = sign === '-' ? 'is-minus' : sign === '+' ? 'is-plus' : sign === 'add' ? 'is-add' : '';
    const signTxt = sign === '-' ? '− ' : (sign === '+' || sign === 'add') ? '+ ' : '';
    return `<div class="b-row ${cls}">
      <div class="b-name">${name}</div>
      <div class="b-amount">${signTxt}${fmtEur(Math.abs(amount), 2)}</div>
      ${sub ? `<div class="b-sub">${sub}</div>` : ''}
      ${barPct != null ? `<div class="b-bar"><i style="width:${Math.min(100, barPct)}%"></i></div>` : ''}
    </div>`;
  }

  /** Formula della detrazione art. 13 col reddito reale dell'utente dentro. */
  function detrazioneFormula(R, valore) {
    const num = (n) => n.toLocaleString('it-IT', { maximumFractionDigits: 0 });
    let f;
    if (R <= 15000) f = `reddito fino a 15.000 € → detrazione fissa di 1.955 €`;
    else if (R <= 28000) f = `1.910 + 1.190 × (28.000 − ${num(R)}) / 13.000`;
    else if (R <= 50000) f = `1.910 × (50.000 − ${num(R)}) / 22.000`;
    else f = `reddito oltre 50.000 € → detrazione azzerata`;
    const extra = R > 25000 && R <= 35000 ? ' (più il correttivo di 65 € tra 25.000 e 35.000 €)' : '';
    return `${f} = <b>${fmtEur(valore, 2)}</b>${extra}`;
  }

  function scaglioniTable(dettaglio) {
    const rows = dettaglio.map((s) => `<tr>
      <td>${fmtEur(s.da)} – ${s.a === Infinity ? 'oltre' : fmtEur(s.a)}</td>
      <td>${fmtPct(s.aliquota)}</td>
      <td>${fmtEur(s.quota, 0)}</td>
      <td>${fmtEur(s.imposta, 2)}</td>
    </tr>`).join('');
    return `<table>
      <thead><tr><th>Scaglione</th><th>Aliquota</th><th>Quota di reddito</th><th>Imposta</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  }

  // Referenze: il numerino apre direttamente la fonte istituzionale in una
  // nuova scheda; al passaggio il tooltip nativo dice di quale fonte si tratta.
  // La numerazione coincide con l'elenco Fonti in fondo alla pagina.
  const FONTI = {
    1: ['Legge di Bilancio 2026 (L. 199/2025), Normattiva', 'https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:legge:2025;199'],
    2: ['Agenzia delle Entrate, aliquote e calcolo IRPEF', 'https://www.agenziaentrate.gov.it/portale/web/guest/aliquote-e-calcolo-dell-irpef'],
    3: ['INPS, circolare n. 6 del 30/01/2026', 'https://www.inps.it/it/it/inps-comunica/atti/circolari-messaggi-e-normativa.html'],
    4: ['Art. 13 TUIR (DPR 917/1986), Normattiva', 'https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:decreto.del.presidente.della.repubblica:1986-12-22;917~art13'],
    5: ['L. 207/2024, art. 1, Normattiva', 'https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:legge:2024-12-30;207~art1'],
    6: ['MEF, Dipartimento delle Finanze, addizionale regionale per ogni regione', 'https://www.finanze.gov.it/it/fiscalita/fiscalita-regionale-e-locale/Addizionale-regionale-allIRPEF/'],
    7: ['MEF, Dipartimento delle Finanze, fiscalità locale', 'https://www1.finanze.gov.it/finanze2/dipartimentopolitichefiscali/fiscalitalocale/nuova_addcomirpef/sceltaregione.htm'],
    8: ['Comune di Milano, addizionale comunale IRPEF', 'https://www.comune.milano.it/argomenti/tributi/addizionale-comunale-irpef'],
    9: ['Roma Capitale, addizionale IRPEF', 'https://www.comune.roma.it/web/it/scheda-servizi.page?contentId=INF41403'],
    10: ['Agenzia delle Entrate, elenco annuale addizionali comunali 2026', 'https://www.agenziaentrate.gov.it/portale/documents/d/guest/elenco-annuale-addizionale-comunale-modulistica-2026_def'],
    11: ['L. 92/2012 (riforma Fornero), Normattiva', 'https://www.normattiva.it/uri-res/N2Ls?urn:nir:stato:legge:2012-06-28;92~art4'],
  };
  const fn = (...nums) => nums.map((n) =>
    `<sup class="fn"><a href="#fonte-${n}" title="Fonte: ${FONTI[n][0]}">${n}</a></sup>`).join('');

  /* Click su una referenza: apre le Fonti, centra la voce e la illumina.
     Da lì il link ufficiale si apre con un secondo click consapevole. */
  document.addEventListener('click', (e) => {
    const a = e.target.closest('sup.fn a');
    if (!a) return;
    e.preventDefault();
    const target = document.querySelector(a.getAttribute('href'));
    if (!target) return;
    const acc = target.closest('details');
    if (acc) acc.open = true;
    target.scrollIntoView({ block: 'center', behavior: 'smooth' });
    target.classList.remove('fonte-flash');
    void target.offsetWidth;
    target.classList.add('fonte-flash');
    setTimeout(() => target.classList.remove('fonte-flash'), 2000);
    mostraPillolaRitorno(a.closest('.v-row') || a.closest('summary') || a.parentElement);
  });

  /* Pillola flottante "Torna alla voce" (pattern snackbar alla TikTok/YouTube):
     sale dal basso dopo il salto a una fonte, ti riporta al punto di partenza
     evidenziandolo, e si congeda da sola se ci risali per conto tuo. */
  let pillola = null;
  let pillolaObs = null;
  function nascondiPillola() {
    if (pillola) pillola.classList.remove('is-visible');
    if (pillolaObs) { pillolaObs.disconnect(); pillolaObs = null; }
  }
  function mostraPillolaRitorno(origine) {
    if (!origine) return;
    if (!pillola) {
      pillola = document.createElement('button');
      pillola.className = 'back-pill';
      pillola.setAttribute('aria-label', 'Torna alla voce da cui sei partito');
      pillola.innerHTML = '<span class="bp-chevron" aria-hidden="true"></span>';
      document.body.appendChild(pillola);
    }
    pillola.onclick = () => {
      let d = origine.closest('details');
      while (d) { d.open = true; d = d.parentElement && d.parentElement.closest('details'); }
      origine.scrollIntoView({ block: 'center', behavior: 'smooth' });
      origine.classList.add('fonte-flash');
      setTimeout(() => origine.classList.remove('fonte-flash'), 2000);
      nascondiPillola();
    };
    requestAnimationFrame(() => pillola.classList.add('is-visible'));
    // Se l'utente risale da solo fino alla voce di partenza, la pillola non serve più
    if (pillolaObs) pillolaObs.disconnect();
    setTimeout(() => {
      pillolaObs = new IntersectionObserver((voci) => {
        if (voci[0].isIntersecting) nascondiPillola();
      });
      pillolaObs.observe(origine);
    }, 1200);
  }

  function renderResult(r) {
    const d = r.mensilitaDetail;
    $('#rh-mensile').innerHTML = `${fmtEur(d.ordinario)}<small> /mese</small>`;
    $('#rh-extra').innerHTML = d.extraCount === 0 ? '' :
      d.extraCount === 1
        ? `più la tredicesima a dicembre: ${fmtEur(d.extra)}`
        : `più tredicesima e quattordicesima: ${fmtEur(d.extra)} l'una`;
    $('#rh-annuo').innerHTML = `<span>netto annuo</span>${fmtEur(r.nettoAnnuo)}`;
    $('#bd-total').innerHTML = `− ${fmtEur(r.totaleTrattenute, 2)}`;
    $('#bd-details').open = false;

    const ral = r.input.ral;
    const pct = (v) => (ral > 0 ? (v / ral) * 100 : 0);
    const R = r.imponibile;

    // Una voce = un elemento: se ha una spiegazione, la riga stessa si apre
    const voce = ({ nome, refs = '', sub, amount, sign, bar, body }) => {
      const cls = sign === '-' ? 'is-minus' : sign === '+' ? 'is-plus' : '';
      const signTxt = sign === '-' ? '− ' : sign === '+' ? '+ ' : '';
      const head = `<div class="v-head">
          <div class="v-name">${nome}${refs}<span class="v-sub">${sub || ''}</span></div>
          <div class="v-amount">${signTxt}${fmtEur(Math.abs(amount), 2)}</div>
        </div>
        ${bar != null ? `<div class="b-bar"><i style="width:${Math.min(100, bar)}%"></i></div>` : ''}`;
      if (!body) return `<div class="v-row ${cls}">${head}</div>`;
      return `<details class="v-row has-body ${cls}"><summary>${head}</summary><div class="v-body">${body}</div></details>`;
    };

    let html = '';
    html += voce({
      nome: 'Retribuzione annua lorda (RAL)',
      sub: `${r.input.regione} · ${state.comuneNome}`,
      amount: ral, bar: 100,
    });
    html += voce({
      nome: 'Contributi INPS', refs: fn(3),
      sub: 'il 9,19% che va alla previdenza',
      amount: r.contributi.totale, sign: '-', bar: pct(r.contributi.totale),
      body:
        `Il 33% della tua retribuzione va alla previdenza, ma in busta ne vedi solo una parte: il datore versa il 23,81%, tu il <b>9,19%</b>.<br>` +
        `${fmtEur(ral)} × 9,19% = <b>${fmtEur(r.contributi.base, 2)}</b>` +
        (r.contributi.aggiuntivo > 0
          ? `<br>La parte di RAL oltre la prima fascia pensionabile (${fmtEur(TAX_2026.inps.primaFascia)}) paga un 1% in più: <b>${fmtEur(r.contributi.aggiuntivo, 2)}</b>`
          : '') +
        `<br>I contributi si calcolano sulla RAL. È l'unica voce che funziona così: tutto il resto si calcola dopo.`,
    });
    html += voce({
      nome: 'Imponibile fiscale',
      sub: 'RAL meno contributi: la base su cui si calcolano le imposte',
      amount: r.imponibile, bar: pct(r.imponibile),
      body:
        `L'IRPEF non si paga sulla RAL. Prima escono i contributi, poi lo Stato tassa quello che resta:<br>` +
        `${fmtEur(ral)} − ${fmtEur(r.contributi.totale, 2)} = <b>${fmtEur(R, 2)}</b><br>` +
        `Questo numero è la base di tutto il resto: IRPEF, addizionali e soglie delle detrazioni si misurano qui.`,
    });
    html += voce({
      nome: 'IRPEF netta', refs: fn(1, 2, 4),
      sub: "l'imposta sul reddito, già ridotta delle detrazioni",
      amount: r.irpef.netta, sign: '-', bar: pct(r.irpef.netta),
      body:
        `Il reddito si tassa "a fette", non tutto alla stessa aliquota:` +
        scaglioniTable(r.irpef.dettaglioScaglioni) +
        `Dalla somma delle fette (<b>${fmtEur(r.irpef.lorda, 2)}</b>) si sottrae la detrazione da lavoro dipendente, uno sconto sull'imposta, non sul reddito: ` +
        detrazioneFormula(R, r.irpef.detrazioneLavoro) +
        (r.irpef.ulterioreDetrazione > 0
          ? `<br>Il taglio del cuneo aggiunge un'altra detrazione: <b>${fmtEur(r.irpef.ulterioreDetrazione, 2)}</b>` +
            (R > 32000 ? `, cioè 1.000 × (40.000 − ${fmtEur(R, 0)}) / 8.000.` : ' (importo pieno tra 20.000 e 32.000 € di reddito).')
          : '') +
        `<br>Risultato: ${fmtEur(r.irpef.lorda, 2)} − ${fmtEur(r.irpef.detrazioneLavoro, 2)}${r.irpef.ulterioreDetrazione > 0 ? ' − ' + fmtEur(r.irpef.ulterioreDetrazione, 2) : ''} = <b>${fmtEur(r.irpef.netta, 2)}</b>. Se le detrazioni superano l'imposta, l'IRPEF si ferma a zero.`,
    });
    html += voce({
      nome: 'Addizionale regionale', refs: fn(6),
      sub: 'la quota che va alla regione',
      amount: r.addizionali.regionale, sign: '-', bar: pct(r.addizionali.regionale),
      body:
        `${r.input.regione} tassa lo stesso imponibile dell'IRPEF (${fmtEur(R, 2)}), non la RAL.` +
        (r.addizionali.regionale === 0
          ? ` Qui non è dovuta: ${r.addizionali.regolaRegionale === 'esente sotto soglia' ? 'la regione esenta gli imponibili sotto la sua soglia' : "l'IRPEF netta è a zero, e senza IRPEF non si pagano le addizionali"}.`
          : (r.addizionali.regolaRegionale === "per fasce, sull'intero imponibile"
              ? ` L'aliquota della fascia si applica all'intero imponibile, non per scaglioni:` + scaglioniTable(r.addizionali.dettaglioRegionale)
              : r.addizionali.regolaRegionale === 'aliquota ridotta sotto soglia'
                ? ` Sotto la soglia regionale vale l'aliquota ridotta su tutto l'imponibile:` + scaglioniTable(r.addizionali.dettaglioRegionale)
                : r.addizionali.dettaglioRegionale
                  ? ` Usa scaglioni propri:` + scaglioniTable(r.addizionali.dettaglioRegionale) +
                    (r.addizionali.detrazioneRegionale > 0 ? `meno la detrazione regionale di fascia: <b>−${fmtEur(r.addizionali.detrazioneRegionale, 2)}</b>` : '')
                  : `<br>${fmtEur(R, 2)} × ${fmtPct(TAX_2026.regioni[state.regioneId].aliquota)} = <b>${fmtEur(r.addizionali.regionale, 2)}</b>`)) +
        `<br>In busta reale le addizionali arrivano l'anno dopo, con saldo e acconto: qui le mostriamo per competenza.`,
    });
    html += voce({
      nome: 'Addizionale comunale', refs: fn(7, 10),
      sub: r.addizionali.comunale === 0 && r.input.comuneEsenzione > 0
        ? 'esente: sei sotto la soglia del tuo comune'
        : 'la quota che va al tuo comune',
      amount: r.addizionali.comunale, sign: '-', bar: pct(r.addizionali.comunale),
      body:
        (r.addizionali.comunale === 0 && r.input.comuneEsenzione > 0
          ? `${state.comuneNome} non la applica sotto ${fmtEur(r.input.comuneEsenzione)} di imponibile, e il tuo (${fmtEur(R, 2)}) è sotto: <b>non paghi nulla</b>. Attenzione: è una soglia "tutto o niente", superarla fa pagare l'aliquota sull'intero imponibile.`
          : (r.addizionali.dettaglioComunale
              ? `${state.comuneNome} usa scaglioni propri (dall'elenco ufficiale AdE), sempre sull'imponibile:` + scaglioniTable(r.addizionali.dettaglioComunale)
              : `${state.comuneNome} applica un'aliquota unica sull'imponibile:<br>${fmtEur(R, 2)} × ${fmtPct(r.input.comuneAliquota)} = <b>${fmtEur(r.addizionali.comunale, 2)}</b>`)),
    });
    if (r.bonus.sommaEsente > 0) {
      html += voce({
        nome: 'Somma esente taglio del cuneo', refs: fn(5),
        sub: 'si aggiunge al netto, non si sottrae',
        amount: r.bonus.sommaEsente, sign: '+', bar: pct(r.bonus.sommaEsente),
        body:
          `Con un reddito da lavoro fino a 20.000 € il taglio del cuneo (L. 207/2024) ti accredita una somma che non fa reddito e non paga tasse:<br>` +
          `${fmtEur(R, 2)} × ${fmtPct(R <= 8500 ? 0.071 : R <= 15000 ? 0.053 : 0.048)} = <b>${fmtEur(r.bonus.sommaEsente, 2)}</b>`,
      });
    }
    if (r.bonus.trattamentoIntegrativo > 0) {
      html += voce({
        nome: 'Trattamento integrativo', refs: fn(5),
        sub: "l'ex bonus Renzi: si aggiunge al netto",
        amount: r.bonus.trattamentoIntegrativo, sign: '+', bar: pct(r.bonus.trattamentoIntegrativo),
        body:
          `Fino a 1.200 € l'anno accreditati in busta ai redditi medio-bassi, se l'imposta lorda supera la detrazione da lavoro (ridotta di 75 €). Nel tuo caso spetta: <b>${fmtEur(r.bonus.trattamentoIntegrativo, 2)}</b>.`,
      });
    }
    html += voce({ nome: 'Netto annuo in tasca', sub: '', amount: r.nettoAnnuo, bar: pct(r.nettoAnnuo) });
    $('#breakdown-rows').innerHTML = html;
    document.querySelector('#breakdown-rows .v-row:last-child').classList.add('is-total');

    $('#meta-pills').innerHTML = `
      <span class="meta-pill">netto medio mensile su 12: <b>${fmtEur(r.nettoAnnuo / 12)}</b></span>
      <span class="meta-pill">maturi <span class="tip" tabindex="0" data-tip="Trattamento di Fine Rapporto: l'azienda lo accantona ogni anno (6,91% della RAL) e lo incassi alla cessazione del contratto.">TFR</span> per <b>~${fmtEur(ral * 0.0691)}</b> ogni anno</span>`;

    renderCalendar(r);
    buildReport(r);
  }

  /* Report stampabile: stesso motore, formato documento. */
  function buildReport(r) {
    const d = r.mensilitaDetail;
    const oggi = new Date().toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
    const riga = (nome, sub, val, cls) =>
      `<tr class="${cls || ''}"><td>${nome}${sub ? `<span class="sub">${sub}</span>` : ''}</td><td>${val}</td></tr>`;

    $('#report').innerHTML = `
      <div class="r-masthead">
        <div class="r-logo">jet<em>netto</em></div>
        <div class="r-date">Proiezione RAL → netto · anno d'imposta 2026 · ${oggi}</div>
      </div>

      <div class="r-hero">
        <div>
          <div style="font-size:0.8rem;color:#b9bfae">Netto in busta</div>
          <div class="big">${fmtEur(r.nettoMensile)} <span style="font-size:0.5em;color:#b9bfae">/mese × ${r.input.mensilita}</span></div>
        </div>
        <div class="side">
          <b>${fmtEur(r.nettoAnnuo)}</b> netto annuo
          <b style="margin-top:6px">${fmtEur(r.totaleTrattenute)}</b> trattenute totali
        </div>
      </div>

      <h2>I dati inseriti</h2>
      <table>
        ${riga('Retribuzione annua lorda', null, fmtEur(r.input.ral))}
        ${riga('Residenza', null, `${r.input.regione}`)}
        ${riga('Addizionale comunale', r.input.comuneEsenzione > 0 ? `esenzione fino a ${fmtEur(r.input.comuneEsenzione)}` : null, r.addizionali.dettaglioComunale ? 'a scaglioni (elenco AdE)' : fmtPct(r.input.comuneAliquota))}
        ${riga('Mensilità', null, String(r.input.mensilita))}
      </table>

      <h2>Dal lordo al netto</h2>
      <table>
        ${riga('Contributi INPS a carico del lavoratore', '9,19% sulla RAL' + (r.contributi.aggiuntivo > 0 ? ' + 1% oltre la prima fascia' : ''), '− ' + fmtEur(r.contributi.totale, 2), 'minus')}
        ${riga('Imponibile fiscale', 'RAL meno contributi: base di IRPEF e addizionali', fmtEur(r.imponibile, 2))}
        ${riga('IRPEF netta', `lorda ${fmtEur(r.irpef.lorda, 2)} − detrazione lavoro ${fmtEur(r.irpef.detrazioneLavoro, 2)}${r.irpef.ulterioreDetrazione > 0 ? ' − detrazione cuneo ' + fmtEur(r.irpef.ulterioreDetrazione, 2) : ''}`, '− ' + fmtEur(r.irpef.netta, 2), 'minus')}
        ${riga('Addizionale regionale', r.addizionali.regolaRegionale, '− ' + fmtEur(r.addizionali.regionale, 2), 'minus')}
        ${riga('Addizionale comunale', r.addizionali.comunale === 0 && r.input.comuneEsenzione > 0 ? 'esente sotto soglia' : (r.addizionali.dettaglioComunale ? 'per scaglioni comunali, elenco AdE' : null), '− ' + fmtEur(r.addizionali.comunale, 2), 'minus')}
        ${r.bonus.sommaEsente > 0 ? riga('Somma esente taglio del cuneo', 'si aggiunge al netto', '+ ' + fmtEur(r.bonus.sommaEsente, 2), 'plus') : ''}
        ${r.bonus.trattamentoIntegrativo > 0 ? riga('Trattamento integrativo', 'si aggiunge al netto', '+ ' + fmtEur(r.bonus.trattamentoIntegrativo, 2), 'plus') : ''}
        ${riga('Netto annuo', null, fmtEur(r.nettoAnnuo, 2), 'total')}
      </table>

      <div class="avoid-break">
      <h2>Quando arrivano i soldi</h2>
      <table>
        ${riga('Busta ordinaria × 12', 'ogni mese', fmtEur(d.ordinario))}
        ${d.extraCount >= 1 ? riga('Tredicesima', 'a dicembre, tassata senza detrazioni', fmtEur(d.extra)) : ''}
        ${d.extraCount >= 2 ? riga('Quattordicesima', 'tra giugno e luglio, dove il CCNL la prevede', fmtEur(d.extra)) : ''}
        ${riga('TFR accantonato dall\'azienda', 'matura ogni anno, lo incassi a fine rapporto', '~' + fmtEur(r.input.ral * 0.0691) + ' all\'anno')}
      </table>
      </div>

      <h2>Fonti (solo siti istituzionali)</h2>
      <p style="font-size:0.78rem;color:#3f4340">L. 199/2025 e art. 13 TUIR su normattiva.it (IRPEF e detrazioni) · INPS, circ. n. 6/2026 (contributi) · L. 207/2024, art. 1 (taglio del cuneo) · MEF, fiscalità locale e Agenzia delle Entrate, elenco annuale 2026 (addizionali regionali e comunali).</p>

      <div class="r-note">
        Ipotesi: impiegato a tempo indeterminato, full time, 12 mesi lavorati, nessun carico familiare né agevolazione.
        Addizionali per competenza. Proiezione indicativa: non è consulenza fiscale né una busta paga.
        Prototipo per il task Product Builder di Jet HR.
      </div>`;
  }

  /* Quando arrivano i soldi: buste ordinarie + 13ª (dicembre) + 14ª (giugno/luglio). */
  function renderCalendar(r) {
    const d = r.mensilitaDetail;
    let rows = `<div class="cal-row">
      <span class="cal-when">Ogni mese, per 12 mesi</span>
      <span class="cal-what">busta ordinaria</span>
      <span class="cal-amount">${fmtEur(d.ordinario)}</span>
    </div>`;
    if (d.extraCount >= 1) {
      rows += `<div class="cal-row is-extra">
        <span class="cal-when">A dicembre</span>
        <span class="cal-what">tredicesima</span>
        <span class="cal-amount">${fmtEur(d.extra)}</span>
      </div>`;
    }
    if (d.extraCount >= 2) {
      rows += `<div class="cal-row is-extra">
        <span class="cal-when">Tra giugno e luglio</span>
        <span class="cal-what">quattordicesima (dove il CCNL la prevede)</span>
        <span class="cal-amount">${fmtEur(d.extra)}</span>
      </div>`;
    }
    const nota = d.extraCount > 0
      ? `<p class="cal-note">La mensilità extra è più leggera di una busta ordinaria: le detrazioni d'imposta sono già spalmate sulle 12 buste dell'anno, quindi la ${d.extraCount >= 2 ? 'tredicesima e la quattordicesima vengono tassate' : 'tredicesima viene tassata'} senza sconti, all'aliquota media.</p>`
      : '';
    $('#calendar-card').innerHTML = `<h2>Quando arrivano i soldi</h2>${rows}${nota}`;
  }

  /* ── Vista azienda (HR) ── */
  function renderHR(r) {
    const { calcolaCostoAzienda, AZIENDA_2026 } = window.JetNetto;
    const det = state.contratto === 'det';
    const c = calcolaCostoAzienda(r.input.ral, { determinato: det });
    document.querySelectorAll('.hr-contract .seg button').forEach((b) =>
      b.setAttribute('aria-pressed', String((b.dataset.c === 'det') === det)));
    $('#hr-contract-hint').textContent = det
      ? "Stai pagando l'1,4% in più di contributi: è il contributo addizionale che finanzia la NASpI. E gli incentivi durano 12 mesi invece di 18."
      : "Il tempo determinato costerebbe l'1,4% in più di contributi (finanzia la NASpI) e dimezzerebbe la durata degli incentivi: 12 mesi invece di 18.";
    $('#hr-totale').innerHTML = `${fmtEur(c.totale)}<small> /anno</small>`;
    $('#hr-mensile').textContent = `circa ${fmtEur(c.totale / 12)} al mese, tutto compreso`;
    $('#hr-netto').innerHTML = `<span>di cui in tasca al dipendente</span>${fmtEur(r.nettoAnnuo)}`;
    $('#hr-extra-total').innerHTML = `+ ${fmtEur(c.totale - c.ral, 2)}`;

    const pct = (v) => (c.totale > 0 ? (v / c.totale) * 100 : 0);
    // La lettura è una somma: si parte dalla RAL e ogni voce si AGGIUNGE al costo
    let html = '';
    html += rowHTML('Si parte dalla RAL pattuita', 'il lordo scritto nel contratto', c.ral, null, pct(c.ral));
    html += rowHTML('Contributi INPS a carico azienda' + fn(3), `${fmtPct(AZIENDA_2026.inpsDatore)} della RAL: la parte di contributi che il dipendente non vede`, c.inps, 'add', pct(c.inps));
    if (c.addizionale > 0) {
      html += rowHTML('Contributo addizionale (determinato)' + fn(11), "1,4% della RAL: la maggiorazione dei contratti a termine, finanzia la NASpI", c.addizionale, 'add', pct(c.addizionale));
    }
    html += rowHTML('TFR accantonato', '6,91% della RAL: retribuzione differita, esce dalla cassa oggi', c.tfr, 'add', pct(c.tfr));
    html += rowHTML('INAIL (stima)', 'premio assicurativo, ~0,40% per mansioni impiegatizie', c.inail, 'add', pct(c.inail));
    html += rowHTML('Costo azienda totale', null, c.totale, null, 100);
    $('#hr-rows').innerHTML = html;
    document.querySelector('#hr-rows .b-row:last-child').classList.add('is-total');

    renderSgravio();
  }

  /* Report per l'azienda: il documento che l'HR allega alla proposta interna */
  function buildReportHR(r) {
    const { calcolaCostoAzienda, calcolaSgravio, AZIENDA_2026 } = window.JetNetto;
    const det = state.contratto === 'det';
    const c = calcolaCostoAzienda(r.input.ral, { determinato: det });
    const oggi = new Date().toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
    const riga = (nome, sub, val, cls) =>
      `<tr class="${cls || ''}"><td>${nome}${sub ? `<span class="sub">${sub}</span>` : ''}</td><td>${val}</td></tr>`;
    const sgravio = state.sgravio ? calcolaSgravio(state.sgravio, r.input.ral, {
      determinato: det,
      indennitaMensile: parseFloat($('#naspi-indennita').value) || 0,
      mesiResidui: parseInt($('#naspi-mesi').value, 10) || 0,
    }) : null;

    $('#report').innerHTML = `
      <div class="r-masthead">
        <div class="r-logo">jet<em>netto</em></div>
        <div class="r-date">Proiezione costo azienda · anno 2026 · ${oggi}</div>
      </div>

      <div class="r-hero">
        <div>
          <div style="font-size:0.8rem;color:#b9bfae">Costo azienda annuo</div>
          <div class="big">${fmtEur(c.totale)} <span style="font-size:0.5em;color:#b9bfae">~${fmtEur(c.totale / 12)}/mese</span></div>
        </div>
        <div class="side">
          <b>${fmtEur(r.nettoAnnuo)}</b> netto in tasca al dipendente
          <b style="margin-top:6px">${fmtEur(c.totale - r.nettoAnnuo)}</b> cuneo complessivo annuo
        </div>
      </div>

      <h2>La proposta</h2>
      <table>
        ${riga('RAL offerta', null, fmtEur(r.input.ral))}
        ${riga('Contratto', null, det ? 'Tempo determinato' : 'Tempo indeterminato')}
        ${riga('Residenza del dipendente', 'determina le sue addizionali, non il costo azienda', r.input.regione)}
        ${riga('Mensilità', null, String(r.input.mensilita))}
        ${riga('Netto mensile percepito', 'la cifra che pesa nella trattativa', fmtEur(r.mensilitaDetail.ordinario) + ' × 12' + (r.mensilitaDetail.extraCount ? ` + ${fmtEur(r.mensilitaDetail.extra)} × ${r.mensilitaDetail.extraCount}` : ''))}
      </table>

      <h2>Dalla RAL al costo azienda</h2>
      <table>
        ${riga('RAL pattuita', null, fmtEur(c.ral, 2))}
        ${riga('Contributi INPS a carico azienda', fmtPct(AZIENDA_2026.inpsDatore) + ' della RAL', '+ ' + fmtEur(c.inps, 2))}
        ${c.addizionale > 0 ? riga('Contributo addizionale (determinato)', '1,4% della RAL, finanzia la NASpI', '+ ' + fmtEur(c.addizionale, 2)) : ''}
        ${riga('TFR accantonato', '6,91% della RAL, retribuzione differita', '+ ' + fmtEur(c.tfr, 2))}
        ${riga('INAIL (stima)', '~0,40%, mansioni impiegatizie', '+ ' + fmtEur(c.inail, 2))}
        ${riga('Costo azienda totale', null, fmtEur(c.totale, 2), 'total')}
      </table>

      ${sgravio ? `
      <div class="avoid-break">
      <h2>Incentivo applicabile: ${sgravio.nome}</h2>
      <table>
        ${riga('Risparmio mensile', sgravio.descr, fmtEur(sgravio.mensile, 2))}
        ${riga('Risparmio primo anno', null, fmtEur(sgravio.primoAnno, 2))}
        ${riga('Risparmio totale', `su ${sgravio.durataMesi} mesi`, fmtEur(sgravio.totale, 2), 'total')}
      </table>
      <p style="font-size:0.75rem;color:#59615f">Fonte: ${sgravio.fonte}. Stima indicativa: condizioni, cumulabilità e comunicazioni obbligatorie vanno verificate su ogni assunzione.</p>
      </div>` : ''}

      <div class="avoid-break">
      <h2>Fonti (solo siti istituzionali)</h2>
      <ol>
        <li>Contributi datoriali e prima fascia: INPS, circ. n. 6 del 30/01/2026 · inps.it</li>
        <li>Incentivi strutturali: L. 92/2012, art. 4 e art. 2 c. 10-bis · normattiva.it</li>
        <li>Netto del dipendente: L. 199/2025 (IRPEF), art. 13 TUIR, L. 207/2024, elenco AdE addizionali comunali 2026</li>
      </ol>
      </div>

      <div class="r-note">
        Ipotesi: impiegato a tempo indeterminato, full time, CCNL senza fondi di categoria aggiuntivi, INAIL da mansione d'ufficio.
        Proiezione indicativa: non sostituisce l'elaborazione del payroll. Prototipo per il task Product Builder di Jet HR.
      </div>`;
  }

  function renderSgravio() {
    const { calcolaSgravio } = window.JetNetto;
    const tipo = state.sgravio || '';
    document.querySelectorAll('.sgravio-pick').forEach((b) =>
      b.setAttribute('aria-pressed', String((b.dataset.sgravio || '') === tipo)));
    $('#naspi-fields').classList.toggle('is-open', tipo === 'naspi');
    const out = $('#sgravio-result');
    if (!tipo || !state.lastResult) { out.innerHTML = ''; return; }
    const s = calcolaSgravio(tipo, state.lastResult.input.ral, {
      determinato: state.contratto === 'det',
      indennitaMensile: parseFloat($('#naspi-indennita').value) || 0,
      mesiResidui: parseInt($('#naspi-mesi').value, 10) || 0,
    });
    out.innerHTML = `
      <div class="sgravio-box">
        <div class="in-label">${s.nome}${fn(11)}</div>
        <div class="in-value">risparmi ${fmtEur(s.mensile)} al mese</div>
        <div class="in-sub">${s.descr}</div>
        <div class="sgravio-nums">
          <span class="meta-pill">primo anno <b>${fmtEur(s.primoAnno)}</b></span>
          <span class="meta-pill">totale su ${s.durataMesi} mesi <b>${fmtEur(s.totale)}</b></span>
        </div>
        <p class="field-hint">Fonte: ${s.fonte}. Stima indicativa: condizioni, cumulabilità e comunicazioni obbligatorie vanno verificate su ogni assunzione.</p>
      </div>`;
  }

  // Copy adattivo: per il dipendente il soggetto sei tu, per l'HR è chi assumi
  const COPY = {
    dip: {
      s1t: 'Dove sei <mark>residente</mark>?',
      s1l: 'La residenza fiscale decide quanto paghi di addizionale regionale e comunale. Tocca la tua regione sulla mappa, o scegli dall\'elenco.',
      s2t: 'Il tuo <mark>comune</mark>',
      s2l: 'Ogni comune delibera la propria addizionale. Cerca il tuo: l\'elenco mostra solo i comuni della regione che hai scelto.',
      s3t: 'La tua <mark>RAL</mark>',
      s3l: 'La retribuzione annua lorda che trovi nel contratto o nella lettera di offerta: include già tredicesima e, se il tuo CCNL la prevede, quattordicesima.',
    },
    hr: {
      s1t: 'Dove è <mark>residente</mark> chi assumi?',
      s1l: 'La residenza del futuro dipendente decide le sue addizionali: contano per il suo netto, il costo azienda non cambia. Tocca la regione sulla mappa, o scegli dall\'elenco.',
      s2t: 'Il <mark>suo</mark> comune',
      s2l: 'Ogni comune delibera la propria addizionale. Cerca il comune di residenza della persona che vuoi assumere.',
      s3t: 'La RAL che <mark>offri</mark>',
      s3l: 'La retribuzione annua lorda che metti nell\'offerta: include già tredicesima e, se il CCNL la prevede, quattordicesima.',
    },
  };

  /* Titolo del risultato: richiama anche la RAL inserita, in piccolo */
  function updateResultTitle() {
    const ral = state.lastResult ? state.lastResult.input.ral : null;
    const sub = (txt) => ral ? ` <span class="title-sub">${txt} ${fmtEur(ral)} di RAL</span>` : '';
    $('#result-title').innerHTML = state.vista === 'hr'
      ? 'Quanto <mark>costa</mark> davvero' + sub('offrire')
      : 'Ecco cosa ti <mark>resta</mark>' + sub('dei tuoi');
  }

  function bindViewSwitch() {
    // Due coppie di bottoni sincronizzate: "chi sei" allo step 1, switch sul risultato
    const setVista = (vista) => {
      state.vista = vista;
      for (const [dip, hr] of [['#vs-dip', '#vs-hr'], ['#aud-dip', '#aud-hr']]) {
        $(dip).setAttribute('aria-pressed', String(vista === 'dip'));
        $(hr).setAttribute('aria-pressed', String(vista === 'hr'));
      }
      const c = COPY[vista];
      $('#s1-title').innerHTML = c.s1t; $('#s1-lead').textContent = c.s1l;
      $('#s2-title').innerHTML = c.s2t; $('#s2-lead').textContent = c.s2l;
      $('#s3-title').innerHTML = c.s3t; $('#s3-lead').textContent = c.s3l;
      $('#view-dip').hidden = vista !== 'dip';
      $('#view-hr').hidden = vista !== 'hr';
      $('#hr-contract').hidden = vista !== 'hr';
      updateResultTitle();
      if (vista === 'hr' && state.lastResult) renderHR(state.lastResult);
      if (state.lastResult) (vista === 'hr' ? buildReportHR : buildReport)(state.lastResult);
    };
    $('#vs-dip').addEventListener('click', () => setVista('dip'));
    $('#vs-hr').addEventListener('click', () => setVista('hr'));
    $('#aud-dip').addEventListener('click', () => setVista('dip'));
    $('#aud-hr').addEventListener('click', () => setVista('hr'));
    document.querySelectorAll('.sgravio-pick').forEach((b) =>
      b.addEventListener('click', () => { state.sgravio = b.dataset.sgravio || ''; renderSgravio(); }));
    document.querySelectorAll('.hr-contract .seg button').forEach((b) =>
      b.addEventListener('click', () => {
        state.contratto = b.dataset.c;
        const det = state.contratto === 'det';
        document.querySelectorAll('.hr-contract .seg button').forEach((x) =>
          x.setAttribute('aria-pressed', String((x.dataset.c === 'det') === det)));
        $('#hr-contract-hint').textContent = det
          ? "Stai pagando l'1,4% in più di contributi: è il contributo addizionale che finanzia la NASpI. E gli incentivi durano 12 mesi invece di 18."
          : "Il determinato costa l'1,4% di contributi in più (finanzia la NASpI) e dimezza la durata degli incentivi.";
        if (state.lastResult) { renderHR(state.lastResult); buildReportHR(state.lastResult); }
      }));
    $('#naspi-indennita').addEventListener('input', renderSgravio);
    $('#naspi-mesi').addEventListener('input', renderSgravio);
  }

  function calculate() {
    if (!validateRal(true)) return;
    const r = calcolaNetto({
      ral: state.ral,
      mensilita: state.mensilita,
      regioneId: state.regioneId,
      comuneAliquota: state.comuneAliquota,
      comuneEsenzione: state.comuneEsenzione,
      comuneScaglioni: state.comuneScaglioni,
    });
    state.lastResult = r;
    renderResult(r);
    updateResultTitle();
    if (state.vista === 'hr') { renderHR(r); buildReportHR(r); }
    goTo(4);
  }

  /* ── Wiring ── */
  document.addEventListener('DOMContentLoaded', () => {
    buildMap();
    buildRegionSelect();
    bindCitySearch();
    bindProgressNav();
    bindViewSwitch();
    bindRal();

    $('#step1-next').addEventListener('click', () => { renderCity(); goTo(2); });
    $('#step2-back').addEventListener('click', () => goTo(1));
    $('#step2-next').addEventListener('click', () => { goTo(3); if (!TOUCH) $('#ral-input').focus(); });
    $('#step3-back').addEventListener('click', () => goTo(2));
    $('#calc-btn').addEventListener('click', calculate);
    const stampa = (nome) => {
      const prev = document.title;
      document.title = `jet-netto-${nome}-${state.ral || ''}`;
      window.print();
      document.title = prev;
    };
    $('#report-btn').addEventListener('click', () => {
      if (state.lastResult) buildReport(state.lastResult);
      stampa('report');
    });
    $('#report-btn-hr').addEventListener('click', () => {
      if (state.lastResult) buildReportHR(state.lastResult);
      stampa('report-azienda');
    });
    $('#result-back').addEventListener('click', () => goTo(3));
    $('#result-restart').addEventListener('click', () => {
      // Reset completo: nessuna regione pre-selezionata al nuovo giro
      state.ral = null; $('#ral-input').value = ''; $('#calc-btn').disabled = true;
      state.regioneId = null; state.comuneNome = null;
      state.comuneAliquota = null; state.comuneEsenzione = null; state.comuneScaglioni = null;
      document.querySelectorAll('#map-slot path').forEach((p) => {
        p.classList.remove('is-selected');
        p.setAttribute('aria-selected', 'false');
      });
      $('#region-select').selectedIndex = 0;
      $('#geo-hint').textContent = 'Passa sulla mappa per vedere l\'aliquota di ogni regione.';
      $('#step1-next').disabled = true;
      $('#aud-dip').click();
      goTo(1);
    });

    // Enter avanza dove ha senso
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || e.target.tagName === 'BUTTON' || e.target.tagName === 'SELECT') return;
      if (state.step === 3 && validateRal(true)) calculate();
      else if (state.step === 1 && state.regioneId) { renderCity(); goTo(2); }
      else if (state.step === 2) { goTo(3); if (!TOUCH) $('#ral-input').focus(); }
    });

    // Deep link: ?ral=30000&regione=lombardy&mensilita=13 salta al risultato.
    const q = new URLSearchParams(window.location.search);
    const qRal = parseInt(q.get('ral'), 10);
    const qReg = q.get('regione') || 'lombardy';
    if (Number.isFinite(qRal) && qRal >= 1000 && TAX_2026.regioni[qReg]) {
      selectRegion(qReg);
      const qM = parseInt(q.get('mensilita'), 10);
      if ([12, 13, 14].includes(qM)) {
        state.mensilita = qM;
        document.querySelectorAll('.mensilita .seg button').forEach((x) => x.setAttribute('aria-pressed', String(Number(x.dataset.m) === qM)));
      }
      state.ral = qRal;
      $('#ral-input').value = qRal.toLocaleString('it-IT');
      validateRal(true);
      renderCity();
      calculate();
      if (q.get('vista') === 'hr') $('#vs-hr').click();
      return;
    }

    goTo(1);
  });
})();
