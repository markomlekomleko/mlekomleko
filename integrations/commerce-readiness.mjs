/** Configuration diagnostics only: never sends network requests or exposes credentials. */
export function commerceReadiness(env = {}) {
  const value = (key) => typeof env[key] === 'string' ? env[key].trim() : '';
  const paymentProvider = value('PAYMENT_PROVIDER') || 'disabled';
  const paymentMode = value('PAYMENT_MODE') || 'disabled';
  const fiscalMode = value('BADI_MODE') || 'mock';
  return {
    payment: {
      provider: paymentProvider, mode: paymentMode, cashAvailable: true,
      cardAvailable: false, recurringCardAvailable: false,
      status: 'not_connected',
      missing: [
        ...(paymentProvider === 'disabled' ? ['Izbor banke / provajdera kartičnog plaćanja.'] : []),
        'Potvrđen API ugovor za hosted checkout, tokenizaciju i mesečnu naplatu.',
        ...(['PAYMENT_MERCHANT_ID', 'PAYMENT_API_SECRET', 'PAYMENT_WEBHOOK_SECRET'].filter(key => !value(key)).map(key => `Serversko podešavanje ${key}.`)),
        'Implementacija adaptera izabranog provajdera i potvrđena sandbox transakcija.',
      ],
    },
    fiscalization: value('FISCAL_PROVIDER') === 'fiscomm' ? {provider: 'fiscomm', mode: value('FISCOMM_MODE') || 'disabled', status: 'verification_required', missing: [...(!value('FISCOMM_API_KEY') ? ['Serverski Fiscomm API ključ.'] : []), ...(value('FISCOMM_MODE') !== 'live' ? ['Aktivacija izdavanja nakon potvrde poreskih oznaka.'] : []), 'Poreske oznake svakog proizvoda i dostave potvrđene sa knjigovođom.', 'Proveren avans, zatvaranje avansa i konačni dokument u sandbox okruženju.']} : {
      provider: 'badi', mode: fiscalMode,
      status: ['sandbox', 'production'].includes(fiscalMode) ? 'verification_required' : 'not_connected',
      missing: [
        ...(!['sandbox', 'production'].includes(fiscalMode) ? ['Izbor i aktivacija stvarnog fiskalnog servisa; postojeći adapter je za Badi.'] : []),
        ...(['BADI_API_KEY', 'BADI_API_SECRET', 'BADI_CLIENT_ID'].filter(key => !value(key)).map(key => `Serversko podešavanje ${key}.`)),
        'Potvrđene šifre artikala, dostave i poreske oznake u fiskalnom servisu.',
        'Potvrđen tok avans → pojedinačne isporuke → konačni račun i refundacije za pretplate.',
        'Proveren stvarni broj računa, dokument i prijem kod kupca.',
      ],
    },
  };
}
