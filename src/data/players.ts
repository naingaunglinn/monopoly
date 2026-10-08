// Seat tokens and default colours (spec section 10). Each seat starts with its spec colour; players
// may pick another colour from PLAYER_COLORS at setup (D53). Tokens stay with the seat.
// Colour names are UI strings (src/ui/strings.ts).

export type TokenKind = 'globe' | 'plane' | 'compass' | 'crown' | 'rocket' | 'star';

export interface SeatData {
  seat: number;
  color: string;
  token: TokenKind;
}

export const SEATS: readonly SeatData[] = [
  { seat: 1, color: '#E5484D', token: 'globe' },
  { seat: 2, color: '#3E63DD', token: 'plane' },
  { seat: 3, color: '#30A46C', token: 'compass' },
  { seat: 4, color: '#F76B15', token: 'crown' },
  { seat: 5, color: '#8E4EC6', token: 'rocket' },
  { seat: 6, color: '#0E9C9C', token: 'star' },
];

/** Colours a player can choose: the six seat colours, then Pink and Brown. */
export const PLAYER_COLORS: readonly string[] = [...SEATS.map((s) => s.color), '#D6409F', '#8D5A3B'];
