export type MilkKind = "cow" | "goat";

export function milkKind(product: { slug: string; name: string }): MilkKind | null {
  const text = `${product.slug} ${product.name}`.toLowerCase();
  if (/koz/.test(text)) return "goat";
  if (/krav/.test(text)) return "cow";
  return null;
}

export const cowMilkPhoto = "/images/catalog/kravlje-mleko-studio.webp";
export const goatMilkPhotos = [
  { src: "/images/catalog/kozje-mleko-crni-cep.webp", alt: "Flaša kozjeg mleka sa crnim čepom" },
  { src: "/images/catalog/kozje-mleko-cep-detalj.webp", alt: "Detalj crnog čepa na flaši kozjeg mleka" },
  { src: "/images/catalog/kozje-mleko-kod-mlekomata.webp", alt: "Flaša kozjeg mleka pored mlekomata" },
] as const;

const legacyMilkImage = /^\/images\/(?:catalog|demo)\/(kravlje|kozje)-mleko(?:-v2|-studio)?\.(?:webp|avif|jpe?g)$/;

export function isBundledMilkImage(url: string) {
  return legacyMilkImage.test(url) || /^\/images\/karusel\/(?:kravlje|kozje)-/.test(url);
}

export function storefrontMilkImage(url: string) {
  const bundled = url.match(legacyMilkImage);
  if (bundled) return bundled[1] === "kravlje" ? cowMilkPhoto : goatMilkPhotos[0].src;
  return isBundledMilkImage(url) ? "" : url;
}
