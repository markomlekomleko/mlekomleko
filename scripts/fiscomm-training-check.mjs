// Explicit opt-in smoke test. It can only POST a non-fiscal training receipt.
// Run: node --env-file=.env.local scripts/fiscomm-training-check.mjs
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { dispatchFiscalOnce } from '../integrations/fiscal-dispatch.mjs';
import { buildFiscalSnapshot, fiscalDeliveryItems } from '../integrations/fiscal-deliveries.mjs';

if (process.env.FISCOMM_MODE !== 'training') throw new Error('This smoke test requires FISCOMM_MODE=training.');
if (!process.env.FISCOMM_API_KEY) throw new Error('FISCOMM_API_KEY is missing.');
const host = 'https://api.fiscomm.rs';
const headers = {Authorization:`Bearer ${process.env.FISCOMM_API_KEY}`, 'content-type':'application/json'};
const directory = resolve('.data/fiscomm-training-check');
await mkdir(directory, {recursive:true});
const path = resolve(directory, 'journal.json');
let journal;
try { journal = JSON.parse(await readFile(path,'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const persist = () => writeFile(path, JSON.stringify(journal,null,2), {mode:0o600});
async function read(route) {
  const response = await fetch(host + route, {headers, signal:AbortSignal.timeout(15000)});
  const body = await response.json();
  if (!response.ok) throw new Error(`Fiscomm read failed: HTTP ${response.status}, ${body.code ?? 'unknown'}`);
  return body;
}
const account = await read('/auth/api-key/me');
const taxes = await read('/receipt/tax-rates');
const labels = taxes.currentTaxRates.taxCategories.flatMap(category => category.taxRates);
// Synthetic price and tax mapping are for training only; do not edit catalog tax settings.
const label = labels.find(rate => rate.label === 'Е')?.label ?? labels.find(rate => rate.label === 'A')?.label;
if (!label) throw new Error('No supported training-example tax label; select it explicitly after reviewing the account.');
const {items,totalMinor} = fiscalDeliveryItems(buildFiscalSnapshot([
  {id:'training-goat-1l', product_name:'TEST — Kozje mleko 1 l', quantity:2, purchased_quantity:2, unit_price_minor:32000, line_total_minor:64000, tax_label:label},
],64000,0,label));
const request = journal?.request ?? {orderNumber:`MM-TRAINING-${randomUUID()}`,items,payments:[{type:'cash',amount:totalMinor/100}],
  metaFields:{purpose:'integration-training-test',synthetic:true}, settings:{returnIfOrderNumberExists:true,textHeader:'TEST INTEGRACIJE — BEZ NAPLATE'}};
const result = await dispatchFiscalOnce({operationKey:request.orderNumber, requestJson:JSON.stringify(request),
  url:host+'/receipt/training/sale', headers,
  normalizeResponse:body => body.receipt?.invoiceNumber && Math.round(body.receipt.totalAmount*100) === totalMinor ? {...body.receipt,correlationId:body.correlationId} : {},
  journal:{
    async claim() { if (journal) return false; journal={request,status:'sending'}; await writeFile(path,JSON.stringify(journal,null,2),{mode:0o600,flag:'wx'}); return true; },
    async read() { return {status:journal.status,responseJson:journal.responseJson}; },
    async finish(_key,status,responseJson) { journal={...journal,status,responseJson}; await persist(); },
  },
});
const archived = await read('/archive/receipts/'+encodeURIComponent(result.invoiceNumber));
const receipt = archived.receipt;
const training = /training/i.test(String(receipt?.invoiceType)) || /ОВО НИЈЕ ФИСКАЛНИ РАЧУН|OVO NIJE FISKALNI RAČUN/i.test(String(receipt?.journal));
if (!receipt || receipt.invoiceNumber !== result.invoiceNumber || !training) throw new Error('The archived document has not been verified as training; inspect the saved response.');
const report = {testedAt:new Date().toISOString(),mode:'training',endpoint:'/receipt/training/sale',
  company:account.companyName,shop:account.shopName,orderNumber:request.orderNumber,invoiceNumber:result.invoiceNumber,
  invoiceType:receipt.invoiceType,totalAmount:result.totalAmount,archiveVerified:true,
  pdfUrl:result.invoicePdfUrl,verificationUrl:result.verificationUrl,correlationId:result.correlationId};
await writeFile(resolve(directory,'result.json'),JSON.stringify(report,null,2),{mode:0o600});
console.log(JSON.stringify(report,null,2));
