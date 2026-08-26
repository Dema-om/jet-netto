/**
 * engine.js — Motore di calcolo RAL → netto, anno d'imposta 2026.
 *
 * Funzione pura, nessuna dipendenza: la stessa logica gira nel browser
 * (window.JetNetto) e in Node per i test (module.exports).
 *
 * Catena di calcolo:
 *   RAL
 *   − contributi INPS a carico dipendente          → imponibile fiscale
 *   − IRPEF netta (scaglioni − detrazioni)
 *   − addizionale regionale + comunale
 *   + trattamento integrativo / somma esente cuneo
 *   = netto annuo → netto mensile
 *
 * Le semplificazioni sono elencate in README.md e mostrate in pagina.
 */

const TAX_2026 = {
  anno: 2026,

  // INPS lavoratore dipendente FPLD: 9,19% a carico del lavoratore.
  // Oltre la prima fascia di retribuzione pensionabile si aggiunge l'1% (IVS).
  // Fonte: INPS, circolare n. 6 del 30/01/2026.
  inps: {
    aliquota: 0.0919,
    aliquotaAggiuntiva: 0.01,
    primaFascia: 56224, // € annui, 2026
    // Apprendistato: aliquota a carico del lavoratore ridotta, che resta
    // per un intero anno dopo la conferma a fine periodo formativo (INPS)
    apprendista: 0.0584,
  },

  // Scaglioni IRPEF 2026 (Legge di Bilancio 2026, L. 199/2025):
  // 23% fino a 28.000, 33% da 28.000 a 50.000, 43% oltre.
  irpef: [
    { fino: 28000, aliquota: 0.23 },
    { fino: 50000, aliquota: 0.33 },
    { fino: Infinity, aliquota: 0.43 },
  ],

  // Detrazione per redditi da lavoro dipendente, art. 13 TUIR.
  // R = reddito complessivo (qui: imponibile fiscale).
  //  R ≤ 15.000            → 1.955 (minimo 690)
  //  15.000 < R ≤ 28.000   → 1.910 + 1.190 × (28.000 − R) / 13.000
  //  28.000 < R ≤ 50.000   → 1.910 × (50.000 − R) / 22.000
  //  R > 50.000            → 0
  // Correttivo: +65 € se 25.000 < R ≤ 35.000.
  detrazioneLavoro(R) {
    let d = 0;
    if (R <= 15000) d = Math.max(1955, 690);
    else if (R <= 28000) d = 1910 + 1190 * (28000 - R) / 13000;
    else if (R <= 50000) d = 1910 * (50000 - R) / 22000;
    if (R > 25000 && R <= 35000) d += 65;
    return d;
  },

  // Taglio del cuneo fiscale (L. 207/2024, a regime dal 2025).
  // Sotto i 20.000 €: somma esente (si AGGIUNGE al netto, non è tassata),
  // percentuale sul reddito da lavoro:
  //  R ≤ 8.500 → 7,1% · R ≤ 15.000 → 5,3% · R ≤ 20.000 → 4,8%
  cuneoSommaEsente(R) {
    if (R > 20000) return 0;
    const pct = R <= 8500 ? 0.071 : R <= 15000 ? 0.053 : 0.048;
    return R * pct;
  },

  // Tra 20.000 e 40.000 €: ulteriore detrazione dall'imposta lorda.
  //  20.000 < R ≤ 32.000 → 1.000
  //  32.000 < R ≤ 40.000 → 1.000 × (40.000 − R) / 8.000
  cuneoUlterioreDetrazione(R) {
    if (R <= 20000 || R > 40000) return 0;
    if (R <= 32000) return 1000;
    return 1000 * (40000 - R) / 8000;
  },

  // Trattamento integrativo (ex bonus Renzi), fino a 1.200 €/anno.
  // R ≤ 15.000: spetta se l'IRPEF lorda supera la detrazione da lavoro
  // ridotta di 75 € (correttivo L. 207/2024).
  // 15.000 < R ≤ 28.000: spetta solo per la parte di detrazioni che
  // eccede l'imposta lorda (qui semplificato alla sola detrazione lavoro).
  trattamentoIntegrativo(R, irpefLorda, detrazione) {
    if (R <= 15000) {
      return irpefLorda > Math.max(0, detrazione - 75) ? 1200 : 0;
    }
    if (R <= 28000) {
      return Math.min(1200, Math.max(0, detrazione - irpefLorda));
    }
    return 0;
  },

  // Addizionale regionale IRPEF 2026, sull'imponibile IRPEF.
  // Aliquote pubblicate per il 2026 (dove la regione non ha ancora
  // deliberato valgono le aliquote 2025). La Lombardia è progressiva
  // per scaglioni; per le altre regioni usiamo l'aliquota base
  // (semplificazione dichiarata: alcune regioni sono progressive).
  regioni: {
    // Aliquote 2026 verificate una per una sulle pagine regionali del MEF,
    // Dipartimento delle Finanze (addregirpef). Tre strutture possibili:
    //  - aliquota:   unica su tutto l'imponibile
    //  - scaglioni:  progressivi (ogni aliquota solo sulla parte nella fascia)
    //  - fasceIntero: l'aliquota della fascia si applica all'INTERO imponibile
    // flatFino: sotto la soglia si paga l'aliquota ridotta su tutto;
    // detrazioni: importi fissi sottratti all'imposta nella fascia indicata.
    // Non modellate (dichiarato): agevolazioni familiari regionali e le
    // misure provinciali di Trento (deduzione 30.000) e Bolzano (detrazione
    // 430,50), perche' la mappa non distingue le due province autonome.
    abruzzo: {
      nome: 'Abruzzo', capoluogo: "L'Aquila",
      scaglioni: [
        { fino: 28000, aliquota: 0.0167 },
        { fino: 50000, aliquota: 0.0287 },
        { fino: Infinity, aliquota: 0.0333 },
      ],
    },
    basilicata: { nome: 'Basilicata', aliquota: 0.0123, capoluogo: 'Potenza' },
    calabria:   { nome: 'Calabria',   aliquota: 0.0173, capoluogo: 'Catanzaro' },
    campania: {
      nome: 'Campania', capoluogo: 'Napoli',
      scaglioni: [
        { fino: 15000, aliquota: 0.0173 },
        { fino: 28000, aliquota: 0.0296 },
        { fino: 50000, aliquota: 0.0320 },
        { fino: Infinity, aliquota: 0.0333 },
      ],
    },
    'emilia-romagna': {
      nome: 'Emilia-Romagna', capoluogo: 'Bologna',
      scaglioni: [
        { fino: 15000, aliquota: 0.0133 },
        { fino: 28000, aliquota: 0.0193 },
        { fino: 50000, aliquota: 0.0278 },
        { fino: Infinity, aliquota: 0.0333 },
      ],
    },
    'friuli-venezia-giulia': {
      nome: 'Friuli-Venezia Giulia', capoluogo: 'Trieste',
      // "Per reddito imponibile superiore a 15.000 l'aliquota e' pari a
      // 1,23% sull'intero importo" (MEF): fasce, non scaglioni progressivi
      fasceIntero: [
        { fino: 15000, aliquota: 0.0070 },
        { fino: Infinity, aliquota: 0.0123 },
      ],
    },
    lazio: {
      nome: 'Lazio', capoluogo: 'Roma',
      // L.R. 20 del 31/12/2025: fino a 28.000 l'1,73% su tutto; oltre,
      // scaglioni 1,73/3,33 con detrazione di 60 euro tra 28.001 e 30.000
      flatFino: { soglia: 28000, aliquota: 0.0173 },
      scaglioni: [
        { fino: 15000, aliquota: 0.0173 },
        { fino: Infinity, aliquota: 0.0333 },
      ],
      detrazioni: [{ da: 28000, a: 30000, importo: 60 }],
    },
    liguria: {
      nome: 'Liguria', capoluogo: 'Genova',
      scaglioni: [
        { fino: 28000, aliquota: 0.0123 },
        { fino: 50000, aliquota: 0.0318 },
        { fino: Infinity, aliquota: 0.0323 },
      ],
    },
    lombardy: {
      nome: 'Lombardia', capoluogo: 'Milano',
      scaglioni: [
        { fino: 15000, aliquota: 0.0123 },
        { fino: 28000, aliquota: 0.0158 },
        { fino: 50000, aliquota: 0.0172 },
        { fino: Infinity, aliquota: 0.0173 },
      ],
    },
    marche: {
      nome: 'Marche', capoluogo: 'Ancona',
      scaglioni: [
        { fino: 15000, aliquota: 0.0123 },
        { fino: 28000, aliquota: 0.0153 },
        { fino: 50000, aliquota: 0.0170 },
        { fino: Infinity, aliquota: 0.0173 },
      ],
    },
    molise: {
      nome: 'Molise', capoluogo: 'Campobasso',
      scaglioni: [
        { fino: 15000, aliquota: 0.0203 },
        { fino: 28000, aliquota: 0.0223 },
        { fino: Infinity, aliquota: 0.0363 },
      ],
    },
    piedmont: {
      nome: 'Piemonte', capoluogo: 'Torino',
      scaglioni: [
        { fino: 15000, aliquota: 0.0162 },
        { fino: 28000, aliquota: 0.0268 },
        { fino: 50000, aliquota: 0.0331 },
        { fino: Infinity, aliquota: 0.0333 },
      ],
    },
    apulia: {
      nome: 'Puglia', capoluogo: 'Bari',
      scaglioni: [
        { fino: 15000, aliquota: 0.0133 },
        { fino: 28000, aliquota: 0.0213 },
        { fino: 50000, aliquota: 0.0323 },
        { fino: Infinity, aliquota: 0.0333 },
      ],
    },
    sardinia: { nome: 'Sardegna', aliquota: 0.0123, capoluogo: 'Cagliari' },
    sicily:   { nome: 'Sicilia',  aliquota: 0.0123, capoluogo: 'Palermo' },
    tuscany: {
      nome: 'Toscana', capoluogo: 'Firenze',
      scaglioni: [
        { fino: 15000, aliquota: 0.0142 },
        { fino: 28000, aliquota: 0.0143 },
        { fino: 50000, aliquota: 0.0332 },
        { fino: Infinity, aliquota: 0.0333 },
      ],
    },
    'trentino-south-tyrol': {
      nome: 'Trentino-Alto Adige', capoluogo: 'Trento',
      // Scaglioni comuni alle due province autonome; la provincia si deduce
      // dal comune scelto e attiva la sua agevolazione (pagine MEF):
      //  - Trento (L.P. 13/2019, mod. L.P. 11/2025): deduzione di 30.000
      //    per gli imponibili fino a 30.000 -> addizionale azzerata
      //  - Bolzano (L.P. 9/1998, art. 21/sexiesdecies): detrazione di
      //    430,50 per gli imponibili fino a 90.000 (l'ulteriore detrazione
      //    decrescente oltre 50.000 non e' modellata: formula non
      //    pubblicata in modo univoco)
      scaglioni: [
        { fino: 50000, aliquota: 0.0123 },
        { fino: Infinity, aliquota: 0.0173 },
      ],
      province: {
        trento: { deduzioneFino: 30000 },
        bolzano: { detrazione: 430.50, fino: 90000 },
      },
    },
    umbria: {
      nome: 'Umbria', capoluogo: 'Perugia',
      // L.R. 2/2025: le maggiorazioni non si applicano fino a 28.000
      // (resta l'1,23% su tutto); oltre, scaglioni pieni con detrazione
      // di 150 euro tra 28.001 e 50.000
      flatFino: { soglia: 28000, aliquota: 0.0123 },
      scaglioni: [
        { fino: 15000, aliquota: 0.0173 },
        { fino: 28000, aliquota: 0.0302 },
        { fino: 50000, aliquota: 0.0312 },
        { fino: Infinity, aliquota: 0.0333 },
      ],
      detrazioni: [{ da: 28000, a: 50000, importo: 150 }],
    },
    'aosta-valley': {
      nome: "Valle d'Aosta", capoluogo: 'Aosta',
      // Esenzione totale fino a 15.000; oltre, 1,23% sull'intero imponibile
      fasceIntero: [
        { fino: 15000, aliquota: 0 },
        { fino: Infinity, aliquota: 0.0123 },
      ],
    },
    veneto: { nome: 'Veneto', aliquota: 0.0123, capoluogo: 'Venezia' },
  },

  // Addizionale comunale di default (personalizzabile in UI).
  // Milano: 0,80% con esenzione totale fino a 23.000 € di imponibile
  // (Comune di Milano). Per gli altri capoluoghi proponiamo lo 0,8%
  // come valore tipico, modificabile: ogni comune delibera la propria.
  comuneDefault: { aliquota: 0.008, esenzione: 0 },
  // Milano: delibera vigente 2026 (0,80%, esenzione 23.000 €).
  // Roma: 0,9%, esenzione alzata a 14.000 € dal 01/01/2025 (Roma Capitale).
  comuniNoti: {
    Milano: { aliquota: 0.008, esenzione: 23000 },
    Roma:   { aliquota: 0.009, esenzione: 14000 },
  },
};

