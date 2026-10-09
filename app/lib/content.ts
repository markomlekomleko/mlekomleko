/**
 * Answers are written in the singular, direct address used across the redesign.
 * Prices, dates and cut-off times are deliberately not hard-coded here: they live in
 * business settings and are shown by the cart and the account, so a static FAQ can
 * never drift away from the real calculation (docs/OPUS-DETALJNA-SPECIFIKACIJA.md D11).
 */
export const frequentlyAskedQuestions = [
  {
    question: "Da li moram da se pretplatim?",
    answer: "Ne. Svaki proizvod možeš uzeti samo uz sledeću dostavu ili ga uključiti u redovan nedeljni ili dvonedeljni ritam.",
  },
  {
    question: "Koliko mleka mogu da poručim?",
    answer: "Brzo biraš 2, 4 ili 8 litara po dostavi, ili uneseš drugu količinu. Mesečni zbir zavisi od stvarnog broja preostalih termina i prikazuje se pre potvrde.",
  },
  {
    question: "Kada su dostave?",
    answer: "Dostavljamo u Beogradu i Novom Sadu. Tačan sledeći termin za tvoju adresu vidiš u korpi i pre potvrde porudžbine.",
  },
  {
    question: "Kako funkcionišu povratne flaše?",
    answer: "Mleko stiže u staklenim flašama. Od druge dostave vraćaš čiste korišćene flaše, a preuzimaš nove pune.",
  },
  {
    question: "Do kada mogu da izmenim dostavu?",
    answer: "Tačan rok je prikazan u korpi i na nalogu. Posle roka zaključavamo količine zbog pripreme i organizacije rute.",
  },
  {
    question: "Mogu li da preskočim, pauziram ili otkažem?",
    answer: "Da. Na nalogu možeš preskočiti sledeću dostavu, pauzirati do izabranog datuma ili trajno otkazati redovnu dostavu.",
  },
  {
    question: "Kako se plaća?",
    answer: "Jednokratna porudžbina se plaća gotovinom pri dostavi. Pretplata se plaća za ceo paket unapred. Sa prodavnicom dogovorite evidentiranje gotovinske uplate pre početka isporuka.",
  },
  {
    question: "Koliko košta dostava?",
    answer: "Dostava se naplaćuje po terminu. Tačan iznos za tvoj izbor i broj termina prikazan je u korpi pre potvrde.",
  },
  {
    question: "Šta ako proizvod stigne oštećen?",
    answer: "Prijavi problem uz broj porudžbine. Nakon provere evidentiramo zamenu ili kredit u skladu sa uslovima kupovine.",
  },
];

/**
 * Homepage copy deck: cheeky in the headlines, plain about what you buy and how it arrives.
 * Delivery weekdays are never written here; they come from the `serviceAreaNote` setting.
 * Frozen strings used by tests and flows: hero.primaryCta and the three rhythm item titles.
 */
export const homeCopy = {
  hero: {
    eyebrow: "Domaće mleko, pravo kući",
    title: "Punomasno i ponosno.",
    lead: "Sirovo kravlje i kozje mleko u povratnoj flaši, do vrata u Beogradu i Novom Sadu.",
    primaryCta: "Izaberi svoje mleko",
    secondaryCta: "Proveri dostavu",
    hint: "Skroluj, ima još",
    rhythmTitle: "Ti biraš ritam, mi donosimo.",
    rhythmSub: "Kravlje. Kozje. Oba.",
  },
  band: ["PUNOMASNO", "SIROVO", "U STAKLU", "KRAVLJE", "KOZJE", "DOMAĆE", "UVEK SVEŽE", "BEOGRAD", "NOVI SAD", "#PRAVOMLEKO"],
  offer: {
    eyebrow: "01 / Na meniju",
    title: "Tim krava ili tim koza?",
    lead: "Biraš vrstu, količinu i koliko često dolazimo. Navijaš za oba? Može i to.",
    storeLink: "Zaviri u prodavnicu",
  },
  steps: {
    eyebrow: "02 / Kako stiže",
    title: "Tri koraka. Nula filozofije.",
    items: [
      {
        title: "Izabereš mleko i ritam.",
        text: "Kravlje ili kozje, jednom ili redovno. Kako tebi paše.",
      },
      {
        title: "Termin crno na belo.",
        text: "Pre nego što potvrdiš, vidiš sledeći datum dostave i rok za izmene. Bez iznenađenja.",
      },
      {
        title: "Flaša ide u krug.",
        text: "Od druge dostave nam vraćaš prazne čiste flaše, a mi donosimo pune. Fer trampa.",
      },
    ],
  },
  origin: {
    eyebrow: "03 / Pedigre",
    title: "Glavne uloge: krave i koze.",
    text: "Kravlje i kozje mleko dolazi sa domaćih farmi. Do tebe stiže punomasno i sirovo, u povratnoj staklenoj flaši. Ništa obrano.",
    link: "Upoznaj ekipu sa farme",
  },
  rhythm: {
    eyebrow: "04 / Tvoj tempo",
    title: "Ozbiljna veza ili avantura?",
    items: [
      {
        title: "Jednokratno",
        text: "Avantura za jednu dostavu. Bez pretplate, bez obaveze, bez ljutnje.",
      },
      {
        title: "Svake nedelje",
        text: "Ozbiljna veza: isti izbor stiže svake nedelje. Količinu menjaš do roka za izmene.",
      },
      {
        title: "Svake 2 nedelje",
        text: "Veza bez pritiska, za manje domaćinstvo. Preskočiš ili pauziraš preko naloga.",
      },
    ],
    note: "Promena plana? Izmene, preskakanje i pauza mogući su do roka navedenog uz svaku dostavu, na tvom nalogu.",
  },
  faq: {
    eyebrow: "05 / Pre prve flaše",
    title: "Nema glupih pitanja.",
    contactPrompt: "Tvoje pitanje nije tu?",
    contactLink: "Piši nam.",
  },
  closing: {
    eyebrow: "06 / Poslednji gutljaj",
    title: "Frižider ti se već raduje.",
    cta: "Napuni frižider",
  },
} as const;

/**
 * Header ticker and footer copy. The real delivery-days string from `serviceAreaNote`
 * is appended to the ticker at runtime, so no weekday is ever hard-coded here.
 */
export const shellCopy = {
  tickerItems: [
    "Domaće kravlje i kozje mleko",
    "Punomasno i sirovo",
    "U povratnim staklenim flašama",
    "Dostava na kućnu adresu",
    "Plaćanje gotovinom pri dostavi",
  ],
  footer: {
    tagline: "Domaće kravlje i kozje mleko u staklu koje se vraća. Punomasno i ponosno. #pravomleko",
    exploreTitle: "Istraži",
    infoTitle: "Sitna slova",
    wordmark: "Mleko i Mleko",
  },
} as const;
