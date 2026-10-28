// The language of the Myanmar map's names and card texts (spec 7.6, D101): a choice made on each
// device. The engine and the server never set it, so they always use English.
export type Lang = 'en' | 'my';

let current: Lang = 'en';
/** The Yangon map reads in Burmese only, whatever the device chose (D116); board.ts sets it. */
let forced = false;

export function setLanguage(lang: Lang): void {
  current = lang === 'my' ? 'my' : 'en';
}

export function setForcedBurmese(on: boolean): void {
  forced = on;
}

export function language(): Lang {
  return forced ? 'my' : current;
}

/** The Burmese form when the language is Burmese and there is one, else the English. */
export function pick(en: string, my: string | undefined): string {
  return language() === 'my' && my ? my : en;
}

const BURMESE_DIGITS = ['၀', '၁', '၂', '၃', '၄', '၅', '၆', '၇', '၈', '၉'];

/** 1,250 in Burmese digits: ၁,၂၅၀. */
export function burmeseDigits(text: string): string {
  return text.replace(/[0-9]/g, (d) => BURMESE_DIGITS[Number(d)] as string);
}
