// Every UI string lives here so another language can be added later (spec section 2).
// Plain data and pure formatting functions only: no React, no DOM.
import { BALANCE, BOARD_SIZE } from '../data/balance.js';
import { AIRPORTS, type SpecialType } from '../data/board.js';
import type { DeckId, ModifierType } from '../data/cardTypes.js';
import type {
  ErrorCode,
  ErrorParams,
  GameEvent,
  MoneyReason,
  RecapItem,
  RentCalc,
  Settings,
} from '../engine/types.js';
import type { TokenKind } from '../data/players.js';
import type { StampId } from '../online/protocol.js';

export const GAME_TITLE = 'Global Monopoly';
export const TAGLINE = 'Build your global empire';

/** "Player 1" to "Player 6": default names, by seat index from 0. */
export function defaultPlayerName(seat: number): string {
  return `Player ${seat + 1}`;
}

const MINUS = '−';
const TIMES = '×';

/** $1,250 */
export function money(amount: number): string {
  const abs = Math.abs(Math.round(amount));
  return `${amount < 0 ? MINUS : ''}$${abs.toLocaleString('en-US')}`;
}

/** +$500 or −$300. Money always carries a sign and a symbol. */
export function signedMoney(amount: number): string {
  if (amount === 0) return '$0';
  return `${amount > 0 ? '+' : MINUS}$${Math.abs(Math.round(amount)).toLocaleString('en-US')}`;
}

/** Small counts in words ("all seven"). */
const COUNT_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

// ---------------------------------------------------------------------------------------------
// Labels

