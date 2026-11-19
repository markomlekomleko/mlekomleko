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
    answer: "Brzo biraš 2, 4 ili 8 litara po dostavi, ili uneseš drugu količinu. Paket sadrži četiri nedeljne ili dve dvonedeljne dostave. Ukupnu količinu i cenu vidiš pre potvrde.",
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
    answer: "Jednokratnu porudžbinu plaćaš gotovinom pri dostavi. Kod redovne dostave ceo paket plaćaš pri prvom uručenju; preostale dostave tog paketa već su plaćene.",
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

/** Subscription questions, shown on the Mesečna pretplata page. No delivery price here. */
export const subscriptionQuestions = frequentlyAskedQuestions.filter(({ question }) =>
  [
    "Da li moram da se pretplatim?",
    "Koliko mleka mogu da poručim?",
    "Kada su dostave?",
    "Kako funkcionišu povratne flaše?",
    "Do kada mogu da izmenim dostavu?",
    "Mogu li da preskočim, pauziram ili otkažem?",
    "Kako se plaća?",
  ].includes(question),
);

/**
 * Questions about the milk itself, for the Poreklo tvog mleka page. Every answer restates
 * something the brand already says on the site or in its own posts; nothing new is claimed.
 */
export const milkQuestions = [
  {
    question: "Da li se mleku nešto dodaje ili oduzima?",
    answer: "Ne. Mleko je punomasno i sirovo — ništa se ne dodaje i ništa se ne obire.",
  },
  {
    question: "Odakle dolazi mleko?",
    answer: "Sa domaćih porodičnih farmi sa kojima radimo direktno, bez posrednika. Za detalje o dobavljačima piši nam.",
  },
  {
    question: "Može li od njega da se napravi kajmak?",
    answer: "Može. Kada prokuvaš dva litra i ostaviš da se ohladi, dobiješ oko 100 grama pravog domaćeg kajmaka.",
  },
  {
    question: "Kako znam da je mleko proveravano?",
    answer: "Podatke o kontroli i deklaraciji objavljujemo uz proizvod kada su potvrđeni dokumentacijom dobavljača.",
  },
  {
    question: "Zašto staklena flaša?",
    answer: "Staklo ne menja ukus mleka i može da se pere i ponovo puni. Praznu čistu flašu vraćaš pri sledećoj dostavi.",
  },
];

/**
 * Homepage copy deck: cheeky in the headlines, plain about what you buy and how it arrives.
 * Delivery weekdays are never written here; they come from the `serviceAreaNote` setting.
 * Frozen strings used by tests and flows: hero.primaryCta and the three rhythm item titles.
 */
export const homeCopy = {
  hero: {
    eyebrow: "",
    title: "Mleko i Mleko — domaće kravlje i kozje mleko",
    lead: "",
    primaryCta: "Mleko koje znaš",
    secondaryCta: "Proveri dostavu",
    hint: "Skroluj i otkrij",
    rhythmTitle: "Ti biraš ritam, mi donosimo.",
    rhythmSub: "Kravlje. Kozje. Oba.",
  },
  band: ["MLEKO KOJE ZNAŠ", "KRAVLJE", "KOZJE", "TVOJ RITAM", "POVRATNE FLAŠE", "DOSTAVA DO VRATA"],
  offer: {
    eyebrow: "",
    title: "Izaberi svoje mleko",
    lead: "Biraš vrstu, količinu i koliko često dolazimo. Želiš oba? Može i to.",
  },
  // Why this milk, first thing under the hero (17 Nov 2026). Facts only, no health
  // claims and no comparison with named dairies: both are regulated advertising.
  milk: {
    title: "Ništa dodato. Ništa oduzeto.",
    titleLines: ["Ništa dodato.", "Ništa oduzeto."],
    lead: "Mleko kakvo daju krava i koza — samo ohlađeno i flaširano.",
    items: [
      { icon: "sirovo", title: "Sirovo i punomasno", text: "Bez obiranja, bez homogenizacije, bez produžavanja roka." },
      { icon: "sveze", title: "Sveže, pravo do tebe", text: "Preuzimamo ga posle muže i donosimo pravo na tvoja vrata." },
      { icon: "poreklo", title: "Znaš odakle je", text: "Iza svake flaše je prava farma i pravi ljudi." },
      { icon: "ukus", title: "Ukus koji pamtiš", text: "Gusto, sa kajmakom, kao nekad." },
    ],
  },
  origin: {
    eyebrow: "Kravlje i kozje",
    title: "Glavne uloge: krave i koze.",
    text: "Kravlje, kozje ili oba — izaberi mleko koje voliš. Donosimo ga u povratnim staklenim flašama.",
    link: "Pogledaj kravlje i kozje",
  },
  rhythm: {
    eyebrow: "Tvoj tempo",
    title: "Ozbiljna veza ili avantura?",
    items: [
      {
        title: "Jednokratno",
        text: "Jedna porudžbina, jedna dostava. Plaćaš pri uručenju.",
      },
      {
        title: "Svake nedelje",
        text: "Četiri dostave u paketu. Plaćaš pri prvoj, a ostale stižu jednom nedeljno.",
      },
      {
        title: "Svake 2 nedelje",
        text: "Dve dostave u paketu, na svake dve nedelje. Preskakanje i pauzu uređuješ na nalogu.",
      },
    ],
    note: "Promena plana? Izmene, preskakanje i pauza mogući su do roka navedenog uz svaku dostavu, na tvom nalogu.",
  },
  faq: {
    eyebrow: "Pre prve flaše",
    title: "Nema glupih pitanja.",
    contactPrompt: "Tvoje pitanje nije tu?",
    contactLink: "Piši nam.",
  },
  social: {
    eyebrow: "@mleko_i_mleko",
    title: "Mleko uživo.",
    lead: "Sa farme, iz mlekomata i iz kuhinje — pogledaj kako izgleda pravo mleko.",
    instagram: "Prati nas na Instagramu",
    tiktok: "Prati nas na TikToku",
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
