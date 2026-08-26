# jet·netto — dalla RAL al netto, voce per voce

Prototipo per il task Product Builder di Jet HR: un calcolatore che riceve una RAL
e restituisce netto annuale, netto mensile e tutte le trattenute, spiegando ogni
voce con la formula reale e i numeri dell'utente dentro.

**Demo:** apri `index.html` in un browser (nessuna build, nessuna dipendenza)
oppure servi la cartella con un qualunque static server.

## Perché è fatto così

Il brief dice che lo scopo non è la velocità con cui si assembla un tool, ma il
controllo delle logiche. Il prototipo lo prende alla lettera su quattro piani:

1. **Il motore è separato dalla UI.** Tutta la fiscalità sta in `engine.js`,
   una funzione pura senza dipendenze che gira identica nel browser e in Node.
   Si testa da terminale: `node engine.test.js` (85 assert su formule, casi
   completi verificati a mano, monotonia del netto, ripartizione delle
   mensilità, dati dei comuni, costo azienda, incentivi e robustezza input). L'audit finale ha
   passato al setaccio 8.000 combinazioni regione × RAL senza anomalie e
   verificato il contrasto WCAG della palette (lime su nero: 14:1, AAA;
   rosso delle trattenute: danger-700 di Jet HR, 6,8:1).
2. **Le logiche sono nel prodotto, non solo nel codice.** Ogni voce del
   risultato si apre sulla propria spiegazione: prima le parole, poi la
   formula di legge compilata con i numeri dell'utente, poi gli eventuali
   scaglioni. In fondo, la catena di calcolo in sette passaggi e le
   semplificazioni con le loro motivazioni.
3. **La residenza è un input vero.** La mappa dell'Italia non è decorativa: la
   regione determina l'addizionale regionale (dati 2026 per tutte le 20
   regioni, Lombardia con i suoi scaglioni progressivi). Il comune si cerca
   con suggerimenti tra i soli comuni della regione scelta (elenco ISTAT,
   7.904 comuni), col capoluogo proposto e i dati ufficiali AdE (7.871
   comuni; per i 33 di recente istituzione, un valore tipico dichiarato).
4. **Ogni numero ha la sua fonte.** Le voci del risultato portano rimandi
   numerati a fonti esclusivamente istituzionali (Normattiva, Agenzia delle
   Entrate, INPS, MEF, Comune di Milano, Roma Capitale), linkate in
   pagina e riportate nel report PDF.

## La catena di calcolo (anno d'imposta 2026)

| # | Passaggio | Regola |
|---|-----------|--------|
| 1 | RAL | lordo annuo da contratto, mensilità aggiuntive già incluse (13ª ed eventuale 14ª) |
| 2 | Contributi INPS | 9,19% sulla RAL + 1% sulla parte oltre 56.224 € (prima fascia pensionabile); in apprendistato 5,84%, valido anche per l'anno successivo alla conferma |
| 3 | Imponibile fiscale | RAL − contributi. È la base di IRPEF e addizionali |
| 4 | IRPEF lorda | a scaglioni: 23% fino a 28.000, 33% fino a 50.000, 43% oltre |
| 5 | Detrazione lavoro dipendente | art. 13 TUIR, decresce col reddito, si azzera a 50.000 € (+65 € tra 25.000 e 35.000) |
| 6 | Ulteriore detrazione cuneo | 1.000 € tra 20.000 e 32.000 €, poi a scalare fino a 40.000 € |
| 7 | IRPEF netta | lorda − detrazioni, mai sotto zero (incapienza) |
| 8 | Addizionale regionale | sull'imponibile del punto 3, aliquote regionali 2026 |
| 9 | Addizionale comunale | sull'imponibile del punto 3, con eventuale soglia di esenzione (Milano: 0,80%, esente fino a 23.000 €) |
| 10 | Somma esente cuneo | redditi fino a 20.000 €: 7,1% / 5,3% / 4,8% del reddito, si AGGIUNGE al netto |
| 11 | Trattamento integrativo | fino a 1.200 € per i redditi medio-bassi, si aggiunge al netto |
| 12 | Netto | RAL − trattenute + integrazioni; mensile = netto / mensilità (12, 13 o 14) |

I tre concetti che il calcolatore mette in scena di proposito:

- **Basi imponibili diverse**: i contributi si calcolano sulla RAL, l'IRPEF su
  RAL meno contributi, le addizionali sulla stessa base dell'IRPEF.
- **Detrazioni ≠ deduzioni**: le detrazioni tolgono imposta, non reddito.
- **Il cuneo cambia natura a 20.000 €**: sotto è una somma esente che si somma
  al netto, sopra diventa una detrazione. Sono i due regimi della L. 207/2024.

## Oltre il netto: le proiezioni

