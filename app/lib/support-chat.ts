import { frequentlyAskedQuestions } from "./content";
import { locales, type Locale } from "./i18n/routing";
import { toCyrillic, translate } from "./i18n/translate";

type SupportLink = { href: string; label: string };
type TopicRules = {
  phrases: string;
  clues?: string;
  typo?: string;
  link: SupportLink;
  related: string[];
};

const topicRules: Record<string, TopicRules> = {
  milk: {
    phrases: "sirov*|prokuv*|pasteriz*|bezbed*|sigurno mleko|da li se kuva|raw milk|boil*|pasteuriz*|is it safe|сыр*|кипят*|пастериз*|безопасн*",
    link: { href: "/analize", label: "Pogledaj analize" },
    related: ["bottles", "delivery"],
  },
  subscription: {
    phrases: "pretplat*|preskoc*|pauzir*|otkaz* obnov*|zaustav* obnov*|obnavlj*|subscription*|skip*|pause*|renew*|подпис*|пропуст*|пропуск*|приостанов*|продлен*",
    clues: "paket*|cetiri isporuke|plan*",
    typo: "pretplat|preskoc|subscription",
    link: { href: "/pravila-pretplate", label: "Pravila pretplate" },
    related: ["addition", "deadline", "payment"],
  },
  delivery: {
    phrases: "kad* dostav*|gde dostav*|dostavljate|dostav* kad*|kojim danima|kad* stiz*|kad* dolaz*|dostava do vrata|do you deliver|when* deliver*|where* deliver*|delivery days|когда достав*|куда достав*|дни достав*",
    clues: "dostav*|isporuk*|beograd*|nov* sad*|ponedelj*|utork*|sredom|cetvrtk*|petk*|subot*|nedeljom|delivery|deliver*|belgrade|monday*|tuesday*|wednesday*|thursday*|friday*|saturday*|sunday*|достав*|белград*|пятниц*|вторник*|суббот*",
    typo: "dostav",
    link: { href: "/dostava", label: "Pogledaj dostavu" },
    related: ["deadline", "bottles", "payment"],
  },
  addition: {
    phrases: "dodam|dodajem|dodaj* proizvod*|dodat* proizvod*|dodat* mleko|dodatak|dodatno mleko|jos lit*|add an item|add milk|add extra|add a product|extra litre*|добав* товар*|добав* молок*|дополнител* литр*",
    clues: "dodaj*|sledec* isporuk*|samo jednom|one delivery|next delivery|следующ* достав*",
    link: { href: "/nalog", label: "Moj nalog" },
    related: ["deadline", "subscription"],
  },
  bottles: {
    phrases: "flas*|ambalaz*|staklen*|bottle*|бутыл*|тара|тары|тару",
    clues: "vrat*|isprat*|pranj*|return*|rinse*|верну*|мыть",
    typo: "ambalaz",
    link: { href: "/kako-funkcionise", label: "Pogledaj kako funkcioniše" },
    related: ["delivery", "milk"],
  },
  payment: {
    phrases: "plati*|placa*|nacin plac*|gotovin*|kes|kartic*|uplat*|payment*|cash|card*|pay|оплат*|заплат*|наличн*|картой|картами",
    typo: "kartic|gotovin",
    link: { href: "/kako-funkcionise", label: "Pogledaj kako funkcioniše" },
    related: ["delivery", "subscription"],
  },
  deadline: {
    phrases: "rok*|izmen*|promen* porud*|promen* narud*|koliko ranije|do kada poruc*|do kada mogu da poruc*|odbrojav*|change* order*|cutoff*|deadline*|срок*|измен* заказ*|до когда можно заказ*",
    clues: "promen*|porud*|narud*|order*|za sutra|do kada|заказ*|до когда",
    typo: "izmen|deadline",
    link: { href: "/kako-funkcionise", label: "Pogledaj kako funkcioniše" },
    related: ["addition", "delivery"],
  },
};

