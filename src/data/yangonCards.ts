// The Yangon map's cards (owner's request, D116): Chance is the fortune teller's deck, News is what
// happens in the ward. Burmese only: both text fields hold the Burmese. Effects are the Myanmar map's
// effect types; companies and groups are the Yangon board's.
import { MYANMAR } from './balance.js';
import type { CardData, CardEffect, CardIcon, CardTone, DeckId } from './cardTypes.js';

const card = (deck: DeckId, id: string, title: string, text: string, icon: CardIcon, tone: CardTone, effect: CardEffect): CardData => ({
  id: `ygn-${deck}-${id}`,
  deck,
  title,
  titleMy: title,
  text,
  textMy: text,
  icon,
  tone,
  effect,
});

/** ဗေဒင်ဆရာ ကတ် (Chance). */
export const YANGON_CHANCE: readonly CardData[] = [
  card('chance', 'teams', 'Boss က Teams မှာ "Urgent!!" ပို့လာပြီ', 'OT ကွက်သို့ တန်းသွားပါ။ လစာထုတ်ရက် ဖြတ်သွားပေမဲ့ ၇၅၀ သိန်း မရပါ။', 'jail', 'bad', { type: 'goToJail' }),
  card('chance', 'sick-leave', 'ဆေးခွင့်လက်မှတ်', 'ဒီကတ်ကို သိမ်းထားပါ။ OT က ချက်ချင်း ထွက်ဖို့ သုံးနိုင်သလို ရောင်းဝယ်လဲလှယ်လည်း ရပါတယ်။', 'pass', 'good', { type: 'getOutOfJail' }),
  card('chance', 'friday', 'Friday ညနေ ၄:၅၉ မှာ Meeting ခေါ်တယ်', '၂၀၀ သိန်း ပေးပြီး ခွင့်တိုင်ပြန်မလား။ မပေးရင် OT ဆင်းရမယ်။', 'business', 'bad', { type: 'broker', amount: 200 }),
  card('chance', 'yadaya', 'ဗေဒင်ဆရာက ယတြာချေခိုင်းတယ်', 'နောက်ကို ၃ ကွက် ပြန်ဆုတ်ပါ။', 'route', 'bad', { type: 'move', steps: -3 }),
  card('chance', 'golden-valley', 'ဗေဒင်ဆရာက "အရှေ့မြောက်က ကံကောင်းတယ်" တဲ့', 'ဂိုလ်ဒင်ဗယ်လီသို့ တန်းသွားပါ။ လစာထုတ်ရက် ဖြတ်ရင် ၇၅၀ သိန်း ရမယ်။', 'map', 'neutral', { type: 'moveTo', target: { kind: 'space', index: 47 } }),
  card('chance', 'grab', 'Grab ခေါ်တာ surge ဈေးကျနေတယ်', 'ရှေ့ဆုံး မြို့ပတ်ရထား ဒါမှမဟုတ် လေဆိပ်သို့ သွားပါ။ ပိုင်ရှင်ရှိရင် ငှားခ ၂ ဆ ပေးရမယ်။ လစာထုတ်ရက် ဖြတ်ရင် ၇၅၀ သိန်း ရမယ်။', 'route', 'neutral', { type: 'moveTo', target: { kind: 'nearestAirport' }, rentFactor: 2 }),
  card('chance', 'ybs', 'YBS မှားစီးမိတယ်', 'ရွှေပြည်သာ ရောက်သွားပြီ။ လစာထုတ်ရက် ဖြတ်ရင် ၇၅၀ သိန်း ရမယ်။', 'truck', 'neutral', { type: 'moveTo', target: { kind: 'space', index: 3 } }),
  card('chance', '19th-street', 'ဆယ့်ကိုးလမ်း ဘီယာဆိုင် ချိန်းထားတယ်', 'တရုတ်တန်းသို့ သွားပါ။ လစာထုတ်ရက် ဖြတ်ရင် ၇၅၀ သိန်း ရမယ်။', 'dinner', 'neutral', { type: 'moveTo', target: { kind: 'space', index: 23 } }),
  card('chance', 'payday', 'လစာထုတ်ရက် ရောက်ပြီ', 'လစာထုတ်ရက်သို့ သွားပြီး ၇၅၀ သိန်း ယူပါ။', 'start', 'good', { type: 'moveTo', target: { kind: 'space', index: 0 } }),
  card('chance', 'jlpt', 'JLPT N3 အောင်ပြီ', 'ဂျပန်က အလုပ်ကမ်းလှမ်းလာတယ်။ ၃၀၀ သိန်း ရမယ်။', 'trendUp', 'good', { type: 'cash', amount: 300 }),
  card('chance', 'mala', 'Mala ဆိုင်ဖွင့်တာ ၃ လနဲ့ ပိတ်လိုက်ရတယ်', '၃၀၀ သိန်း ဆုံးပါတယ်။', 'trendDown', 'bad', { type: 'cash', amount: -300 }),
  card('chance', 'cash-only', '"Pay နဲ့ပေးမယ်" ဆိုတော့ Cash ပဲယူတယ်တဲ့', 'ငွေထုတ်ခ ၅၀ သိန်း ပေးပါ။', 'moneyOut', 'bad', { type: 'cash', amount: -50 }),
  card('chance', 'flood', 'မိုးသည်းလို့ လမ်းပေါ် ရေလျှံနေတယ်', 'ဆိုက်ကားငှားပြီး ရှေ့ ၂ ကွက် တိုးပါ။', 'storm', 'neutral', { type: 'move', steps: 2 }),
  card('chance', 'lottery', 'ထီထိုးမလား?', '၁၀ သိန်း ပေးပြီး ထီထိုးရင် အန်စာ ၂ လုံး လှိမ့်မယ်။ ၁၂ ဆို ၃,၀၀၀ သိန်း၊ ၁၀ သို့မဟုတ် ၁၁ ဆို ၅၀၀၊ ၇ မှ ၉ ဆို ၁၀၀၊ ၂ မှ ၆ ဆို ဘာမှ မရ။ မထိုးလည်း ရတယ်။', 'dice', 'neutral', { type: 'lottery', ticket: MYANMAR.lotteryTicket }),
  card('chance', 'pagoda', 'ရွှေတိဂုံ ဘုရားပွဲ လှူတယ်', '၁၀၀ သိန်း လှူပြီး ကုသိုလ် ၁ မှတ် ရမယ်။ ကုသိုလ် အများဆုံး ၃ မှတ်ပဲ သိမ်းလို့ရတယ်။', 'gift', 'neutral', { type: 'meritFee', amount: MYANMAR.festivalDonation }),
  card('chance', 'team-dinner', 'ရုံး Team dinner ဘေလ်ခွဲ', 'ကစားသူတိုင်း Brycen Myanmar ပိုင်ရှင်ကို ၁၀၀ သိန်းစီ ပေးရမယ်။ ဘယ်သူမှ မပိုင်သေးရင် ၁၀၀ သိန်းစီ အိုးထဲ ထည့်ရမယ်။', 'dinner', 'neutral', { type: 'companyRescue', company: 'brycen', amount: MYANMAR.brycenRescue }),
];