- **Quando arrivano i soldi**: le 12 buste ordinarie, la tredicesima a
  dicembre e la quattordicesima (giugno/luglio, dove il CCNL la prevede),
  ognuna col proprio netto. La mensilità extra è più leggera: le detrazioni
  sono spalmate sulle 12 buste ordinarie, quindi la 13ª si tassa senza sconti
  all'aliquota media. Le buste ricostruiscono esattamente il netto annuo
  (proprietà verificata nei test).
- **TFR che matura**: il dipendente vede quanto accantona ogni anno
  (6,91% della RAL), la cifra che incasserà a fine rapporto.

## Le due viste: dipendente e azienda

La prima scelta del wizard è chi sei ("Sono un dipendente", default, o
"Sono un'azienda"), e la scelta adatta anche il copy di ogni passo: al
dipendente il sito dà del tu ("Dove sei residente?", "La tua RAL"), all'HR
parla del candidato ("Dove è residente chi assumi?", "La RAL che offri").
Stessi tre input, due soggetti diversi:

- **Per il dipendente** (default): netto mensile e annuo, cascata delle
  trattenute, calendario delle mensilità.
- **Per l'azienda (HR)**: costo azienda voce per voce (RAL + INPS datore
  23,81% + TFR 6,91% + INAIL ~0,4%), scelta del contratto (il tempo
  determinato aggiunge il contributo addizionale dell'1,4% e riduce la durata
  degli incentivi a 12 mesi) e il simulatore degli incentivi all'assunzione.

