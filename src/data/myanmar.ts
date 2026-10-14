// The Myanmar map (owner's spec, D101): 48 spaces, nine regions of 25 cities, four transport
// spaces, four companies and three pagodas, priced in lakh of kyat. Every name is given in English
// and in Burmese. The World map's data is not touched; board.ts builds this map's layout.
import type { AirportData } from './airports.js';
import type { CityData } from './cities.js';
import type { CompanyData } from './companies.js';
import type { CountryData } from './countries.js';

export type MyanmarGroupId =
  | 'mmChin'
  | 'mmKachin'
  | 'mmAnyar'
  | 'mmRakhine'
  | 'mmSouth'
  | 'mmDelta'
  | 'mmShan'
  | 'mmMandalay'
  | 'mmYangon';

/** The nine regions in board order, with their band colours. */
export const MYANMAR_GROUPS: readonly CountryData[] = [
  { id: 'mmChin', name: 'Chin', nameMy: 'ချင်း', colorName: 'Teak brown', color: '#7C5A3A', flag: null, at: [93.6, 22.6] },
  { id: 'mmKachin', name: 'Kachin', nameMy: 'ကချင်', colorName: 'Jade green', color: '#2E7D5B', flag: null, at: [97.4, 25.4] },
  { id: 'mmAnyar', name: 'Anyar', nameMy: 'အညာ', colorName: 'Dry-zone ochre', color: '#C9842B', flag: null, at: [95.1, 22.1] },
  { id: 'mmRakhine', name: 'Rakhine', nameMy: 'ရခိုင်', colorName: 'Bay blue', color: '#2F6FB0', flag: null, at: [94.0, 19.0] },
  { id: 'mmSouth', name: 'Southern', nameMy: 'တောင်ပိုင်း', colorName: 'Andaman teal', color: '#13857A', flag: null, at: [98.2, 13.5] },
  { id: 'mmDelta', name: 'Delta', nameMy: 'မြစ်ဝကျွန်းပေါ်', colorName: 'Paddy green', color: '#6F9B2F', flag: null, at: [95.2, 17.2] },
  { id: 'mmShan', name: 'Shan', nameMy: 'ရှမ်း', colorName: 'Inle violet', color: '#8A5BC4', flag: null, at: [97.1, 21.5] },
  { id: 'mmMandalay', name: 'Mandalay', nameMy: 'မန္တလေး', colorName: 'Palace red', color: '#B23A2E', flag: null, at: [96.1, 21.5] },
  { id: 'mmYangon', name: 'Yangon', nameMy: 'ရန်ကုန်', colorName: 'Pagoda gold', color: '#D4A017', flag: null, at: [96.2, 16.85] },
];

/** A Myanmar city: the World city fields, its Burmese name and where it is (for the board art). */
export interface MyanmarCity extends CityData {
  nameMy: string;
  at: readonly [number, number];
}

const city = (
  space: number,
  name: string,
  nameMy: string,
  country: MyanmarGroupId,
  price: number,
  houseCost: number,
  at: readonly [number, number],
): MyanmarCity => ({ space, name, nameMy, country, price, baseRent: price / 10, houseCost, at });

