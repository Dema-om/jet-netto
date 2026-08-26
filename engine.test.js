/**
 * engine.test.js — test del motore di calcolo.
 * Esecuzione: node engine.test.js
 *
 * I valori attesi di netto sono confrontati con un range plausibile
 * (i calcolatori pubblici differiscono di ±2% tra loro per via delle
 * diverse semplificazioni), mentre le singole voci intermedie sono
 * verificate in modo esatto contro le formule di legge.
 */
const { TAX_2026, calcolaNetto, perScaglioni } = require('./engine.js');

let passed = 0, failed = 0;
function ok(cond, label) {
  if (cond) { passed++; console.log('  ✓', label); }
  else { failed++; console.error('  ✗', label); }
}
function approx(a, b, tol, label) {
  ok(Math.abs(a - b) <= tol, `${label} (atteso ~${b}, ottenuto ${a.toFixed(2)})`);
}

console.log('— Scaglioni IRPEF');
{
  // 30.000 € imponibile: 28.000×23% + 2.000×33% = 6.440 + 660 = 7.100
  const r = perScaglioni(30000, TAX_2026.irpef);
  approx(r.totale, 7100, 0.01, 'IRPEF lorda su 30.000');
  ok(r.dettaglio.length === 2, 'due scaglioni toccati');
  // 60.000: 6.440 + 22.000×33% + 10.000×43% = 6.440+7.260+4.300 = 17.999,99…
  approx(perScaglioni(60000, TAX_2026.irpef).totale, 18000, 0.01, 'IRPEF lorda su 60.000');
}

console.log('— Contributi INPS');
{
  const r = calcolaNetto({ ral: 30000, regioneId: 'lombardy' });
  approx(r.contributi.totale, 30000 * 0.0919, 0.01, '9,19% su RAL 30.000');
  ok(r.contributi.aggiuntivo === 0, 'nessun 1% aggiuntivo sotto la prima fascia');
  const alto = calcolaNetto({ ral: 70000, regioneId: 'lombardy' });
  approx(alto.contributi.aggiuntivo, (70000 - 56224) * 0.01, 0.01, '1% sulla quota oltre 56.224');
}

console.log('— Detrazione lavoro dipendente (art. 13 TUIR)');
{
  approx(TAX_2026.detrazioneLavoro(10000), 1955, 0.01, 'fissa a 1.955 fino a 15.000');
  approx(TAX_2026.detrazioneLavoro(20000), 1910 + 1190 * 8000 / 13000, 0.01, 'formula 15–28k');
  approx(TAX_2026.detrazioneLavoro(30000), 1910 * 20000 / 22000 + 65, 0.01, 'formula 28–50k con +65');
  approx(TAX_2026.detrazioneLavoro(55000), 0, 0.01, 'zero oltre 50.000');
}

console.log('— Cuneo fiscale (L. 207/2024)');
{
  approx(TAX_2026.cuneoSommaEsente(18000), 18000 * 0.048, 0.01, 'somma esente 4,8% a 18.000');
  approx(TAX_2026.cuneoSommaEsente(21000), 0, 0.01, 'niente somma esente sopra 20.000');
  approx(TAX_2026.cuneoUlterioreDetrazione(25000), 1000, 0.01, 'ulteriore detrazione piena a 25.000');
  approx(TAX_2026.cuneoUlterioreDetrazione(36000), 1000 * 4000 / 8000, 0.01, 'décalage a 36.000');
  approx(TAX_2026.cuneoUlterioreDetrazione(45000), 0, 0.01, 'zero oltre 40.000');
}

console.log('— Addizionali');
{
  // Lombardia progressiva su 30.000: 15.000×1,23% + 13.000×1,58% + 2.000×1,72%
  const att = 15000 * 0.0123 + 13000 * 0.0158 + 2000 * 0.0172;
  const r = calcolaNetto({ ral: 33036, regioneId: 'lombardy' }); // imponibile ≈ 30.000
  approx(r.addizionali.regionale, att, 5, 'Lombardia per scaglioni (~30.000 imponibile)');
  // Esenzione comunale Milano: sotto 23.000 di imponibile → 0
  const basso = calcolaNetto({ ral: 20000, regioneId: 'lombardy', comuneAliquota: 0.008, comuneEsenzione: 23000 });
  ok(basso.addizionali.comunale === 0, 'comunale azzerata sotto la soglia di esenzione');
  const sopra = calcolaNetto({ ral: 40000, regioneId: 'lombardy', comuneAliquota: 0.008, comuneEsenzione: 23000 });
  ok(sopra.addizionali.comunale > 0, 'comunale dovuta sopra la soglia');
}