/** ရပ်ကွက်ထဲက ကတ် (News). */
export const YANGON_NEWS: readonly CardData[] = [
  card('event', 'fb-live', 'FB Live ရောင်းတာ ပွင့်သွားပြီ!', 'ကစားသူတိုင်းက "CF" လို့ ပြောပြီး ၅၀ သိန်းစီ ပေးရမယ်။', 'camera', 'good', { type: 'cashPerPlayer', amount: 50 }),
  card('event', 'weddings', 'မင်္ဂလာဆောင်ဖိတ်စာ ၃ စောင် တစ်ပြိုင်နက် ရောက်လာတယ်', 'လက်ဖွဲ့ ၂၅၀ သိန်း ပေးပါ။', 'gift', 'bad', { type: 'cash', amount: -250 }),
  card('event', 'birthday', 'မွေးနေ့ ရောက်ပြီ', 'ကစားသူတိုင်းဆီက ၂၅ သိန်းစီ ရမယ်။', 'gift', 'good', { type: 'cashPerPlayer', amount: 25 }),
  card('event', 'teashop', 'လက်ဖက်ရည်ဆိုင်ဝိုင်း မင်းရှင်းရမယ်', 'ကစားသူတိုင်းကို ၂၅ သိန်းစီ ပေးပါ။', 'dinner', 'bad', { type: 'cashPerPlayer', amount: -25 }),
  card('event', 'kpay', 'အမေ KPay နဲ့ မုန့်ဖိုးလွှဲလိုက်တယ်', '၃၀၀ သိန်း ရမယ်။', 'moneyIn', 'good', { type: 'cash', amount: 300 }),
  card('event', 'appraisal', 'Appraisal ကောင်းလို့ လစာတိုးပြီ', '၂၅၀ သိန်း ရမယ်။', 'trendUp', 'good', { type: 'cash', amount: 250 }),
  card('event', 'tuition', 'ကျူရှင်တွေ ပြည့်နေတယ်', '၂၀၀ သိန်း ရမယ်။', 'business', 'good', { type: 'cash', amount: 200 }),
  card('event', 'mlbb', 'MLBB diamond ဝယ်လိုက်တယ်', '၁၀၀ သိန်း ဆုံးပါတယ်။', 'moneyOut', 'bad', { type: 'cash', amount: -100 }),
  card('event', 'junction', 'Junction City မှာ Sale ဖြစ်နေတယ်', '၁၅၀ သိန်း ကုန်သွားပြီ။', 'moneyOut', 'bad', { type: 'cash', amount: -150 }),
  card('event', 'water', 'ရပ်ကွက်ထဲ ရေမလာလို့ ရေဘောက်ဆာ ဝယ်ရတယ်', '၇၅ သိန်း ပေးပါ။', 'moneyOut', 'bad', { type: 'cash', amount: -75 }),
  card('event', 'roof', 'မိုးရာသီ ရောက်လို့ အမိုးယိုတယ်', 'အိမ်တစ်လုံး ၅၀ သိန်း၊ ဟိုတယ်တစ်လုံး ၁၅၀ သိန်း ပြင်ဆင်ခ ပေးပါ။', 'construction', 'bad', { type: 'perBuildingFee', house: 50, hotel: 150 }),
  card('event', 'blackout', 'မီးပျက်ပြီ!', 'နောက်တစ်ကြိမ် သင့်အလှည့် မရောက်မချင်း မြို့နယ်အားလုံး ငှားခ တစ်ဝက် ကျပြီး YESC ဝင်ငွေ ၂ ဆ ရမယ်။', 'power', 'neutral', { type: 'blackout', cityFactor: MYANMAR.blackoutCityFactor, company: 'yesc', companyFactor: MYANMAR.blackoutCompanyFactor }),
  card('event', 'no-data', 'ဖုန်းဒေတာ ပြတ်သွားပြီ', 'နောက်တစ်ကြိမ် သင့်အလှည့် မရောက်မချင်း MPT ပိုင်သူ တစ်ယောက်ပဲ ရောင်းဝယ်လဲလှယ်ဖို့ ကမ်းလှမ်းလို့ ရမယ်။', 'telecom', 'neutral', { type: 'noTrade', company: 'mpt' }),
  card('event', 'fuel', 'ဆီဆိုင်မှာ တန်းစီရတယ်', 'Denko ပိုင်သူနဲ့ OT ဆင်းနေသူတွေ မှလွဲ၍ ကစားသူတိုင်း နောက်အလှည့် တစ်ခု ကျော်ရမယ်။', 'oil', 'neutral', { type: 'fuelShortage', company: 'denko' }),
  card('event', 'dollar', 'ဒေါ်လာဈေး တက်ပြီ', 'အခုကစပြီး မြို့နယ်ငှားခတွေ ၁၀% တက်မယ်။ KBZ ဘဏ် ပိုင်သူက ငှားခ ပေးတဲ့အခါ ဖောင်းပွမှု မခံရ။', 'trendUp', 'neutral', { type: 'inflation', step: MYANMAR.inflationStep }),
  card('event', 'donation', 'ရပ်ကွက် ဆွမ်းကျွေး', 'ကစားသူတိုင်း ၅၀ သိန်းစီ အိုးထဲ ထည့်ရမယ်။', 'group', 'neutral', { type: 'potDonation', amount: MYANMAR.potDonation }),
  card('event', 'ferry', 'ဒလ ဖယ်ရီ ရပ်နားတယ်', 'နောက်တစ်ကြိမ် သင့်အလှည့် မရောက်မချင်း ဒလဖယ်ရီ ဝင်ငွေ မရ။', 'ship', 'neutral', { type: 'transportClosed', kind: 'border' }),
  card('event', 'thingyan', 'သင်္ကြန် ရောက်ပြီ', 'နောက်တစ်ကြိမ် သင့်အလှည့် မရောက်မချင်း မြို့လယ် မြို့နယ်တွေရဲ့ ငှားခ ၂ ဆ။', 'group', 'neutral', { type: 'groupRent', groups: ['ygnDowntown'], factor: 2 }),
  card('event', 'rent-up', 'အိမ်ရှင်တွေ အိမ်လခ တိုးကုန်ပြီ', 'နောက်တစ်ကြိမ် သင့်အလှည့် မရောက်မချင်း ကန်ဘေးနဲ့ အထက်တန်းရပ်ကွက် ငှားခ ၂ ဆ။', 'house', 'neutral', { type: 'groupRent', groups: ['ygnLake', 'ygnPrime'], factor: 2 }),
  card('event', 'karaoke', 'ဘေးအိမ်က ကာရာအိုကေ ညလုံးပေါက်ဆိုတယ်', 'အိပ်မရလို့ ကော်ဖီဖိုး ၃၀ သိန်း ပေးပါ။', 'bed', 'bad', { type: 'cash', amount: -30 }),
];

/** Every Yangon card by id. */
export const YANGON_CARD_BY_ID: ReadonlyMap<string, CardData> = new Map([...YANGON_CHANCE, ...YANGON_NEWS].map((c) => [c.id, c]));
