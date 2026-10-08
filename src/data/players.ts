// Seat colours and tokens, assigned automatically in seat order (spec section 10).

export type TokenKind = 'globe' | 'plane' | 'compass' | 'crown' | 'rocket' | 'star';

export interface SeatData {
  seat: number;
  colorName: string;
  color: string;
  token: TokenKind;
}

export const SEATS: readonly SeatData[] = [
  { seat: 1, colorName: 'Red', color: '#E5484D', token: 'globe' },
  { seat: 2, colorName: 'Blue', color: '#3E63DD', token: 'plane' },
  { seat: 3, colorName: 'Green', color: '#30A46C', token: 'compass' },
  { seat: 4, colorName: 'Orange', color: '#F76B15', token: 'crown' },
  { seat: 5, colorName: 'Purple', color: '#8E4EC6', token: 'rocket' },
  { seat: 6, colorName: 'Teal', color: '#0E9C9C', token: 'star' },
];