export const T = {
  start: {
    newGame: 'New game',
    continue: 'Continue',
    rules: 'Rules',
    noSave: 'No saved game yet',
    saveProblemTitle: 'This saved game can’t be continued',
    saveProblem: {
      corrupt: 'The saved game is damaged and can’t be loaded.',
      older: 'The saved game comes from an older version of the game and can’t be loaded.',
      otherBoard: `The saved game was played on a different board. This version of the game has a ${BOARD_SIZE}-space board, so the save can’t be loaded.`,
      newer: 'The saved game comes from a newer version of the game and can’t be loaded.',
    },
    startFresh: 'Start a new game',
    back: 'Back',
  },
  setup: {
    title: 'New game',
    players: 'Players',
    names: 'Player names',
    nameLabel: (seat: number) => `Name of player ${seat}`,
    startingMoney: 'Starting money',
    mode: 'Game mode',
    quick: 'Quick',
    normal: 'Normal',
    quickHint: 'Ends after the round limit or at the first bankruptcy. Highest net worth wins.',
    normalHint: 'Play until one player is left.',
    roundLimit: 'Round limit',
    rounds: (n: number) => `${n} rounds`,
    rules: 'House rules',
    freeStay: 'Free Stay',
    vacation: 'Vacation',
    auction: 'Auction',
    chance: 'Chance',
    event: 'Event',
    randomFirst: 'Random first player',
    passDevice: 'Pass-device screen',
    animation: 'Animation speed',
    on: 'On',
    off: 'Off',
    speed: { normal: 'Normal', fast: 'Fast', off: 'Off' } as Record<Settings['animationSpeed'], string>,
    start: 'Start game',
    back: 'Back',
    seatColor: (color: string, token: string) => `${color} ${token}`,
    colorHint: 'Press a token to choose its colour.',
    colorButton: (name: string, color: string) => `${name}: ${color}. Choose a colour`,
    colorTitle: (name: string) => `Colour for ${name}`,
    colorOption: (color: string, holder: string | null) => (holder ? `${color}, now ${holder}’s` : color),
    colorSwap: 'Picking a colour another player has swaps your colours.',
    motionAnyway: 'Show movement anyway',
    motionHint: 'This device asks for less motion, so tokens jump instead of moving.',
  },
  top: {
    round: (n: number) => `Round ${n}`,
    roundOf: (n: number, limit: number) => `Round ${n} of ${limit}`,
    turn: (n: number) => `Turn ${n}`,
    rules: 'Rules',
    menu: 'Menu',
    settings: 'Settings',
    save: 'Save',
    newGame: 'New game',
    saved: 'Game saved',
    saveFailed: 'Saving failed: this browser blocks storage.',
    modifiersLabel: 'Active events',
    until: (name: string) => `Until ${name}’s next turn`,
    sound: 'Sound effects',
    soundOn: 'Sound effects on',
    soundOff: 'Sound effects off',
  },
  settings: {
    title: 'Settings',
    passDevice: 'Pass-device screen',
    passDeviceHint: 'Show a handover screen at the start of each turn.',
    animation: 'Animation speed',
    motionAnyway: 'Show movement anyway',
    sound: 'Sound effects',
    volume: 'Volume',
    volumeValue: (percent: number) => `${percent}%`,
    close: 'Close',
  },
  online: {
    thisDevice: 'Play on this device',
    playOnline: 'Play online',
    create: 'Create room',
    join: 'Join room',
    rejoin: (code: string) => `Rejoin room ${code}`,
    yourName: 'Your name',
    roomCode: 'Room code',
    createTitle: 'Create a room',
    createHint: 'You get a short code and a link to send to your friends.',
    joinTitle: 'Join a room',
    joinHint: 'Type the 4-letter code the host sent you, or open their link.',
    joinButton: 'Join',
    back: 'Back',
    roomLabel: 'Room',
    room: (code: string) => `Room ${code}`,
    invite: 'Invite friends',
    inviteHint: 'Send this link. Anyone with it can join.',
    share: 'Share link',
    copy: 'Copy link',
    copied: 'Link copied',
    shareText: (code: string) => `Join my ${GAME_TITLE} room ${code}`,
    seats: 'Players',
    seatCount: (n: number, max: number) => `${n} of ${max} seats taken`,
    you: 'You',
    host: 'Host',
    addSeat: 'Add a player on this device',
    leave: 'Leave room',
    start: 'Start game',
    startNeeds: (min: number) => `The game starts with ${min} to 6 players.`,
    waitingForHost: (name: string) => `Waiting for ${name} to start the game.`,
    settings: 'Game settings',
    hostOnly: 'The host chooses the settings.',
    nameOf: (seat: number) => `Name of player ${seat}`,
    colorTaken: (name: string) => `${name} has this colour`,
    connected: 'Connected',
    disconnected: 'Disconnected',
    reconnecting: 'Reconnecting…',
    reconnectingDetail: 'Your moves wait until the connection is back.',
    gone: 'This room no longer exists.',
    goneDetail: 'Rooms close 48 hours after the last move.',
    backToStart: 'Back to start',
    waitingFor: (name: string) => `Waiting for ${name}`,
    yourTurn: (name: string) => `Your turn, ${name}`,
    yourBid: (name: string) => `Your bid, ${name}`,
    yourTrade: (name: string) => `${name}, a trade offer for you`,
    yourDecision: (name: string) => `${name}, your decision`,
    titleYourTurn: 'Your turn',
    tradeWaiting: (name: string) => `Waiting for ${name} to answer your offer`,
    playFor: 'Play for them',
    stopPlayingFor: 'Stop',
    remove: 'Remove',
    removeTitle: (name: string) => `Remove ${name}?`,
    removeText: (name: string, quick: boolean) =>
      quick
        ? `${name} goes bankrupt to the bank. In a Quick game the first bankruptcy ends the game, so the game ends now.`
        : `${name} goes bankrupt to the bank and leaves the game.`,
    removeYes: 'Remove player',
    playedBy: (name: string) => `${name} plays for them`,
    youPlayFor: 'You play for them',
    takeOver: (name: string) => `Take over ${name}’s seat`,
    takeOverHint: 'These players are disconnected. Pick your seat to play on from this device.',
    joinStarted: 'This game has already started.',
    noFreeSeat: 'Every seat is in use. Ask the host for a new room.',
    leftGame: 'Your seat was taken over on another device.',
    errors: {
      badRequest: 'That did not work. Please try again.',
      roomNotFound: 'No room has this code, or it has closed. Check it with the host.',
      notInRoom: 'This device has no seat in the room.',
      notHost: 'Only the host can do that.',
      started: 'This game has already started.',
      notStarted: 'The game has not started yet.',
      full: 'This room is full (6 players).',
      colorTaken: 'Another player has that colour.',
      notEnoughPlayers: 'The game starts with 2 to 6 players.',
      stale: 'Someone else acted first. The board is up to date now; try again.',
      conflict: 'Someone else acted first. Please try again.',
      notYourTurn: 'It is not your decision.',
      illegal: 'That is not possible right now.',
      seatConnected: 'That player is still connected.',
      seatGone: 'That seat has left the game.',
      gameOver: 'The game is over.',
      slowDown: 'Wait a moment before sending again.',
      notConfigured: 'Online play is not set up on this server yet.',
      network: 'No connection. Check your internet and try again.',
      server: 'The server had a problem. Please try again.',
    } as Record<string, string>,
  },
  chat: {
    title: 'Chat',
    log: 'Log',
    tabsLabel: 'Log and chat',
    inputLabel: 'Message',
    placeholder: 'Message everyone',
    send: 'Send',
    as: 'Send as',
    empty: 'No messages yet. Say hello to the table.',
    stampsLabel: 'Stamps',
    stampButton: (word: string) => `Stamp: ${word}`,
    stamped: (name: string, word: string) => `${name} stamped ${word}`,
    slowDown: 'Wait a moment before sending again.',
    open: 'Open chat',
    unread: (n: number) => (n === 1 ? '1 new message' : `${n} new messages`),
    preview: (name: string) => `New message from ${name}. Open chat`,
    you: 'you',
  },
  voice: {
    join: 'Join voice',
    joining: 'Joining voice',
    leave: 'Leave voice',
    mute: 'Mute microphone',
    unmute: 'Unmute microphone',
    micOn: 'Mic on',
    inVoice: (n: number) => (n === 1 ? '1 person in voice' : `${n} people in voice`),
    talking: 'Talking',
    muted: 'Muted',
    listening: 'In voice',
    volume: 'Voice volume',
    hint: 'Use headphones so the others do not hear themselves.',
    micBlocked: 'The microphone is blocked. Allow it for this site in the browser settings, then join again.',
    noMic: 'No microphone was found. Connect one, then join again.',
    failed: 'Voice chat could not start. Please try again.',
    unsupported: 'This browser cannot do voice chat. Try a recent Chrome, Safari, Edge or Firefox.',
    dropped: 'You left voice chat after losing the connection. Join again when you are back.',
  },
  phone: {
    boardLabel: 'Board: drag to move, pinch to zoom, double-tap for the whole board',
    hintFit: 'Double-tap: whole board',
    hintFollow: 'Double-tap: follow the token',
    sheetLabel: 'Game controls',
    tabsLabel: 'Views',
    decision: 'Decision',
    card: 'Card',
    players: 'Players',
    log: 'Log',
    mine: 'Mine',
  },
  confirm: {
    newGameTitle: 'Start a new game?',
    newGameText: 'The current game will be lost.',
    newGameYes: 'Start a new game',
    cancel: 'Cancel',
    bankruptTitle: 'Declare bankruptcy?',
    bankruptText: (name: string, to: string) => `${name} leaves the game. Everything left goes to ${to}.`,
    bankruptYes: 'Declare bankruptcy',
    tradeTitle: 'Accept this trade?',
    tradeText: 'The trade happens at once and cannot be undone.',
    tradeYes: 'Accept trade',
  },
  play: {
    rollDice: 'Roll dice',
    rollForDoubles: 'Roll for doubles',
    move: (n: number) => `Move ${n} spaces`,
    doubles: 'Doubles: roll again',
    thirdDouble: 'Third double: go to Jail',
    extraRoll: 'Roll again',
    trade: 'Trade',
    myProperties: 'My properties',
    build: 'Build here',
    endTurn: 'End turn',
    buy: 'Buy',
    pass: 'Pass',
    pay: (amount: number) => `Pay ${money(amount)}`,
    ok: 'OK',
    continue: 'Continue',
    done: 'Done',
    ready: 'I’m ready',
    since: 'Since your last turn:',
    nothingSince: 'Nothing happened to you since your last turn.',
    yourTurn: (name: string) => `${name}, your turn`,
    decides: (name: string) => `${name} decides`,
    total: (n: number) => `Total ${n}`,
    die: (n: number) => `Die showing ${n}`,
    bid: (amount: number) => `Bid ${money(amount)}`,
    fold: 'Fold',
    waitingFor: (name: string) => `Waiting for ${name}`,
    /** The primary button while an animation plays: pressing it (or any key) finishes it. */
    skip: 'Skip',
  },
  players: {
    title: 'Players',
    cities: (n: number) => plural(n, 'city', 'cities'),
    airports: (n: number) => plural(n, 'airport', 'airports'),
    companies: (n: number) => plural(n, 'company', 'companies'),
    freeStay: (n: number) => `${n} Free Stay`,
    inJail: 'In Jail',
    onVacation: 'On vacation',
    bankrupt: 'Bankrupt',
    current: 'Current player',
    jailCard: 'Get Out of Jail card',
    voucher: 'Free House card',
    open: (name: string) => `Open ${name}’s properties`,
  },
  log: {
    title: 'Log',
    showMore: 'Show more',
    showLess: 'Show less',
    empty: 'The game has just started.',
  },
  focus: {
    owner: 'Owner',
    unowned: 'For sale',
    price: 'Price',
    houseCost: 'House cost',
    hotelCost: 'Hotel cost',
    rent: 'Rent',
    multiplier: 'Multiplier',
    mortgage: 'Mortgage value',
    mortgaged: 'Mortgaged',
    notMortgaged: 'Not mortgaged',
    status: 'Status',
    level: 'Buildings',
    country: 'Country',
    complete: 'Country complete',
    countryProgress: (owned: number, total: number) => `${owned} of ${total} owned`,
    countryOwners: 'No single owner yet',
    noBuilding: 'No building',
    completeEmpty: 'Country complete, no building',
    houses: (n: number) => plural(n, 'house', 'houses'),
    hotel: 'Hotel',
    airportsOwned: (n: number) => plural(n, 'airport', 'airports'),
    companyFormula: (multiplier: number) => `Dice total ${TIMES} ${money(multiplier)}`,
    companyBetween: (a: string, b: string) => `Between ${a} and ${b}`,
    pinned: 'Pinned',
    unpin: 'Unpin',
    noAirportSet: 'Airports belong to no country set.',
    landHere: 'If you land here',
  },
  tile: {
    rent: (amount: number) => money(amount),
    /** Soft hyphen: narrow tiles may break it as "Mort-gaged". */
    mortgaged: 'Mort\u00ADgaged',
    dice: (multiplier: number) => `Dice ${TIMES}${multiplier}`,
    canBuild: 'You can build here now',
    bought: 'Bought',
    owner: (name: string) => `Owned by ${name}`,
    forSale: 'For sale',
    level: (level: number) => (level === 5 ? 'Hotel' : plural(level, 'house', 'houses')),
  },
  panels: {
    help: 'Help',
    whose: (name: string) => `${name}’s decision`,
    buy: {
      title: (name: string) => `Buy ${name}?`,
      price: 'Price',
      cashAfter: 'Cash after buying',
      passHint: 'If you pass, everyone can bid for it.',
      passHintNoAuction: 'If you pass, it stays for sale.',
      short: (amount: string) => `You need ${amount} more to buy it.`,
    },
    auction: {
      title: (name: string) => `Auction: ${name}`,
      highBid: 'High bid',
      noBids: 'No bids yet',
      by: (name: string) => `by ${name}`,
      turn: (name: string) => `${name}, raise or fold`,
      custom: 'Your bid',
      bidCustom: 'Bid',
      minimum: (amount: number) => `At least ${money(amount)}`,
      folded: 'Folded',
      active: 'Still bidding',
      yourCash: (amount: number) => `Your cash: ${money(amount)}`,
    },
    rent: {
      title: (name: string) => `Rent for ${name}`,
      taxTitle: (name: string) => name,
      owner: 'Owner',
      amount: 'Amount',
      toBank: 'Paid to the bank',
      freeStay: (left: number) => `Use Free Stay (${left} left)`,
      freeStayHint: 'A Free Stay token skips the rent on another player’s city.',
    },
    company: {
      title: (name: string) => name,
      intro: (owner: string) => `Owned by ${owner}. Roll two dice: rent is the total times the multiplier.`,
      roll: 'Roll',
    },
    build: {
      title: (name: string) => `Build on ${name}`,
      current: 'Now',
      house: (cost: number) => `Build house · ${money(cost)}`,
      houseFree: 'Build house · free with Free House card',
      hotel: (cost: number) => `Build hotel · ${money(cost)}`,
      done: 'Done',
      maxed: 'This city has a hotel. Nothing more can be built.',
      landingRule: 'You can build only on the city you have just landed on, during this move.',
      rentNow: 'Rent now',
      rentNext: 'Rent after building',
    },
    card: {
      chance: 'Chance',
      event: 'Event',
      boarding: 'Boarding pass',
      news: 'World news',
      kept: 'Keep this card until you use it.',
    },
    jail: {
      title: (name: string) => `${name} is in Jail`,
      attempts: (used: number, max: number) => `Doubles attempts used: ${used} of ${max}`,
      lastAttempt: 'If this roll fails you must pay $300 and move.',
      pay: (amount: number) => `Pay ${money(amount)}`,
      useCard: 'Use Get Out of Jail card',
      roll: 'Roll for doubles',
    },
    vacation: {
      title: 'Vacation',
      landed: (name: string) => `${name} is on vacation. Their next turn will be skipped.`,
      skipTitle: (name: string) => `${name} is on vacation`,
      skip: 'This turn is skipped. Rent still comes in as usual.',
    },
    debt: {
      title: (name: string) => `${name} owes money`,
      amount: 'Amount owed',
      creditor: 'To',
      bank: 'The bank',
      cash: 'Cash',
      shortfall: 'Still short',
      covered: 'Covered: you can pay now.',
      options: 'Raise money by selling buildings, mortgaging or trading.',
      canSell: (n: number) => `${plural(n, 'building', 'buildings')} can be sold`,
      canMortgage: (n: number) => `${plural(n, 'property', 'properties')} can be mortgaged`,
      manage: 'Sell or mortgage',
      trade: 'Trade',
      bankrupt: 'Declare bankruptcy',
      reason: {
        rent: (name: string) => `Rent for ${name}`,
        tax: (name: string) => name,
        card: (title: string) => `Card: ${title}`,
        jailFine: 'Jail fine',
      },
    },
    bankruptcy: {
      title: (name: string) => `${name} is bankrupt`,
      toPlayer: (name: string) => `Their buildings were sold to the bank. Their cash and properties go to ${name}; mortgaged properties stay mortgaged.`,
      toBank: 'Their buildings were sold to the bank. Their properties are for sale again.',
      out: 'They are out of the game.',
    },
  },
  trade: {
    title: 'Trade',
    partner: 'Trade with',
    pickPartner: 'Pick a player',
    youGive: 'You give',
    youGet: 'You get',
    cash: 'Cash',
    jailCards: 'Get Out of Jail cards',
    none: 'Nothing to offer',
    blocked: (country: string) => `Sell the buildings in ${country} first`,
    send: 'Send offer',
    cancel: 'Cancel',
    handTo: (name: string) => `Hand the device to ${name}`,
    offerFrom: (name: string) => `${name} offers you a trade`,
    theyGive: (name: string) => `${name} gives`,
    youGiveBack: 'You give',
    accept: 'Accept',
    reject: 'Reject',
    nothing: 'Nothing',
    mortgagedNote: 'Mortgaged properties stay mortgaged.',
    notTradeable: 'Free Stay tokens and Free House cards cannot be traded.',
  },
  properties: {
    title: (name: string) => `${name}’s properties`,
    none: 'No properties yet.',
    airports: 'Airports',
    companies: 'Companies',
    sellHouse: (refund: number) => `Sell house · ${signedMoney(refund)}`,
    sellHotel: (refund: number) => `Sell hotel · ${signedMoney(refund)}`,
    mortgage: (amount: number) => `Mortgage · ${signedMoney(amount)}`,
    unmortgage: (cost: number) => `Unmortgage · ${signedMoney(-cost)}`,
    viewOnly: 'Only the owner can manage these, on their own turn.',
    close: 'Close',
    held: 'Held cards',
  },
  pass: {
    title: 'Pass the device',
    to: (name: string) => `to ${name}`,
    hint: 'Everything in this game is public. This screen is just a handover.',
  },
  winner: {
    wins: (name: string) => `${name} wins`,
    shared: (names: string) => `Shared win: ${names}`,
    netWorth: 'Net worth',
    reason: {
      roundLimit: 'The round limit is complete.',
      bankruptcy: 'The first bankruptcy ends a Quick game.',
      lastPlayer: 'The last player left wins.',
    },
    viewResults: 'View results',
    newGame: 'New game',
  },
  results: {
    title: 'Results',
    rank: 'Rank',
    player: 'Player',
    cash: 'Cash',
    property: 'Cities',
    buildings: 'Buildings',
    airports: 'Airports',
    companies: 'Companies',
    netWorth: 'Net worth',
    bankrupt: 'Bankrupt',
    winner: 'Winner',
    newGame: 'New game',
    close: 'Back to board',
  },
  rules: {
    title: 'Rule guide',
    search: 'Search the rules',
    noMatch: 'No topic matches your search.',
    close: 'Close',
    topics: 'Topics',
    offInGame: (what: string) => `${what} is switched off in this game.`,
    tableLevel: 'Building level',
    tableRent: 'Rent',
    tableAirports: 'Airports owned',
    tableCompany: 'Company',
    tablePrice: 'Price',
    tableMultiplier: 'Multiplier',
    baseRent: 'Base rent',
    incompleteRow: 'Country not complete',
    cityRentIntro: 'Rent as a multiple of the city’s base rent:',
  },
  debug: {
    title: 'Debug',
    die1: 'First die',
    die2: 'Second die',
    player: 'Player',
    cashChange: 'Cash change',
    nextDice: 'Next dice',
    set: 'Set',
    movePlayer: 'Move player',
    cash: 'Cash',
    owner: 'Owner',
    level: 'Level',
    forceCard: 'Force next card',
    space: 'Space',
    nobody: 'Nobody',
  },
  error: {
    title: 'Not allowed',
  },
};

