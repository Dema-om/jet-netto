# jet·netto — dalla RAL al netto, voce per voce

Prototipo per il task Product Builder di Jet HR: un calcolatore che riceve una RAL
e restituisce netto annuale, netto mensile e tutte le trattenute, spiegando ogni
voce con la formula reale e i numeri dell'utente dentro.

**Demo:** apri `index.html` in un browser (nessuna build, nessuna dipendenza)
oppure servi la cartella con un qualunque static server.

## Perché è fatto così

Il brief dice che lo scopo non è la velocità con cui si assembla un tool, ma il
controllo delle logiche. Il prototipo lo prende alla lettera su tre piani:

1. **Il motore è separato dalla UI.** Tutta la fiscalità sta in `engine.js`,
   una funzione pura senza dipendenze che gira identica nel browser e in Node.
   Si testa da terminale: `node engine.test.js` (50 assert su formule, casi
   completi verificati a mano, monotonia del netto, ripartizione delle
   mensilità, dati dei comuni, costo azienda, incentivi e robustezza input). L'audit finale ha
   passato al setaccio 8.000 combinazioni regione × RAL senza anomalie e
   verificato il contrasto WCAG della palette (lime su nero: 14:1, AAA;
   rosso delle trattenute: danger-700 di Jet HR, 6,8:1).
2. **Le logiche sono nel prodotto, non solo nel codice.** Ogni voce del
   risultato ha un espansore "perché questo numero" con la formula di legge
   compilata con i numeri dell'utente, più una sezione finale con la catena di
   calcolo in sette passaggi.
3. **La residenza è un input vero.** La mappa dell'Italia non è decorativa: la
   regione determina l'addizionale regionale (dati 2026 per tutte le 20
   regioni, Lombardia con i suoi scaglioni progressivi). Il comune si cerca
   con suggerimenti tra i soli comuni della regione scelta (elenco ISTAT,
   7.904 comuni), col capoluogo proposto e i dati ufficiali AdE di ognuno.
4. **Ogni numero ha la sua fonte.** Le voci del risultato portano rimandi
   numerati a fonti esclusivamente istituzionali (Normattiva, Agenzia delle
   Entrate, INPS, MEF, Comune di Milano, Roma Capitale), linkate in
   pagina e riportate nel report PDF.

## La catena di calcolo (anno d'imposta 2026)

| # | Passaggio | Regola |
|---|-----------|--------|
| 1 | RAL | lordo annuo da contratto, tredicesima inclusa |
| 2 | Contributi INPS | 9,19% sulla RAL + 1% sulla parte oltre 56.224 € (prima fascia pensionabile) |
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
  23,81% + TFR 6,91% + INAIL ~0,4%), cuneo complessivo ("di ogni 100 € spesi,
  al dipendente ne arrivano X") e il simulatore degli incentivi all'assunzione.

Il simulatore copre di proposito solo gli incentivi STRUTTURALI della
L. 92/2012, quelli sempre in vigore e senza fondi a esaurimento: over 50
disoccupato da 12+ mesi e donne svantaggiate (50% dei contributi datoriali
per 18 mesi), percettori di NASpI (20% dell'indennità residua). I bonus
temporanei (es. under 35) dipendono da decreti attuativi e fondi annuali:
sono esclusi e dichiarati, perché una stima sbagliata su un incentivo vale
meno di nessuna stima.

## Report e condivisione

- **Scarica il report (PDF)**: dal risultato, un documento brandizzato con
  dati inseriti, cascata lordo→netto, calendario delle mensilità, catena di
  calcolo e fonti. Generato client-side con lo stylesheet di stampa: nessun
  backend, nessun dato che lascia il browser.
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

- Impiegato a tempo indeterminato, full time, 12 mesi lavorati, nessun carico
  familiare, nessuna agevolazione. Il part time non richiede un campo: il
  calcolo è lineare nella RAL, basta inserire quella effettiva. Il tempo
  determinato non è modellato (lato azienda avrebbe un contributo addizionale
  dell'1,4% e incentivi di durata ridotta).
- Vista azienda: INPS datore 23,81%, TFR 6,91%, INAIL stimato 0,40% per
  mansioni d'ufficio, nessun fondo di categoria da CCNL.
- Addizionali per competenza sull'anno (in busta reale: saldo e acconto
  sull'anno successivo).
- Regioni diverse dalla Lombardia: aliquota base pubblicata (alcune regioni
  hanno scaglioni propri; la struttura dati li supporta già, vedi Lombardia).
- Comuni: aliquote, scaglioni e soglie di esenzione REALI per tutti i 7.904
  comuni, importate dall'elenco annuale ufficiale dell'Agenzia delle Entrate
  (modulistica 2026, riferito a saldo 2025 / acconto 2026) e unite all'elenco
  ISTAT tramite codice catastale. 1.095 comuni con scaglioni propri sono
  calcolati per scaglioni; 33 comuni di recente istituzione non presenti
  nell'elenco usano un valore tipico dichiarato. I "casi particolari"
  agevolativi dell'elenco (colonna Tipizzazione: esenzioni per categorie
  specifiche) non sono modellati.
- TFR escluso (retribuzione differita), massimale contributivo post-1996
  ignorato, trattamento integrativo semplificato alla sola detrazione lavoro.
- Nessun contributo di categoria oltre l'INPS (es. fondi CCNL).

## Fonti

- Scaglioni IRPEF 2026: Legge di Bilancio 2026 (L. 199/2025), aliquota del
  secondo scaglione dal 35% al 33%.
- Contributi e prima fascia pensionabile: INPS, circolare n. 6 del 30/01/2026.
- Detrazione lavoro dipendente: art. 13 TUIR (DPR 917/1986).
- Taglio del cuneo (somma esente + ulteriore detrazione) e trattamento
  integrativo: L. 207/2024, art. 1.
- Addizionale regionale Lombardia (scaglioni) e tabella regioni 2026: delibere
  regionali vigenti; comunale Milano: delibera comunale (0,80%, esenzione
  23.000 €).

## Struttura

```
index.html      pagina unica: wizard a 3 step + risultato
styles.css      design system (token estratti dal brand Jet HR)
app.js          logica UI: mappa, step, validazioni, rendering risultato
engine.js       motore fiscale puro (browser + Node)
engine.test.js  test: node engine.test.js
italy-map.js    geometrie SVG delle regioni (@svg-maps/italy, MIT)
```

Il design usa i token reali di Jet HR (nero caldo `#11150a`, lime `#dfeb57`,
famiglia Wix Madefor) per mostrare l'output come lo vivrebbe il loro brand.

## Uso e paternità

Prototipo realizzato da Matteo De Marco (matteodemarco272@gmail.com) per il
task di selezione Product Builder di Jet HR, agosto 2026. Condiviso ai soli
fini della valutazione della candidatura: codice, dataset derivati e testi
restano dell'autore fino a diverso accordo.

*Non è consulenza fiscale: proiezione indicativa per un caso standard.*