/** The 25 cities, at their board index (spec section 6). Base rent is a tenth of the price. */
export const MYANMAR_CITIES: readonly MyanmarCity[] = [
  city(1, 'Falam', 'ဖလမ်း', 'mmChin', 60, 50, [93.68, 22.91]),
  city(3, 'Hakha', 'ဟားခါး', 'mmChin', 90, 50, [93.61, 22.64]),
  city(5, 'Putao', 'ပူတာအို', 'mmKachin', 130, 50, [97.4, 27.33]),
  city(7, 'Bhamo', 'ဗန်းမော်', 'mmKachin', 160, 50, [97.24, 24.27]),
  city(8, 'Myitkyina', 'မြစ်ကြီးနား', 'mmKachin', 190, 50, [97.39, 25.38]),
  city(11, 'Pakokku', 'ပခုက္ကူ', 'mmAnyar', 230, 100, [95.09, 21.33]),
  city(13, 'Monywa', 'မုံရွာ', 'mmAnyar', 260, 100, [95.13, 22.11]),
  city(15, 'Magway', 'မကွေး', 'mmAnyar', 290, 100, [94.94, 20.15]),
  city(17, 'Kyaukphyu', 'ကျောက်ဖြူ', 'mmRakhine', 330, 100, [93.55, 19.43]),
  city(19, 'Thandwe', 'သံတွဲ', 'mmRakhine', 370, 100, [94.36, 18.46]),
  city(21, 'Kawthaung', 'ကော့သောင်း', 'mmSouth', 410, 150, [98.55, 9.98]),
  city(23, 'Myeik', 'မြိတ်', 'mmSouth', 440, 150, [98.6, 12.44]),
  city(25, 'Mawlamyine', 'မော်လမြိုင်', 'mmSouth', 470, 150, [97.63, 16.49]),
  city(27, 'Hinthada', 'ဟင်္သာတ', 'mmDelta', 500, 150, [95.46, 17.65]),
  city(29, 'Pathein', 'ပုသိမ်', 'mmDelta', 530, 150, [94.73, 16.78]),
  city(30, 'Bago', 'ပဲခူး', 'mmDelta', 560, 150, [96.48, 17.34]),
  city(33, 'Lashio', 'လားရှိုး', 'mmShan', 590, 200, [97.75, 22.94]),
  city(35, 'Kalaw', 'ကလော', 'mmShan', 620, 200, [96.56, 20.63]),
  city(37, 'Taunggyi', 'တောင်ကြီး', 'mmShan', 650, 200, [97.03, 20.79]),
  city(39, 'Meiktila', 'မိတ္ထီလာ', 'mmMandalay', 680, 200, [95.86, 20.88]),
  city(41, 'Pyin Oo Lwin', 'ပြင်ဦးလွင်', 'mmMandalay', 710, 200, [96.46, 22.03]),
  city(42, 'Mandalay', 'မန္တလေး', 'mmMandalay', 740, 200, [96.08, 21.97]),
  city(45, 'North Okkalapa', 'မြောက်ဥက္ကလာပ', 'mmYangon', 770, 250, [96.17, 16.91]),
  city(46, 'North Dagon', 'မြောက်ဒဂုံ', 'mmYangon', 800, 250, [96.19, 16.88]),
  city(47, 'Bahan', 'ဗဟန်း', 'mmYangon', 830, 250, [96.16, 16.81]),
];

/** What a transport space is: rent and the Chance card's "nearest airport" go by kind. */
export type TransportKind = 'airport' | 'road' | 'border';

export interface MyanmarTransport extends AirportData {
  nameMy: string;
  shortNameMy: string;
  kind: TransportKind;
  /** Passing over it (not landing) costs a toll for its owner (stage 3, D104). */
  toll: boolean;
}

/** The four transport spaces, 200 lakh each (spec section 3). They play as airports. */
export const MYANMAR_TRANSPORT: readonly MyanmarTransport[] = [
  {
    space: 4,
    name: 'Yangon International Airport',
    shortName: 'Yangon Airport',
    nameMy: 'ရန်ကုန် အပြည်ပြည်ဆိုင်ရာ လေဆိပ်',
    shortNameMy: 'ရန်ကုန်လေဆိပ်',
    country: 'mmYangon',
    price: 200,
    kind: 'airport',
    toll: false,
  },
  {
    space: 16,
    name: 'Yangon–Mandalay Expressway',
    shortName: 'Expressway',
    nameMy: 'ရန်ကုန်–မန္တလေး အမြန်လမ်း',
    shortNameMy: 'အမြန်လမ်း',
    country: 'mmMandalay',
    price: 200,
    kind: 'road',
    toll: true,
  },
  {
    space: 26,
    name: 'Mandalay International Airport',
    shortName: 'Mandalay Airport',
    nameMy: 'မန္တလေး အပြည်ပြည်ဆိုင်ရာ လေဆိပ်',
    shortNameMy: 'မန္တလေးလေဆိပ်',
    country: 'mmMandalay',
    price: 200,
    kind: 'airport',
    toll: false,
  },
  {
    space: 38,
    name: 'Muse Border Gate',
    shortName: 'Muse Gate',
    nameMy: 'မူဆယ် နယ်စပ်ဂိတ်',
    shortNameMy: 'မူဆယ်ဂိတ်',
    country: 'mmShan',
    price: 200,
    kind: 'border',
    toll: true,
  },
];