const contact = { href: "/kontakt", label: "Kontakt" };
const navigation = [
  {
    id: "contact",
    phrases: "kontakt*|podrsk*|operater*|ziv covek|telefon*|broj telefona|customer service|human agent|contact*|phone|контакт*|оператор*|телефон*|поддержк*",
    message: "Na stranici Kontakt možeš da nam pišeš ili da nas pozoveš.",
    link: contact,
  },
  {
    id: "order",
    phrases: "gde je moja porud*|gde mi je porud*|kasni* porud*|kasni* dostav*|nije stig*|nisam dobio*|nisam dobila*|status porud*|status narud*|pratim porud*|prover* porud*|broj porud*|moj paket|otkaz* porud*|otkaz* narud*|promen* adres*|track* order*|order status|order number|cancel* order*|where is my order*|where is my deliver*|где мой заказ|где заказ|статус заказ*|номер заказ*|отмен* заказ*",
    message: "Svoje porudžbine možeš da pogledaš na nalogu. Ako imaš problem sa porudžbinom, piši nam.",
    link: { href: "/nalog", label: "Moj nalog" },
    extraLink: contact,
  },
  {
    id: "complaint",
    phrases: "reklamac*|ostecen*|pogresan proizvod|povrat novca|refund*|damaged|wrong item|рекламац*|возврат денег|поврежден*",
    message: "Ako imaš problem sa proizvodom, pogledaj kako da prijaviš reklamaciju.",
    link: { href: "/reklamacije", label: "Reklamacije i povraćaj" },
    extraLink: contact,
  },
  {
    id: "shelfLife",
    phrases: "rok trajanja|rok upotrebe|koliko dugo traje|koliko dugo moze da stoji|koliko traje mleko|cuvam mleko|skladist* mleko|shelf life|expiry date|how long does milk|срок годности|хранить молоко|сколько хранится",
    message: "Za rok upotrebe proveri oznaku na flaši ili nam piši ako ti treba pomoć.",
    link: contact,
  },
  {
    id: "postcode",
    phrases: "postansk* broj*|zip code|postal code|postcode|почтов* индекс*",
    message: "Na stranici za svoj grad možeš da proveriš dostavu po poštanskom broju.",
    link: { href: "/dostava-mleka/beograd", label: "Dostava Beograd" },
    extraLink: { href: "/dostava-mleka/novi-sad", label: "Dostava Novi Sad" },
  },
  {
    id: "machines",
    phrases: "mlekomat*|mleko automat*|milk vending|milk dispenser|молокомат*|автомат* молок*",
    message: "Mapu i adrese mlekomata možeš da vidiš na stranici Mlekomati.",
    link: { href: "/gde-kupiti", label: "Pronađi svoj mlekomat" },
  },
  {
    id: "analyses",
    phrases: "analiz*|laborator*|lab result*|lab report*|анализ*|лаборатор*",
    message: "Objavljene izveštaje možeš da pogledaš na stranici Analize.",
    link: { href: "/analize", label: "Pogledaj analize" },
  },
  {
    id: "deliveryCost",
    phrases: "cena dostav*|cene dostav*|koliko kosta dostav*|koliko je dostav*|postarin*|delivery cost|delivery fee|shipping cost|how much is delivery|стоимост* достав*|цена достав*",
    message: "Trošak dostave za svoju porudžbinu možeš da proveriš u korpi.",
    link: { href: "/korpa", label: "Pogledaj korpu" },
  },
  {
    id: "products",
    phrases: "kozj*|kozij*|goat milk|козь* молок*|koliko kosta|cene|cena|price*|how much does|сколько стоит|цен*",
    message: "Aktuelne cene i dostupnost mleka možeš da proveriš u prodavnici.",
    link: { href: "/prodavnica", label: "Prodavnica" },
  },
] as const;

const quickTopicIds = ["delivery", "subscription", "bottles", "payment"];

export type SupportAnswer = {
  topic: string;
  question: string;
  answer: string;
  link?: SupportLink;
};

export type SupportTarget = { topic: string } | { guide: typeof navigation[number]["id"] };

export type SupportReply = {
  answers: SupportAnswer[];
  guides: Array<{ message: string; links: SupportLink[] }>;
  choices: string[];
  prompt?: string;
};

function normalize(text: string) {
  return toCyrillic(text.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replaceAll("đ", "dj"))
    .replace(/[чћ]/g, "ц").replace(/ш/g, "с").replace(/ж/g, "з")
    .replace(/њ/g, "нј").replace(/љ/g, "лј").replace(/ђ/g, "дј").replace(/џ/g, "дз")
    .replace(/[^\p{L}\p{N}*]+/gu, " ").trim();
}

function patterns(phrases = "") {
  return phrases.split("|").filter(Boolean).map((phrase) => normalize(phrase).split(" "));
}

function contains(tokens: string[], phrases: string[][]) {
  return phrases.some((phrase) => tokens.some((_, index) => phrase.every((part, offset) => {
    const token = tokens[index + offset];
    return part.endsWith("*") ? token?.startsWith(part.slice(0, -1)) : token === part;
  })));
}

// One missing, extra, swapped or wrong letter in a known, distinctive root.
function nearRoot(token: string, root: string) {
  if (token.length < root.length || token.length > root.length + 3) return false;
  return [root.length - 1, root.length, root.length + 1].some((length) => {
    const candidate = token.slice(0, length);
    if (Math.abs(candidate.length - root.length) > 1) return false;
    if (candidate === root) return true;
    let mismatch = 0;
    while (candidate[mismatch] === root[mismatch]) mismatch++;
    const left = candidate.slice(mismatch);
    const right = root.slice(mismatch);
    if (left.length < right.length) return left === right.slice(1);
    if (left.length > right.length) return left.slice(1) === right;
    return left.slice(1) === right.slice(1) ||
      (left[0] === right[1] && left[1] === right[0] && left.slice(2) === right.slice(2));
  });
}

const topics = frequentlyAskedQuestions.map((faq) => {
  const rule = topicRules[faq.id];
  return {
    ...faq,
    phrases: patterns(rule?.phrases),
    clues: patterns(rule?.clues),
    typoRoots: (rule?.typo ?? "").split("|").filter(Boolean).map(normalize),
    names: [...new Set(locales.map((locale) => normalize(translate(faq.question, locale))))],
  };
});

