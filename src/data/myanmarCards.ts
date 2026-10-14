// The Myanmar map's Chance and News cards (owner's spec, section 8), in English and Burmese. Each
// card states its exact effect. Cards arrive with the rules they need: stage 1 has these; the
// conscription, merit, company, lottery and pot cards follow in later stages (D101 to D104).
import type { CardData } from './cardTypes.js';

export const MYANMAR_CHANCE: readonly CardData[] = [
  {
    id: 'mm-chance-call-up',
    deck: 'chance',
    title: 'On the conscription list',
    titleMy: 'ရပ်ကွက်ကနေ စစ်မှုထမ်း စာရင်းတင်လိုက်ပြီ',
    text: 'Your ward put your name forward. Go straight to the Military camp. Do not collect 500 lakh.',
    textMy: 'ရပ်ကွက်က သင့်နာမည်ကို စာရင်းတင်လိုက်ပြီ။ စစ်မှုထမ်းစခန်းသို့ တန်းသွားပါ။ ၅၀၀ သိန်း မရပါ။',
    icon: 'jail',
    tone: 'bad',
    effect: { type: 'goToJail' },
  },
  {
    id: 'mm-chance-exemption',
    deck: 'chance',
    title: 'Call-up exemption',
    titleMy: 'ခေါ်စာ ကင်းလွတ်ခွင့် ရတယ်',
    text: 'Keep this card. Use it to leave the Military camp at once, or trade it.',
    textMy: 'ဒီကတ်ကို သိမ်းထားပါ။ စစ်မှုထမ်းစခန်းက ချက်ချင်း လွတ်ဖို့ သုံးနိုင်သလို ရောင်းဝယ်လဲလှယ်လည်း ရပါတယ်။',
    icon: 'pass',
    tone: 'good',
    effect: { type: 'getOutOfJail' },
  },
  {
    id: 'mm-chance-traffic',
    deck: 'chance',
    title: 'Yangon traffic jam',
    titleMy: 'ရန်ကုန် ယာဉ်ကြောပိတ်',
    text: 'The road ahead is blocked. Move back 3 spaces.',
    textMy: 'ရှေ့လမ်း ပိတ်နေတယ်။ ၃ ကွက် နောက်ပြန်ဆုတ်ပါ။',
    icon: 'route',
    tone: 'bad',
    effect: { type: 'move', steps: -3 },
  },
  {
    id: 'mm-chance-hospital',
    deck: 'chance',
    title: 'Hospital bill',
    titleMy: 'ဆေးရုံစရိတ်',
    text: 'An unexpected stay in hospital. Pay 200 lakh.',
    textMy: 'မမျှော်လင့်ဘဲ ဆေးရုံတက်ရတယ်။ ၂၀၀ သိန်း ပေးပါ။',
    icon: 'medical',
    tone: 'bad',
    effect: { type: 'cash', amount: -200 },
  },
  {
    id: 'mm-chance-airport',
    deck: 'chance',
    title: 'Fly from the nearest airport',
    titleMy: 'အရှေ့ဆုံး လေဆိပ်သို့ သွား',
    text: 'Move forward to the nearest airport. If someone owns it, pay twice the rent. Collect 500 lakh if you pass Start.',
    textMy: 'ရှေ့ဆုံး လေဆိပ်သို့ သွားပါ။ ပိုင်ရှင်ရှိရင် ငှားခ ၂ ဆ ပေးရမယ်။ Start ဖြတ်ရင် ၅၀၀ သိန်း ရမယ်။',
    icon: 'flight',
    tone: 'neutral',
    effect: { type: 'moveTo', target: { kind: 'nearestAirport' }, rentFactor: 2 },
  },
  {
    id: 'mm-chance-start',
    deck: 'chance',
    title: 'Back to Start',
    titleMy: 'Start သို့ ပြန်သွား',
    text: 'Move forward to Start and collect 500 lakh.',
    textMy: 'Start သို့ သွားပြီး ၅၀၀ သိန်း ယူပါ။',
    icon: 'start',
    tone: 'good',
    effect: { type: 'moveTo', target: { kind: 'space', index: 0 } },
  },
];

export const MYANMAR_NEWS: readonly CardData[] = [
  {
    id: 'mm-event-tourism',
    deck: 'event',
    title: 'Tourist season',
    titleMy: 'ခရီးသွား ရာသီ',
    text: 'Rakhine and Shan city rents are doubled until your next turn.',
    textMy: 'နောက်တစ်ကြိမ် သင့်အလှည့် မရောက်မချင်း ရခိုင်နဲ့ ရှမ်း မြို့တွေရဲ့ ငှားခ ၂ ဆ။',
    icon: 'camera',
    tone: 'neutral',
    effect: { type: 'groupRent', groups: ['mmRakhine', 'mmShan'], factor: 2 },
  },
  {
    id: 'mm-event-rice',
    deck: 'event',
    title: 'Rice prices climb',
    titleMy: 'ဆန်ဈေး တက်',
    text: 'Delta city rents are doubled until your next turn.',
    textMy: 'နောက်တစ်ကြိမ် သင့်အလှည့် မရောက်မချင်း မြစ်ဝကျွန်းပေါ် မြို့တွေရဲ့ ငှားခ ၂ ဆ။',
    icon: 'rice',
    tone: 'neutral',
    effect: { type: 'groupRent', groups: ['mmDelta'], factor: 2 },
  },
  {
    id: 'mm-event-border',
    deck: 'event',
    title: 'Border trade closed',
    titleMy: 'နယ်စပ် ကုန်သွယ်မှု ပိတ်',
    text: 'The Muse Border Gate earns nothing until your next turn.',
    textMy: 'နောက်တစ်ကြိမ် သင့်အလှည့် မရောက်မချင်း မူဆယ် နယ်စပ်ဂိတ် ဝင်ငွေ မရ။',
    icon: 'truck',
    tone: 'neutral',
    effect: { type: 'transportClosed', kind: 'border' },
  },
];

/** Every Myanmar card by id. */
export const MYANMAR_CARD_BY_ID: ReadonlyMap<string, CardData> = new Map([...MYANMAR_CHANCE, ...MYANMAR_NEWS].map((c) => [c.id, c]));