/**
 * Addizionale regionale secondo la struttura della regione (pagine MEF):
 * aliquota unica, scaglioni progressivi, fasce sull'intero imponibile,
 * aliquota ridotta sotto soglia, detrazioni fisse di fascia.
 */
function addizionaleRegionale(imponibile, regione, provinciaTAA) {
  // Province autonome: l'agevolazione dipende dalla provincia del comune
  if (regione.province && provinciaTAA && regione.province[provinciaTAA]) {
    const prov = regione.province[provinciaTAA];
    if (prov.deduzioneFino != null && imponibile <= prov.deduzioneFino) {
      return { totale: 0, dettaglio: null, regola: 'azzerata dalla deduzione provinciale', detrazione: 0 };
    }
    if (prov.detrazione != null && imponibile <= prov.fino) {
      const calc = perScaglioni(imponibile, regione.scaglioni);
      return {
        totale: Math.max(0, calc.totale - prov.detrazione),
        dettaglio: calc.dettaglio,
        regola: 'per scaglioni',
        detrazione: prov.detrazione,
        detrazioneNota: 'la detrazione provinciale di Bolzano',
      };
    }
    // sopra le soglie provinciali valgono gli scaglioni pieni
  }
  if (regione.fasceIntero) {
    const fascia = regione.fasceIntero.find((f) => imponibile <= f.fino);
    const totale = imponibile * fascia.aliquota;
    return {
      totale,
      dettaglio: totale > 0 ? [{ da: 0, a: imponibile, aliquota: fascia.aliquota, quota: imponibile, imposta: totale }] : null,
      regola: totale > 0 ? 'per fasce, sull\'intero imponibile' : 'esente sotto soglia',
      detrazione: 0,
    };
  }
  if (regione.flatFino && imponibile <= regione.flatFino.soglia) {
    const totale = imponibile * regione.flatFino.aliquota;
    return {
      totale,
      dettaglio: [{ da: 0, a: imponibile, aliquota: regione.flatFino.aliquota, quota: imponibile, imposta: totale }],
      regola: 'aliquota ridotta sotto soglia',
      detrazione: 0,
    };
  }
  if (regione.scaglioni) {
    const calc = perScaglioni(imponibile, regione.scaglioni);
    let detrazione = 0;
    if (regione.detrazioni) {
      for (const d of regione.detrazioni) {
        if (imponibile > d.da && imponibile <= d.a) detrazione = d.importo;
      }
    }
    return { totale: Math.max(0, calc.totale - detrazione), dettaglio: calc.dettaglio, regola: 'per scaglioni', detrazione, detrazioneNota: 'la detrazione regionale di fascia' };
  }
  return { totale: imponibile * regione.aliquota, dettaglio: null, regola: 'aliquota unica', detrazione: 0 };
}