console.log('— Casi completi (range di plausibilità vs calcolatori pubblici)');
{
  // RAL 30.000, Milano, con riforma cuneo 2025/26 (ulteriore detrazione 1.000):
  // verifica manuale → 23.425,58. I simulatori aggiornati danno ~23.000–23.700.
  const r30 = calcolaNetto({ ral: 30000, regioneId: 'lombardy', comuneAliquota: 0.008, comuneEsenzione: 23000 });
  approx(r30.nettoAnnuo, 23425.58, 1, 'RAL 30.000 → netto (verifica manuale)');
  ok(r30.nettoMensile > 1700 && r30.nettoMensile < 1850, `mensile su 13 → ${r30.nettoMensile.toFixed(0)} plausibile`);

  // RAL 50.000, Milano: ~33.000–35.000
  const r50 = calcolaNetto({ ral: 50000, regioneId: 'lombardy', comuneAliquota: 0.008, comuneEsenzione: 23000 });
  ok(r50.nettoAnnuo > 32500 && r50.nettoAnnuo < 35500, `RAL 50.000 → netto ${r50.nettoAnnuo.toFixed(0)} nel range atteso`);

  // RAL 15.000: redditi bassi, deve esserci la somma esente e IRPEF quasi azzerata
  const r15 = calcolaNetto({ ral: 15000, regioneId: 'lombardy', comuneAliquota: 0.008, comuneEsenzione: 23000 });
  ok(r15.bonus.sommaEsente > 0, 'somma esente presente a RAL 15.000');
  ok(r15.irpef.netta < r15.irpef.lorda, 'detrazioni riducono l\'IRPEF');
  ok(r15.nettoAnnuo > 13000, `netto ${r15.nettoAnnuo.toFixed(0)} > 13.000 (carico fiscale quasi nullo)`);

  // Monotonia: più RAL → più netto (nessun "scalone" che inverte)
  let prev = 0, monotono = true;
  for (let ral = 5000; ral <= 100000; ral += 500) {
    const n = calcolaNetto({ ral, regioneId: 'lombardy', comuneAliquota: 0.008, comuneEsenzione: 23000 }).nettoAnnuo;
    if (n < prev - 300) { monotono = false; console.error(`    inversione a RAL ${ral}: ${prev.toFixed(0)} → ${n.toFixed(0)}`); }
    prev = n;
  }
  ok(monotono, 'netto quasi-monotono su RAL 5.000–100.000 (discontinuità note < 300 €)');
}

console.log('— Addizionale comunale a scaglioni (elenco AdE)');
{
  const { comuneScaglioni } = require('./engine.js');
  // Tipologia 2 (es. Abbadia Lariana): 0,76% fino a 28k, 0,77% 28-50k, 0,80% oltre
  const sc = comuneScaglioni(2, [0.76, 0.77, 0.8]);
  ok(sc.length === 3 && sc[0].fino === 28000 && sc[1].fino === 50000, 'tipologia 2: soglie 28.000 / 50.000');
  approx(sc[0].aliquota, 0.0076, 1e-9, 'aliquote convertite da percento a frazione');
  // Imponibile 40.000: 28.000×0,76% + 12.000×0,77% = 212,80 + 92,40 = 305,20
  const r = calcolaNetto({ ral: 44050, regioneId: 'lombardy', comuneEsenzione: 15000, comuneScaglioni: sc });
  approx(r.addizionali.comunale, perScaglioni(r.imponibile, sc).totale, 0.01, 'comunale calcolata per scaglioni');
  ok(r.addizionali.dettaglioComunale.length >= 2, 'dettaglio scaglioni comunali presente');
  // Tipologia 1: quattro soglie
  const sc1 = comuneScaglioni(1, [0.5, 0.6, 0.7, 0.8]);
  ok(sc1.length === 4 && sc1[0].fino === 15000 && sc1[2].fino === 50000, 'tipologia 1: soglie 15.000 / 28.000 / 50.000');
  // Esenzione vince sugli scaglioni
  const es = calcolaNetto({ ral: 15000, regioneId: 'lombardy', comuneEsenzione: 15000, comuneScaglioni: sc });
  ok(es.addizionali.comunale === 0, 'sotto la soglia di esenzione non si paga, anche a scaglioni');
}

