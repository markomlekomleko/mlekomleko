import assert from 'node:assert/strict';
import { beforeEach, afterEach, test } from 'node:test';
import { register } from 'node:module';
import { randomUUID } from 'node:crypto';
import { createDatabase } from './sqlite-d1.mjs';

const RealDate = Date;
const env = { APP_ENV: 'local', PAYMENT_MODE: 'mock', APP_ORIGIN: 'http://localhost' };
globalThis.__mlekoTestCloudflareEnv = env;
register(new URL('./cloudflare-loader.mjs', import.meta.url));
const worker = (await import('../dist/server/index.js')).default;
let database;
beforeEach(() => {
  const now = new RealDate('2026-12-30T10:00:00Z').getTime();
  globalThis.Date = class extends RealDate { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } };
  database = createDatabase(); env.DB = database;
  database.raw.exec('UPDATE products SET is_active=1, allow_subscription=1');
});
afterEach(() => { database.close(); globalThis.Date = RealDate; });
async function request(path, body) {
  const response = await worker.fetch(new Request(`http://localhost${path}`, {
    method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Origin: 'http://localhost', 'Idempotency-Key': randomUUID() }, ...(body ? { body: JSON.stringify(body) } : {}),
  }), env, { waitUntil() {}, passThroughOnException() {} });
  return { status: response.status, body: await response.json() };
}
const customer = { email:'schedule@example.test', fullName:'Test Kupac', phone:'0601234567', addressLine1:'Test 1', city:'Beograd', postalCode:'11000' };
const items = cadence => [{ productId:'prod_kravlje_1l', quantity:2, purchaseType:cadence ? 'subscription' : 'one_time', ...(cadence ? {cadence} : {}) }];
const day = date => new RealDate(`${date}T12:00:00Z`).getUTCDay();

test('calendar exposes Tuesday and Friday in Belgrade, Friday only in Novi Sad and aliases', async () => {
  for (const [city, postalCode, weekdays] of [['Beograd','11000',[2,5]],['Novi Sad','21000',[5]],['Петроварадин','21132',[5]]]) {
    const result = await request(`/api/delivery-options?${new URLSearchParams({city,postalCode})}`);
    assert.equal(result.status, 200, JSON.stringify(result.body));
    assert.deepEqual(result.body.weekdays, weekdays);
    assert.ok(result.body.dates.length > 20);
    assert.ok(result.body.dates.every(date => weekdays.includes(day(date))));
    assert.equal(result.body.dates[0], '2027-01-01');
  }
});
test('calendar excludes holidays, expired cutoffs and closed delivery routes', async () => {
  database.raw.prepare("INSERT OR REPLACE INTO settings (key,value_json) VALUES ('holidays',?)").run(JSON.stringify(['2027-01-01']));
  const now = '2026-12-30T10:00:00Z';
  database.raw.prepare("INSERT INTO deliveries (id,delivery_date,cutoff_at,status,generated_at,generation_key) VALUES (?,?,?,?,?,?)").run('closed','2027-01-05','2027-01-04T07:00:00Z','locked',now,'closed-route');
  const {body} = await request('/api/delivery-options?city=Beograd&postalCode=11000');
  assert.equal(body.dates[0], '2027-01-08');
  assert.ok(body.dates.every(date => date > '2026-12-30'));
});
test('calendar rejects an unsupported address or mismatched city and postcode', async () => {
  for (const query of ['city=Novi+Sad&postalCode=11000','city=Nis&postalCode=18000','city=Beograd&postalCode=00000']) assert.equal((await request(`/api/delivery-options?${query}`)).status, 422);
});
test('Novi Sad cannot bypass Friday-only delivery via quote or checkout', async () => {
  const payload = { items:items(), deliveryDate:'2027-01-05', paymentMethod:'cash', customer:{...customer, city:'Novi Sad',postalCode:'21000'} };
  for (const [path, body] of [['/api/cart',{...payload,city:'Novi Sad',postalCode:'21000'}],['/api/checkout',payload]]) {
    const result = await request(path,body);
    assert.equal(result.status,422); assert.equal(result.body.error.code,'INVALID_DELIVERY_DATE');
  }
  assert.equal(database.raw.prepare('SELECT COUNT(*) n FROM orders').get().n,0);
});
for (const cadence of [undefined,'weekly','biweekly']) for (const date of ['2027-01-05','2027-01-15']) {
  test(`chosen ${date} persists through quote, order and cadence anchors (${cadence ?? 'one time'})`, async () => {
    const payload = {items:items(cadence),deliveryDate:date,paymentMethod:'cash',customer};
    const quote = await request('/api/cart',{...payload,city:customer.city,postalCode:customer.postalCode});
    assert.equal(quote.status,200); assert.equal(quote.body.deliveryDate,date);
    const dates = quote.body.lines[0].deliveryDates;
    assert.equal(dates.length,cadence === 'weekly' ? 4 : cadence === 'biweekly' ? 2 : 1);
    assert.equal(dates[0],date); assert.ok(dates.every(d => day(d) === day(date)));
    if(cadence) assert.equal((RealDate.parse(dates[1]) - RealDate.parse(dates[0]))/86400000,cadence === 'weekly' ? 7 : 14);
    const order = await request('/api/checkout',payload);
    assert.equal(order.status,201,JSON.stringify(order.body)); assert.equal(order.body.order.deliveryDate,date);
    assert.equal(database.raw.prepare('SELECT delivery_date FROM orders').get().delivery_date,date);
    if(cadence) assert.equal(database.raw.prepare('SELECT cadence_anchor_date FROM subscription_items').get().cadence_anchor_date,date);
  });
}

test('a Friday after its Thursday cutoff is unavailable; Novi Sad defaults to the following Friday', async () => {
  const now = new RealDate('2026-12-31T10:00:00Z').getTime();
  globalThis.Date = class extends RealDate { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } };
  const result = await request('/api/delivery-options?city=Novi+Sad&postalCode=21000');
  assert.equal(result.body.dates[0],'2027-01-08');
  const quote = await request('/api/cart',{items:items(),city:'Novi Sad',postalCode:'21000'});
  assert.equal(quote.status,200); assert.equal(quote.body.deliveryDate,'2027-01-08');
});
for(const date of ['2026-12-25','2027-01-02','2027-02-30']) test(`invalid or unavailable date ${date} is rejected without creating an order`,async()=>{
  const result=await request('/api/checkout',{items:items(),deliveryDate:date,paymentMethod:'cash',customer});
  assert.ok([409,422].includes(result.status));
  assert.equal(database.raw.prepare('SELECT COUNT(*) n FROM orders').get().n,0);
});

test('postcode checker and a postcode-only quote agree with the Novi Sad calendar', async () => {
  const now = new RealDate('2027-01-02T10:00:00Z').getTime();
  globalThis.Date = class extends RealDate { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } };
  const checker = await request('/api/storefront?postalCode=21000');
  assert.equal(checker.status,200); assert.equal(checker.body.delivery.deliveryDate,'2027-01-08');
  const quote = await request('/api/cart',{items:items(),postalCode:'21000'});
  assert.equal(quote.status,200); assert.equal(quote.body.deliveryDate,'2027-01-08');
});