/** Applica scaglioni progressivi a un imponibile. Ritorna { totale, dettaglio[] }. */
function perScaglioni(imponibile, scaglioni) {
  let resto = imponibile, prec = 0, totale = 0;
  const dettaglio = [];
  for (const s of scaglioni) {
    if (resto <= 0) break;
    const quota = Math.min(resto, s.fino - prec);
    const imposta = quota * s.aliquota;
    dettaglio.push({ da: prec, a: s.fino, aliquota: s.aliquota, quota, imposta });
    totale += imposta;
    resto -= quota;
    prec = s.fino;
  }
  return { totale, dettaglio };
}

/**
 * Calcolo principale.
 * @param {object} p
 * @param {number} p.ral            retribuzione annua lorda
 * @param {number} [p.mensilita=13] numero mensilità (12, 13 o 14)
 * @param {string} [p.regioneId='lombardy'] id regione (chiavi di TAX_2026.regioni)
 * @param {number} [p.comuneAliquota] aliquota comunale (es. 0.008)
 * @param {number} [p.comuneEsenzione] soglia di esenzione comunale in €
 */
function calcolaNetto(p) {
  const T = TAX_2026;
  const ral = Number(p.ral);
  if (!Number.isFinite(ral) || ral < 0) throw new Error('RAL non valida');
  const mensilita = p.mensilita || 13;
  const regione = T.regioni[p.regioneId || 'lombardy'];
  if (!regione) throw new Error('Regione non riconosciuta: ' + p.regioneId);

  // 1. Contributi INPS a carico del lavoratore (calcolati sulla RAL).
  // In apprendistato l'aliquota scende al 5,84%; il contributo aggiuntivo
  // dell'1% oltre la prima fascia non e' modellato per gli apprendisti
  // (caso non tipico del contratto, dichiarato).
  const apprendistato = !!p.apprendistato;
  const aliquotaInps = apprendistato ? T.inps.apprendista : T.inps.aliquota;
  const inpsBase = ral * aliquotaInps;
  const inpsAggiuntivo = apprendistato ? 0 : Math.max(0, ral - T.inps.primaFascia) * T.inps.aliquotaAggiuntiva;
  const contributi = inpsBase + inpsAggiuntivo;

  // 2. Imponibile fiscale (base per IRPEF e addizionali)
  const imponibile = ral - contributi;

  // 3. IRPEF lorda per scaglioni
  const irpefCalc = perScaglioni(imponibile, T.irpef);
  const irpefLorda = irpefCalc.totale;

  // 4. Detrazioni dall'imposta
  const detrazioneLavoro = T.detrazioneLavoro(imponibile);
  const ulterioreDetrazione = T.cuneoUlterioreDetrazione(imponibile);
  // L'IRPEF netta non scende sotto zero: l'eccedenza si perde (incapienza)
  const irpefNetta = Math.max(0, irpefLorda - detrazioneLavoro - ulterioreDetrazione);

  // 5. Addizionali (stessa base imponibile IRPEF; semplificazione: competenza).
  // Condizione di debenza: le addizionali sono dovute solo se l'IRPEF è dovuta,
  // cioè se l'imposta netta è maggiore di zero (art. 50 c.2 D.Lgs. 446/1997 per
  // la regionale, art. 1 c.4 D.Lgs. 360/1998 per la comunale). Sotto la no-tax
  // area, dove l'IRPEF si azzera, non si pagano nemmeno le addizionali.
  const irpefDovuta = irpefNetta > 0;
  const addRegionaleCalc = !irpefDovuta
    ? { totale: 0, dettaglio: null, regola: 'non dovuta', detrazione: 0 }
    : addizionaleRegionale(imponibile, regione, p.provinciaTAA);
  const addRegionale = addRegionaleCalc.totale;

  const comAliquota = p.comuneAliquota ?? T.comuneDefault.aliquota;
  const comEsenzione = p.comuneEsenzione ?? T.comuneDefault.esenzione;
  // Alcuni comuni (elenco AdE) applicano scaglioni propri invece dell'aliquota unica
  const comCalc = (!irpefDovuta || imponibile <= comEsenzione)
    ? { totale: 0, dettaglio: null }
    : (p.comuneScaglioni && p.comuneScaglioni.length
        ? perScaglioni(imponibile, p.comuneScaglioni)
        : { totale: imponibile * comAliquota, dettaglio: null });
  const addComunale = comCalc.totale;

  // 6. Somme che si AGGIUNGONO al netto (cuneo fiscale, redditi medio-bassi)
  const sommaEsente = T.cuneoSommaEsente(imponibile);
  const trattIntegrativo = T.trattamentoIntegrativo(imponibile, irpefLorda, detrazioneLavoro);

  // 7. Netto
  const totaleTrattenute = contributi + irpefNetta + addRegionale + addComunale;
  const nettoAnnuo = ral - totaleTrattenute + sommaEsente + trattIntegrativo;
  const nettoMensile = nettoAnnuo / mensilita;

  // 8. Ripartizione sulle mensilità: la mensilità aggiuntiva (13ª/14ª) è più
  // "leggera" di una busta ordinaria, perché le detrazioni d'imposta vengono
  // già spalmate sulle 12 buste ordinarie e la quota extra si tassa senza
  // sconti, all'aliquota media IRPEF. Modello semplificato ma coerente:
  // la somma delle buste ricostruisce esattamente il netto annuo.
  const quotaLorda = mensilita > 0 ? ral / mensilita : 0;
  const contribRate = ral > 0 ? contributi / ral : 0;
  const aliquotaMediaIrpef = imponibile > 0 ? irpefLorda / imponibile : 0;
  const nettoExtra = quotaLorda * (1 - contribRate) * (1 - aliquotaMediaIrpef);
  const extraCount = Math.max(0, mensilita - 12);
  const nettoOrdinario = (nettoAnnuo - extraCount * nettoExtra) / 12;

  return {
    input: { ral, mensilita, regione: regione.nome, comuneAliquota: comAliquota, comuneEsenzione: comEsenzione },
    mensilitaDetail: { ordinario: nettoOrdinario, extra: nettoExtra, extraCount },
    contributi: { totale: contributi, base: inpsBase, aggiuntivo: inpsAggiuntivo, aliquota: aliquotaInps, apprendistato },
    imponibile,
    irpef: {
      lorda: irpefLorda,
      dettaglioScaglioni: irpefCalc.dettaglio,
      detrazioneLavoro,
      ulterioreDetrazione,
      netta: irpefNetta,
    },
    addizionali: { regionale: addRegionale, dettaglioRegionale: addRegionaleCalc.dettaglio, regolaRegionale: addRegionaleCalc.regola, detrazioneRegionale: addRegionaleCalc.detrazione, detrazioneRegionaleNota: addRegionaleCalc.detrazioneNota || null, comunale: addComunale, dettaglioComunale: comCalc.dettaglio },
    bonus: { sommaEsente, trattamentoIntegrativo: trattIntegrativo },
    totaleTrattenute,
    nettoAnnuo,
    nettoMensile,
    aliquotaEffettiva: ral > 0 ? totaleTrattenute / ral : 0,
  };
}