const guides = navigation.map((guide) => ({
  id: guide.id,
  phrases: patterns(guide.phrases),
  message: guide.message,
  links: "extraLink" in guide ? [guide.link, guide.extraLink] : [guide.link],
}));

export function getSupportChoices(ids: string[]) {
  return ids.flatMap((id) => {
    const faq = frequentlyAskedQuestions.find((item) => item.id === id);
    return faq ? [faq] : [];
  });
}

export function searchSupportFaqs(query: string, locale: Locale) {
  const tokens = normalize(query).split(" ").filter(Boolean);
  if (!tokens.length) return frequentlyAskedQuestions;
  return topics.filter((topic) => {
    const searchable = normalize(translate(topic.answer, locale)).split(" ")
      .concat(topic.names.flatMap((name) => name.split(" ")));
    return tokens.every((token) => searchable.some((word) => word.startsWith(token))) ||
      contains(tokens, topic.phrases) || contains(tokens, topic.clues);
  });
}

const conjunctions = ["i", "and", "a takzhe", "а также"].map(normalize).join("|");
const questionStarts = [
  "kako", "kad", "kada", "koliko", "gde", "da li", "mogu li", "do kada", "čime", "koji", "koja", "dostavljate li",
  "how", "when", "where", "what", "can i", "do you",
  "как", "когда", "где", "сколько", "можно ли", "чем",
].map(normalize).join("|");
const clauseBoundary = new RegExp(` (?:${conjunctions}) (?=(?:${questionStarts})(?: |$))`, "u");

function answerFor(faq: (typeof topics)[number]): SupportAnswer {
  return { topic: faq.id, question: faq.question, answer: faq.answer, link: topicRules[faq.id]?.link };
}

export function answerSupportQuestion(text: string, previousTopic?: string, selected?: SupportTarget): SupportReply {
  if (selected && "guide" in selected) {
    const guide = guides.find(({ id }) => id === selected.guide);
    if (guide) return { answers: [], guides: [guide], choices: [] };
  }
  const normalized = normalize(text);
  const exact = topics.find((topic) => selected && "topic" in selected
    ? topic.id === selected.topic
    : topic.names.includes(normalized));
  if (exact) {
    return { answers: [answerFor(exact)], guides: [], choices: topicRules[exact.id]?.related ?? quickTopicIds };
  }

  // Separate explicit questions while leaving phrases like "preskačem dostavu ili pauziram pretplatu" together.
  const clauses = text.split(/[?!;\n]+/).flatMap((part) => normalize(part).split(clauseBoundary));
  const answers = new Map<string, SupportAnswer>();
  const matchedGuides = new Set<{ message: string; links: SupportLink[] }>();
  const possible = new Set<string>();

  for (const clause of clauses.filter(Boolean)) {
    const exactClause = topics.find((topic) => topic.names.includes(clause));
    if (exactClause) {
      answers.set(exactClause.id, answerFor(exactClause));
      continue;
    }
    const tokens = clause.split(" ");
    const guide = guides.find((item) => contains(tokens, item.phrases));
    if (guide) {
      matchedGuides.add(guide);
      continue;
    }
    const strong = topics.filter((topic) => contains(tokens, topic.phrases));
    if (strong.length) {
      strong.forEach((topic) => answers.set(topic.id, answerFor(topic)));
      continue;
    }
    const fuzzy = topics.filter((topic) => topic.typoRoots.some((root) => tokens.some((token) => nearRoot(token, root))));
    if (fuzzy.length === 1) {
      answers.set(fuzzy[0].id, answerFor(fuzzy[0]));
      continue;
    }
    const weak = topics.filter((topic) => contains(tokens, topic.clues));
    const followUp = weak.find((topic) => topic.id === previousTopic);
    if (followUp && tokens.length <= 5) {
      answers.set(followUp.id, answerFor(followUp));
      continue;
    }
    [...fuzzy, ...weak].forEach((topic) => possible.add(topic.id));
  }

  if (answers.size || matchedGuides.size) {
    const related = [...answers.keys()].flatMap((id) => topicRules[id]?.related ?? []);
    return {
      answers: [...answers.values()],
      guides: [...matchedGuides],
      choices: [...new Set([...possible, ...related, ...quickTopicIds])].filter((id) => !answers.has(id)).slice(0, 3),
    };
  }

  if (possible.size) {
    return {
      answers: [],
      guides: [],
      choices: [...new Set([...possible, ...quickTopicIds])].slice(0, 4),
      prompt: "Na koje pitanje misliš? Izaberi ispod ili napiši malo više.",
    };
  }

  return {
    answers: [],
    guides: [{
      message: "Nemam odgovor na to pitanje. Izaberi drugu temu ili ostavi kontakt da ti se javimo.",
      links: [contact],
    }],
    choices: quickTopicIds,
  };
}

export { quickTopicIds };
