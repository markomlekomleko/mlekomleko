import type { SupportTarget } from "./support-chat";

export type SupportMenu = { label: string; children: SupportMenuItem[] };
export type SupportMenuItem = SupportMenu | { label: string; target: SupportTarget };

export const supportMenu: SupportMenuItem[] = [
  {
    label: "Pretplata",
    children: [
      { label: "Kako funkcioniše pretplata?", target: { topic: "subscription" } },
      {
        label: "Izmene pretplate",
        children: [
          { label: "Do kada mogu da izmenim porudžbinu?", target: { topic: "deadline" } },
          { label: "Mogu li da dodam proizvod samo za jednu isporuku?", target: { topic: "addition" } },
          { label: "Preskakanje, pauza ili otkazivanje", target: { topic: "subscription" } },
        ],
      },
      { label: "Kako mogu da platim?", target: { topic: "payment" } },
    ],
  },
  {
    label: "Dostava",
    children: [
      {
        label: "Termini i adrese",
        children: [
          { label: "Kada i gde dostavljate?", target: { topic: "delivery" } },
          { label: "Provera poštanskog broja", target: { guide: "postcode" } },
        ],
      },
      { label: "Cena dostave", target: { guide: "deliveryCost" } },
      { label: "Status moje porudžbine", target: { guide: "order" } },
    ],
  },
  {
    label: "Porudžbine i plaćanje",
    children: [
      { label: "Kako mogu da platim?", target: { topic: "payment" } },
      { label: "Do kada mogu da izmenim porudžbinu?", target: { topic: "deadline" } },
      { label: "Status moje porudžbine", target: { guide: "order" } },
      { label: "Reklamacije i povraćaj", target: { guide: "complaint" } },
    ],
  },
  {
    label: "Mleko i flaše",
    children: [
      {
        label: "O mleku",
        children: [
          { label: "Da li je mleko bezbedno i kako se koristi?", target: { topic: "milk" } },
          { label: "Pogledaj analize", target: { guide: "analyses" } },
          { label: "Cene i dostupnost mleka", target: { guide: "products" } },
          { label: "Rok upotrebe", target: { guide: "shelfLife" } },
        ],
      },
      { label: "Šta radim sa staklenim flašama?", target: { topic: "bottles" } },
    ],
  },
  { label: "Mlekomati", target: { guide: "machines" } },
];
