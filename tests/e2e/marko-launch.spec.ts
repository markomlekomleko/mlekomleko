import {expect,test} from "@playwright/test";
import {mkdir} from "node:fs/promises";
test("bulk cash selection excludes unchecked orders and the confirmation shows the reviewed total",async({page,request},testInfo)=>{
  test.setTimeout(90000);
  const origin=`http://localhost:${process.env.E2E_PORT||"4173"}`;
  const auth=await request.post('/api/admin/access',{headers:{Origin:origin,"cf-connecting-ip":`2001:db8:${Date.now().toString(16).slice(-4)}::1`},data:{email:'admin@example.test',password:'e2e-admin-password'}});
  expect(auth.ok()).toBe(true);const token=(await auth.json()).sessionToken;
  const headers={Origin:origin,Authorization:`Bearer ${token}`};
  const options=await(await request.get('/api/admin/orders/quote',{headers})).json();
  const name=`Provera gotovine ${crypto.randomUUID().slice(0,6)}`;
  const created=[];
  for(let i=0;i<3;i++){
    const response=await request.post('/api/admin/orders',{headers:{...headers,'Idempotency-Key':crypto.randomUUID()},data:{customer:{fullName:`${name} ${i+1}`,phone:'0601234567',addressLine1:'Test 12',city:'Beograd',postalCode:'11000'},deliveryDate:options.dates.at(-3),items:[{productId:'prod_kravlje_1l',quantity:2,purchaseType:'one_time'}]}});
    expect(response.status()).toBe(201);created.push((await response.json()).order);
  }
  await page.goto('/admin');
  const consent=page.getByRole('button',{name:'Samo neophodno'});if(await consent.isVisible())await consent.click();
  await page.getByLabel('Email',{exact:true}).fill('admin@example.test');await page.getByLabel('Lozinka',{exact:true}).fill('e2e-admin-password');await page.getByRole('button',{name:'Prijavi se',exact:true}).click();
  await expect(page.locator('.status-dot')).toHaveText('● Povezano');
  await mkdir('output/playwright',{recursive:true});
  await page.screenshot({path:`output/playwright/guide-home-${testInfo.project.name}.png`,fullPage:true});
  await page.getByRole('navigation',{name:'Administracija'}).getByRole('button',{name:'Porudžbine',exact:true}).click();
  await page.getByLabel('Pretraga porudžbina').fill(name);await page.getByRole('button',{name:'Primeni filtere'}).click();
  const selectAll=page.getByRole('checkbox',{name:'Označi sve gotovinske porudžbine na stranici'});await expect(selectAll).toBeVisible();await selectAll.check();
  const checks=page.getByRole('checkbox',{name:/Izaberi uplatu/});await expect(checks).toHaveCount(3);await checks.last().uncheck();
  await page.screenshot({path:`output/playwright/guide-orders-${testInfo.project.name}.png`,fullPage:true});
  await page.getByRole('button',{name:'Potvrdi primljenu gotovinu'}).click();
  const dialog=page.getByRole('dialog',{name:'Potvrda gotovinskih uplata'});
  await expect(dialog).toContainText('2 porudžbina');await expect(dialog.getByRole('button',{name:'Sačuvaj 2 uplata'})).toBeDisabled();
  await page.screenshot({path:`output/playwright/guide-cash-${testInfo.project.name}.png`,fullPage:true});
  await dialog.getByRole('checkbox').check();await dialog.getByRole('button',{name:'Sačuvaj 2 uplata'}).click();
  await expect(page.getByRole('status').filter({hasText:'Sačuvano: 2. Neuspešno: 0.'})).toBeVisible();
  const states=await Promise.all(created.map(async o=>(await(await request.get(`/api/admin/orders/${o.id}`,{headers})).json()).order.payment_status));
  expect(states.filter(s=>s==='paid')).toHaveLength(2);expect(states.filter(s=>s==='pending')).toHaveLength(1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await page.getByRole('navigation',{name:'Administracija'}).getByRole('button',{name:'Dostave',exact:true}).click();
  await page.screenshot({path:`output/playwright/guide-deliveries-${testInfo.project.name}.png`,fullPage:true});
  await page.goto('/prodavnica');const cookie=page.getByRole('button',{name:'Samo neophodno'});if(await cookie.isVisible())await cookie.click();await page.screenshot({path:`output/playwright/shop-${testInfo.project.name}.png`,fullPage:true});
});
