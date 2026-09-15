/** Delivery is limited to the administrative territories of Beograd and Novi Sad.
 * Exact codes, not the broad 11/21 postal regions (which include other cities).
 * Source: Pošta Srbije public post-office directory, checked 2026-09-15:
 * https://posta.rs/lat/stanovnistvo/usluga.aspx?usluga=servisi-za-gradjane/digitalni-zeleni-sertifikat/digitalni-zeleni-sertifikat
 * Additional city offices: https://www.posta.rs/DocumentViewer.aspx?IdDokument=1000964
 * Unknown codes fail closed; extend this list when a new local office is confirmed.
 */
export const DELIVERY_CITIES = ["Beograd", "Novi Sad"] as const;
export type DeliveryCity = (typeof DELIVERY_CITIES)[number];

export const DELIVERY_POSTAL_CODES: Record<DeliveryCity, readonly string[]> = {
  "Beograd": [
    "11000", "11010", "11011", "11030", "11032", "11040", "11041", "11042", "11043", "11050",
    "11051", "11052", "11053", "11054", "11055", "11056", "11060", "11061", "11062", "11070",
    "11071", "11072", "11073", "11074", "11075", "11076", "11077", "11079", "11080", "11081",
    "11083", "11084", "11090", "11091", "11092", "11101", "11102", "11103", "11104", "11105",
    "11106", "11107", "11108", "11109", "11110", "11111", "11112", "11113", "11114", "11115",
    "11116", "11118", "11119", "11120", "11122", "11123", "11124", "11125", "11126", "11127",
    "11128", "11129", "11130", "11131", "11135", "11136", "11137", "11138", "11139", "11140",
    "11141", "11142", "11143", "11144", "11145", "11147", "11148", "11149", "11150", "11151",
    "11152", "11154", "11158", "11159", "11160", "11163", "11164", "11165", "11166", "11167",
    "11168", "11169", "11172", "11173", "11174", "11175", "11176", "11177", "11178", "11179",
    "11180", "11182", "11183", "11184", "11185", "11186", "11187", "11188", "11189", "11190",
    "11191", "11192", "11193", "11194", "11195", "11196", "11197", "11198", "11199", "11210",
    "11211", "11212", "11213", "11214", "11215", "11216", "11221", "11222", "11224", "11231",
    "11232", "11233", "11235", "11250", "11251", "11252", "11253", "11254", "11255", "11260",
    "11261", "11262", "11271", "11272", "11273", "11275", "11276", "11277", "11278", "11279",
    "11280", "11281", "11282", "11283", "11284", "11306", "11307", "11308", "11309", "11350",
    "11351", "11352", "11353", "11400", "11401", "11406", "11408", "11409", "11412", "11413",
    "11414", "11415", "11426", "11430", "11433", "11450", "11453", "11454", "11460", "11461",
    "11462", "11500", "11503", "11504", "11506", "11507", "11508", "11509", "11511", "11550",
    "11554", "11555", "11560", "11561", "11562", "11563", "11564", "11565", "11566", "11568",
  ],
  "Novi Sad": [
    "21000", "21101", "21102", "21103", "21104", "21105", "21106", "21107", "21108", "21109",
    "21110", "21111", "21112", "21113", "21114", "21115", "21116", "21117", "21118", "21119",
    "21120", "21121", "21122", "21123", "21124", "21125", "21126", "21127", "21128", "21131",
    "21132", "21137", "21138", "21141", "21201", "21203", "21204", "21207", "21208", "21209",
    "21211", "21212", "21241", "21243", "21410",
  ],
};

const cityAliases: Record<string, DeliveryCity> = {
  beograd: "Beograd", belgrade: "Beograd", "novi beograd": "Beograd", zemun: "Beograd",
  "novi sad": "Novi Sad", petrovaradin: "Novi Sad", "sremska kamenica": "Novi Sad",
};

export function normalizeDeliveryCity(value: string): DeliveryCity | null {
  const cyrillic: Record<string, string> = {
    а: "a", б: "b", в: "v", г: "g", д: "d", ђ: "đ", е: "e", ж: "ž", з: "z",
    и: "i", ј: "j", к: "k", л: "l", љ: "lj", м: "m", н: "n", њ: "nj", о: "o",
    п: "p", р: "r", с: "s", т: "t", ћ: "ć", у: "u", ф: "f", х: "h", ц: "c",
    ч: "č", џ: "dž", ш: "š",
  };
  const normalized = value.normalize("NFC").trim().toLowerCase().replace(/[а-яђјљњћџ]/g, (letter) => cyrillic[letter] ?? letter).replace(/\s+/g, " ");
  return cityAliases[normalized] ?? null;
}

export function deliveryCityForPostalCode(postalCode: string): DeliveryCity | null {
  const code = postalCode.trim();
  if (!/^\d{5}$/.test(code)) return null;
  return DELIVERY_CITIES.find((city) => DELIVERY_POSTAL_CODES[city].includes(code)) ?? null;
}

export function deliveryAddressError(city: string, postalCode: string): string | null {
  const normalizedCity = normalizeDeliveryCity(city);
  if (!normalizedCity) return "Dostavljamo samo na teritoriji Beograda i Novog Sada.";
  const postalCity = deliveryCityForPostalCode(postalCode);
  if (!postalCity) return "Poštanski broj nije u zoni dostave za Beograd i Novi Sad.";
  if (postalCity !== normalizedCity) return "Poštanski broj ne odgovara izabranom gradu.";
  return null;
}
