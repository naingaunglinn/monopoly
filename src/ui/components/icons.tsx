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
  type LucideIcon,
} from 'lucide-react';
import type { SpaceData } from '../../data/board';
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
};

/** Icon for a board space (cities use their flag instead). */
export function spaceIcon(space: SpaceData, rest = false): LucideIcon | null {
  if (rest) return Coffee;
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
