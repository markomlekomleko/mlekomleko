/**
 * The farms that produce the milk we sell today (spec 19 Nov 2026, §6 and §10): real
 * photos of the current cow-milk producers, with the farm's name and place. The goat-milk
 * producer is added only when goat milk is back on sale.
 * `place` stays empty until the owner confirms it; an empty place is simply not shown.
 */
export type Producer = { id: string; name: string; place: string; image: string; width: number; height: number; alt: string; story: string;
  /** Where the face sits, so wide crops keep it in frame (CSS object-position). */
  focus: string };

export const producers: readonly Producer[] = [
  {
    id: "glisic",
    name: "Farma Glišić",
    place: "Deliblatska peščara",
    focus: "50% 45%",
    image: "/images/domacini/porodica-glisic.webp",
    width: 1400,
    height: 1050,
    alt: "Porodica Glišić, od najmlađe do najstarije, ispred velikih bala sena na farmi u Deliblatskoj peščari",
    story: "Cela porodica na okupu, ispred sena spremljenog za krave. Takve domaćine biramo — ljude koji iza svog mleka stoje imenom i prezimenom.",
  },
  {
    id: "dragojevic",
    name: "Slobodanka Dragojević",
    place: "Mramorak",
    focus: "58% 12%",
    image: "/images/domacini/domacica-krave.webp",
    width: 1200,
    height: 1500,
    alt: "Slobodanka Dragojević u štali, naslonjena na ogradu između svojih krava",
    story: "Mala štala i krave koje poznaje jednu po jednu. Od ovakvih domaćina preuzimamo mleko odmah posle muže.",
  },
];
