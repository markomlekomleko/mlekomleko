// Read-only local configuration check. Never contacts providers or prints secrets.
import nextEnv from '@next/env';
import {commerceReadiness} from '../integrations/commerce-readiness.mjs';
nextEnv.loadEnvConfig(process.cwd(),false,{info(){},error(){}});
const e=process.env,has=key=>Boolean(e[key]?.trim());
const readiness=commerceReadiness(e);
const checks={
  cashFirst:e.PAYMENT_MODE==='disabled'&&(!e.PAYMENT_PROVIDER||e.PAYMENT_PROVIDER==='disabled'),
  persistentDatabase:Boolean(e.POSTGRES_URL||e.POSTGRES_PRISMA_URL||/^(libsql|https|postgres):/.test(e.TURSO_DATABASE_URL||e.DATABASE_URL||'')),
  productionOrigin:/^https:\/\//.test(e.APP_ORIGIN||''),
  resend:e.EMAIL_MODE==='provider'&&e.EMAIL_PROVIDER==='resend'&&has('EMAIL_API_KEY')&&has('EMAIL_FROM'),
  replyTo:has('EMAIL_REPLY_TO'),
  emailDeliveryWebhook:has('RESEND_WEBHOOK_SECRET'),
  admin:has('ADMIN_EMAIL')&&has('ADMIN_PASSWORD'),
  scheduledJobs:has('CRON_SECRET'),
  liveFiscal:e.FISCAL_PROVIDER==='fiscomm'&&e.FISCOMM_MODE==='live'&&has('FISCOMM_API_KEY')&&has('FISCOMM_DELIVERY_TAX_LABEL'),
};
console.log(JSON.stringify({configurationOnly:true,source:'local_environment_not_hosting',checks,cards:readiness.payment.status,fiscal:readiness.fiscalization.status,
  manualChecks:['DNS pošiljaoca verifikovan u Resend-u','Kod, potvrda porudžbine i podsetnik primljeni u stvarnom test sandučetu; odgovor stiže na potvrđeni Reply-To','Fiskalni tok potvrđen izvan treninga','Rezervna kopija i migracije produkcije proverene','Marko prihvatio sadržaj, fotografije i probni radni dan','Tek potom domen i obaveštenje kupcima']},null,2));
process.exitCode=Object.values(checks).every(Boolean)?0:1;