// ─── Vista azienda (HR) ───────────────────────────────────────────────

// Aliquote tipiche a carico del datore per un impiegato:
// INPS 23,81% (FPLD + minori), TFR 6,91% (quota annua RAL/13,5 al netto
// dello 0,50% al fondo di garanzia), INAIL ~0,40% (rischio ufficio).
// Il contratto a termine paga anche il contributo addizionale dell'1,4%
// (art. 2, c. 28, L. 92/2012: finanzia la NASpI).
const AZIENDA_2026 = {
  inpsDatore: 0.2381,
  // Apprendistato, aziende con piu' di 9 dipendenti: 10% previdenziale
  // + 1,61% NASpI e fondi (L. 296/2006 art. 1 c. 773; NASpI dal 2013)
  inpsDatoreApprendista: 0.1161,
  tfr: 0.0691,
  inail: 0.004,
  addizionaleDeterminato: 0.014,
};

/** Costo azienda: quanto spende il datore per una data RAL. */
function calcolaCostoAzienda(ral, opts = {}) {
  const apprendistato = Boolean(opts.apprendistato);
  const determinato = Boolean(opts.determinato) && !apprendistato;
  const inps = ral * (apprendistato ? AZIENDA_2026.inpsDatoreApprendista : AZIENDA_2026.inpsDatore);
  // Gli apprendisti sono esclusi dal contributo addizionale del determinato
  // (art. 2 c. 29 L. 92/2012)
  const addizionale = determinato ? ral * AZIENDA_2026.addizionaleDeterminato : 0;
  const tfr = ral * AZIENDA_2026.tfr;
  const inail = ral * AZIENDA_2026.inail;
  return { ral, inps, addizionale, tfr, inail, determinato, apprendistato, totale: ral + inps + addizionale + tfr + inail };
}

