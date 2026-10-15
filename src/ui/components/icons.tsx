// One bundled interface icon set (lucide-react). Card and space icons map semantic keys to icons.
import {
  Banknote,
  BedDouble,
  Briefcase,
  Camera,
  CircleParking,
  CloudLightning,
  Construction,
  Dices,
  Flag as FlagIcon,
  Fuel,
  Gift,
  Globe,
  HandCoins,
  HeartPulse,
  House,
  IdCard,
  Landmark,
  LockKeyhole,
  Luggage,
  Map as MapIcon,
  Newspaper,
  Plane,
  Radio,
  Receipt,
  Gem,
  Route,
  ShieldAlert,
  Ship,
  Ticket,
  TrainFront,
  TreePalm,
  TrendingDown,
  TrendingUp,
  Truck,
  Users,
  Utensils,
  Wheat,
  Zap,
  Coffee,
  Cpu,
  Tent,
  Mail,
  Trees,
  Milestone,
  Fence,
  createLucideIcon,
  type LucideIcon,
} from 'lucide-react';
import { MAP, type SpaceData } from '../../data/board';
import type { MyanmarTransport } from '../../data/myanmar';
import type { CardIcon } from '../../data/cardTypes';
import type { CompanyIcon } from '../../data/companies';

export const CARD_ICONS: Record<CardIcon, LucideIcon> = {
  moneyIn: HandCoins,
  moneyOut: Banknote,
  flight: Plane,
  luggage: Luggage,
  route: Route,
  train: TrainFront,
  ship: Ship,
  house: House,
  vacation: TreePalm,
  jail: LockKeyhole,
  pass: IdCard,
  group: Users,
  dinner: Utensils,
  gift: Gift,
  trendUp: TrendingUp,
  trendDown: TrendingDown,
  oil: Fuel,
  power: Zap,
  rice: Wheat,
  telecom: Radio,
  finance: Landmark,
  construction: Construction,
  medical: HeartPulse,
  tax: Receipt,
  business: Briefcase,
  globe: Globe,
  storm: CloudLightning,
  bed: BedDouble,
  dice: Dices,
  start: FlagIcon,
  camera: Camera,
  map: MapIcon,
  truck: Truck,
};

export const COMPANY_ICONS: Record<CompanyIcon, LucideIcon> = {
  truck: Truck,
  fuel: Fuel,
  ship: Ship,
  zap: Zap,
  globe: Globe,
  radio: Radio,
  wheat: Wheat,
  landmark: Landmark,
  cpu: Cpu,
};

/**
 * A pagoda (the Myanmar map's three pagoda spaces): finial, spire, bell-shaped dome and three
 * terraces, drawn for this game on lucide's 24-pixel grid with its stroke.
 */
export const Pagoda: LucideIcon = createLucideIcon('Pagoda', [
  ['path', { d: 'M12 2v3', key: 'finial' }],
  ['path', { d: 'm10.5 9 1.5-4 1.5 4', key: 'spire' }],
  ['path', { d: 'M8 14a4 5 0 0 1 8 0', key: 'dome' }],
  ['path', { d: 'M6 14h12', key: 'terrace1' }],
  ['path', { d: 'M5 17.5h14', key: 'terrace2' }],
  ['path', { d: 'M6 14 5 17.5 4 21h16l-1-3.5-1-3.5', key: 'base' }],
]);

/** The sign of a player held at the Jail corner: the World's lock, or the Myanmar map's tent (D101). */
export function jailIcon(world: LucideIcon): LucideIcon {
  return MAP.id === 'myanmar' ? Tent : world;
}

/** The Myanmar map's corners and transport spaces have their own icons (D101). */
function myanmarIcon(space: SpaceData): LucideIcon | null {
  switch (space.type) {
    case 'jail':
      return Tent;
    case 'goToJail':
      return Mail;
    case 'vacation':
      return Trees;
    case 'temple':
      return Pagoda;
    case 'airport': {
      const kind = (space.airport as MyanmarTransport).kind;
      return kind === 'road' ? Milestone : kind === 'border' ? Fence : Plane;
    }
    default:
      return null;
  }
}

/** Icon for a board space (cities use their flag instead). */
export function spaceIcon(space: SpaceData, rest = false): LucideIcon | null {
  if (rest) return Coffee;
  if (MAP.id === 'myanmar') {
    const icon = myanmarIcon(space);
    if (icon) return icon;
  }
  switch (space.type) {
    case 'start':
      return FlagIcon;
    case 'chance':
      return Ticket;
    case 'event':
      return Newspaper;
    case 'tax':
      return space.tax === 'income' ? Receipt : Gem;
    case 'jail':
      return LockKeyhole;
    case 'goToJail':
      return ShieldAlert;
    case 'vacation':
      return TreePalm;
    case 'freeParking':
      return CircleParking;
    case 'airport':
      return Plane;
    case 'company':
      return COMPANY_ICONS[space.company.icon];
    default:
      return null;
  }
}
