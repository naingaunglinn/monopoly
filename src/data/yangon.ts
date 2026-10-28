// The Yangon map (owner's request, D116): the Myanmar map's 48-space board and rules, with Yangon
// townships, Yangon transport and Yangon pagodas, and Burmese only (both name fields hold the Burmese
// name). Indices, prices and the five companies are the Myanmar map's, so its rules and balance hold.
import type { CountryData } from './countries.js';
import { MYANMAR_TRANSPORT, type MyanmarCity, type MyanmarTransport, type TempleData } from './myanmar.js';

export type YangonGroupId =
  | 'ygnEdge'
  | 'ygnNorth'
  | 'ygnEast'
  | 'ygnPort'
  | 'ygnDowntown'
  | 'ygnWest'
  | 'ygnMiddle'
  | 'ygnLake'
  | 'ygnPrime';

const group = (id: YangonGroupId, name: string, colorName: string, color: string): CountryData => ({
  id,
  name,
  nameMy: name,
  colorName,
  color,
  flag: null,
  at: [96.16, 16.84],
});

/** The nine areas in board order; the Myanmar map's band colours in the same order. */
export const YANGON_GROUPS: readonly CountryData[] = [
  group('ygnEdge', 'မြို့စွန်', 'Teak brown', '#7C5A3A'),
  group('ygnNorth', 'မြောက်ပိုင်း', 'Jade green', '#2E7D5B'),
  group('ygnEast', 'အရှေ့ပိုင်း', 'Dry-zone ochre', '#C9842B'),
  group('ygnPort', 'ဆိပ်ကမ်း', 'Bay blue', '#2F6FB0'),
  group('ygnDowntown', 'မြို့လယ်', 'Andaman teal', '#13857A'),
  group('ygnWest', 'အနောက်ပိုင်း', 'Paddy green', '#6F9B2F'),
  group('ygnMiddle', 'အလယ်ပိုင်း', 'Inle violet', '#8A5BC4'),
  group('ygnLake', 'ကန်ဘေး', 'Palace red', '#B23A2E'),
  group('ygnPrime', 'အထက်တန်းရပ်ကွက်', 'Pagoda gold', '#D4A017'),
];

const city = (
  space: number,
  name: string,
  country: YangonGroupId,
  price: number,
  houseCost: number,
  at: readonly [number, number],
): MyanmarCity => ({ space, name, nameMy: name, country: country as never, price, baseRent: price / 10, houseCost, at });

/** The 25 townships, at the Myanmar map's spaces and prices. */
export const YANGON_CITIES: readonly MyanmarCity[] = [
  city(1, 'ဒလ', 'ygnEdge', 60, 50, [96.17, 16.76]),
  city(3, 'ရွှေပြည်သာ', 'ygnEdge', 90, 50, [96.08, 17.0]),
  city(5, 'လှိုင်သာယာ', 'ygnNorth', 130, 50, [96.06, 16.87]),
  city(7, 'မင်္ဂလာဒုံ', 'ygnNorth', 160, 50, [96.13, 16.95]),
  city(8, 'အင်းစိန်', 'ygnNorth', 190, 50, [96.1, 16.89]),
  city(11, 'သာကေတ', 'ygnEast', 230, 100, [96.2, 16.8]),
  city(13, 'မြောက်ဥက္ကလာပ', 'ygnEast', 260, 100, [96.17, 16.91]),
  city(15, 'မြောက်ဒဂုံ', 'ygnEast', 290, 100, [96.19, 16.88]),
  city(17, 'ဆိပ်ကမ်းသာ', 'ygnPort', 330, 100, [96.16, 16.77]),
  city(19, 'ပုဇွန်တောင်', 'ygnPort', 370, 100, [96.18, 16.78]),
  city(21, 'လမ်းမတော်', 'ygnDowntown', 410, 150, [96.15, 16.78]),
  city(23, 'တရုတ်တန်း', 'ygnDowntown', 440, 150, [96.15, 16.77]),
  city(25, 'ကျောက်တံတား', 'ygnDowntown', 470, 150, [96.16, 16.77]),
  city(27, 'ကြည့်မြင်တိုင်', 'ygnWest', 500, 150, [96.13, 16.8]),
  city(29, 'လှိုင်', 'ygnWest', 530, 150, [96.12, 16.85]),
  city(30, 'ကမာရွတ်', 'ygnWest', 560, 150, [96.13, 16.83]),
  city(33, 'တာမွေ', 'ygnMiddle', 590, 200, [96.18, 16.81]),
  city(35, 'ရန်ကင်း', 'ygnMiddle', 620, 200, [96.17, 16.84]),
  city(37, 'မရမ်းကုန်း', 'ygnMiddle', 650, 200, [96.14, 16.87]),
  city(39, 'စမ်းချောင်း', 'ygnLake', 680, 200, [96.14, 16.81]),
  city(41, 'ဗဟန်း', 'ygnLake', 710, 200, [96.16, 16.81]),
  city(42, 'ကမ္ဘာအေး', 'ygnLake', 740, 200, [96.16, 16.85]),
  city(45, 'အင်းယားလမ်း', 'ygnPrime', 770, 250, [96.15, 16.83]),
  city(46, 'ကန်တော်ကြီးဘေး', 'ygnPrime', 800, 250, [96.17, 16.8]),
  city(47, 'ဂိုလ်ဒင်ဗယ်လီ', 'ygnPrime', 830, 250, [96.15, 16.82]),
];

const transport = (space: number, name: string, shortName: string, kind: MyanmarTransport['kind']): MyanmarTransport => {
  const from = MYANMAR_TRANSPORT.find((t) => t.space === space) as MyanmarTransport;
  return { ...from, name, shortName, nameMy: name, shortNameMy: shortName, kind, toll: kind !== 'airport' };
};

/**
 * The four transport spaces at the Myanmar map's spaces and prices. The Circle Line and the airport
 * count as airports (the nearest-airport card), YBS as a road and the Dala ferry as the crossing
 * the "closed" news card stops; the last two charge the toll.
 */
export const YANGON_TRANSPORT: readonly MyanmarTransport[] = [
  transport(4, 'ရန်ကုန် မြို့ပတ်ရထား', 'မြို့ပတ်ရထား', 'airport'),
  transport(16, 'YBS ဘတ်စ်ကား', 'YBS', 'road'),
  transport(26, 'ရန်ကုန် လေဆိပ်', 'လေဆိပ်', 'airport'),
  transport(38, 'ဒလ ဖယ်ရီ', 'ဒလဖယ်ရီ', 'border'),
];

/** The three pagodas: the Myanmar map's ids, so merit works the same. */
export const YANGON_TEMPLES: Readonly<Record<number, TempleData>> = {
  6: { id: 'shwedagon', name: 'ရွှေတိဂုံဘုရား', nameMy: 'ရွှေတိဂုံဘုရား', at: [96.15, 16.8] },
  22: { id: 'kyaiktiyo', name: 'ဆူးလေဘုရား', nameMy: 'ဆူးလေဘုရား', at: [96.16, 16.77] },
  32: { id: 'mahamuni', name: 'ဗိုလ်တထောင်ဘုရား', nameMy: 'ဗိုလ်တထောင်ဘုရား', at: [96.17, 16.77] },
};
