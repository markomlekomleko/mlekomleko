import { expect, test } from "@playwright/test";
const consentKey = "mleko-i-mleko-analytics-consent";
const attributionKey = "mleko-i-mleko-attribution-v2";
test("no measurement storage before consent; SPA views and campaign survive navigation; revoke clears identifiers", async ({ page }) => {
  const events: Array<Record<string, unknown>> = [];
  await page.route("**/api/events", async route => { events.push(route.request().postDataJSON()); await route.fulfill({ status:202, contentType:"application/json", body:'{"accepted":true}' }); });
  // Protect all tests from accidentally configured external providers.
  await page.route(/https:\/\/(www\.googletagmanager\.com|www\.google-analytics\.com|connect\.facebook\.net|www\.facebook\.com)\//, route => route.abort());
  await page.goto("/prodavnica?utm_source=instagram&utm_medium=paid_social&utm_campaign=e2e-jesen&email=private%40example.test");
  await expect(page.getByRole("dialog", { name:"Podešavanja kolačića" })).toBeVisible();
  expect(events).toHaveLength(0);
  expect(await page.evaluate(() => Object.keys(localStorage).filter(key => /anonymous|attribution/.test(key)))).toEqual([]);
  await page.getByRole("button", {name:"Dozvoli analitiku",exact:true}).click();
  await expect.poll(() => events.filter(event => event.eventName === "page_view").length).toBe(1);
  await expect.poll(() => events.some(event => event.eventName === "view_item_list")).toBe(true);
  const before = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), attributionKey);
  expect(before.lastTouch.parameters.utm_campaign).toBe("e2e-jesen");
  expect(JSON.stringify(before)).not.toContain("private@example.test");
  await page.getByRole("navigation", {name:"Istraži"}).getByRole("link", {name:"Česta pitanja",exact:true}).click();
  await expect(page).toHaveURL(/\/faq$/);
  await expect.poll(() => events.filter(event => event.eventName === "page_view").length).toBe(2);
  const after = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), attributionKey);
  expect(after.lastTouch.parameters.utm_campaign).toBe("e2e-jesen");
  expect(events.filter(event => event.eventName === "page_view").map(event => event.sessionId).every(id => id === events[0].sessionId)).toBe(true);
  await page.getByRole("button", {name:"Podešavanja kolačića",exact:true}).click();
  await page.getByRole("button", {name:"Samo neophodno",exact:true}).click();
  await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key)!).analytics,consentKey)).toBe(false);
  expect(await page.evaluate(() => Object.keys(localStorage).filter(key => /anonymous|attribution/.test(key)))).toEqual([]);
});

test("campaign report counts real consented sessions once per step and rejects fabricated purchase events", async ({ request }) => {
  const suffix = crypto.randomUUID();
  const sessionId = `marketing-${suffix}`;
  const source = `source-${suffix}`;
  const campaign = `campaign-${suffix}`;
  const body = { consent:true, anonymousId: `anon-${suffix}`, sessionId, path:"/prodavnica", properties:{ attribution:{ lastTouch:{ parameters:{ utm_source:source,utm_medium:"qr",utm_campaign:campaign } } } } };
  for (const eventName of ["page_view","page_view","view_item","add_to_cart","begin_checkout"]) {
    const response = await request.post("/api/events",{data:{...body,eventName}});
    expect(response.status()).toBe(202);
  }
  expect((await request.post("/api/events",{data:{...body,eventName:"purchase"}})).status()).toBe(422);
  expect((await request.post("/api/events",{data:{...body,consent:false,eventName:"page_view"}})).status()).toBe(403);
  const auth = await request.post("/api/admin/access", { headers:{Origin:`http://localhost:${process.env.E2E_PORT || "4173"}`,"cf-connecting-ip":`2001:db8:${suffix.replaceAll("-","").match(/.{1,4}/g)!.slice(0,6).join(":")}`},data:{email:"admin@example.test",password:"e2e-admin-password"}});
  expect(auth.ok()).toBe(true);
  const response = await request.get("/api/admin/insights",{headers:{Authorization:`Bearer ${(await auth.json()).sessionToken}`}});
  expect(response.ok()).toBe(true);
  const row = (await response.json()).marketing.channels.find((entry:Record<string,unknown>) => entry.campaign===campaign);
  expect(row).toMatchObject({source,campaign,channel:"qr",visits:1,products:1,carts:1,checkouts:1,orders:0,paidOrders:0,paidMinor:0});
});