console.log('— Comuni noti');
{
  ok(TAX_2026.comuniNoti.Milano.aliquota === 0.008 && TAX_2026.comuniNoti.Milano.esenzione === 23000,
    'Milano: 0,80% con esenzione 23.000 (delibera vigente 2026)');
  ok(TAX_2026.comuniNoti.Roma.aliquota === 0.009 && TAX_2026.comuniNoti.Roma.esenzione === 14000,
    'Roma: 0,90% con esenzione 14.000 (dal 2025)');
}

console.log('— Ripartizione mensilità (13ª/14ª)');
{
  const r = calcolaNetto({ ral: 30000, mensilita: 13, regioneId: 'lombardy', comuneAliquota: 0.008, comuneEsenzione: 23000 });
  const somma = 12 * r.mensilitaDetail.ordinario + r.mensilitaDetail.extraCount * r.mensilitaDetail.extra;
  approx(somma, r.nettoAnnuo, 0.01, 'le buste ricostruiscono il netto annuo');
  ok(r.mensilitaDetail.extra < r.mensilitaDetail.ordinario, 'la tredicesima è più leggera della busta ordinaria');
  const r14 = calcolaNetto({ ral: 30000, mensilita: 14, regioneId: 'lombardy', comuneAliquota: 0.008, comuneEsenzione: 23000 });
  ok(r14.mensilitaDetail.extraCount === 2, 'con 14 mensilità le quote extra sono due');
  const r12 = calcolaNetto({ ral: 30000, mensilita: 12, regioneId: 'lombardy', comuneAliquota: 0.008, comuneEsenzione: 23000 });
  approx(r12.mensilitaDetail.ordinario, r12.nettoAnnuo / 12, 0.01, 'con 12 mensilità nessuna quota extra');
}

console.log('— Vista azienda: costo e sgravi (L. 92/2012)');
{
  const { calcolaCostoAzienda, calcolaSgravio } = require('./engine.js');
  const c = calcolaCostoAzienda(30000);
  approx(c.inps, 30000 * 0.2381, 0.01, 'INPS datore 23,81%');
  approx(c.tfr, 30000 * 0.0691, 0.01, 'TFR 6,91%');
  approx(c.totale, 30000 * 1.3112, 0.01, 'costo azienda = RAL × 1,3112');
  const det = calcolaCostoAzienda(30000, { determinato: true });
  approx(det.addizionale, 30000 * 0.014, 0.01, 'determinato: contributo addizionale 1,4%');
  approx(det.totale - c.totale, 420, 0.01, 'il determinato costa 420 € in più su RAL 30.000');
  const o = calcolaSgravio('over50', 30000);
  approx(o.mensile, 30000 * 0.2381 * 0.5 / 12, 0.01, 'over 50: 50% dei contributi datore, quota mensile');
  ok(o.durataMesi === 18, 'over 50: 18 mesi a tempo indeterminato');
  ok(calcolaSgravio('over50', 30000, { determinato: true }).durataMesi === 12, 'over 50: 12 mesi a tempo determinato');
  approx(o.totale, o.mensile * 18, 0.01, 'over 50: totale su 18 mesi');
  const d = calcolaSgravio('donna', 30000);
  approx(d.totale, o.totale, 0.01, 'donna svantaggiata: stesso meccanismo');
  const n = calcolaSgravio('naspi', 30000, { indennitaMensile: 1200, mesiResidui: 10 });
  approx(n.mensile, 240, 0.01, 'NASpI: 20% dell\'indennità residua');
  approx(n.totale, 2400, 0.01, 'NASpI: per i mesi residui');
  ok(calcolaSgravio('inventato', 30000) === null, 'sgravio sconosciuto rifiutato');
}

