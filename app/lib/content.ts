/**
 * Answers are written in the singular, direct address used across the redesign.
 * Prices, dates and cut-off times are deliberately not hard-coded here: they live in
 * business settings and are shown by the cart and the account, so a static FAQ can
 * never drift away from the real calculation (docs/OPUS-DETALJNA-SPECIFIKACIJA.md D11).
 */
export const frequentlyAskedQuestions = [
  {
    id: "milk",
    question: "Da li je mleko bezbedno i kako se koristi?",
    answer: "Naše mleko je domaće, sirovo i punomasno, bez obiranja i homogenizacije. Sirovo mleko zadržava svoje prirodne enzime, mlečnu mast i karakterističan pun ukus. Redovno se laboratorijski testira u Zavodu za mlekarstvo Srbije, a rezultate analiza delimo transparentno. Neki naši kupci biraju da ga konzumiraju sirovo, ali naša preporuka je da se mleko obavezno prokuva pre konzumiranja.",
  },
  {
    id: "subscription",
    question: "Kako funkcioniše pretplata?",
    answer: "Pretplata je paket od četiri isporuke koji se automatski obnavlja tek kada su sve četiri stvarno realizovane. Na nalogu možeš da dodaš proizvode, preskočiš dostavu, pauziraš ili otkažeš narednu obnovu.",
  },
  {
    id: "delivery",
    question: "Kada i gde dostavljate?",
    answer: "U Beogradu utorkom i petkom, u Novom Sadu petkom. Mleko donosimo do tvojih vrata.",
  },
  {
    id: "addition",
    question: "Mogu li da dodam proizvod samo za jednu isporuku?",
    answer: "Da. Biraš da li dodatak stiže samo uz sledeću isporuku ili redovno, a doplatu obračunavamo automatski i vidiš je pre potvrde.",
  },
  {
    id: "bottles",
    question: "Šta radim sa staklenim flašama?",
    answer: "Isperi ih i očisti, po mogućstvu u mašini za sudove, i vrati pri sledećoj dostavi. Mi ih zatim profesionalno peremo i sanitarno obrađujemo pre ponovne upotrebe.",
  },
  {
    id: "payment",
    question: "Kako mogu da platim?",
    answer: "Gotovinom pri prvoj isporuci ili uplatom na račun. Onlajn plaćanje će biti dostupno uskoro.",
  },
  {
    id: "deadline",
    question: "Do kada mogu da izmenim porudžbinu?",
    answer: "Do 36 sati pre početka dostavne ture. Odbrojavanje do roka vidiš na vrhu sajta.",
  },
];

/** Subscription questions, shown on the Mesečna pretplata page. */
export const subscriptionQuestions = frequentlyAskedQuestions.filter(({ question }) =>
  [
    "Kako funkcioniše pretplata?",
    "Kada i gde dostavljate?",
    "Mogu li da dodam proizvod samo za jednu isporuku?",
    "Šta radim sa staklenim flašama?",
    "Kako mogu da platim?",
    "Do kada mogu da izmenim porudžbinu?",
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
  band: ["DIREKTNO SA FARME", "REDOVNO TESTIRANO", "STAKLENA AMBALAŽA", "DOSTAVA DO VRATA"],
  offer: {
    eyebrow: "",
    title: "Izaberi svoje mleko",
    lead: "Domaće sirovo mleko, u povratnoj staklenoj flaši, do tvojih vrata. Izaberi pretplatu ili jednokratnu kupovinu i količinu po dostavi.",
  },
  // Why this milk, first thing under the hero (17 Nov 2026). Facts only, no health
  // claims and no comparison with named dairies: both are regulated advertising.
  // "Sa paše do flaše" (spec 19 Nov 2026, §4): four short icons, no long explanations.
  milk: {
    title: "Sa paše do flaše",
    titleLines: ["Sa paše", "do flaše"],
    lead: "Znamo odakle dolazi tvoje mleko.",
    items: [
      { icon: "sirovo", title: "Sirovo i punomasno" },
      { icon: "testirano", title: "Redovno testirano" },
      { icon: "poreklo", title: "Poznato poreklo" },
      { icon: "sveze", title: "Sveže do tvojih vrata" },
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
        text: "Četiri dostave u paketu, jednom nedeljno, plaćene unapred.",
      },
    ],
    note: "Promena plana? Izmene, preskakanje i pauza mogući su do roka navedenog uz svaku dostavu, na tvom nalogu.",
  },
  faq: {
    eyebrow: "Nema glupih pitanja",
    title: "Pre prve flaše",
    contactPrompt: "Tvoje pitanje nije tu?",
    contactLink: "Piši nam.",
  },
  social: {
    eyebrow: "@mleko_i_mleko",
    title: "Mleko uživo.",
    lead: "Upoznaj farmu, vidi kako radi mlekomat i pozdravi Rumenku.",
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
    tagline: "Domaće kravlje i kozje mleko u staklu koje se vraća. #pravomleko",
    exploreTitle: "Istraži",
    infoTitle: "Sitna slova",
    wordmark: "Mleko i Mleko",
  },
} as const;
