// Renders etikete.html into print files: one PDF per label at its exact size, a 300 dpi
// PNG of each, and a preview sheet with all six. Run: node etikete/export.mjs
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, "izvoz");
await mkdir(out, { recursive: true });

const browser = await chromium.launch();
const url = pathToFileURL(path.join(here, "etikete.html")).href;

// Preview sheet.
const sheet = await browser.newPage({ viewport: { width: 1500, height: 1000 }, deviceScaleFactor: 2 });
await sheet.goto(url, { waitUntil: "networkidle" });
await sheet.evaluate(() => document.fonts.ready);
await sheet.locator(".sheet").screenshot({ path: path.join(out, "pregled-svih-6.png") });
const fontOk = await sheet.evaluate(() => document.fonts.check('900 20px "Montserrat"', "Кравље"));
console.log("Montserrat loaded:", fontOk);
const figures = await sheet.locator("figure").evaluateAll((nodes) =>
  nodes.map((n, i) => ({ i, file: n.dataset.file, w: Number(n.dataset.w), h: Number(n.dataset.h) })));
await sheet.close();

// 300 dpi: CSS works at 96 px per inch.
const dpiScale = 300 / 96;
for (const f of figures) {
  const page = await browser.newPage({ deviceScaleFactor: dpiScale, viewport: { width: 600, height: 600 } });
  await page.goto(url, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate((index) => {
    document.body.classList.add("solo");
    document.querySelectorAll("figure")[index].classList.add("solo-target");
  }, f.i);
  const label = page.locator(".solo-target .label");
  await label.screenshot({ path: path.join(out, `${f.file}.png`), omitBackground: true });
  await page.pdf({ path: path.join(out, `${f.file}.pdf`), width: `${f.w}mm`, height: `${f.h}mm`, printBackground: true, margin: { top: "0", right: "0", bottom: "0", left: "0" }, pageRanges: "1" });
  await page.close();
  console.log("exported", f.file);
}
await browser.close();
