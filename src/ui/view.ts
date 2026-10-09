// Pure view helpers: names, tile display values and the one primary action. No React here.
import { BALANCE } from '../data/balance';
import {
  AIRPORT_BY_SPACE,
  BOARD,
  CITY_BY_SPACE,
  COMPANY_BY_SPACE,
  propertyPrice,
  type SpaceData,
} from '../data/board';
import { COUNTRY_BY_ID, type CountryData, type FlagCode } from '../data/countries';
import {
  auctionBidOptions,
  buildBlocker,
  cardById,
  decisionMaker,
  displayedRent,
  legalActions,
  validateAction,
  type Action,
  type GameState,
  type LegalAction,
  type Player,
} from '../engine';
import { money, SPECIAL_NAMES, T, type NameLookup } from './strings';

export function spaceName(s: GameState | null, index: number): string {
  const space = BOARD[index];
  if (!space) return '';
  switch (space.type) {
    case 'city':
      return space.city.name;
    case 'airport':
      return space.airport.name;
    case 'company':
      return space.company.name;
    case 'tax':
      return space.tax === 'income' ? SPECIAL_NAMES.incomeTax : SPECIAL_NAMES.luxuryTax;
    case 'chance':
      return s && !s.meta.settings.chance ? SPECIAL_NAMES.rest : SPECIAL_NAMES.chance;
    case 'event':
      return s && !s.meta.settings.event ? SPECIAL_NAMES.rest : SPECIAL_NAMES.event;
    default:
      return SPECIAL_NAMES[space.type];
  }
}

/** Short tile name (companies use their short form). */
/** Short tile name: companies use their short form; airports keep their full name (two lines fit). */
export function spaceShortName(s: GameState | null, index: number): string {
  return COMPANY_BY_SPACE.get(index)?.shortName ?? spaceName(s, index);
}

/** One-line tiles: an airport shows its country beside a plane icon. */
export function rowTileName(s: GameState | null, index: number): string {
  return AIRPORT_BY_SPACE.get(index)?.shortName ?? spaceShortName(s, index);
}

export function playerName(s: GameState, id: number | null): string {
  if (id === null) return T.panels.debt.bank;
  return s.players[id]?.name ?? '';
}

export function names(s: GameState): NameLookup {
  return {
    player: (id) => playerName(s, id),
    space: (index) => spaceName(s, index),
    cardTitle: (id) => {
      try {
        return cardById(id).title;
      } catch {
        return id;
      }
    },
  };
}

export function countryOfSpace(index: number): CountryData | null {
  const id = CITY_BY_SPACE.get(index)?.country ?? AIRPORT_BY_SPACE.get(index)?.country ?? null;
  return id ? COUNTRY_BY_ID[id] : null;
}

export function flagOf(index: number): FlagCode | null {
  return countryOfSpace(index)?.flag ?? null;
}

export function isRestSpace(s: GameState | null, index: number): boolean {
  const t = BOARD[index]?.type;
  return !!s && ((t === 'chance' && !s.meta.settings.chance) || (t === 'event' && !s.meta.settings.event));
}

export interface TileView {
  space: SpaceData;
  name: string;
  shortName: string;
  country: CountryData | null;
  /** "$70" for sale, the current rent when owned, or null. */
  value: string | null;
  owner: Player | null;
  level: number;
  mortgaged: boolean;
  canBuildNow: boolean;
}