// Incentivi STRUTTURALI all'assunzione (L. 92/2012): non a bando, sempre
// in vigore. I bonus temporanei (es. under 35) dipendono da decreti
// attuativi e fondi annuali: esclusi di proposito, vedi README.
const SGRAVI_2026 = {
  over50: {
    nome: 'Over 50 disoccupato da almeno 12 mesi',
    tipo: 'contributi', quota: 0.5, mesi: 18,
    fonte: 'L. 92/2012, art. 4, commi 8-10',
    descr: 'Riduzione del 50% dei contributi a carico del datore per 18 mesi (assunzione a tempo indeterminato).',
  },
  donna: {
    nome: 'Donna "svantaggiata"',
    tipo: 'contributi', quota: 0.5, mesi: 18,
    fonte: 'L. 92/2012, art. 4, commi 8-11',
    descr: 'Riduzione del 50% dei contributi datoriali per 18 mesi: donne senza impiego da 24 mesi, o da 6 mesi se residenti in aree svantaggiate o in settori con forte disparità di genere.',
  },
  naspi: {
    nome: 'Percettore di NASpI',
    tipo: 'naspi', quota: 0.2, mesi: null,
    fonte: 'L. 92/2012, art. 2, comma 10-bis',
    descr: 'Contributo pari al 20% dell\'indennità NASpI mensile residua, per i mesi che il lavoratore avrebbe ancora percepito.',
  },
};

