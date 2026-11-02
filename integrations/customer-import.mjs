import { createHash } from 'node:crypto';
import { fiscalDeliveryItems } from './fiscal-deliveries.mjs';

const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const idFor = (batch, kind, source) => `import-${kind}-${digest([batch,source]).slice(0,40)}`;
const check = (ok,message) => {if(!ok)throw new Error(message);};
const required = (row,key) => {const value=String(row[key]??'').trim();check(value.length>0 && value.length<=2000,`Nedostaje ili je predugačko polje ${key}.`);return value;};
const integer = (row,key,min=0) => {const text=required(row,key);check(/^\d+$/.test(text),`${key} mora biti ceo broj.`);const n=Number(text);check(Number.isSafeInteger(n)&&n>=min&&n<=100000,`Neispravno ${key}.`);return n;};
const money = (row,key) => {const text=required(row,key).replace(',','.');check(/^\d+(\.\d{1,2})?$/.test(text),`${key} mora biti iznos u dinarima sa najviše dve decimale.`);const [whole,decimal='']=text.split('.');const n=Number(whole)*100+Number(decimal.padEnd(2,'0'));check(Number.isSafeInteger(n)&&n<=100000000,`Prevelik iznos ${key}.`);return n;};

/** RFC 4180, also accepting the semicolon delimiter produced by local Excel. */
export function parseCustomerCsv(text) {
  text=text.replace(/^\uFEFF/,'');
  const delimiter=(text.split(/\r?\n/,1)[0].match(/;/g)?.length??0)>(text.split(/\r?\n/,1)[0].match(/,/g)?.length??0)?';':',';
  const rows=[];let row=[],cell='',quoted=false;
  for(let i=0;i<=text.length;i++){
    const ch=text[i];
    if(ch==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else{check(quoted||!cell,'Neispravan navodnik u CSV-u.');quoted=!quoted;}}
    else if(!quoted&&(ch===delimiter||ch==='\n'||ch===undefined)){row.push(cell.trim());cell='';if(ch!==delimiter){if(row.some(Boolean))rows.push(row);row=[];}}
    else if(ch!=='\r'||quoted)cell+=ch;
  }
  check(!quoted,'Nezatvoreni navodnici u CSV-u.');
  const headers=rows.shift()??[];check(headers.length&&new Set(headers).size===headers.length,'Zaglavlja moraju biti jedinstvena.');
  return rows.map((values,index)=>{check(values.length===headers.length,`Red ${index+2}: broj kolona se ne poklapa.`);return Object.fromEntries(headers.map((header,i)=>[header,values[i]]));});
}

