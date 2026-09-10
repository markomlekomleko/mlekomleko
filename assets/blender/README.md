# Milk product scene

`milk-bottles.blend` is the editable scene created locally with Blender 5.2. It contains modeled bottles, cap grips, curved paper labels, the existing brand seal, and studio lighting. This is a stylized product visualization; the existing catalog photography remains on product cards.

Rebuild from the repository root:

```sh
/Applications/Blender.app/Contents/MacOS/Blender -b --python scripts/build-milk-scene.py
node --input-type=module -e "import sharp from 'sharp'; await sharp('public/images/3d/milk-bottles.png').webp({quality:86}).toFile('public/images/3d/milk-bottles.webp');"
```

The script exports `public/models/milk-bottles.glb` and a transparent PNG poster. The WebP poster is approximately 25 KB; the GLB is approximately 628 KB. The browser loads the model only above 760 px, when reduced motion and connection data saving are off. Pointer and scroll movement, gentle floating, rotation buttons, and a pause control enhance the poster. Rendering stops offscreen and in background tabs. Errors, context loss, reduced motion, and smaller viewports keep the static product render visible.

Production CSP allows blob URLs for the GLB's embedded textures. No external texture or environment requests are needed.

Homepage changes surface current catalog prices, shipping cost, one-time purchase availability, a delivery checker link, and the product selection ahead of the brand story. Conversion lift needs to be measured against actual traffic; no uplift is assumed.

Validate the production storefront with `npm run build` followed by `npx playwright test --config playwright.design.config.ts --grep "public pages have|hero priorities|responsive navigation|Blender scene|reduced motion|failed model"`. The config uses an isolated local test database.