Il simulatore copre di proposito solo gli incentivi STRUTTURALI della
L. 92/2012, quelli sempre in vigore e senza fondi a esaurimento: over 50
disoccupato da 12+ mesi e donne svantaggiate (50% dei contributi datoriali
per 18 mesi), percettori di NASpI (20% dell'indennità residua). I bonus
temporanei (es. under 35) dipendono da decreti attuativi e fondi annuali:
sono esclusi e dichiarati, perché una stima sbagliata su un incentivo vale
meno di nessuna stima.

## Report e condivisione

- **Scarica il report (PDF)**: dal risultato, un documento brandizzato per
  ognuna delle due viste: per il dipendente dati inseriti, cascata
  lordo→netto, calendario delle mensilità e TFR; per l'azienda la proposta,
  la scala RAL→costo e l'incentivo selezionato. Fonti in calce, una pagina
  ciascuno, generati client-side con lo stylesheet di stampa: nessun backend,
  nessun dato che lascia il browser.
- **Deep link**: `?ral=30000&regione=lombardy&mensilita=13` apre direttamente
  il risultato (aggiungi `&vista=hr` per la vista azienda). Una simulazione
  si condivide con un URL.

## Perché niente CCNL

Il CCNL inciderebbe su mensilità (già chiesta), minimi tabellari e piccoli
contributi di categoria. Il registro ufficiale è l'archivio CNEL, che però
pubblica i testi dei contratti, non tabelle strutturate e aggiornate dei
minimi: quelle vivono nei database professionali a pagamento. Un sottoinsieme
curato dei 10-15 CCNL principali sarebbe manutenibile a mano; la copertura
completa è esattamente il tipo di dato che chi fa payroll costruisce come
asset interno. Scelta per il prototipo: chiedere direttamente la sola cosa
che cambia il calcolo (le mensilità) e dichiarare il resto.

## Come lo porterei in produzione: il report via email

Il passo successivo naturale è "ricevi il report via email", che qui è
progettato ma volutamente non implementato: un form email che sembra
funzionare ma non gestisce il dato sarebbe il peccato capitale di un prodotto
payroll, dove la compliance è il mestiere. Il flusso di produzione sarebbe:

1. CTA sul risultato → campo email + checkbox di consenso esplicito
   (finalità: invio del report; niente pre-flag).
2. Serverless function → double opt-in (link di conferma), poi invio del
   report PDF generato dal motore lato server con gli stessi dati.
3. Storage minimo (email, consenso, timestamp, hash della simulazione) con
   retention dichiarata e cancellazione self-service.
4. Opportunità di prodotto: con la RAL e la residenza si possono inviare
   consigli calcolati dal motore (es. "sei nella zona di décalage del cuneo:
   un aumento di 1.000 € te ne lascia X") e intercettare chi sta negoziando
   un'offerta, che per Jet HR è un lead a monte dell'assunzione.

## Semplificazioni dichiarate

- Impiegato full time, 12 mesi lavorati, nessun carico familiare, nessuna
  agevolazione. Il part time non richiede un campo: il calcolo è lineare
  nella RAL, basta inserire quella effettiva.
- Il tipo di contratto (indeterminato/determinato) si sceglie SOLO nel flusso
  azienda, ed è una scelta di design: sul netto del dipendente non cambia
  nulla (stessa IRPEF, stessi contributi), quindi lato dipendente sarebbe un
  campo morto; lato azienda invece il determinato aggiunge il contributo
  addizionale dell'1,4% (art. 2, c. 28, L. 92/2012) e riduce la durata degli
  incentivi da 18 a 12 mesi, e infatti lì il toggle c'è e agisce su entrambi.
- Vista azienda: INPS datore 23,81%, TFR 6,91%, INAIL stimato 0,40% per
  mansioni d'ufficio, nessun fondo di categoria da CCNL.
- Addizionali per competenza sull'anno (in busta reale: saldo e acconto
  sull'anno successivo).
- Addizionale regionale: tutte e 20 le regioni seguono la struttura della
  propria pagina MEF 2026. Scaglioni progressivi dove ci sono (Lombardia,
  Piemonte, Campania, Emilia-Romagna, Liguria, Marche, Molise, Puglia,
  Toscana, Abruzzo, Trentino-A.A.), fasce sull'intero imponibile dove la
  norma le prevede (Friuli-VG 0,70/1,23; Valle d'Aosta esente fino a
  15.000), aliquote ridotte sotto soglia con detrazioni di fascia (Lazio
  1,73% fino a 28.000 poi scaglioni con −60 €; Umbria 1,23% fino a 28.000
  poi scaglioni con −150 €). In Trentino-Alto Adige la provincia si deduce
  dal comune scelto (incrocio con l'elenco ISTAT, 166+116 comuni): Trento
  azzera l'addizionale fino a 30.000 € di imponibile con la sua deduzione,
  Bolzano applica una detrazione di 430,50 € fino a 90.000. Non modellate,
  e dichiarate: le agevolazioni familiari regionali e l'ulteriore
  detrazione di Bolzano oltre 50.000 € (formula non pubblicata in modo
  univoco dal MEF).
- Le addizionali seguono la condizione di debenza: sotto la no-tax area, dove
  l'IRPEF si azzera, non sono dovute (art. 50 D.Lgs. 446/1997).
- Apprendistato: lato lavoratore il 5,84% al posto del 9,19% (senza il
  contributo aggiuntivo dell'1%, caso non tipico del contratto); lato
  azienda l'11,61% delle imprese con più di 9 dipendenti (per le più
  piccole esistono aliquote ancora ridotte nei primi anni, non modellate)
  e l'esclusione di legge dal contributo addizionale del determinato
  (art. 2 c. 29 L. 92/2012).
- Comuni: aliquote, scaglioni e soglie di esenzione REALI per 7.871 dei
  7.904 comuni, importate dall'elenco annuale ufficiale dell'Agenzia delle Entrate
  (modulistica 2026, riferito a saldo 2025 / acconto 2026) e unite all'elenco
  ISTAT tramite codice catastale. 1.095 comuni con scaglioni propri sono
  calcolati per scaglioni; 33 comuni di recente istituzione non presenti
  nell'elenco usano un valore tipico dichiarato. I "casi particolari"
  agevolativi dell'elenco (colonna Tipizzazione: esenzioni per categorie
  specifiche) non sono modellati.
- TFR fuori dal netto perché è retribuzione differita che non passa dalla
  busta: ma non è ignorato: il dipendente vede quanto matura ogni anno
  (6,91% della RAL) e nel costo azienda è conteggiato per intero.
- Massimale contributivo post-1996 ignorato; trattamento integrativo
  semplificato alla sola detrazione lavoro.
- Nessun contributo di categoria oltre l'INPS (es. fondi CCNL).
- Solo RAL monetaria: welfare, buoni pasto, fringe benefit e premi di
  risultato restano fuori dal calcolo. Viaggiano sopra la RAL e, entro le
  soglie di legge, sono esenti: si sommano al percepito senza passare dalle
  tasse. Due offerte con la stessa RAL possono quindi valere diversamente;
  il confronto qui riguarda solo la parte monetaria. Non li modelliamo
  perché le soglie di esenzione cambiano di manovra in manovra.

## Fonti

- Scaglioni IRPEF 2026: Legge di Bilancio 2026 (L. 199/2025), aliquota del
  secondo scaglione dal 35% al 33%.
- Contributi e prima fascia pensionabile: INPS, circolare n. 6 del 30/01/2026.
- Detrazione lavoro dipendente: art. 13 TUIR (DPR 917/1986).
- Taglio del cuneo (somma esente + ulteriore detrazione) e trattamento
  integrativo: L. 207/2024, art. 1.
- Addizionale regionale: scaglioni Lombardia e aliquote regionali 2026 dalle
  delibere vigenti (MEF, fiscalità locale).
- Addizionali comunali: elenco annuale ufficiale dell'Agenzia delle Entrate
  (modulistica 2026) per tutti i comuni; verifiche puntuali su Comune di
  Milano (0,80%, esenzione 23.000 €) e Roma Capitale (0,90%, esenzione
  14.000 €).
- Incentivi all'assunzione: L. 92/2012 (art. 4 e art. 2 c. 10-bis).

## I dettagli di UX

Le scelte minute d'interfaccia sono ragionate quanto quelle fiscali:

- **Fonti che non ti perdono**: il click sul numerino apre la sezione Fonti,
  scorre centrando la voce e la illumina un attimo; da lì un altro click
  porta al documento ufficiale. Per il viaggio inverso compare un tasto tondo
  in basso a destra che ti riporta alla voce da cui eri partito,
  evidenziandola allo stesso modo: e se risali per conto tuo, capisce di non
  servire e sparisce da solo. Al passaggio, il tooltip anticipa quale fonte è.
- **La soglia parla in RAL**: l'esenzione comunale per legge vale
  sull'imponibile, ma l'utente conosce la sua RAL, quindi gliela traduciamo
  ("con una RAL fino a ~25.300 €").
- **Il copy cambia soggetto**: al dipendente il sito dà del tu, all'HR parla
  del candidato. Stessi input, due persone diverse davanti allo schermo.
- **Prima il totale, poi le voci**: il risultato apre con la cifra delle
  trattenute; ogni voce si espande su parole → formula coi numeri
  dell'utente → scaglioni.
- **Una grammatica di colore**: nero = selezionato, lime = azione da
  compiere, in tutto il sito.
- **La ricerca comune si svuota al focus** e suggerisce subito: scrivere
  sopra un valore precompilato è attrito inutile.
- **Il bordo intero della regione**: la selezionata sale in cima allo stack
  SVG (i confini condivisi non la coprono) e, uscendo dalla mappa, il
  riquadro torna alla regione scelta, non all'ultima sfiorata.
- **Il contratto si chiede solo a chi serve**: indeterminato/determinato
  esiste solo nel flusso azienda, perché sul netto del dipendente non cambia
  nulla.
- **Mobile first sul serio**: layout verificato a 375px senza scroll
  orizzontale, avanzamento ridotto ai soli pallini sugli schermi stretti,
  campi in colonna dove le etichette andrebbero a capo. I bersagli tattili
  seguono, oltre agli standard WCAG, le Apple Human Interface Guidelines:
  44px effettivi anche dove il disegno è più piccolo (pallini, logo, chip),
  estendendo l'area toccabile senza toccare l'estetica. E il telefono è
  trattato da telefono: feedback al tocco disegnati dal sito (niente flash
  grigio di sistema) e tastiera che non si impone: non si apre da sola e si
  chiude scegliendo un importo preimpostato.
- **Trovabilità curata (SEO e GEO)**: titolo brand-first ("Jet Netto |
  dalla RAL al netto 2026"), Open Graph per le anteprime nelle chat e sui
  social, canonical e scheda JSON-LD (WebApplication): la SEO parla ai
  motori di ricerca, la GEO agli assistenti AI che citano gli strumenti.
  Il robots.txt con la sitemap dà il benvenuto esplicito a entrambi i
  tipi di crawler.
- **Anche la favicon è nel sistema**: il marchio nella tab è una variante
  del logo Jet HR nell'accento del sito (J lime su nero caldo), per
  distinguere a colpo d'occhio il prototipo dal sito principale. In due
  misure: tab e touch icon iPhone.

Le stesse scelte, con più contesto, sono nella pagina
[credits](https://jetnetto.zetakiwi.com/credits.html) del sito.

## Struttura

```
index.html      pagina unica: wizard a 3 step + risultato (due viste)
credits.html    metodo, affidabilità e contatti
styles.css      design system (token estratti dal brand Jet HR) + stampa
app.js          logica UI: mappa, step, validazioni, rendering, report
engine.js       motore fiscale puro (browser + Node)
engine.test.js  test: node engine.test.js
comuni.js       7.904 comuni ISTAT con i dati dell'elenco AdE
italy-map.js    geometrie SVG delle regioni (@svg-maps/italy, MIT)
favicon.png     variante lime del marchio (con apple-touch-icon.png)
robots.txt      benvenuto esplicito a crawler e assistenti AI (+ sitemap.xml)
```

Il design usa i token reali di Jet HR (nero caldo `#11150a`, lime `#dfeb57`,
famiglia Wix Madefor) per mostrare l'output come lo vivrebbe il loro brand.

## Uso e paternità

Prototipo realizzato da Matteo De Marco (matteodemarco272@gmail.com) per il
task di selezione Product Builder di Jet HR, agosto 2026. Condiviso ai soli
fini della valutazione della candidatura: codice, dataset derivati e testi
restano dell'autore fino a diverso accordo.

*Non è consulenza fiscale: proiezione indicativa per un caso standard.*