/** Builds one reviewed transaction. Never sends messages, charges money or issues receipts. */
export async function prepareCustomerImport(rows,{batchId,db,validatePackage,now=new Date().toISOString()}) {
  check(/^[a-zA-Z0-9_-]{3,80}$/.test(batchId),'batch-id mora sadržati 3–80 slova, brojeva, crtica ili donjih crta.');
  check(rows.length>0&&rows.length<=10000,'Uvoz podržava 1–10000 redova.');
  const sourceHash=digest(rows),saved=await db.first("SELECT request_hash,response_json FROM idempotency_keys WHERE namespace='customer-import' AND key=?",batchId);
  if(saved){check(saved.request_hash===sourceHash,'Ova grupa je već uvezena iz drugog sadržaja. Koristite originalni fajl.');return {...JSON.parse(saved.response_json),alreadyImported:true,statements:[],sourceHash};}
  const statements=[],customers=new Map(),orders=new Map(),errors=[];
  for(const [index,row] of rows.entries()) {
    try {
      const sourceCustomer=required(row,'external_customer_id');
      let customer=customers.get(sourceCustomer);
      const contact={fullName:required(row,'full_name'),phone:required(row,'phone'),address:required(row,'address'),city:required(row,'city'),postalCode:required(row,'postal_code')};
      check(/^\d{5}$/.test(contact.postalCode),'Poštanski broj mora imati pet cifara.');
      const email=String(row.email??'').trim().toLowerCase()||`${idFor('legacy','customer',sourceCustomer)}@manual.invalid`;
      check(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),'Email nije ispravan.');
      if(customer)check(customer.email===email&&JSON.stringify(customer.contact)===JSON.stringify(contact),'Podaci istog kupca razlikuju se između redova.');
      else {
        check(![...customers.values()].some(c=>c.email===email),'Dva izvorna kupca koriste isti email; prvo usaglasite duplikat.');
        const existing=await db.first('SELECT id,email,phone FROM customers WHERE email=? OR id=?',email,idFor('legacy','customer',sourceCustomer));
        check(!existing||existing.email===email&&String(existing.phone).replace(/\D/g,'')===contact.phone.replace(/\D/g,''),'Postojeći email ima drugi telefon; potrebno je usaglašavanje.');
        customer={id:existing?.id??idFor('legacy','customer',sourceCustomer),email,contact,existing:Boolean(existing)};customers.set(sourceCustomer,customer);
        if(!existing)statements.push({sql:'INSERT INTO customers(id,email,full_name,phone,address_line_1,city,postal_code,source_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)',bindings:[customer.id,email,contact.fullName,contact.phone,contact.address,contact.city,contact.postalCode,JSON.stringify({importBatch:batchId,externalCustomerId:sourceCustomer}),now,now]});
      }
      if(!String(row.external_order_id??'').trim())continue;
      const sourceOrder=required(row,'external_order_id');
      let order=orders.get(sourceOrder);
      const nextDate=required(row,'next_delivery_date');check(/^\d{4}-\d{2}-\d{2}$/.test(nextDate) && new Date(nextDate+'T12:00:00Z').toISOString().slice(0,10)===nextDate,'Sledeći datum mora biti YYYY-MM-DD.');
      check(typeof validatePackage==='function','Aktivni paketi zahtevaju proveru područja i rasporeda.');
      await validatePackage({...contact,nextDate});
      check(String(row.paid)==='true','Uvoz postojećeg paketa zahteva potvrđenu punu uplatu (paid=true).');
      const method=required(row,'payment_method');check(['cash','card'].includes(method),'Način stare uplate zahteva usaglašavanje; ne sme se nagađati.');
      const invoice=required(row,'advance_invoice_number'),invoiceTime=required(row,'advance_time'),purchasedAt=required(row,'purchased_at');
      check(row.advance_provider==='fiscomm' && row.advance_mode==='live','Aktivni paket zahteva potvrđen stvarni Fiscomm avans. Drugi servis ili trening zahteva zasebno fiskalno usaglašavanje.');
      check([invoiceTime,purchasedAt].every(value=>/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.test(value)&&Number.isFinite(Date.parse(value))&&Date.parse(value)<=Date.parse(now)),'Datumi uplate i kupovine moraju biti stvarni ISO datumi sa zonom, ne u budućnosti.');
      const shared={customerId:customer.id,nextDate,method,invoice,invoiceTime,purchasedAt,totalMinor:money(row,'total_rsd'),deliveryMinor:money(row,'delivery_fee_rsd'),remainingMinor:money(row,'remaining_rsd'),deliveryLabel:String(row.delivery_tax_label??'').trim()};
      if(order)check(JSON.stringify(order.shared)===JSON.stringify(shared),'Zbirni podaci iste stare porudžbine nisu jednaki.');
      else {
        check(!await db.first('SELECT id FROM fiscal_receipts WHERE invoice_number=?',invoice),'Avansni račun je već evidentiran. Usaglasite stare pakete pre uvoza.');
        check(!await db.first('SELECT id FROM orders WHERE order_number=?',`IMPORT-${sourceOrder}`.slice(0,100)),'Izvorna porudžbina već postoji u drugoj grupi.');
        check(![...orders.values()].some(o=>o.shared.invoice===invoice),'Dve porudžbine koriste isti avansni račun.');
        order={id:idFor(batchId,'order',sourceOrder),subscriptionId:idFor(batchId,'subscription',sourceOrder),shared,customer,lines:[]};orders.set(sourceOrder,order);
      }
      const productId=required(row,'product_id');const product=await db.first('SELECT id,name,unit_label FROM products WHERE id=?',productId);check(product,'Proizvod ne postoji; prvo mapirajte šifre proizvoda.');
      const cadence=required(row,'cadence');check(['weekly','biweekly','one_time'].includes(cadence),'Ritam mora biti weekly, biweekly ili one_time.');
      const quantity=integer(row,'quantity',1),occurrences=cadence==='weekly'?4:cadence==='biweekly'?2:1,delivered=integer(row,'delivered_quantity');check(delivered<=quantity*occurrences,'Uručena količina prelazi kupljenu.');
      const lineId=idFor(batchId,'line',`${sourceOrder}:${order.lines.length}`),unitPrice=money(row,'unit_price_rsd'),net=money(row,'net_product_rsd'),shipping=money(row,'allocated_delivery_rsd');
      check(net<=unitPrice*quantity*occurrences,'Neto vrednost prelazi kupljenu bruto vrednost.');
      order.lines.push({id:lineId,productId,cadence,quantity,occurrences,delivered,unitPrice,net,shipping,name:product.name,unit:product.unit_label,label:required(row,'tax_label')});
    }catch(error){errors.push({row:index+2,message:error.message});}
  }
  const summary={batchId,sourceHash,customers:customers.size,newCustomers:[...customers.values()].filter(c=>!c.existing).length,packages:orders.size,purchasedUnits:0,deliveredUnits:0,remainingUnits:0,paidMinor:0,remainingMinor:0};
  for(const [sourceOrder,order] of orders){try {
    const {shared,lines,id,subscriptionId,customer}=order;
    check(lines.some(l=>l.cadence!=='one_time'),'Paket mora imati redovnu stavku.');
    const snapshot={version:1,paymentTiming:'advance',totalMinor:shared.totalMinor,deliveryLabel:shared.deliveryLabel,lines:lines.map(l=>({orderItemId:l.id,name:l.name,label:l.label,quantity:l.quantity*l.occurrences,productMinor:l.net,deliveryMinor:l.shipping}))};
    check(lines.reduce((s,l)=>s+l.net+l.shipping,0)===shared.totalMinor,'Zbir neto stavki i dostave ne odgovara staroj uplati.');
    check(lines.reduce((s,l)=>s+l.shipping,0)===shared.deliveryMinor,'Raspodela dostave ne odgovara staroj porudžbini.');
    check(!shared.deliveryMinor||shared.deliveryLabel,'Nedostaje potvrđena poreska oznaka dostave.');
    const allocations=lines.filter(l=>l.delivered<l.quantity*l.occurrences).map(l=>({order_item_id:l.id,unit_offset:l.delivered,quantity:l.quantity*l.occurrences-l.delivered}));
    check(allocations.length,'Završene pakete čuvajte u istorijskoj arhivi, bez nove aktivne pretplate.');
    const remaining=fiscalDeliveryItems(snapshot,allocations).totalMinor;check(remaining===shared.remainingMinor,'Preostala vrednost se ne poklapa sa potvrđenim preostalim količinama i cenama.');
    const shippingJson=JSON.stringify({fullName:customer.contact.fullName,email:customer.email,phone:customer.contact.phone,addressLine1:customer.contact.address,city:customer.contact.city,postalCode:customer.contact.postalCode});
    const gross=lines.reduce((s,l)=>s+l.unitPrice*l.quantity*l.occurrences,0);
    statements.push({sql:"INSERT INTO subscriptions(id,customer_id,status,payment_method,next_delivery_date,started_at,shipping_json) VALUES(?,?,'active',?,?,?,?)",bindings:[subscriptionId,customer.id,shared.method,shared.nextDate,shared.purchasedAt,shippingJson]},
      {sql:"INSERT INTO orders(id,order_number,customer_id,subscription_id,kind,payment_method,payment_status,fulfillment_status,delivery_date,subtotal_minor,discount_minor,delivery_fee_minor,total_minor,idempotency_key,created_at,updated_at,source_json,shipping_json) VALUES(?,?,?,?,'subscription_invoice',?,'paid','planned',?,?,?,?,?,?,?,?,?,?)",bindings:[id,`IMPORT-${sourceOrder}`.slice(0,100),customer.id,subscriptionId,shared.method,shared.nextDate,gross,gross+shared.deliveryMinor-shared.totalMinor,shared.deliveryMinor,shared.totalMinor,id,shared.purchasedAt,now,JSON.stringify({importBatch:batchId,externalOrderId:sourceOrder,originalAdvance:shared.invoice}),shippingJson]},
      {sql:'INSERT INTO subscription_packages(id,order_id,subscription_id) VALUES(?,?,?)',bindings:[id,id,subscriptionId]});
    for(const l of lines){statements.push({sql:'INSERT INTO order_items(id,order_id,product_id,product_name,unit_label,quantity,unit_price_minor,line_total_minor,purchase_type,cadence,fiscal_tax_label) VALUES(?,?,?,?,?,?,?,?,?,?,?)',bindings:[l.id,id,l.productId,l.name,l.unit,l.quantity,l.unitPrice,l.unitPrice*l.quantity*l.occurrences,l.cadence==='one_time'?'one_time':'subscription',l.cadence==='one_time'?null:l.cadence,l.label]},
      {sql:'INSERT INTO package_lines(id,package_id,order_item_id,required_deliveries,anchor_date,imported_delivered_quantity) VALUES(?,?,?,?,?,?)',bindings:[l.id,id,l.id,l.occurrences,shared.nextDate,l.delivered]});
      if(l.cadence!=='one_time')statements.push({sql:"INSERT INTO subscription_items(id,subscription_id,product_id,quantity,cadence,cadence_anchor_date,status) VALUES(?,?,?,?,?,?,'active')",bindings:[l.id,subscriptionId,l.productId,l.quantity,l.cadence,shared.nextDate]});
      summary.purchasedUnits+=l.quantity*l.occurrences;summary.deliveredUnits+=l.delivered;summary.remainingUnits+=l.quantity*l.occurrences-l.delivered;
    }
    const receiptId=`receipt:${id}:advance`;
    statements.push({sql:"INSERT INTO fiscal_receipts(id,order_id,operation_key,kind,status,provider,invoice_number,provider_reference,pfr_time,issued_at) VALUES(?,?,?,'advance','issued','fiscomm',?,?,?,?)",bindings:[receiptId,id,receiptId,shared.invoice,shared.invoice,shared.invoiceTime,shared.invoiceTime]},
      {sql:'INSERT INTO fiscal_order_snapshots(order_id,snapshot_json) VALUES(?,?)',bindings:[id,JSON.stringify(snapshot)]});
    summary.paidMinor+=shared.totalMinor;summary.remainingMinor+=remaining;
  }catch(error){errors.push({order:sourceOrder,message:error.message});}}
  const approvalHash=digest({sourceHash,summary});
  return {...summary,approvalHash,errors,statements:errors.length?[]:statements};
}

export async function applyCustomerImport(plan,{db,approvedHash}) {
  check(!plan.errors?.length,'Prvo otklonite greške iz probnog uvoza.');
  if(plan.alreadyImported)return plan;
  check(approvedHash===plan.approvalHash,'approved-hash mora odgovarati pregledanom izveštaju.');
  const {statements,errors,...summary}=plan;void errors;
  await db.batch([{sql:"INSERT INTO idempotency_keys(id,namespace,key,request_hash,response_json,status_code,expires_at) VALUES(?,'customer-import',?,?,?,200,?)",bindings:[idFor(plan.batchId,'batch',plan.batchId),plan.batchId,plan.sourceHash,JSON.stringify(summary),'2099-12-31T00:00:00Z']},...statements,
    {sql:"INSERT INTO audit_log(id,actor_type,actor_id,action,entity_type,entity_id,after_json) VALUES(?,'admin','customer-import','customers.imported','import_batch',?,?)",bindings:[idFor(plan.batchId,'audit',plan.batchId),plan.batchId,JSON.stringify(summary)]}]);
  return {...summary,applied:true};
}
