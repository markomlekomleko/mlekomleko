import { chromium } from "playwright";
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await page.goto("http://localhost:3000", { waitUntil: "domcontentloaded" });
const accept = page.locator("button", { hasText: "Dozvoli sve" });
if (await accept.count()) { try { await accept.first().click({ timeout: 3000 }); } catch { /* Consent may already be dismissed. */ } }
await page.waitForTimeout(800);

// check computed transition actually registered on the element BEFORE click
const pre = await page.locator(".main-nav").evaluate((el) => {
  const cs = getComputedStyle(el);
  return { transition: cs.transitionProperty, durations: cs.transitionDuration, delays: cs.transitionDelay };
});
console.log("pre-click computed transition:", JSON.stringify(pre));

await page.locator("#menu-toggle").click();

// sample opacity/transform at several points in the following 400ms
const samples = [];
for (let i = 0; i < 8; i++) {
  const v = await page.locator(".main-nav").evaluate((el) => {
    const cs = getComputedStyle(el);
    return { t: performance.now(), opacity: cs.opacity, transform: cs.transform };
  });
  samples.push(v);
  await page.waitForTimeout(50);
}
console.log("samples:");
samples.forEach((s, i) => console.log(`  t+${i*50}ms  opacity=${s.opacity}  transform=${s.transform}`));

await browser.close();
