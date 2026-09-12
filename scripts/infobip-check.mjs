// Offline readiness check. Never prints credentials, calls a provider, or sends a message.
const checks = [
  ['AUTH_MODE=provider', process.env.AUTH_MODE === 'provider'],
  ['AUTH_CODE_SECRET (at least 32 characters)', (process.env.AUTH_CODE_SECRET?.length ?? 0) >= 32],
  ['INFOBIP_BASE_URL (account HTTPS origin)', /^https:\/\/[a-z0-9-]+\.api\.infobip\.com\/?$/i.test(process.env.INFOBIP_BASE_URL ?? '')],
  ['EMAIL_MODE=provider', process.env.EMAIL_MODE === 'provider'],
  ['EMAIL_PROVIDER=infobip', process.env.EMAIL_PROVIDER === 'infobip'],
  ['EMAIL_API_KEY', Boolean(process.env.EMAIL_API_KEY)],
  ['EMAIL_FROM', Boolean(process.env.EMAIL_FROM && !process.env.EMAIL_FROM.includes('example.'))],
  ['WHATSAPP_MODE=provider', process.env.WHATSAPP_MODE === 'provider'],
  ['WHATSAPP_PROVIDER=infobip', process.env.WHATSAPP_PROVIDER === 'infobip'],
  ['WHATSAPP_API_KEY', Boolean(process.env.WHATSAPP_API_KEY)],
  ['WHATSAPP_SENDER_ID', /^\+?[1-9]\d{7,14}$/.test(process.env.WHATSAPP_SENDER_ID ?? '')],
  ['WHATSAPP_AUTH_TEMPLATE', Boolean(process.env.WHATSAPP_AUTH_TEMPLATE)],
  ['WHATSAPP_TEMPLATE_LANGUAGE', Boolean(process.env.WHATSAPP_TEMPLATE_LANGUAGE)],
];
for (const [name, ready] of checks) console.log(`${ready ? 'OK' : 'MISSING'} ${name}`);
console.log('Template approval, sender registration, DNS verification and actual delivery must be checked in the Infobip portal.');
console.log(`Optional order notifications: ${process.env.WHATSAPP_UPDATE_TEMPLATE && process.env.CRON_SECRET ? 'configured; verify template and scheduler' : 'not configured (WHATSAPP_UPDATE_TEMPLATE and CRON_SECRET needed)'}`);
process.exitCode = checks.every(([, ready]) => ready) ? 0 : 1;