// ---------------------------------------------------------------------------------------------
// Board names

/** The words on the stamps (spec section 18), shown in capitals on the stamp. */
export const STAMP_WORDS: Readonly<Record<StampId, string>> = {
  nice: 'Nice',
  ouch: 'Ouch',
  haha: 'Ha ha',
  wow: 'Wow',
  hurry: 'Hurry up',
  gg: 'Good game',
};

/** A chat message's time, in the viewer's clock: 14:05. */
export function chatTime(at: number): string {
  try {
    return new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export const SPECIAL_NAMES: Readonly<Record<SpecialType | 'incomeTax' | 'luxuryTax' | 'rest', string>> = {
  start: 'World Start',
  chance: 'Chance',
  event: 'Event',
  tax: 'Tax',
  incomeTax: 'Income Tax',
  luxuryTax: 'Luxury Tax',
  jail: 'Jail',
  goToJail: 'Go To Jail',
  vacation: 'Vacation',
  freeParking: 'Free Parking',
  rest: 'Rest',
};

/** What happens on each special space (Focus Card). */
export const SPECIAL_TEXT: Readonly<Record<SpecialType | 'incomeTax' | 'luxuryTax' | 'rest', string>> = {
  start: 'Collect $500 each time you pass or land here moving forward.',
  chance: 'Draw the top Chance card and do what it says.',
  event: 'Draw the top Event card: world news that can affect everyone.',
  tax: 'Pay the tax to the bank.',
  incomeTax: 'Pay $300 to the bank.',
  luxuryTax: 'Pay $500 to the bank.',
  jail: 'Just visiting: nothing happens. Players sent to Jail wait here.',
  goToJail: 'Go straight to Jail. You collect nothing for passing World Start.',
  vacation: 'Your next turn is skipped. You still collect rent.',
  freeParking: 'Nothing happens.',
  rest: 'Nothing happens: this card deck is switched off.',
};

export const TOKEN_NAMES: Readonly<Record<TokenKind, string>> = {
  globe: 'Globe',
  plane: 'Plane',
  compass: 'Compass',
  crown: 'Crown',
  rocket: 'Rocket',
  star: 'Star',
};

/** Names of the colours a player can choose (data/players.ts PLAYER_COLORS). */
const COLOR_NAMES: Readonly<Record<string, string>> = {
  '#E5484D': 'Red',
  '#3E63DD': 'Blue',
  '#30A46C': 'Green',
  '#F76B15': 'Orange',
  '#8E4EC6': 'Purple',
  '#0E9C9C': 'Teal',
  '#D6409F': 'Pink',
  '#8D5A3B': 'Brown',
};

export function colorName(color: string): string {
  return COLOR_NAMES[color] ?? color;
}

export const DECK_NAMES: Readonly<Record<DeckId, string>> = { chance: 'Chance', event: 'Event' };

const MODIFIER_NAMES: Readonly<Record<ModifierType, string>> = {
  cityRent: 'City rent',
  airportRent: 'Airport rent',
  companyRent: 'Company rent',
  buildCost: 'Build cost',
};

/** "City rent +25%" */
export function modifierLabel(type: ModifierType, factor: number): string {
  const pct = Math.round((factor - 1) * 100);
  return `${MODIFIER_NAMES[type]} ${pct > 0 ? '+' : MINUS}${Math.abs(pct)}%`;
}

export function levelText(level: number): string {
  if (level === 0) return T.focus.noBuilding;
  if (level === 5) return T.focus.hotel;
  return T.focus.houses(level);
}

// ---------------------------------------------------------------------------------------------
// Errors

function p(params: ErrorParams, key: string): string {
  const v = params[key];
  return v === undefined ? '' : String(v);
}

function m(params: ErrorParams, key: string): string {
  const v = params[key];
  return typeof v === 'number' ? money(v) : String(v ?? '');
}

export const ERROR_TEXT: Readonly<Record<ErrorCode, (params: ErrorParams) => string>> = {
  gameOver: () => 'The game is over.',
  wrongPhase: () => 'That is not possible right now.',
  noticePending: () => 'Press OK first.',
  tradePending: (x) => `${p(x, 'player')} must answer the trade offer first.`,
  notEnoughCash: (x) => `You don't have enough money. You need ${m(x, 'needed')} and have ${m(x, 'have')}.`,
  notProperty: () => 'That space cannot be owned.',
  notOwner: (x) => `${p(x, 'name')} is not yours.`,
  notCity: () => 'Only cities can have houses and hotels.',
  alreadyMortgaged: (x) => `${p(x, 'name')} is already mortgaged.`,
  notMortgaged: (x) => `${p(x, 'name')} is not mortgaged.`,
  countryHasBuildings: (x) => `Sell the buildings in ${p(x, 'country')} first.`,
  countryIncomplete: (x) => `You need every city in ${p(x, 'country')} before building.`,
  countryMortgaged: (x) => `Unmortgage ${p(x, 'name')} before building in ${p(x, 'country')}.`,
  notLandedHere: () => 'You can build only on the city you have just landed on, during that move.',
  evenBuild: (x) => `Your other ${p(x, 'country')} cities must have the same number of houses first.`,
  hasHotel: (x) => `${p(x, 'name')} already has a hotel.`,
  noBuildings: (x) => `${p(x, 'name')} has no buildings to sell.`,
  evenSell: (x) => `Sell evenly: start with the ${p(x, 'country')} city that has the most buildings.`,
  noJailCard: () => 'You have no Get Out of Jail card.',
  bidTooLow: (x) => `Your bid must be at least ${m(x, 'min')}.`,
  bidTooHigh: (x) => `You can't bid more than your cash (${m(x, 'cash')}).`,
  invalidAmount: () => 'Enter a whole number of dollars.',
  freeStayUnavailable: () => "Free Stay can be used only on another player's city, and you need a token.",
  debtNotCovered: (x) => `You still need ${m(x, 'shortfall')} more to pay.`,
  tradeInvalidPlayer: () => 'Pick another player who is still in the game.',
  tradeEmpty: () => 'Add at least one item to the trade.',
  tradeNotOwned: (x) => `${p(x, 'name')} does not belong to ${p(x, 'player')}.`,
  tradeBuildings: (x) => `Sell the buildings in ${p(x, 'country')} before trading ${p(x, 'name')}.`,
  tradeCash: (x) => `${p(x, 'player')} doesn't have ${m(x, 'amount')}.`,
  tradeCards: (x) => `${p(x, 'player')} doesn't have that many Get Out of Jail cards.`,
  noUnmortgageInDebt: () => 'Pay your debt before unmortgaging.',
  invalidAction: () => 'That action is not available.',
};

export function errorText(code: ErrorCode, params: ErrorParams): string {
  return ERROR_TEXT[code](params);
}

// ---------------------------------------------------------------------------------------------
// Sentences built from game data. The caller supplies names.

export interface NameLookup {
  player(id: number): string;
  space(index: number): string;
  cardTitle(id: string): string;
}

/** "Tokyo, 2 houses: $43 × 7 = $301", with "× 1.25 = $376" added when an Event modifier applies. */
export function rentCalcText(calc: RentCalc, amount: number, spaceName: string): string {
  const total = (subtotal: number, factor: number | null) =>
    factor === null ? money(subtotal) : `${money(subtotal)} ${TIMES} ${factor} = ${money(amount)}`;
  switch (calc.kind) {
    case 'cityBase':
      return `${spaceName}, base rent: ${total(calc.baseRent, calc.factor)}`;
    case 'cityComplete': {
      const what = calc.level === 0 ? 'country complete' : levelText(calc.level).toLowerCase();
      return `${spaceName}, ${what}: ${money(calc.baseRent)} ${TIMES} ${calc.multiplier} = ${total(calc.baseRent * calc.multiplier, calc.factor)}`;
    }
    case 'airport':
      return `${spaceName}, ${T.focus.airportsOwned(calc.owned)} owned: ${total(calc.ladderRent, calc.factor)}`;
    case 'company':
      return `Dice ${calc.dice[0]} + ${calc.dice[1]} = ${calc.total}: ${calc.total} ${TIMES} ${money(calc.multiplier)} = ${total(calc.total * calc.multiplier, calc.factor)}`;
    case 'tax':
      return calc.tax === 'income' ? 'Income Tax: pay $300 to the bank' : 'Luxury Tax: pay $500 to the bank';
  }
}

const REASON_TEXT: Readonly<Record<MoneyReason, string>> = {
  start: 'World Start',
  buy: 'purchase',
  auction: 'auction',
  rent: 'rent',
  tax: 'tax',
  card: 'card',
  freeStayCash: 'Free Stay',
  build: 'building',
  sell: 'sold building',
  mortgage: 'mortgage',
  unmortgage: 'unmortgage',
  jailFine: 'Jail fine',
  trade: 'trade',
  bankruptcy: 'bankruptcy',
  debug: 'debug',
};

/** One recap entry: "+$172 rent from Player 3". */
export function recapItemText(item: RecapItem, names: NameLookup): string {
  const amount = signedMoney(item.delta);
  if (item.reason === 'rent' && item.counterparty !== null) {
    return item.delta > 0
      ? `${amount} rent from ${names.player(item.counterparty)}`
      : `${amount} rent to ${names.player(item.counterparty)}`;
  }
  if (item.reason === 'card' && item.cardId) return `${amount} ${names.cardTitle(item.cardId)}`;
  if (item.reason === 'trade' && item.counterparty !== null) return `${amount} trade with ${names.player(item.counterparty)}`;
  if (item.reason === 'auction' && item.space !== null) return `${amount} won ${names.space(item.space)} at auction`;
  if (item.reason === 'bankruptcy' && item.counterparty !== null) {
    return `${amount} from ${names.player(item.counterparty)}’s bankruptcy`;
  }
  return `${amount} ${REASON_TEXT[item.reason]}`;
}

/** Summarises a recap list into one line, merging rent from the same player. */
export function recapLine(items: RecapItem[], names: NameLookup): string {
  if (items.length === 0) return T.play.nothingSince;
  const merged: RecapItem[] = [];
  for (const item of items) {
    const same = merged.find(
      (x) => x.reason === item.reason && x.counterparty === item.counterparty && x.cardId === item.cardId && x.reason === 'rent',
    );
    if (same) same.delta += item.delta;
    else merged.push({ ...item });
  }
  const parts = merged.slice(0, 3).map((x) => recapItemText(x, names));
  const more = merged.length > 3 ? ` and ${merged.length - 3} more` : '';
  return `${T.play.since} ${parts.join(', ')}${more}.`;
}

/** One plain sentence per logged event, or null for events that are not shown in the log. */
export function logText(e: GameEvent, n: NameLookup): string | null {
  const who = (id: number) => n.player(id);
  switch (e.type) {
    case 'gameStarted':
      return `${who(e.firstPlayer)} goes first.`;
    case 'roundStarted':
      return `Round ${e.round} begins.`;
    case 'turnStarted':
      return `${who(e.player)}’s turn.`;
    case 'turnSkipped':
      return `${who(e.player)} is on vacation; turn skipped.`;
    case 'turnEnded':
      return null;
    case 'diceRolled':
      if (e.purpose === 'company') return `${who(e.player)} rolled ${e.dice[0]} + ${e.dice[1]} for company rent.`;
      if (e.purpose === 'jail') {
        return `${who(e.player)} rolled ${e.dice[0]} + ${e.dice[1]} for doubles${e.doubles ? ' and got them' : ''}.`;
      }
      return `${who(e.player)} rolled ${e.dice[0]} + ${e.dice[1]} = ${e.dice[0] + e.dice[1]}${e.doubles ? ', doubles' : ''}.`;
    case 'moved':
      return e.by === 'card'
        ? `${who(e.player)} moved ${e.direction === 1 ? 'forward' : 'back'} to ${n.space(e.to)}.`
        : `${who(e.player)} moved to ${n.space(e.to)}.`;
    case 'teleported':
      if (e.reason === 'debug') return `Debug: ${who(e.player)} placed on ${n.space(e.to)}.`;
      return null;
    case 'passedStart':
      return `${who(e.player)} passed World Start: ${signedMoney(e.amount)}.`;
    case 'landed':
    case 'money':
    case 'settingChanged':
      return null;
    case 'bought':
      return `${who(e.player)} bought ${n.space(e.space)} for ${money(e.price)}.`;
    case 'declined':
      return `${who(e.player)} passed on ${n.space(e.space)}.`;
    case 'auctionStarted':
      return `Auction for ${n.space(e.space)} begins.`;
    case 'bid':
      return `${who(e.player)} bid ${money(e.amount)}.`;
    case 'folded':
      return e.auto ? `${who(e.player)} cannot beat the bid and folds.` : `${who(e.player)} folded.`;
    case 'auctionWon':
      return `${who(e.player)} won ${n.space(e.space)} for ${money(e.price)}.`;
    case 'auctionUnsold':
      return `Nobody bid: ${n.space(e.space)} stays for sale.`;
    case 'rentPaid':
      return `${who(e.from)} paid ${who(e.to)} ${money(e.amount)} rent for ${n.space(e.space)}.`;
    case 'freeStayUsed':
      return `${who(e.player)} used a Free Stay at ${n.space(e.space)} and saved ${money(e.saved)}.`;
    case 'noRent':
      return `${n.space(e.space)} is mortgaged: no rent.`;
    case 'feePaid': {
      const what = e.reason === 'incomeTax' ? 'Income Tax' : e.reason === 'luxuryTax' ? 'Luxury Tax' : 'the Jail fine';
      return `${who(e.player)} paid ${what}: ${signedMoney(-e.amount)}.`;
    }
    case 'cardDrawn':
      return `${who(e.player)} drew ${DECK_NAMES[e.deck]}: ${n.cardTitle(e.cardId)}.`;
    case 'deckShuffled':
      return `The ${DECK_NAMES[e.deck]} deck was reshuffled.`;
    case 'cardCash':
      return `${who(e.player)}: ${signedMoney(e.amount)} (${n.cardTitle(e.cardId)}).`;
    case 'cardTransfer':
      return `${who(e.from)} paid ${who(e.to)} ${money(e.amount)} (${n.cardTitle(e.cardId)}).`;
    case 'cardNoEffect':
      return `${n.cardTitle(e.cardId)}: no effect this time.`;
    case 'freeStayGained':
      return `${who(e.player)} now holds ${e.tokens} Free Stay.`;
    case 'cardKept':
      return `${who(e.player)} keeps ${n.cardTitle(e.cardId)}.`;
    case 'rollAgainGranted':
      return `${who(e.player)} gets an extra roll.`;
    case 'modifierStarted':
      return `${modifierLabel(e.modifier.type, e.modifier.factor)} until ${who(e.modifier.drawnBy)}’s next turn.`;
    case 'modifierEnded':
      return `${modifierLabel(e.modifier.type, e.modifier.factor)} has ended.`;
    case 'built':
      return `${who(e.player)} built ${e.level === 5 ? 'a hotel' : 'a house'} on ${n.space(e.space)}${e.voucher ? ' with a Free House card' : ` for ${money(e.cost)}`}.`;
    case 'buildingSold':
      return `${who(e.player)} sold a building on ${n.space(e.space)}: ${signedMoney(e.refund)}.`;
    case 'mortgaged':
      return `${who(e.player)} mortgaged ${n.space(e.space)}: ${signedMoney(e.amount)}.`;
    case 'unmortgaged':
      return `${who(e.player)} unmortgaged ${n.space(e.space)}: ${signedMoney(-e.cost)}.`;
    case 'jailed':
      return e.reason === 'doubles'
        ? `${who(e.player)} rolled a third double and went to Jail.`
        : `${who(e.player)} went to Jail.`;
    case 'jailRollFailed':
      return `${who(e.player)} stays in Jail (attempt ${e.attempts}).`;
    case 'leftJail':
      return e.how === 'card'
        ? `${who(e.player)} used a Get Out of Jail card.`
        : e.how === 'fine'
          ? `${who(e.player)} paid to leave Jail.`
          : e.how === 'forcedFine'
            ? `${who(e.player)} paid the fine and leaves Jail.`
            : `${who(e.player)} rolled doubles and leaves Jail.`;
    case 'vacationStarted':
      return `${who(e.player)} is on vacation; their next turn is skipped.`;
    case 'debtStarted':
      return `${who(e.debtor)} owes ${money(e.amount)} and is ${money(e.shortfall)} short.`;
    case 'debtPaid':
      return null;
    case 'bankrupt':
      return e.creditor === null
        ? `${who(e.player)} is bankrupt; the bank takes everything.`
        : `${who(e.player)} is bankrupt; ${who(e.creditor)} takes everything.`;
    case 'tradeProposed':
      return `${who(e.from)} offered ${who(e.to)} a trade.`;
    case 'tradeAccepted':
      return `${who(e.offer.to)} accepted ${who(e.offer.from)}’s trade.`;
    case 'tradeRejected':
      return `${who(e.to)} rejected ${who(e.from)}’s trade.`;
    case 'tradeCancelled':
      return `The trade between ${who(e.from)} and ${who(e.to)} was cancelled.`;
    case 'playerRemoved':
      return `${who(e.player)} left the game.`;
    case 'gameOver':
      return e.winners.length > 1
        ? `Game over: shared win for ${e.winners.map(who).join(' and ')}.`
        : `Game over: ${who(e.winners[0] ?? 0)} wins.`;
    case 'debugApplied':
      return `Debug: ${e.op}.`;
  }
}

/** The player a log line is about (for its colour dot). */
export function logPlayer(e: GameEvent): number | null {
  switch (e.type) {
    case 'rentPaid':
    case 'cardTransfer':
      return e.from;
    case 'tradeProposed':
    case 'tradeRejected':
    case 'tradeCancelled':
      return e.from;
    case 'tradeAccepted':
      return e.offer.to;
    case 'debtStarted':
    case 'debtPaid':
      return e.debtor;
    case 'gameStarted':
      return e.firstPlayer;
    case 'modifierStarted':
    case 'modifierEnded':
      return e.modifier.drawnBy;
    default:
      return 'player' in e && typeof e.player === 'number' ? e.player : null;
  }
}

// ---------------------------------------------------------------------------------------------
// Rule guide (spec section 16). Topic text is used as written, one short point per line.

export type RuleTopicId =
  | 'quickStart'
  | 'yourTurn'
  | 'worldStart'
  | 'buying'
  | 'citiesRent'
  | 'countries'
  | 'houses'
  | 'selling'
  | 'airports'
  | 'companies'
  | 'cards'
  | 'freeStay'
  | 'jail'
  | 'vacation'
  | 'taxes'
  | 'mortgages'
  | 'trading'
  | 'debt'
  | 'winning'
  | 'controls'
  | 'online';

export interface RuleTopic {
  id: RuleTopicId;
  title: string;
  lines: string[];
  ordered?: boolean;
  /** A table generated from the game data, shown after the lines. */
  table?: 'cityRent' | 'airportRent' | 'companies';
  /** Settings that can switch this topic off for a game. */
  switches?: Array<'freeStay' | 'vacation' | 'auction' | 'chance' | 'event'>;
}

export const SWITCH_NAMES = {
  freeStay: 'Free Stay',
  vacation: 'Vacation',
  auction: 'Auction',
  chance: 'Chance',
  event: 'Event',
} as const;

export const RULE_TOPICS: readonly RuleTopic[] = [
  {
    id: 'quickStart',
    title: 'Quick start',
    lines: [
      'Roll the dice and move clockwise.',
      'Land on a property nobody owns: buy it, or let everyone bid for it.',
      'Land on someone else’s property: pay rent.',
      'Own every city of a country and its rent doubles. Then you can build houses, but only on the city you land on.',
      'Pass World Start and collect $500.',
      'Quick game: the richest player after the last round wins. Normal game: the last player not bankrupt wins.',
      'The yellow button always shows your next step.',
    ],
  },
  {
    id: 'yourTurn',
    title: 'Your turn',
    ordered: true,
    lines: [
      'Tap I’m ready, then Roll dice.',
      'Your token moves. Do what the space says.',
      'Before or after rolling you can trade, mortgage, or sell buildings.',
      'Rolled doubles? Roll again. Three doubles in one turn sends you to Jail.',
      'Press End turn and pass the device.',
    ],
  },
  {
    id: 'worldStart',
    title: 'World Start',
    lines: [
      'Collect $500 each time you pass it or land on it.',
      'You collect nothing when a card moves you backward or when you go to Jail.',
    ],
  },
  {
    id: 'buying',
    title: 'Buying and auctions',
    switches: ['auction'],
    lines: [
      'Land on an unowned city, airport or company and you may buy it at its price.',
      'White tiles are still for sale. A tile you own takes your colour.',
      'If you pass, it is auctioned. Everyone can bid, including you. Bids start at $1.',
      'In an auction, players take turns to raise or fold. The last bidder left wins and pays the bank.',
    ],
  },
  {
    id: 'citiesRent',
    title: 'Cities and rent',
    lines: [
      'Land on another player’s city and you pay its rent. The tile shows the rent you would pay right now.',
      'A mortgaged city charges no rent.',
      'You can use a Free Stay token instead of paying.',
    ],
  },
  {
    id: 'countries',
    title: 'Countries',
    table: 'cityRent',
    lines: [
      'A country is complete when one player owns all of its cities.',
      'In a complete country, rent on empty cities doubles and building becomes possible.',
    ],
  },
  {
    id: 'houses',
    title: 'Houses and hotels',
    lines: [
      'You need the whole country, with none of its cities mortgaged.',
      'You can build only on the city you have just landed on, and only during that move.',
      'Build evenly: no city may be more than one house ahead of the others in its country.',
      'You may build several houses in one landing if the even rule and your cash allow it.',
      'After 4 houses you can build a hotel. A hotel costs twice the house cost.',
    ],
  },
  {
    id: 'selling',
    title: 'Selling buildings',
    lines: [
      'Sell on your own turn or when you owe money. You get half the cost back.',
      'Sell evenly, tallest city first. Selling a hotel leaves 4 houses.',
    ],
  },
  {
    id: 'airports',
    title: 'Airports',
    table: 'airportRent',
    lines: ['Airports never have buildings.', 'Rent grows with the number of airports the owner holds.'],
  },
  {
    id: 'companies',
    title: 'Companies',
    table: 'companies',
    lines: ['Land on another player’s company, roll two dice and pay the total times the company’s multiplier.'],
  },
  {
    id: 'cards',
    title: 'Chance and Event cards',
    switches: ['chance', 'event'],
    lines: [
      'Land on Chance or Event to draw a card, then do what it says.',
      'Chance mostly affects you: money, movement, Jail and bonus cards.',
      'Events are world news. They can affect everyone, and some change rents or building costs for one round. Active events show at the top of the screen.',
      'Free House: your next house is free, still only on a city you land on.',
      'Get Out of Jail: keep it until you need it. You can trade it.',
    ],
  },
  {
    id: 'freeStay',
    title: 'Free Stay',
    switches: ['freeStay'],
    lines: [
      'You start with 3 tokens. Use one to skip the rent on another player’s city.',
      'It does not work on airports, companies, taxes or cards.',
      'You never hold more than 3.',
    ],
  },
  {
    id: 'jail',
    title: 'Jail',
    lines: [
      'You go to Jail from the Go To Jail space, from a card, or by rolling three doubles in one turn.',
      'To leave: pay $300, use a Get Out of Jail card, or roll doubles.',
      'Rolling doubles moves you out by that roll, with no extra roll.',
      'After three failed rolls you must pay $300 and move.',
      'In Jail you still collect rent, trade and bid.',
      'Landing on the Jail space during a normal move is just visiting.',
    ],
  },
  {
    id: 'vacation',
    title: 'Vacation',
    switches: ['vacation'],
    lines: ['Land on Vacation and your next turn is skipped, once.', 'You still own everything and still collect rent.'],
  },
  {
    id: 'taxes',
    title: 'Taxes and Free Parking',
    lines: ['Income Tax: pay $300. Luxury Tax: pay $500.', 'Free Parking: nothing happens.'],
  },
  {
    id: 'mortgages',
    title: 'Mortgages',
    lines: [
      'Short of cash? Mortgage a property to the bank for half its price. You keep it, but it earns no rent.',
      'For a city, sell all buildings in that country first.',
      'To unmortgage, pay the mortgage value plus 10%.',
      'You cannot build in a country while one of its cities is mortgaged.',
    ],
  },
  {
    id: 'trading',
    title: 'Trading',
    lines: [
      'On your turn, offer a trade to one player: properties, Get Out of Jail cards and cash, in any mix.',
      'The other player accepts or rejects. Nobody can be forced.',
      'Cities in a country with buildings cannot be traded until the buildings are sold.',
      'A mortgaged property stays mortgaged after a trade.',
    ],
  },
  {
    id: 'debt',
    title: 'Debt and bankruptcy',
    lines: [
      'If you cannot pay, raise money: sell buildings, mortgage properties or make a trade.',
      'If that is still not enough, you are bankrupt and out of the game.',
      'Owing a player: they receive everything you have left. Owing the bank: your properties become free to buy again.',
    ],
  },
  {
    id: 'winning',
    title: 'Winning',
    lines: [
      'Quick game: it ends after the round limit, or when the first player goes bankrupt. The highest net worth wins.',
      'Normal game: the last player left wins.',
      'Net worth is cash, plus properties at their price (mortgaged ones at half), plus buildings at cost.',
    ],
  },
  {
    id: 'controls',
    title: 'Controls',
    lines: [
      'Space or Enter presses the yellow button. B buys, P passes, T trades, R opens this guide.',
      'Hover over or tap a tile to see its details. Click a player to see what they own.',
      'Any click skips an animation. Animation speed is in Settings.',
    ],
  },
  {
    id: 'online',
    title: 'Playing online',
    lines: [
      'Create a room and send its link or 4-letter code. Friends join from any browser, phone or computer.',
      'Everyone types a name and takes a seat. One device can hold several seats.',
      'The host picks the settings and starts the game with 2 to 6 players.',
      'You act only on your own decisions; everyone sees the dice, moves, cards and money live.',
      'Bids and trade answers happen on each player’s own device.',
      'Lost the connection? Open the link again to get your seat back. The game waits; there is no timer.',
      'If a player is gone, the host can play for them or remove them (bankrupt to the bank).',
      'Chat with the table from the Chat tab (in the lobby: the Chat button). Stamps are quick reactions that land on your card.',
      'Animation speed and sound are chosen on each device.',
    ],
  },
];

/** Two-line explanations behind the small help buttons (spec 14, Comfort). */
export const QUICK_HELP: Readonly<Record<'freeStay' | 'companies' | 'airports' | 'building', { lines: [string, string]; topic: RuleTopicId }>> = {
  freeStay: {
    lines: ['Use a Free Stay token to skip rent on another player’s city.', 'Not for airports, companies, taxes or cards. You hold at most 3.'],
    topic: 'freeStay',
  },
  companies: {
    lines: ['Landing on someone’s company: roll two dice.', 'You pay the total times the company’s multiplier.'],
    topic: 'companies',
  },
  airports: {
    lines: [
      'Airport rent depends on how many airports the owner holds.',
      `From ${money(BALANCE.airportRent[0] as number)} for one up to ${money(BALANCE.airportRent[AIRPORTS.length - 1] as number)} for all ${COUNT_WORDS[AIRPORTS.length] ?? AIRPORTS.length}.`,
    ],
    topic: 'airports',
  },
  building: {
    lines: ['Own the whole country, then build on the city you just landed on.', 'Build evenly; after 4 houses comes a hotel.'],
    topic: 'houses',
  },
};

export const RULE_LINK = 'Open the rule guide';
