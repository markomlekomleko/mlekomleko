/* eslint-disable @next/next/no-img-element -- Owner-uploaded gallery images use the existing image service. */
import { BrandGlyph } from "./brand-glyph";

export function OriginGallery({cow = "", goat = ""}: {cow?:string;goat?:string}) {
  return <div className="origin-gallery" aria-label="Kravlje i kozje mleko">
    {[{name:"Kravlje",url:cow,mark:"cow" as const},{name:"Kozje",url:goat,mark:"bottle" as const}].map(item=><figure key={item.name}>
      {item.url ? <img src={item.url} alt={item.name === "Kravlje" ? "Krave — fotografija iz naše galerije" : "Koze — fotografija iz naše galerije"} width="800" height="600" loading="lazy" /> : <div className="origin-gallery-illustration" aria-hidden="true"><BrandGlyph name={item.mark} /></div>}
      <figcaption>{item.name}{!item.url ? <small>Ilustracija</small> : null}</figcaption>
    </figure>)}
  </div>;
}
