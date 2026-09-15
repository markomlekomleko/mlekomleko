import { chromium } from "playwright";
const out = "C:/Users/PC/AppData/Local/Temp/claude/d--Projekti-Vibe-Code-Mleko-Mleko/d1f119b9-a6f4-4a62-acd8-ccf8b8e2ce67/scratchpad";
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const logs = [];
page.on("console", (msg) => logs.push(`[console:${msg.type()}] ${msg.text()}`));
page.on("pageerror", (err) => logs.push(`[pageerror] ${err.message}`));
await page.goto("http://localhost:3000", { waitUntil: "domcontentloaded" });
const accept = page.locator("button", { hasText: "Dozvoli sve" });
if (await accept.count()) { try { await accept.first().click({ timeout: 3000 }); } catch { /* Consent may already be dismissed. */ } }
await page.waitForTimeout(800);

const before = await page.locator(".main-nav").evaluate((el) => ({
  className: el.className,
  visibility: getComputedStyle(el).visibility,
  ariaExpandedBtn: document.getElementById("menu-toggle")?.getAttribute("aria-expanded"),
}));
console.log("BEFORE click:", JSON.stringify(before));

const btn = page.locator("#menu-toggle");
console.log("button count:", await btn.count());
console.log("button visible:", await btn.isVisible());
await btn.click();
await page.waitForTimeout(400);

const after = await page.locator(".main-nav").evaluate((el) => ({
  className: el.className,
  visibility: getComputedStyle(el).visibility,
  opacity: getComputedStyle(el).opacity,
  transform: getComputedStyle(el).transform,
  ariaExpandedBtn: document.getElementById("menu-toggle")?.getAttribute("aria-expanded"),
}));
console.log("AFTER click:", JSON.stringify(after));

await page.screenshot({ path: `${out}/menu-click-test.png` });
console.log("--- console/page logs ---");
console.log(logs.join("\n") || "(none)");
await browser.close();
