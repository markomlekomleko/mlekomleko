# Pastoral luxury redesign

Direction confirmed by the user: Mleko i Mleko; origin is the premium differentiator; pastoral luxury; purchase is the primary journey. The existing logo is final. Existing origin information stays. Everything else may evolve. Visual reference: https://unitedcarriers.com/.

The homepage uses oversized editorial typography, a shared three-dimensional bottle pair, a morning landscape, a clear product selection, existing farm information, delivery steps, the live postcode checker and FAQ. Existing product, cart, subscription and checkout routes remain connected.

## 3D and performance

The Three.js renderer is dynamically imported after the initial render. A photograph is server rendered as a permanent fallback. Reduced-motion, data-saving and 2G connections skip the 3D download. Pointer and scroll updates render on demand, settle to idle, and pause offscreen or in hidden tabs. Pixel ratio is capped at 1.25 on mobile and 1.5 on desktop. The two procedural bottles share geometry/materials. The environment is generated locally; no GLB, HDR or image-sequence downloads are required. A lightweight reflective shell avoids expensive full-screen glass transmission passes.

The original logo remains unchanged. Next Image handles header/footer sizing; a 512px WebP derivative supplies the label textures without uploading the 4167px source to the GPU. Display labels in the scene are website art direction and are not a verified production packaging specification.

Generated scenery is illustrative atmosphere, not a photograph or verification of a particular supplier farm. The existing farm image remains from the project's demo collection, with illustrative alt text. Product prices and availability still come from the existing storefront data.

## New image asset

Built-in imagegen was used (not CLI). Selected source: `/Users/luka/.codex/generated_images/01a082da-413a-7bc3-90db-a813a3c6702c/exec-3452b679-fa10-45dd-975c-72bcd72d07e9.png`.

Project assets: `public/images/pastoral-morning.avif` and `public/images/pastoral-morning.webp` (1536 × 1024). The AVIF is approximately 50 KB and the WebP approximately 91 KB.

Prompt: “Photorealistic natural luxury dairy hero background; wide Serbian-style meadow at early morning; extremely low horizon; upper 70% pale ivory mist near #f1f2ec without dominant blue; restrained lush light greens; delicate grasses and hazy trees; unobstructed center; upper-right sunlight; understated film photography; no farms, houses, people, animals, logos, products, bottles, text, UI, borders, or watermarks.”

A second attempt to generate a transparent bottle poster returned a baked checkerboard without alpha, so it was rejected. The valid existing product photograph is used as the fallback. The rejected output is not included in the site.

## Hosting

The existing project explicitly migrated from Sites to Next.js/Vercel; see `docs/hosting.md`. This design change preserves that runtime and the deletion of `.openai/hosting.json`. It does not create a replacement Sites project or publish an alternate application. Public deployment still needs the existing Vercel project and persistent database setup described there.

Core Web Vitals are performance targets, not measured results of this implementation. Field performance requires deployed traffic; browser/device visual and interaction review is still needed before a competition submission.

## Validation

Production build, TypeScript and lint pass. Eight production HTTP/libSQL tests pass, including checkout idempotency and a new test that verifies the homepage delivers its purchase navigation, product-image fallback, delivery checker, FAQ and image assets before WebGL. Source review checked reduced-motion changes, offscreen/hidden-tab rendering, teardown, mobile navigation specificity and camera projection at representative narrow and wide aspect ratios.

Approximate local gzip sizes: initial root/home JavaScript 150 KB; deferred renderer/Three.js 137 KB; shared CSS 16 KB. The 3D chunk is absent from the initial route manifest. These are local build-size estimates, not measured transfer timings or field Web Vitals.