export interface MyanmarCompany extends CompanyData {
  nameMy: string;
  shortNameMy: string;
}

/**
 * The four companies, 250 lakh each (spec section 4). Rent is the dice total times 25, 50, 100 or
 * 200 by how many of the four the owner holds (`multiplier` is the rate for one).
 */
export const MYANMAR_COMPANIES: readonly MyanmarCompany[] = [
  {
    space: 9,
    id: 'yesc',
    name: 'YESC (Yangon Electricity)',
    shortName: 'YESC',
    nameMy: 'YESC (ရန်ကုန်လျှပ်စစ်ဓာတ်အားပေးရေး)',
    shortNameMy: 'YESC',
    between: ['mmKachin', 'mmAnyar'],
    price: 250,
    multiplier: 25,
    icon: 'zap',
  },
  {
    space: 20,
    id: 'denko',
    name: 'Denko (fuel stations)',
    shortName: 'Denko',
    nameMy: 'Denko (ဓာတ်ဆီဆိုင်)',
    shortNameMy: 'Denko',
    between: ['mmRakhine', 'mmSouth'],
    price: 250,
    multiplier: 25,
    icon: 'fuel',
  },
  {
    space: 31,
    id: 'mpt',
    name: 'MPT (mobile network)',
    shortName: 'MPT',
    nameMy: 'MPT (မိုဘိုင်းကွန်ရက်)',
    shortNameMy: 'MPT',
    between: ['mmDelta', 'mmShan'],
    price: 250,
    multiplier: 25,
    icon: 'radio',
  },
  {
    space: 43,
    id: 'kbz',
    name: 'KBZ Bank',
    shortName: 'KBZ Bank',
    nameMy: 'KBZ ဘဏ်',
    shortNameMy: 'KBZ ဘဏ်',
    between: ['mmMandalay', 'mmYangon'],
    price: 250,
    multiplier: 25,
    icon: 'landmark',
  },
];

export type TempleId = 'shwedagon' | 'kyaiktiyo' | 'mahamuni';

export interface TempleData {
  id: TempleId;
  name: string;
  nameMy: string;
  at: readonly [number, number];
}

/** The three pagodas: landing there, a player may donate for merit (stage 2, D102). */
export const MYANMAR_TEMPLES: Readonly<Record<number, TempleData>> = {
  6: { id: 'shwedagon', name: 'Shwedagon Pagoda', nameMy: 'ရွှေတိဂုံဘုရား', at: [96.15, 16.8] },
  22: { id: 'kyaiktiyo', name: 'Kyaiktiyo Pagoda', nameMy: 'ကျိုက်ထီးရိုးဘုရား', at: [97.1, 17.48] },
  32: { id: 'mahamuni', name: 'Mahamuni Pagoda', nameMy: 'မဟာမုနိဘုရား', at: [96.08, 21.95] },
};

/**
 * The special spaces. The corners keep the World map's kinds so the turn flow stays the same:
 * the Military camp is the Jail corner, the Refuge the Vacation corner and Call-up letter the
 * Go To Jail corner, each with this map's own rules (D101).
 */
export const MYANMAR_SPECIALS: Readonly<Record<number, 'start' | 'chance' | 'event' | 'tax:income' | 'tax:luxury' | 'jail' | 'goToJail' | 'vacation' | 'temple'>> = {
  0: 'start',
  2: 'chance',
  6: 'temple',
  10: 'tax:income',
  12: 'jail',
  14: 'event',
  18: 'chance',
  22: 'temple',
  24: 'vacation',
  28: 'event',
  32: 'temple',
  34: 'chance',
  36: 'goToJail',
  40: 'event',
  44: 'tax:luxury',
};

/** Spaces on the Myanmar board: four corners and eleven spaces along every side. */
export const MYANMAR_SIZE = 48;