export function tileView(s: GameState, index: number): TileView {
  const space = BOARD[index] as SpaceData;
  const ps = s.properties[index];
  const owner = ps && ps.owner !== null ? (s.players[ps.owner] ?? null) : null;
  let value: string | null = null;
  if (ps) {
    if (!owner) value = money(propertyPrice(index));
    else if (ps.mortgaged) value = T.tile.mortgaged;
    else {
      const rent = displayedRent(s, index);
      const company = COMPANY_BY_SPACE.get(index);
      value = rent !== null ? money(rent) : company ? T.tile.dice(company.multiplier) : null;
    }
  } else if (space.type === 'tax') {
    value = money(space.tax === 'income' ? BALANCE.incomeTax : BALANCE.luxuryTax);
  }
  const current = s.turn.currentPlayerIndex;
  // Any city of the country just landed in that may take a building now (D98).
  const canBuildNow =
    s.flow.phase !== 'GameOver' && s.turn.landedCity !== null && ps?.owner === current && buildBlocker(s, current, index) === null;
  return {
    space,
    name: spaceName(s, index),
    shortName: spaceShortName(s, index),
    country: countryOfSpace(index),
    value,
    owner,
    level: ps?.level ?? 0,
    mortgaged: ps?.mortgaged ?? false,
    canBuildNow,
  };
}

export function isLegalNow(s: GameState, action: Action): boolean {
  return validateAction(s, action) === null;
}

export function legalTypes(s: GameState): Set<LegalAction['type']> {
  return new Set(legalActions(s).map((a) => a.type));
}

export interface PrimarySpec {
  label: string;
  action: Action;
  /** Why the action is refused right now, or null when it can be pressed. */
  reason: string | null;
}

function spec(s: GameState, label: string, action: Action): PrimarySpec {
  return { label, action, reason: validateAction(s, action)?.reason ?? null };
}

/** The one primary button: always the next required action (spec 12, HUD). */
export function primarySpec(s: GameState): PrimarySpec | null {
  const notice = s.flow.notices[0];
  if (notice) return spec(s, notice.kind === 'bankruptcy' ? T.play.continue : T.play.ok, { type: 'acknowledge' });
  if (s.flow.phase === 'GameOver' || s.flow.trade) return null;
  const pending = s.flow.pending;
  switch (s.flow.phase) {
    case 'PassDevice':
      return spec(s, T.play.ready, { type: 'ready' });
    case 'TurnStart':
      return pending?.kind === 'vacationSkip'
        ? spec(s, T.play.ok, { type: 'acknowledge' })
        : spec(s, T.play.rollForDoubles, { type: 'rollForDoubles' });
    case 'AwaitRoll':
      return spec(s, s.turn.dice && s.turn.rollsLeft > 0 ? T.play.extraRoll : T.play.rollDice, { type: 'roll' });
    case 'BuyDecision':
      // Too little cash to buy: the big button passes, so the game always has a way on (D95).
      if (validateAction(s, { type: 'buy' }) !== null) return spec(s, T.play.pass, { type: 'decline' });
      return spec(s, T.play.buy, { type: 'buy' });
    case 'Auction': {
      if (pending?.kind !== 'auction') return null;
      const raise = pending.auction.highBid + 10;
      const options = auctionBidOptions(s);
      const amount = options.includes(raise) ? raise : options[0];
      return amount === undefined ? spec(s, T.play.fold, { type: 'fold' }) : spec(s, T.play.bid(amount), { type: 'bid', amount });
    }
    case 'RentDue':
      return pending?.kind === 'rent' ? spec(s, T.play.pay(pending.rent.amount), { type: 'payRent' }) : null;
    case 'CompanyRoll':
      return spec(s, T.panels.company.roll, { type: 'rollCompanyDice' });
    case 'CardReveal':
      return spec(s, T.play.ok, { type: 'confirmCard' });
    case 'BuildOffer':
      return spec(s, T.play.done, { type: 'finishBuilding' });
    case 'Debt': {
      const debt = s.flow.debts[0];
      return debt ? spec(s, T.play.pay(debt.amount), { type: 'payDebt' }) : null;
    }
    case 'AwaitEndTurn':
      return spec(s, T.play.endTurn, { type: 'endTurn' });
  }
}

export function decider(s: GameState): Player | null {
  const id = decisionMaker(s);
  return id === null ? null : (s.players[id] ?? null);
}