console.log('— Addizionali regionali 2026: strutture MEF regione per regione');
{
  // RAL tale che l'imponibile sia ~X: ral = X / (1 - 0.0919)
  const ralPer = (imp) => imp / (1 - 0.0919);
  const addReg = (imp, regioneId) =>
    calcolaNetto({ ral: ralPer(imp), regioneId, comuneAliquota: 0, comuneEsenzione: 0 }).addizionali.regionale;
  const vicino = (a, b) => Math.abs(a - b) < 0.5;

  // Lazio, esempi CGIL Lazio verificati a mano (L.R. 20/2025)
  ok(vicino(addReg(25000, 'lazio'), 432.50), 'Lazio 25.000: 1,73% ridotta su tutto = 432,50');
  ok(vicino(addReg(28000, 'lazio'), 484.40), 'Lazio 28.000: ancora ridotta = 484,40');
  ok(vicino(addReg(29000, 'lazio'), 665.70), 'Lazio 29.000: scaglioni pieni meno 60 = 665,70');
  ok(vicino(addReg(32000, 'lazio'), 825.60), 'Lazio 32.000: scaglioni pieni senza detrazione = 825,60');

  // Friuli-VG: aliquota della fascia sull'INTERO imponibile (MEF)
  ok(vicino(addReg(14000, 'friuli-venezia-giulia'), 98.00), 'FVG 14.000: 0,70% su tutto = 98,00');
  ok(vicino(addReg(16000, 'friuli-venezia-giulia'), 196.80), 'FVG 16.000: 1,23% su TUTTO (non progressivo) = 196,80');

  // Valle d'Aosta: esenzione totale fino a 15.000
  ok(addReg(14000, 'aosta-valley') === 0, 'VdA 14.000: esente');
  ok(vicino(addReg(16000, 'aosta-valley'), 196.80), 'VdA 16.000: 1,23% su tutto = 196,80');

  // Umbria: ridotta 1,23% fino a 28.000; sopra scaglioni pieni meno 150
  ok(vicino(addReg(25000, 'umbria'), 307.50), 'Umbria 25.000: 1,23% su tutto = 307,50');
  ok(vicino(addReg(40000, 'umbria'), 876.50), 'Umbria 40.000: 259,50+392,60+374,40−150 = 876,50');

  // Piemonte e Trentino-A.A.: scaglioni MEF
  ok(vicino(addReg(20000, 'piedmont'), 377.00), 'Piemonte 20.000: 243+134 = 377,00');
  {
    // sopra 56.224 il contributo aggiuntivo 1% sposta l'imponibile:
    // l'atteso si calcola dall'imponibile effettivo
    const r = calcolaNetto({ ral: ralPer(60000), regioneId: 'trentino-south-tyrol', comuneAliquota: 0, comuneEsenzione: 0 });
    const atteso = 50000 * 0.0123 + (r.imponibile - 50000) * 0.0173;
    ok(vicino(r.addizionali.regionale, atteso), "Trentino-A.A. oltre 50.000: 1,23% + 1,73% sull'eccedenza");
  }

  // Aliquote uniche corrette dal MEF
  ok(vicino(addReg(20000, 'sicily'), 246.00), 'Sicilia 20.000: 1,23% (non 1,73) = 246,00');
  ok(vicino(addReg(20000, 'calabria'), 346.00), 'Calabria 20.000: 1,73% (non 2,03) = 346,00');
}

console.log('— Province autonome: agevolazioni dedotte dalla provincia');
{
  const ralPer2 = (imp) => imp / (1 - 0.0919);
  const taa = (imp, prov) =>
    calcolaNetto({ ral: ralPer2(imp), regioneId: 'trentino-south-tyrol', provinciaTAA: prov, comuneAliquota: 0, comuneEsenzione: 0 }).addizionali;
  const vicino2 = (a, b) => Math.abs(a - b) < 0.5;

  // Trento: deduzione 30.000 -> azzerata fino a 30.000 di imponibile
  ok(taa(25000, 'trento').regionale === 0, 'Trento 25.000: azzerata dalla deduzione provinciale');
  ok(taa(29999, 'trento').regionale === 0, 'Trento 29.999: ancora azzerata');
  ok(vicino2(taa(40000, 'trento').regionale, 492.00), 'Trento 40.000: scaglioni pieni = 492,00');

  // Bolzano: detrazione 430,50 fino a 90.000
  ok(taa(30000, 'bolzano').regionale === 0, 'Bolzano 30.000: 369 − 430,50 -> zero');
  ok(vicino2(taa(50000, 'bolzano').regionale, 184.50), 'Bolzano 50.000: 615 − 430,50 = 184,50');

  // Senza provincia: scaglioni comuni (retrocompatibile)
  ok(vicino2(taa(25000, undefined).regionale, 307.50), 'TAA senza provincia: scaglioni comuni = 307,50');
}