/**
 * Risparmio da incentivo strutturale.
 * @param {string} tipo         chiave di SGRAVI_2026 ('over50' | 'donna' | 'naspi')
 * @param {number} ral
 * @param {object} [opts]       per 'naspi': { indennitaMensile, mesiResidui }
 */
function calcolaSgravio(tipo, ral, opts = {}) {
  const s = SGRAVI_2026[tipo];
  if (!s) return null;
  if (s.tipo === 'contributi') {
    const mensile = (ral * AZIENDA_2026.inpsDatore * s.quota) / 12;
    // A tempo determinato l'incentivo dura 12 mesi, a indeterminato 18
    const mesi = opts.determinato ? 12 : s.mesi;
    return { ...s, mensile, primoAnno: mensile * Math.min(12, mesi), totale: mensile * mesi, durataMesi: mesi };
  }
  // NASpI: 20% dell'indennità residua per i mesi rimanenti
  const indennita = opts.indennitaMensile ?? 1000;
  const mesi = opts.mesiResidui ?? 12;
  const mensile = indennita * s.quota;
  return { ...s, mensile, primoAnno: mensile * Math.min(12, mesi), totale: mensile * mesi, durataMesi: mesi };
}

/**
 * Costruisce gli scaglioni comunali dall'elenco AdE.
 * Tipologia 1: soglie a 15.000 / 28.000 / 50.000. Tipologia 2: 28.000 / 50.000.
 * Le aliquote arrivano in percento (0.8 = 0,80%) e vengono convertite in frazione.
 */
function comuneScaglioni(tipologia, aliquotePct) {
  const soglie = tipologia === 1 ? [15000, 28000, 50000, Infinity] : [28000, 50000, Infinity];
  return aliquotePct.map((a, i) => ({ fino: soglie[i] ?? Infinity, aliquota: a / 100 }));
}

const JetNetto = { TAX_2026, AZIENDA_2026, SGRAVI_2026, calcolaNetto, calcolaCostoAzienda, calcolaSgravio, perScaglioni, comuneScaglioni };

if (typeof module !== 'undefined' && module.exports) module.exports = JetNetto;
if (typeof window !== 'undefined') window.JetNetto = JetNetto;
