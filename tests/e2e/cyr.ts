import { translate } from "../../app/lib/i18n/translate";

// The storefront default is Serbian Cyrillic (docs/sastanak-2026-11-17.md). Specs keep the
// Latin source wording, which is what the catalog is keyed on, and pass it through the
// same translator the app uses so selectors always match the rendered text.
export const cyr = (text: string) => translate(text, "sr-cyrl");