console.log('— Apprendistato lato azienda: 11,61% e niente 1,4%');
{
  const { calcolaCostoAzienda } = require('./engine.js');
  const app2 = calcolaCostoAzienda(25000, { apprendistato: true });
  ok(Math.abs(app2.inps - 25000 * 0.1161) < 0.01, 'INPS datore 11,61% della RAL');
  const appDet = calcolaCostoAzienda(25000, { apprendistato: true, determinato: true });
  ok(appDet.addizionale === 0, "apprendista escluso dall'1,4% anche se a termine (art. 2 c. 29 L. 92/2012)");
  const std2 = calcolaCostoAzienda(25000, {});
  ok(std2.totale - app2.totale > 3000, 'apprendista: oltre 3.000 € di costo in meno su 25.000 di RAL');
}

console.log('— Apprendistato: contributi ridotti al 5,84%');
{
  const std = calcolaNetto({ ral: 25000, regioneId: 'lombardy', comuneAliquota: 0.008, comuneEsenzione: 23000 });
  const app = calcolaNetto({ ral: 25000, regioneId: 'lombardy', comuneAliquota: 0.008, comuneEsenzione: 23000, apprendistato: true });
  ok(Math.abs(app.contributi.totale - 25000 * 0.0584) < 0.01, 'contributi = 5,84% secco della RAL');
  ok(app.contributi.apprendistato === true && std.contributi.apprendistato === false, 'flag esposto nel risultato');
  ok(app.nettoAnnuo > std.nettoAnnuo, 'a parità di RAL il netto sale');
  ok(app.imponibile > std.imponibile, "l'imponibile sale (meno contributi)");
  // niente contributo aggiuntivo oltre la prima fascia in apprendistato
  const alto = calcolaNetto({ ral: 70000, regioneId: 'lombardy', apprendistato: true });
  ok(alto.contributi.aggiuntivo === 0, 'apprendistato: nessun 1% aggiuntivo (dichiarato)');
}

console.log('— Condizione di debenza delle addizionali (no-tax area)');
{
  // A RAL bassa l'IRPEF netta è 0: le addizionali NON sono dovute (art. 50 D.Lgs. 446/1997)
  const basso = calcolaNetto({ ral: 8000, regioneId: 'lombardy', comuneAliquota: 0.008, comuneEsenzione: 23000 });
  ok(basso.irpef.netta === 0, 'RAL 8.000: IRPEF netta azzerata');
  ok(basso.addizionali.regionale === 0, 'IRPEF a zero → nessuna addizionale regionale dovuta');
  ok(basso.addizionali.comunale === 0, 'IRPEF a zero → nessuna addizionale comunale dovuta');
  // Sopra la no-tax area invece si pagano
  const medio = calcolaNetto({ ral: 30000, regioneId: 'lombardy', comuneAliquota: 0.008, comuneEsenzione: 23000 });
  ok(medio.addizionali.regionale > 0, 'RAL 30.000: addizionale regionale dovuta');
}

console.log('— Robustezza input');
{
  let thrown = false;
  try { calcolaNetto({ ral: -1 }); } catch { thrown = true; }
  ok(thrown, 'RAL negativa rifiutata');
  thrown = false;
  try { calcolaNetto({ ral: 30000, regioneId: 'atlantide' }); } catch { thrown = true; }
  ok(thrown, 'regione sconosciuta rifiutata');
  const zero = calcolaNetto({ ral: 0 });
  ok(zero.nettoAnnuo >= 0, 'RAL 0 → netto ≥ 0');
}

console.log(`\n${passed} passati, ${failed} falliti`);
process.exit(failed ? 1 : 0);
