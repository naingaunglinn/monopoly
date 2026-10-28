// Every UI string lives here so another language can be added later (spec section 2).
// Plain data and pure formatting functions only: no React, no DOM.
import { BALANCE, BOARD_SIZE, MYANMAR } from '../data/balance.js';
import { AIRPORTS, groupName, MAP, RULES, type SpecialType } from '../data/board.js';
import { MYANMAR_COMPANIES, MYANMAR_TRANSPORT, type MyanmarTransport } from '../data/myanmar.js';
import { MYANMAR_CARD_BY_ID } from '../data/myanmarCards.js';
import { YANGON_CARD_BY_ID } from '../data/yangonCards.js';
import { burmeseDigits, language, pick } from '../data/lang.js';
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

/** A whole amount in the map's currency, without a sign: $1,250, or 1,250 lakh (၁,၂၅၀ သိန်း in Burmese). */
function amountText(abs: number): string {
  const digits = abs.toLocaleString('en-US');
  if (RULES.currency === 'usd') return `$${digits}`;
  return language() === 'my' ? `${burmeseDigits(digits)} သိန်း` : `${digits} lakh`;
}

/** $1,250 (World map) or 1,250 lakh (Myanmar map, D101). */
export function money(amount: number): string {
  return `${amount < 0 ? MINUS : ''}${amountText(Math.abs(Math.round(amount)))}`;
}

/** +$500 or −$300 (+500 lakh on the Myanmar map). Money always carries a sign and a symbol. */
export function signedMoney(amount: number): string {
  if (amount === 0) return amountText(0);
  return `${amount > 0 ? '+' : MINUS}${amountText(Math.abs(Math.round(amount)))}`;
}

/** The Myanmar map or the Yangon map (its rules, D116) is in play (D101): texts below name its spaces, regions and rules. */
function onMyanmar(): boolean {
  return MAP.id !== 'world';
}

/** The Yangon map is in play (D116): the Myanmar map's rules, told as office life, in Burmese. */
function onYangon(): boolean {
  return MAP.id === 'yangon';
}

/**
 * The Myanmar map's English words for its military-service rules, and the Yangon map's office words
 * for the same rules (D116). Longer phrases come first so they win over the words inside them.
 */
const YANGON_WORDS: readonly (readonly [RegExp, string])[] = [
  [/the Military camp/g, 'OT'],
  [/Military camp/g, 'OT'],
  [/Military service/g, 'OT'],
  [/military service/g, 'OT'],
  [/Call-up exemption cards?/g, 'Sick leave card'],
  [/Call-up letter/g, 'Urgent Teams message'],
  [/called up/g, 'sent to OT'],
  [/Called up/g, 'Sent to OT'],
  [/In the camp/g, 'Doing OT'],
  [/in the camp/g, 'in OT'],
  [/the camp/g, 'OT'],
  [/Chiang Mai/g, 'the tea shop'],
  [/the army/g, 'OT'],
  [/army salary/g, 'office salary'],
  [/Myanmar news/g, 'Ward news'],
  [/porters?/gi, 'weekend OT'],
  [/the general/g, 'the Big Boss'],
  [/The general/g, 'The Big Boss'],
  [/Military rank/g, 'Job title'],
  [/regions/g, 'areas'],
  [/region/g, 'area'],
  [/Regions/g, 'Areas'],
  [/Region/g, 'Area'],
];

/** The Myanmar map's Burmese words and the Yangon map's (D116), for the Burmese rule guide. */
const YANGON_WORDS_MY: readonly (readonly [string, string])[] = [
  ['စစ်မှုထမ်းစခန်း', 'OT'],
  ['စစ်မှုထမ်း ခေါ်ခံရ', 'OT ဆင်းခိုင်းခံရ'],
  ['စစ်မှုထမ်း', 'OT'],
  ['ခေါ်စာရောက်ပြီ', 'Boss က Teams မှာ Urgent ပို့လာပြီ'],
  ['ခေါ်စာ', 'Teams Urgent'],
  ['ကင်းလွတ်ခွင့်ကတ်', 'ဆေးခွင့်လက်မှတ်'],
  ['ကင်းလွတ်ခွင့်', 'ဆေးခွင့်လက်မှတ်'],
  ['ချင်းမိုင်', 'လက်ဖက်ရည်ဆိုင်'],
  ['ပေါ်တာ', 'Weekend OT'],
  ['ရှောင်ပုန်း', 'ဖုန်းပိတ်ထား'],
  ['ထွက်ပြေး', 'အလုပ်ထွက်ပြေး'],
  ['ပွဲစားခ', 'ခွင့်တိုင်ခ'],
  ['ပွဲစား', 'ခွင့်တိုင်'],
  ['ဗိုလ်ချုပ်', 'Boss ကြီး'],
  ['စစ်တပ်', 'ရုံး'],
  ['တပ်က', 'ရုံးက'],
  ['စစ်လစာ', 'ရာထူးလစာ'],
  ['စစ်ရာထူး', 'ရာထူး'],
  ['ခေါ်ခံရ', 'OT ဆင်းခိုင်းခံရ'],
  ['"တက်" (Serve)', '"OT ဆင်း" (Serve)'],
  ['တက်: အခမဲ့', 'OT ဆင်း: အခမဲ့'],
  ['ထပ်ထမ်းပါ', 'OT ထပ်ဆင်းပါ'],
  ['ကံစမ်းမဲ', 'ဗေဒင်ဆရာ'],
  ['သတင်းကတ်', 'ရပ်ကွက်ထဲက ကတ်'],
  ['သတင်း ကွက်', 'ရပ်ကွက်ထဲက ကွက်'],
];

/** Turns the Myanmar map's English text into the Yangon map's office version of it (D116). */
function yangonize(text: string): string {
  return YANGON_WORDS.reduce((out, [from, to]) => out.replace(from, to), text);
}

/** Turns the Myanmar map's Burmese text into the Yangon map's office version of it (D116). */
function yangonizeMy(text: string): string {
  return YANGON_WORDS_MY.reduce((out, [from, to]) => out.split(from).join(to), text);
}

/** The Myanmar text, or on the Yangon map its own Burmese text (D116). */
function ygn(myanmar: string, yangon: string): string {
  return onYangon() ? yangon : myanmar;
}

/**
 * The World text, or the Myanmar map's version of it (D101). The Yangon map takes its own text
 * when there is one, else the Myanmar text in office words (D116).
 */
function byMap(world: string, myanmar: string, yangon?: string): string {
  if (onYangon()) return yangon ?? yangonize(myanmar);
  return onMyanmar() ? myanmar : world;
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
    get event() {
      return byMap('Event', 'News');
    },
    randomFirst: 'Random first player',
    general: 'The general (power, unrest, bribes)',
    map: 'Map',
    maps: { world: 'World', myanmar: 'Myanmar', yangon: 'ရန်ကုန်' } as Record<'world' | 'myanmar' | 'yangon', string>,
    language: 'Names and cards',
    languages: { en: 'English', my: 'မြန်မာ' } as Record<'en' | 'my', string>,
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
    inflation: (rate: number) => `Inflation +${rate}%`,
    pot: (amount: number) => `Community pot ${money(amount)}`,
    potTitle: 'Taxes and fines collect in the pot. Landing on Chiang Mai takes it all.',
    potLabel: 'Community pot',
    inflationTitle: 'City rents are this much higher than printed. The owner of KBZ Bank pays without it.',
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
    roomWord: 'Room',
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
    yourLoan: (name: string) => `${name}, a loan offer for you`,
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
  // The Yangon map reads in Burmese only (D116): its buttons take the Burmese through ygn().
  play: {
    get rollDice() {
      return ygn('Roll dice', 'အန်စာ လှိမ့်');
    },
    get rollForDoubles() {
      return ygn('Roll for doubles', 'အတူတူ ကျဖို့ လှိမ့်');
    },
    move: (n: number) => ygn(`Move ${n} spaces`, `${dMy(n)} ကွက် သွား`),
    get doubles() {
      return ygn('Doubles: roll again', 'အတူတူ ကျပြီ: ထပ်လှိမ့်');
    },
    get thirdDouble() {
      return byMap('Third double: go to Jail', 'Third double: go to the Military camp', 'အတူတူ ၃ ကြိမ်: OT ဆင်းရမယ်');
    },
    get extraRoll() {
      return ygn('Roll again', 'ထပ်လှိမ့်');
    },
    get trade() {
      return ygn('Trade', 'အရောင်းအဝယ်');
    },
    get myProperties() {
      return ygn('My properties', 'ကိုယ့်ပိုင်ဆိုင်မှု');
    },
    get build() {
      return ygn('Build here', 'ဒီမှာ ဆောက်');
    },
    get endTurn() {
      return ygn('End turn', 'အလှည့် ပြီးပြီ');
    },
    get buy() {
      return ygn('Buy', 'ဝယ်မယ်');
    },
    get pass() {
      return ygn('Pass', 'မဝယ်ဘူး');
    },
    pay: (amount: number) => ygn(`Pay ${money(amount)}`, `${money(amount)} ပေးမယ်`),
    get ok() {
      return ygn('OK', 'အိုကေ');
    },
    get continue() {
      return ygn('Continue', 'ဆက်သွား');
    },
    get done() {
      return ygn('Done', 'ပြီးပြီ');
    },
    get ready() {
      return ygn('I’m ready', 'အဆင်သင့်ပဲ');
    },
    get since() {
      return ygn('Since your last turn:', 'ပြီးခဲ့တဲ့ အလှည့်ကစပြီး:');
    },
    get nothingSince() {
      return ygn('Nothing happened to you since your last turn.', 'ပြီးခဲ့တဲ့ အလှည့်ကစပြီး ဘာမှ မဖြစ်ခဲ့ဘူး။');
    },
    yourTurn: (name: string) => ygn(`${name}, your turn`, `${name}၊ မင်းအလှည့်`),
    decides: (name: string) => ygn(`${name} decides`, `${name} ဆုံးဖြတ်နေတယ်`),
    total: (n: number) => ygn(`Total ${n}`, `စုစုပေါင်း ${dMy(n)}`),
    die: (n: number) => ygn(`Die showing ${n}`, `အန်စာ ${dMy(n)}`),
    bid: (amount: number) => ygn(`Bid ${money(amount)}`, `${money(amount)} ခေါ်မယ်`),
    get fold() {
      return ygn('Fold', 'လက်လျှော့');
    },
    waitingFor: (name: string) => ygn(`Waiting for ${name}`, `${name} ကို စောင့်နေတယ်`),
    /** The primary button while an animation plays: pressing it (or any key) finishes it. */
    get skip() {
      return ygn('Skip', 'ကျော်');
    },
  },
  players: {
    get title() {
      return ygn('Players', 'ကစားသူများ');
    },
    cities: (n: number) => (onYangon() ? `မြို့နယ် ${dMy(n)}` : plural(n, 'city', 'cities')),
    airports: (n: number) =>
      onYangon() ? `ယာဉ် ${dMy(n)}` : onMyanmar() ? plural(n, 'transport', 'transports') : plural(n, 'airport', 'airports'),
    companies: (n: number) => (onYangon() ? `ကုမ္ပဏီ ${dMy(n)}` : plural(n, 'company', 'companies')),
    freeStay: (n: number) => `${n} Free Stay`,
    get inJail() {
      return byMap('In Jail', 'In the camp', 'OT ဆင်းနေ');
    },
    get onVacation() {
      return byMap('On vacation', 'No fuel', 'ဆီတန်းစီနေ');
    },
    get bankrupt() {
      return ygn('Bankrupt', 'ဒေဝါလီ');
    },
    /** A bankrupt player's chip in the top bar (room play). */
    get out() {
      return ygn('Out', 'ထွက်ပြီ');
    },
    get current() {
      return ygn('Current player', 'လက်ရှိ ကစားသူ');
    },
    get jailCard() {
      return byMap('Get Out of Jail card', 'Call-up exemption card', 'ဆေးခွင့်လက်မှတ်');
    },
    voucher: 'Free House card',
    merit: (n: number) => (onYangon() ? `ကုသိုလ် ${dMy(n)} မှတ်` : plural(n, 'merit point', 'merit points')),
    draft: (status: 'hiding' | 'serving' | 'fled' | 'called', turns: number) =>
      onYangon()
        ? status === 'hiding'
          ? `ဖုန်းပိတ်ထား၊ ${dMy(turns)} အလှည့်`
          : status === 'serving'
            ? `OT ဆင်းနေ၊ ${dMy(turns)} အလှည့်`
            : status === 'fled'
              ? 'လက်ဖက်ရည်ဆိုင်မှာ'
              : 'OT ဆင်းခိုင်းခံရ'
        : status === 'hiding'
        ? `Hiding, ${plural(turns, 'turn', 'turns')}`
        : status === 'serving'
          ? `In the army, ${plural(turns, 'turn', 'turns')}`
          : status === 'fled'
            ? 'In Chiang Mai'
            : 'Called up',
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
    get country() {
      return byMap('Country', 'Region');
    },
    get complete() {
      return byMap('Country complete', 'Region complete');
    },
    countryProgress: (owned: number, total: number) => `${owned} of ${total} owned`,
    countryOwners: 'No single owner yet',
    noBuilding: 'No building',
    get completeEmpty() {
      return byMap('Country complete, no building', 'Region complete, no building');
    },
    houses: (n: number) => plural(n, 'house', 'houses'),
    hotel: 'Hotel',
    airportsOwned: (n: number) => (onMyanmar() ? plural(n, 'transport', 'transports') : plural(n, 'airport', 'airports')),
    companyFormula: (multiplier: number) => `Dice total ${TIMES} ${money(multiplier)}`,
    companyBetween: (a: string, b: string) => `Between ${a} and ${b}`,
    pinned: 'Pinned',
    unpin: 'Unpin',
    get noAirportSet() {
      return byMap('Airports belong to no country set.', 'Transport belongs to no region set.');
    },
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
      merit: (left: number) => `Skip it with a merit point (${left} left)`,
      rankHalf: (owner: string, rank: number) => `${owner} holds army rank ${rank}: half rent, since the army pays them.`,
      freeStayHint: 'A Free Stay token skips the rent on another player’s city.',
    },
    company: {
      title: (name: string) => name,
      intro: (owner: string) => `Owned by ${owner}. Roll two dice: rent is the total times the multiplier.`,
      roll: 'Roll',
    },
    build: {
      title: (country: string) => `Build in ${country}`,
      current: 'Now',
      house: (cost: number) => `Build house · ${money(cost)}`,
      houseFree: 'Build house · free with Free House card',
      hotel: (cost: number) => `Build hotel · ${money(cost)}`,
      done: 'Done',
      maxed: 'This city has a hotel. Nothing more can be built.',
      /** A city row with a hotel already. */
      maxedShort: 'Hotel built',
      /** Marks the city the player is standing on. */
      here: 'You are here',
      get landingRule() {
        return byMap(
          'You can build on any city of this country during this move. Build evenly: a city gets its next house only when every city here has as many.',
          'You can build on any city of this region during this move. Build evenly: a city gets its next house only when every city here has as many.',
        );
      },
      rentNow: 'Rent now',
      rentNext: 'Rent after building',
    },
    card: {
      get chance() {
        return ygn('Chance', 'ဗေဒင်ဆရာ');
      },
      get event() {
        return byMap('Event', 'News', 'ရပ်ကွက်ထဲက');
      },
      boarding: 'Boarding pass',
      get cancelMerit() {
        return ygn('Cancel it with a merit point', 'ကုသိုလ် ၁ မှတ်နဲ့ ချေဖျက်မယ်');
      },
      ticket: (amount: number) => (onYangon() ? `ထီထိုးမယ် · ${money(amount)}` : `Buy a ticket · ${money(amount)}`),
      get noTicket() {
        return ygn('No ticket', 'မထိုးတော့ဘူး');
      },
      brokerPay: (amount: number) => (onYangon() ? `${money(amount)} ပေးမယ်` : `Pay ${money(amount)}`),
      get toCamp() {
        return ygn('Go to the Military camp', 'OT ဆင်းမယ်');
      },
      get news() {
        return byMap('World news', 'Myanmar news', 'ရပ်ကွက်ထဲက သတင်း');
      },
      get kept() {
        return ygn('Keep this card until you use it.', 'သုံးတဲ့အထိ ဒီကတ်ကို သိမ်းထားပါ။');
      },
    },
    jail: {
      title: (name: string) => byMap(`${name} is in Jail`, `${name} is in the Military camp`, `${name} OT ဆင်းနေရတယ်`),
      attempts: (used: number, max: number) =>
        onYangon() ? `အတူတူကျအောင် လှိမ့်ပြီးသား: ${dMy(used)} / ${dMy(max)}` : `Doubles attempts used: ${used} of ${max}`,
      get lastAttempt() {
        return onYangon()
          ? `ဒီတစ်ခါ မကျရင် ${money(BALANCE.jailFine)} ပေးပြီး ရွှေ့ရမယ်။`
          : `If this roll fails you must pay ${money(BALANCE.jailFine)} and move.`;
      },
      pay: (amount: number) => (onYangon() ? `${money(amount)} ပေးမယ်` : `Pay ${money(amount)}`),
      get useCard() {
        return byMap('Use Get Out of Jail card', 'Use Call-up exemption card', 'ဆေးခွင့်လက်မှတ် သုံးမယ်');
      },
      get roll() {
        return ygn('Roll for doubles', 'အတူတူကျအောင် လှိမ့်မယ်');
      },
    },
    vacation: {
      title: 'Vacation',
      landed: (name: string) => `${name} is on vacation. Their next turn will be skipped.`,
      skipTitle: (name: string) => byMap(`${name} is on vacation`, `${name} has no fuel`, `${name} ဆီတန်းစီနေရတယ်`),
      get skip() {
        return byMap(
          'This turn is skipped. Rent still comes in as usual.',
          'Fuel shortage: this turn is skipped. Rent still comes in as usual.',
          'ဆီပြတ်နေလို့ ဒီအလှည့် ကျော်ရမယ်။ အိမ်လခတော့ ပုံမှန် ဝင်နေမယ်။',
        );
      },
    },
    // Myanmar map (D102); on the Yangon map the same rules are overtime (D116).
    draft: {
      title: (name: string) => (onYangon() ? `${name} ကို OT ဆင်းခိုင်းပြီ` : `${name} is called up`),
      get intro() {
        return ygn(
          'Choose how to deal with military service. Your rent still comes in meanwhile.',
          'OT ကို ဘယ်လို ဖြေရှင်းမလဲ ရွေးပါ။ အဲဒီအတောအတွင်း အိမ်လခ ဆက်ဝင်နေမယ်။',
        );
      },
      pay: (amount: number) => (onYangon() ? `ခွင့်တိုင်ခ ${money(amount)} ပေးမယ်` : `Pay ${money(amount)}`),
      get payHint() {
        return onYangon()
          ? `လက်ထဲငွေရဲ့ ၁၀ ပုံ ၁ ပုံ၊ အနည်းဆုံး ${money(MYANMAR.draftPayMin)}။ ချက်ချင်း လွတ်မယ်။`
          : `A tenth of your cash, at least ${money(MYANMAR.draftPayMin)}. Free at once.`;
      },
      get hide() {
        return ygn('Hide', 'ဖုန်းပိတ်ထားမယ်');
      },
      get hideHint() {
        return ygn(`Skip ${MYANMAR.draftHideTurns} turns.`, `${dMy(MYANMAR.draftHideTurns)} အလှည့် ကျော်ရမယ်။`);
      },
      flee: (amount: number) =>
        onYangon() ? `အလုပ်ထွက်ပြီး လက်ဖက်ရည်ဆိုင်ပြေးမယ် · ${money(amount)}` : `Flee to Chiang Mai · ${money(amount)}`,
      get fleeHint() {
        return ygn(
          `To the Chiang Mai corner. Skip ${MYANMAR.draftFleeTurns} turn. Rent still comes in.`,
          `လက်ဖက်ရည်ဆိုင် ထောင့်ကွက်ကို သွားမယ်။ ${dMy(MYANMAR.draftFleeTurns)} အလှည့် ကျော်ရမယ်။ အိမ်လခ ဆက်ဝင်မယ်။`,
        );
      },
      get serve() {
        return ygn('Serve', 'OT ဆင်းမယ်');
      },
      get serveHint() {
        return onYangon()
          ? `${dMy(MYANMAR.draftServeTurns)} အလှည့် ကျော်ရမယ်။ ပြီးရင် OT ကြေး ${money(MYANMAR.draftServeBonus)} နဲ့ ရာထူးတိုးမယ်: ရာထူးလစာ ရပေမဲ့ အိမ်လခ တစ်ဝက်ပဲ ရမယ်။`
          : `Skip ${MYANMAR.draftServeTurns} turns. ${money(MYANMAR.draftServeBonus)} on return, and a rank: army salary, but half rent.`;
      },
      get merit() {
        return ygn('Use a merit point', 'ကုသိုလ် ၁ မှတ် သုံးမယ်');
      },
      get meritHint() {
        return ygn('Free at once.', 'ချက်ချင်း လွတ်မယ်။');
      },
      get card() {
        return ygn('Use Call-up exemption card', 'ဆေးခွင့်လက်မှတ် သုံးမယ်');
      },
      get cardHint() {
        return ygn('Free at once.', 'ချက်ချင်း လွတ်မယ်။');
      },
      skipTitle: (name: string, status: 'hiding' | 'serving' | 'fled' | 'called') =>
        onYangon()
          ? status === 'hiding'
            ? `${name} ဖုန်းပိတ်ထားတယ်`
            : status === 'serving'
              ? `${name} OT ဆင်းနေတယ်`
              : status === 'fled'
                ? `${name} လက်ဖက်ရည်ဆိုင်မှာ`
                : `${name} ကို OT ဆင်းခိုင်းပြီ`
          : status === 'hiding'
            ? `${name} is in hiding`
            : status === 'serving'
              ? `${name} is serving in the army`
              : status === 'fled'
                ? `${name} is in Chiang Mai`
                : `${name} is called up`,
      skip: (left: number) =>
        onYangon()
          ? left > 0
            ? `ဒီအလှည့် ကျော်ရမယ်။ နောက်ထပ် ${dMy(left)} အလှည့် ကျန်သေးတယ်။`
            : 'ဒီအလှည့် ကျော်ရမယ်။ ပြီးရင် လွတ်ပြီ။'
          : left > 0
            ? `This turn is skipped. ${plural(left, 'more turn', 'more turns')} after this one.`
            : 'This turn is skipped. Free after it.',
      get noRent() {
        return ygn('No rent comes in meanwhile.', 'အဲဒီအတောအတွင်း အိမ်လခ မဝင်ဘူး။');
      },
      get rentStill() {
        return ygn('Rent still comes in.', 'အိမ်လခ ဆက်ဝင်နေတယ်။');
      },
      bonus: (amount: number) =>
        onYangon() ? `ဒီအလှည့်ပြီးရင် OT ပြီးပြီ: ${signedMoney(amount)}။` : `Back from the army after this turn: ${signedMoney(amount)}.`,
      get leaveMerit() {
        return ygn('Leave now with a merit point', 'ကုသိုလ် ၁ မှတ်နဲ့ အခုပဲ ထွက်မယ်');
      },
      get leaveCard() {
        return ygn('Leave now with the exemption card', 'ဆေးခွင့်လက်မှတ်နဲ့ အခုပဲ ထွက်မယ်');
      },
    },
    donation: {
      title: (name: string) => (onYangon() ? `${name} မှာ လှူမလား?` : `Donate at ${name}?`),
      text: (amount: number) => (onYangon() ? `${money(amount)} လှူရင် ကုသိုလ် ၁ မှတ် ရမယ်။` : `Donate ${money(amount)} for 1 merit point.`),
      have: (merit: number, max: number) => (onYangon() ? `ကုသိုလ်: ${dMy(merit)} / ${dMy(max)}` : `Merit points: ${merit} of ${max}`),
      get uses() {
        return ygn(
          'A merit point frees you from military service, skips one rent, or cancels a bad Chance card.',
          'ကုသိုလ် ၁ မှတ်နဲ့ OT က လွတ်တာ၊ အိမ်လခ ၁ ကြိမ် ကျော်တာ၊ ဆိုးတဲ့ ဗေဒင်ဆရာကတ် ချေဖျက်တာ လုပ်လို့ရတယ်။',
        );
      },
      give: (amount: number) => (onYangon() ? `${money(amount)} လှူမယ်` : `Donate ${money(amount)}`),
      get no() {
        return ygn('No thanks', 'မလှူတော့ဘူး');
      },
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
        toll: (name: string) => `Toll for ${name}`,
        get jailFine() {
          return byMap('Jail fine', 'Military camp fine');
        },
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
    get jailCards() {
      return byMap('Get Out of Jail cards', 'Call-up exemption cards');
    },
    none: 'Nothing to offer',
    blocked: (country: string) => `Sell the buildings in ${country} first`,
    send: 'Send offer',
    cancel: 'Cancel',
    handTo: (name: string) => `Hand the device to ${name}`,
    offerFrom: (name: string) => `${name} offers you a trade`,
    offerTo: (name: string) => `Your offer to ${name}`,
    offerBetween: (from: string, to: string) => `${from} offers ${to} a trade`,
    counterFrom: (name: string) => `${name}’s counter-offer`,
    counterTo: (name: string) => `Your counter-offer to ${name}`,
    counterBetween: (from: string, to: string) => `${from}’s counter-offer to ${to}`,
    theyGive: (name: string) => `${name} gives`,
    youGiveBack: 'You give',
    accept: 'Accept',
    reject: 'Reject',
    counter: 'Counter-offer',
    /** The stamp on a counter-offer: which round of the negotiation it is. */
    counterStamp: (round: number) => (round > 1 ? `Counter-offer ${round}` : 'Counter-offer'),
    withdraw: 'Withdraw offer',
    /** Beside an item that was not in the previous offer. */
    isNew: 'New',
    /** Beside an item the previous offer had and this one does not. */
    dropped: 'Taken out',
    /** Beside an amount that changed since the previous offer. */
    was: (amount: string) => `was ${amount}`,
    from: 'Offer from',
    counterTitle: (name: string) => `Counter-offer to ${name}`,
    sendCounter: 'Send counter-offer',
    nothing: 'Nothing',
    mortgagedNote: 'Mortgaged properties stay mortgaged.',
    get notTradeable() {
      return byMap('Free Stay tokens and Free House cards cannot be traded.', 'Merit points cannot be traded.');
    },
  },
  // Myanmar map: rank, the general and unrest (spec v2, D107)
  general: {
    title: 'General',
    none: `No general yet: rank ${MYANMAR.generalMinRank} is needed`,
    who: (name: string, rank: number) => `General: ${name}, rank ${rank}`,
    unrest: (used: number, needed: number) => `Unrest ${used}/${needed}`,
    ready: 'Power ready',
    wait: (rounds: number) => (rounds === 1 ? 'Power in 1 round' : `Power in ${rounds} rounds`),
    rank: (n: number) => `Rank ${n}`,
    badge: 'General',
    cups: (n: number) => plural(n, 'unrest cup', 'unrest cups'),
    usePower: 'Use power',
    bribe: 'Bribe',
    rolled: (total: number, outcome: 'money' | 'land') =>
      outcome === 'money' ? `Rolled ${total}: money from the richest player` : `Rolled ${total}: a property from the richest player`,
    pickPlayer: 'The richest player pays',
    pickLand: (name: string) => `${name} is the richest player with a property the power may take. Which one?`,
    targetTitle: 'The general’s power',
    windowTitle: (general: string) => `${general} uses the general’s power`,
    windowMoney: (target: string, amount: number) => `${target} is to pay ${money(amount)}.`,
    windowLand: (target: string, space: string) => `${target} is to lose ${space}.`,
    windowHint: (needed: number) => `Show an unrest cup to stand against it. At ${needed} cups the general falls, loses all rank and this use is cancelled.`,
    countdown: (seconds: number) => `${seconds} s`,
    show: 'Show unrest',
    hold: 'Hold back',
    block: (merit: number) => `Block with ${merit} merit points`,
    answered: (name: string, use: boolean, block: boolean) => (block ? `${name} blocked it` : use ? `${name} showed unrest` : `${name} held back`),
    waiting: (name: string) => `${name} is deciding`,
    bribeTitle: 'Offer a bribe',
    bribeTo: 'To',
    bribeAmount: 'Amount',
    bribeHint: 'If they accept, they get the money now and cannot show unrest at your next use of power.',
    bribeSend: 'Offer',
    bribeOffer: (general: string, to: string, amount: number) => `${general} offers ${to} ${money(amount)} to hold back`,
    bribeAccept: 'Take the money',
    bribeReject: 'Turn it down',
  },
  // Myanmar map: loans between players (D104)
  loan: {
    button: 'Loan',
    title: 'Ask for a loan',
    counterTitle: (name: string) => `New loan terms for ${name}`,
    borrower: 'Borrower',
    lender: 'Ask',
    amount: 'Amount',
    rate: 'Interest each round',
    term: 'Rounds to pay back',
    collateral: 'Collateral',
    collateralHint: 'If the loan is not paid back in time, the lender takes these. Until then they cannot be built on, mortgaged or traded.',
    noCollateral: 'Nothing can be pledged now: it must be yours, unmortgaged, with no buildings in its region.',
    send: 'Ask for the loan',
    sendCounter: 'Send new terms',
    cancel: 'Cancel',
    request: (borrower: string, lender: string) => `${borrower} asks ${lender} for a loan`,
    counterBetween: (from: string, to: string) => `${from}’s new loan terms for ${to}`,
    stamp: (round: number) => (round > 1 ? `New terms ${round}` : 'New terms'),
    lends: (lender: string, borrower: string) => `${lender} lends ${borrower}`,
    terms: (rate: number, term: number) => `${rate}% a round · ${plural(term, 'round', 'rounds')}`,
    cap: (amount: number) => `Never more than ${money(amount)} owed`,
    accept: 'Accept',
    counter: 'New terms',
    reject: 'Reject',
    withdraw: 'Withdraw request',
    listTitle: 'Loans',
    owes: (borrower: string, lender: string) => `${borrower} owes ${lender}`,
    owedNow: 'Owed now',
    roundsLeft: (n: number) => (n === 0 ? 'Due at the next round' : `${plural(n, 'round', 'rounds')} left`),
    payBack: (amount: number) => `Pay back · ${money(amount)}`,
    pledged: 'Pledged for a loan',
  },
  properties: {
    title: (name: string) => `${name}’s properties`,
    none: 'No properties yet.',
    get airports() {
      return byMap('Airports', 'Transport');
    },
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
    get airports() {
      return byMap('Airports', 'Transport');
    },
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
    get tableAirports() {
      return byMap('Airports owned', 'Transport owned');
    },
    tableCompany: 'Company',
    tableCompaniesOwned: 'Companies owned',
    tableRank: 'Rank',
    tableSalary: 'Salary each time',
    tablePrice: 'Price',
    tableMultiplier: 'Multiplier',
    baseRent: 'Base rent',
    get incompleteRow() {
      return byMap('Country not complete', 'Region not complete');
    },
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

type SpecialKey = SpecialType | 'incomeTax' | 'luxuryTax' | 'rest';

const WORLD_SPECIAL_NAMES: Readonly<Record<SpecialKey, string>> = {
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
  temple: 'Pagoda',
  rest: 'Rest',
};

/** The Myanmar map's special spaces, in English and Burmese (D101). */
const MYANMAR_SPECIAL_NAMES: Readonly<Record<SpecialKey, readonly [string, string]>> = {
  start: ['Start', 'စတင်ရာ'],
  chance: ['Chance', 'ကံစမ်းမဲ'],
  event: ['News', 'သတင်း'],
  tax: ['Tax', 'အခွန်'],
  incomeTax: ['Income tax', 'ဝင်ငွေခွန်'],
  luxuryTax: ['Special tax', 'အခွန်ထူး'],
  jail: ['Military camp', 'စစ်မှုထမ်းစခန်း'],
  goToJail: ['Call-up letter', 'ခေါ်စာရောက်ပြီ'],
  vacation: ['Chiang Mai', 'ချင်းမိုင်'],
  freeParking: ['Rest', 'နားရာ'],
  temple: ['Pagoda', 'ဘုရား'],
  rest: ['Rest', 'နားရာ'],
};

/** The Yangon map's special spaces, in Burmese only (D116). */
const YANGON_SPECIAL_NAMES: Readonly<Record<SpecialKey, string>> = {
  start: 'လစာထုတ်ရက်',
  chance: 'ဗေဒင်ဆရာ',
  event: 'ရပ်ကွက်ထဲက',
  tax: 'အခွန်',
  incomeTax: 'မီးစက်ဆီဖိုး',
  luxuryTax: 'မင်္ဂလာဆောင်လက်ဖွဲ့',
  jail: 'OT ဆင်းနေရတယ်',
  goToJail: 'Boss က Teams မှာ Urgent ပို့လာပြီ',
  vacation: 'လက်ဖက်ရည်ဆိုင်',
  freeParking: 'ခဏနား',
  temple: 'ဘုရား',
  rest: 'ခဏနား',
};

/** What happens on each special space of the Yangon map (Focus Card), in Burmese (D116). */
function yangonSpecialText(key: SpecialKey): string {
  switch (key) {
    case 'start':
      return `ရှေ့ဆက်သွားရင်း ဖြတ်တိုင်း ဒါမှမဟုတ် ဆိုက်တိုင်း လစာ ${money(RULES.startBonus)} ရမယ်။`;
    case 'chance':
      return 'ဗေဒင်ဆရာကတ် အပေါ်ဆုံးတစ်ကတ် ဆွဲပြီး ပြောတဲ့အတိုင်း လုပ်ပါ။';
    case 'event':
      return 'ရပ်ကွက်ထဲက ကတ် အပေါ်ဆုံးတစ်ကတ် ဆွဲပါ: လူတိုင်းကို သက်ရောက်နိုင်တဲ့ သတင်း။';
    case 'tax':
      return 'အခွန်ကို ဘဏ်ထဲ ပေးပါ။';
    case 'incomeTax':
      return `မီးပျက်လို့ မီးစက်ဆီဖိုး ${money(RULES.incomeTax)} ဘဏ်ထဲ ပေးပါ။`;
    case 'luxuryTax':
      return `မင်္ဂလာဆောင်လက်ဖွဲ့ ${money(RULES.luxuryTax)} ဘဏ်ထဲ ပေးပါ။`;
    case 'jail':
      return 'ရုံးဘေးက ဖြတ်သွားရုံပဲ: ဘာမှ မဖြစ်ဘူး။ OT ဆင်းခိုင်းခံရသူတွေ ဒီမှာ စောင့်ရတယ်။';
    case 'goToJail':
      return `OT ကွက်ကို တန်းသွားပါ။ ${YANGON_SPECIAL_NAMES.start} ဖြတ်သွားပေမဲ့ ဘာမှ မရဘူး။`;
    case 'vacation':
      return 'ဒီမှာ ဆိုက်ရင် ရပ်ကွက်အိုးထဲက ငွေ အားလုံး ယူရမယ်။ အလုပ်ထွက်ပြေးသူတွေ ဒီကို ရောက်လာတယ်။';
    case 'freeParking':
      return 'ဘာမှ မဖြစ်ဘူး။';
    case 'temple':
      return 'ဘုရားဖူး ခဏနားရာ: ဘာမှ မဖြစ်ဘူး။';
    case 'rest':
      return 'ဘာမှ မဖြစ်ဘူး: ဒီကတ်အုပ် ပိတ်ထားတယ်။';
  }
}

/** A special space's name on the map in play (pagodas are named from the board data). */
export function specialName(key: SpecialKey): string {
  if (MAP.id === 'yangon') return YANGON_SPECIAL_NAMES[key];
  if (MAP.id === 'myanmar') {
    const [en, my] = MYANMAR_SPECIAL_NAMES[key];
    return pick(en, my);
  }
  return WORLD_SPECIAL_NAMES[key];
}

/** What happens on each special space (Focus Card), on the map in play. */
export function specialText(key: SpecialKey): string {
  if (MAP.id === 'yangon') return yangonSpecialText(key);
  const myanmar = MAP.id === 'myanmar';
  switch (key) {
    case 'start':
      return `Collect ${money(RULES.startBonus)} each time you pass or land here moving forward.`;
    case 'chance':
      return 'Draw the top Chance card and do what it says.';
    case 'event':
      return myanmar ? 'Draw the top News card: Myanmar news that can affect everyone.' : 'Draw the top Event card: world news that can affect everyone.';
    case 'tax':
      return 'Pay the tax to the bank.';
    case 'incomeTax':
      return `Pay ${money(RULES.incomeTax)} to the bank.`;
    case 'luxuryTax':
      return `Pay ${money(RULES.luxuryTax)} to the bank.`;
    case 'jail':
      return myanmar
        ? 'Just visiting: nothing happens. Players called up for military service wait here.'
        : 'Just visiting: nothing happens. Players sent to Jail wait here.';
    case 'goToJail':
      return myanmar
        ? `Go straight to the Military camp. You collect nothing for passing ${specialName('start')}.`
        : 'Go straight to Jail. You collect nothing for passing World Start.';
    case 'vacation':
      return myanmar
        ? 'Land here to take everything in the community pot. Players who flee military service come here.'
        : 'Your next turn is skipped. You still collect rent.';
    case 'freeParking':
      return 'Nothing happens.';
    case 'temple':
      return 'A place to pause: nothing happens.';
    case 'rest':
      return 'Nothing happens: this card deck is switched off.';
  }
}

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

/** A deck's name on the map in play: Chance, and Event (News on the Myanmar map). */
export function deckName(deck: DeckId): string {
  return specialName(deck);
}

const MODIFIER_NAMES: Readonly<Record<ModifierType, string>> = {
  cityRent: 'City rent',
  airportRent: 'Airport rent',
  companyRent: 'Company rent',
  buildCost: 'Build cost',
  groupRent: 'City rent',
  transportRent: 'Transport rent',
  companyBoost: 'Company rent',
  noTrade: 'Trading closed',
};

/** The modifiers' names on the Yangon map, in Burmese (D116). */
const YANGON_MODIFIER_NAMES: Readonly<Record<ModifierType, string>> = {
  cityRent: 'အိမ်လခ',
  airportRent: 'ကားခ',
  companyRent: 'ကုမ္ပဏီ ဝင်ငွေ',
  buildCost: 'ဆောက်လုပ်ခ',
  groupRent: 'အိမ်လခ',
  transportRent: 'ကားခ',
  companyBoost: 'ကုမ္ပဏီ ဝင်ငွေ',
  noTrade: 'ရောင်းဝယ်ခွင့် ပိတ်',
};

/** A Myanmar company's name in the device's language. */
function companyName(id: string): string {
  const company = MYANMAR_COMPANIES.find((c) => c.id === id);
  return company ? pick(company.shortName, company.shortNameMy) : id;
}

/** "A and B", "A, B and C". */
function andList(items: string[]): string {
  return items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** "City rent +25%"; on the Myanmar map "Rakhine and Shan rent +100%" or "Muse Border Gate closed". */
export function modifierLabel(type: ModifierType, factor: number, cardId: string | null = null): string {
  const pct = Math.round((factor - 1) * 100);
  const change = `${pct > 0 ? '+' : MINUS}${Math.abs(pct)}%`;
  const effect = cardId ? (MYANMAR_CARD_BY_ID.get(cardId) ?? YANGON_CARD_BY_ID.get(cardId))?.effect : undefined;
  const my = onYangon();
  if (effect?.type === 'groupRent') {
    const groups = effect.groups.map(groupName);
    return my ? `${groups.join('၊ ')} အိမ်လခ ${change}` : `${andList(groups)} rent ${change}`;
  }
  if (effect?.type === 'blackout' && type === 'companyBoost') return my ? `${companyName(effect.company)} ဝင်ငွေ ${change}` : `${companyName(effect.company)} rent ${change}`;
  if (effect?.type === 'noTrade') return my ? `${companyName(effect.company)} ပိုင်သူပဲ ရောင်းဝယ်လို့ရ` : `Only the ${companyName(effect.company)} owner trades`;
  if (effect?.type === 'transportClosed') {
    const transport = (onMyanmar() ? (AIRPORTS as readonly MyanmarTransport[]) : MYANMAR_TRANSPORT).find((t) => t.kind === effect.kind);
    if (transport) return my ? `${transport.nameMy} ပိတ်ထား` : `${pick(transport.name, transport.nameMy)} closed`;
    return `${MODIFIER_NAMES[type]} ${change}`;
  }
  if (my) return `${YANGON_MODIFIER_NAMES[type]} ${change}`;
  return `${MODIFIER_NAMES[type]} ${change}`;
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
  tradeWait: (x) =>
    p(x, 'player') ? `Offers can be sent once ${p(x, 'player')} has made their decision.` : 'Offers can be sent between decisions.',
  notEnoughCash: (x) => `You don't have enough money. You need ${m(x, 'needed')} and have ${m(x, 'have')}.`,
  notProperty: () => 'That space cannot be owned.',
  notOwner: (x) => `${p(x, 'name')} is not yours.`,
  notCity: () => 'Only cities can have houses and hotels.',
  alreadyMortgaged: (x) => `${p(x, 'name')} is already mortgaged.`,
  notMortgaged: (x) => `${p(x, 'name')} is not mortgaged.`,
  countryHasBuildings: (x) => `Sell the buildings in ${p(x, 'country')} first.`,
  countryIncomplete: (x) => `You need every city in ${p(x, 'country')} before building.`,
  countryMortgaged: (x) => `Unmortgage ${p(x, 'name')} before building in ${p(x, 'country')}.`,
  notLandedHere: (x) =>
    p(x, 'country')
      ? `You can build in ${p(x, 'country')} only during a move that lands on one of its cities.`
      : byMap('You can build only during a move that lands on a city of that country.', 'You can build only during a move that lands on a city of that region.'),
  evenBuild: (x) => `Your other ${p(x, 'country')} cities must have the same number of houses first.`,
  hasHotel: (x) => `${p(x, 'name')} already has a hotel.`,
  noBuildings: (x) => `${p(x, 'name')} has no buildings to sell.`,
  evenSell: (x) => `Sell evenly: start with the ${p(x, 'country')} city that has the most buildings.`,
  noJailCard: () => byMap('You have no Get Out of Jail card.', 'You have no Call-up exemption card.'),
  bidTooLow: (x) => `Your bid must be at least ${m(x, 'min')}.`,
  bidTooHigh: (x) => `You can't bid more than your cash (${m(x, 'cash')}).`,
  invalidAmount: () => byMap('Enter a whole number of dollars.', 'Enter a whole number of lakh.'),
  freeStayUnavailable: () => "Free Stay can be used only on another player's city, and you need a token.",
  debtNotCovered: (x) => `You still need ${m(x, 'shortfall')} more to pay.`,
  tradeInvalidPlayer: () => 'Pick another player who is still in the game.',
  tradeEmpty: () => 'Add at least one item to the trade.',
  tradeNotOwned: (x) => `${p(x, 'name')} does not belong to ${p(x, 'player')}.`,
  tradeBuildings: (x) => `Sell the buildings in ${p(x, 'country')} before trading ${p(x, 'name')}.`,
  tradeCash: (x) => `${p(x, 'player')} doesn't have ${m(x, 'amount')}.`,
  tradeCards: (x) =>
    byMap(`${p(x, 'player')} doesn't have that many Get Out of Jail cards.`, `${p(x, 'player')} doesn't have that many Call-up exemption cards.`),
  noUnmortgageInDebt: () => 'Pay your debt before unmortgaging.',
  invalidAction: () => 'That action is not available.',
  noMerit: () => 'You have no merit point.',
  meritFull: () => `You already hold ${MYANMAR.meritMax} merit points, the most anyone keeps.`,
  tradeBlocked: () => 'The internet is cut: only the owner of MPT can offer trades or loans until it is back.',
  loanPending: (x) => `${p(x, 'player')} must answer the loan offer first.`,
  loanTerms: () =>
    `A loan needs a whole amount of at least ${money(1)}, a rate of 0 to ${MYANMAR.loanMaxRatePercent}% a round and a term of 1 to ${MYANMAR.loanMaxTerm} rounds.`,
  loanCollateral: (x) =>
    p(x, 'name')
      ? `${p(x, 'name')} cannot be collateral: it must be the borrower’s, unmortgaged, with no buildings in its region.`
      : 'Pick at least one property of the borrower as collateral.',
  pledged: (x) => `${p(x, 'name')} is pledged for a loan until it is paid back.`,
  loanRepay: (x) => `Pay back between ${money(1)} and ${m(x, 'max')}.`,
  powerNotReady: () => `The general’s power can be used on the general’s own turn, once in ${MYANMAR.powerEveryRounds} rounds.`,
  powerTarget: () => 'The power hits the richest player; for land, one of their properties without buildings, not pledged, in a region without buildings.',
  unrestNone: () => 'No unrest cup left to show, or paid not to show one this time.',
  meritShort: () => `Only the player the power hits can block it, with ${MYANMAR.powerBlockMerit} merit points.`,
  rankNoBuy: (x) => `${p(x, 'player') || 'A player'} holds army rank ${MYANMAR.noBuyRank} or more and may not buy land.`,
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
      const what = calc.level === 0 ? byMap('country complete', 'region complete') : levelText(calc.level).toLowerCase();
      return `${spaceName}, ${what}: ${money(calc.baseRent)} ${TIMES} ${calc.multiplier} = ${total(calc.baseRent * calc.multiplier, calc.factor)}`;
    }
    case 'airport':
      return `${spaceName}, ${T.focus.airportsOwned(calc.owned)} owned: ${total(calc.ladderRent, calc.factor)}`;
    case 'company':
      return `Dice ${calc.dice[0]} + ${calc.dice[1]} = ${calc.total}: ${calc.total} ${TIMES} ${money(calc.multiplier)} = ${total(calc.total * calc.multiplier, calc.factor)}`;
    case 'tax':
      return `${specialName(calc.tax === 'income' ? 'incomeTax' : 'luxuryTax')}: pay ${money(calc.tax === 'income' ? RULES.incomeTax : RULES.luxuryTax)} to the bank`;
  }
}

const REASON_TEXT: Readonly<Record<MoneyReason, string>> = {
  get start() {
    return specialName('start');
  },
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
  get jailFine() {
    return byMap('Jail fine', 'Military camp fine');
  },
  trade: 'trade',
  bankruptcy: 'bankruptcy',
  debug: 'debug',
  get draft() {
    return ygn('military service', 'OT');
  },
  merit: 'donation',
  toll: 'toll',
  pot: 'community pot',
  remittance: 'money from home',
  lottery: 'lottery',
  loan: 'loan',
  get salary() {
    return ygn('army salary', 'ရာထူးလစာ');
  },
  get power() {
    return ygn('the general’s power', 'Boss ကြီးရဲ့ အာဏာ');
  },
  bribe: 'bribe',
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
      return `${who(e.player)} passed ${specialName('start')}: ${signedMoney(e.amount)}.`;
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
      const what =
        e.reason === 'incomeTax' || e.reason === 'luxuryTax' ? specialName(e.reason) : byMap('the Jail fine', 'the Military camp fine');
      return `${who(e.player)} paid ${what}: ${signedMoney(-e.amount)}.`;
    }
    case 'cardDrawn':
      return `${who(e.player)} drew ${deckName(e.deck)}: ${n.cardTitle(e.cardId)}.`;
    case 'deckShuffled':
      return `The ${deckName(e.deck)} deck was reshuffled.`;
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
      return `${modifierLabel(e.modifier.type, e.modifier.factor, e.modifier.cardId)} until ${who(e.modifier.drawnBy)}’s next turn.`;
    case 'modifierEnded':
      return `${modifierLabel(e.modifier.type, e.modifier.factor, e.modifier.cardId)} has ended.`;
    case 'built':
      return `${who(e.player)} built ${e.level === 5 ? 'a hotel' : 'a house'} on ${n.space(e.space)}${e.voucher ? ' with a Free House card' : ` for ${money(e.cost)}`}.`;
    case 'buildingSold':
      return `${who(e.player)} sold a building on ${n.space(e.space)}: ${signedMoney(e.refund)}.`;
    case 'mortgaged':
      return `${who(e.player)} mortgaged ${n.space(e.space)}: ${signedMoney(e.amount)}.`;
    case 'unmortgaged':
      return `${who(e.player)} unmortgaged ${n.space(e.space)}: ${signedMoney(-e.cost)}.`;
    case 'jailed':
      if (onYangon()) {
        return e.reason === 'doubles'
          ? `${who(e.player)} အတူတူ ၃ ကြိမ်ကျလို့ OT ဆင်းရပြီ။`
          : `${who(e.player)} OT ဆင်းရပြီ။`;
      }
      if (onMyanmar()) {
        return e.reason === 'doubles'
          ? `${who(e.player)} rolled a third double and went to the Military camp.`
          : `${who(e.player)} went to the Military camp.`;
      }
      return e.reason === 'doubles'
        ? `${who(e.player)} rolled a third double and went to Jail.`
        : `${who(e.player)} went to Jail.`;
    case 'jailRollFailed':
      return byMap(
        `${who(e.player)} stays in Jail (attempt ${e.attempts}).`,
        `${who(e.player)} stays in the camp (attempt ${e.attempts}).`,
        `${who(e.player)} OT ဆက်ဆင်းရတယ် (${dMy(e.attempts)} ကြိမ်မြောက်)။`,
      );
    case 'leftJail':
      if (onYangon()) {
        return e.how === 'card'
          ? `${who(e.player)} ဆေးခွင့်လက်မှတ် သုံးလိုက်တယ်။`
          : e.how === 'fine'
            ? `${who(e.player)} ခွင့်တိုင်ခ ပေးပြီး OT က ထွက်တယ်။`
            : e.how === 'forcedFine'
              ? `${who(e.player)} ဒဏ်ကြေး ပေးပြီး OT က ထွက်တယ်။`
              : `${who(e.player)} အတူတူကျလို့ OT က ထွက်တယ်။`;
      }
      if (onMyanmar()) {
        return e.how === 'card'
          ? `${who(e.player)} used a Call-up exemption card.`
          : e.how === 'fine'
            ? `${who(e.player)} paid to leave the camp.`
            : e.how === 'forcedFine'
              ? `${who(e.player)} paid the fine and leaves the camp.`
              : `${who(e.player)} rolled doubles and leaves the camp.`;
      }
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
    case 'tradeCountered':
      return `${who(e.from)} answered ${who(e.to)} with a counter-offer.`;
    case 'tradeWithdrawn':
      return `${who(e.from)} withdrew their offer to ${who(e.to)}.`;
    case 'tradeCancelled':
      return `The trade between ${who(e.from)} and ${who(e.to)} was cancelled.`;
    case 'playerRemoved':
      return `${who(e.player)} left the game.`;
    case 'gameOver':
      return e.winners.length > 1
        ? `Game over: shared win for ${e.winners.map(who).join(' and ')}.`
        : `Game over: ${who(e.winners[0] ?? 0)} wins.`;
    case 'draftChosen':
      if (onYangon()) {
        switch (e.how) {
          case 'pay':
            return `${who(e.player)} ခွင့်တိုင်ခ ${money(e.cost)} ပေးပြီး OT မဆင်းတော့ဘူး။`;
          case 'hide':
            return `${who(e.player)} ဖုန်းပိတ်ထားလိုက်တယ်: ${dMy(MYANMAR.draftHideTurns)} အလှည့် ကျော်ရမယ်။`;
          case 'serve':
            return `${who(e.player)} OT ဆင်းတယ်: ${dMy(MYANMAR.draftServeTurns)} အလှည့် ကျော်ပြီး ပြန်လာရင် ${money(MYANMAR.draftServeBonus)} ရမယ်။`;
          case 'flee':
            return `${who(e.player)} ${money(e.cost)} ပေးပြီး အလုပ်ထွက်လို့ လက်ဖက်ရည်ဆိုင် ပြေးတယ်။`;
          case 'merit':
            return `${who(e.player)} ကုသိုလ် ၁ မှတ် သုံးပြီး လွတ်သွားတယ်။`;
          case 'card':
            return `${who(e.player)} ဆေးခွင့်လက်မှတ် သုံးပြီး လွတ်သွားတယ်။`;
        }
        return null;
      }
      switch (e.how) {
        case 'pay':
          return `${who(e.player)} paid ${money(e.cost)} to stay out of military service.`;
        case 'hide':
          return `${who(e.player)} went into hiding: ${MYANMAR.draftHideTurns} turns skipped.`;
        case 'serve':
          return `${who(e.player)} joined the army: ${MYANMAR.draftServeTurns} turns skipped, ${money(MYANMAR.draftServeBonus)} on return.`;
        case 'flee':
          return `${who(e.player)} fled to Chiang Mai for ${money(e.cost)}.`;
        case 'merit':
          return `${who(e.player)} spent a merit point and is free.`;
        case 'card':
          return `${who(e.player)} used a Call-up exemption card and is free.`;
      }
      return null;
    case 'draftEnded':
      if (onYangon()) {
        if (e.how === 'merit') return `${who(e.player)} ကုသိုလ် ၁ မှတ် သုံးပြီး OT က ထွက်တယ်။`;
        if (e.how === 'card') return `${who(e.player)} ဆေးခွင့်လက်မှတ် သုံးပြီး OT က ထွက်တယ်။`;
        return e.bonus > 0 ? `${who(e.player)} OT ပြီးပြီ: ${signedMoney(e.bonus)}။` : `${who(e.player)} ပြန်လွတ်ပြီ။`;
      }
      if (e.how === 'merit') return `${who(e.player)} spent a merit point to leave military service.`;
      if (e.how === 'card') return `${who(e.player)} used a Call-up exemption card to leave military service.`;
      return e.bonus > 0 ? `${who(e.player)} is back from the army: ${signedMoney(e.bonus)}.` : `${who(e.player)} is free again.`;
    case 'meritGained':
      if (onYangon()) return `${who(e.player)} မှာ ကုသိုလ် ${dMy(e.merit)} မှတ် ရှိပြီ။`;
      return `${who(e.player)} now has ${plural(e.merit, 'merit point', 'merit points')}.`;
    case 'rentWaived':
      if (onYangon()) {
        return e.why === 'draft'
          ? `${who(e.owner)} OT ဆင်းနေလို့ ${n.space(e.space)} အိမ်လခ မရဘူး။`
          : `${who(e.player)} ကုသိုလ် ၁ မှတ် သုံးလို့ ${n.space(e.space)} အိမ်လခ မပေးရဘူး။`;
      }
      return e.why === 'draft'
        ? `${who(e.owner)} is in military service: no rent for ${n.space(e.space)}.`
        : `${who(e.player)} spent a merit point: no rent for ${n.space(e.space)}.`;
    case 'cardCancelled':
      return `${who(e.player)} spent a merit point to cancel ${n.cardTitle(e.cardId)}.`;
    case 'fuelShortage':
      return e.players.length > 0
        ? `Fuel shortage: ${andList(e.players.map(who))} skip their next turn.`
        : 'Fuel shortage: nobody has to skip a turn.';
    case 'inflationRose':
      return `Inflation: city rents are now +${e.rate}%.`;
    case 'tollPaid':
      return `${who(e.from)} paid ${who(e.to)} a ${money(e.amount)} toll for passing ${n.space(e.space)}.`;
    case 'potAdded':
      return `${money(e.amount)} went into the community pot (now ${money(e.pot)}).`;
    case 'potTaken':
      return `${who(e.player)} took the community pot: ${signedMoney(e.amount)}.`;
    case 'remittance':
      return `${who(e.player)} received money from home: ${signedMoney(e.amount)}.`;
    case 'lotteryDrawn':
      return e.prize > 0
        ? `${who(e.player)} drew ${e.total} in the lottery and won ${money(e.prize)}.`
        : `${who(e.player)} drew ${e.total} in the lottery: no prize.`;
    case 'loanRequested':
      return `${who(e.from)} asked ${who(e.to)} for a loan.`;
    case 'loanCountered':
      return `${who(e.from)} answered ${who(e.to)} with new loan terms.`;
    case 'loanRejected':
      return `${who(e.to)} turned down ${who(e.from)}’s loan offer.`;
    case 'loanWithdrawn':
      return `${who(e.from)} withdrew their loan offer to ${who(e.to)}.`;
    case 'loanCancelled':
      return `The loan talks between ${who(e.from)} and ${who(e.to)} ended.`;
    case 'loanAccepted':
      return `${who(e.loan.lender)} lent ${who(e.loan.borrower)} ${money(e.loan.principal)} at ${e.loan.ratePercent}% a round for ${plural(e.loan.term, 'round', 'rounds')}.`;
    case 'loanRepaid':
      return e.left > 0
        ? `${who(e.borrower)} paid ${who(e.lender)} back ${money(e.amount)}${e.auto ? ' at Start' : ''}; ${money(e.left)} still owed.`
        : `${who(e.borrower)} paid ${who(e.lender)} back ${money(e.amount)}${e.auto ? ' at Start' : ''}: the loan is paid off.`;
    case 'loanDue':
      return e.left <= 0
        ? `${who(e.borrower)}’s loan from ${who(e.lender)} is due: ${who(e.borrower)} pays ${money(e.paid)}.`
        : `${who(e.borrower)}’s loan from ${who(e.lender)} is due: ${who(e.borrower)} pays all their cash, ${money(e.paid)} of ${money(e.owed)}.`;
    case 'loanDefaulted':
      return e.why === 'term'
        ? `${who(e.borrower)} could not pay it all: ${who(e.lender)} takes ${andList(e.collateral.map(n.space))}.`
        : `${who(e.lender)} takes ${andList(e.collateral.map(n.space))}, pledged by ${who(e.borrower)}.`;
    case 'loanForgiven':
      return `${who(e.borrower)}’s loan from ${who(e.lender)} is cancelled.`;
    case 'buyBarred':
      return `${who(e.player)} holds army rank ${e.rank} and may not buy ${n.space(e.space)}: it stays for sale.`;
    case 'salaryPaid':
      return `${who(e.player)} draws their army salary: ${signedMoney(e.amount)}.`;
    case 'promoted':
      return `${who(e.player)} rolled ${e.die} on leaving the army: rank ${e.rank}, salary ${signedMoney(e.salary)}.`;
    case 'generalChanged':
      return e.player === null ? 'There is no general now.' : `${who(e.player)} is the general now.`;
    case 'powerRolled':
      return `${who(e.player)} used the general’s power: ${e.dice[0]} + ${e.dice[1]}, ${e.outcome === 'money' ? 'money' : 'land'}.`;
    case 'powerFizzled':
      return 'Nobody has a property the power could take: nothing happens.';
    case 'powerTargeted':
      return e.space === null
        ? `${who(e.player)} demands money from ${who(e.target)}.`
        : `${who(e.player)} moves to take ${n.space(e.space)} from ${who(e.target)}.`;
    case 'unrestAnswered':
      return e.block
        ? `${who(e.player)} spends ${MYANMAR.powerBlockMerit} merit points to block it.`
        : e.use
          ? `${who(e.player)} shows unrest.`
          : `${who(e.player)} holds back.`;
    case 'generalDeposed':
      return `${e.used} unrest cups: ${who(e.player)} is brought down and loses all rank.`;
    case 'powerBlocked':
      return `${who(e.target)} blocked the general’s power.`;
    case 'powerSeized':
      return `${who(e.to)} takes ${n.space(e.space)} from ${who(e.from)}.`;
    case 'powerPaid':
      return `${who(e.from)} pays ${who(e.to)} ${money(e.amount)}.`;
    case 'bribeOffered':
      return `${who(e.from)} offers ${who(e.to)} ${money(e.amount)} to hold back.`;
    case 'bribeAnswered':
      return e.accept ? `${who(e.to)} takes ${who(e.from)}’s ${money(e.amount)}.` : `${who(e.to)} turns down ${who(e.from)}’s money.`;
    case 'earthquake':
      return e.spaces.length > 0
        ? `Earthquake (die ${e.die}): every building in ${groupName(e.region)} fell.`
        : `Earthquake (die ${e.die}): ${groupName(e.region)} had no buildings to lose.`;
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
    case 'tradeCountered':
    case 'tradeWithdrawn':
    case 'tradeCancelled':
      return e.from;
    case 'tradeRejected':
      return e.to;
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
  | 'online'
  /** Myanmar map only (D102). */
  | 'merit'
  | 'companyEvents'
  | 'loans'
  | 'general'
  | 'rank'
  | 'salary';

export interface RuleTopic {
  id: RuleTopicId;
  title: string;
  lines: string[];
  ordered?: boolean;
  /** A table generated from the game data, shown after the lines. */
  table?: 'cityRent' | 'airportRent' | 'companies' | 'salary';
  /** Settings that can switch this topic off for a game. */
  switches?: Array<'freeStay' | 'vacation' | 'auction' | 'chance' | 'event' | 'general'>;
}

export const SWITCH_NAMES = {
  freeStay: 'Free Stay',
  vacation: 'Vacation',
  auction: 'Auction',
  chance: 'Chance',
  get event() {
    return byMap('Event', 'News');
  },
  general: 'The general',
};

/**
 * The rule guide for the map in play. The Myanmar map words the same rules with its own spaces
 * (Military camp, regions, transport) and leaves out Free Stay and Vacation, which it does not use
 * (D101). Topic ids stay the same on both maps.
 */
export function ruleTopics(): readonly RuleTopic[] {
  // The Myanmar map read in Burmese has the guide in Burmese too (D114).
  // The Yangon map has the same guide, told as office life (D116).
  if (burmeseGuide() && onYangon()) {
    return ruleTopicsMy().map((t) => ({ ...t, title: yangonizeMy(t.title), lines: t.lines.map(yangonizeMy) }));
  }
  if (burmeseGuide()) return ruleTopicsMy();
  const myanmar = onMyanmar();
  const start = specialName('start');
  const topics: Array<RuleTopic | null> = [
    {
      id: 'quickStart',
      title: 'Quick start',
      lines: [
        'Roll the dice and move clockwise.',
        'Land on a property nobody owns: buy it, or let everyone bid for it.',
        'Land on someone else’s property: pay rent.',
        byMap(
          'Own every city of a country and its rent doubles. Then, each time you land on one of its cities, you can build houses on all of them.',
          'Own every city of a region and its rent doubles. Then, each time you land on one of its cities, you can build houses on all of them.',
        ),
        `Pass ${start} and collect ${money(RULES.startBonus)}.`,
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
        byMap(
          'Rolled doubles? Roll again. Three doubles in one turn sends you to Jail.',
          'Rolled doubles? Roll again. Three doubles in one turn sends you to the Military camp.',
        ),
        'Press End turn and pass the device.',
      ],
    },
    {
      id: 'worldStart',
      title: start,
      lines: [
        `Collect ${money(RULES.startBonus)} each time you pass it or land on it.`,
        byMap(
          'You collect nothing when a card moves you backward or when you go to Jail.',
          'You collect nothing when a card moves you backward or when you go to the Military camp.',
        ),
      ],
    },
    {
      id: 'buying',
      title: 'Buying and auctions',
      switches: ['auction'],
      lines: [
        byMap(
          'Land on an unowned city, airport or company and you may buy it at its price.',
          'Land on an unowned city, transport space or company and you may buy it at its price.',
        ),
        'White tiles are still for sale. A tile you own takes your colour.',
        `If you pass, it is auctioned. Everyone can bid, including you. Bids start at ${money(BALANCE.auctionMinBid)}.`,
        'In an auction, players take turns to raise or fold. The last bidder left wins and pays the bank.',
      ],
    },
    {
      id: 'citiesRent',
      title: 'Cities and rent',
      lines: [
        'Land on another player’s city and you pay its rent. The tile shows the rent you would pay right now.',
        'A mortgaged city charges no rent.',
        ...(myanmar ? [] : ['You can use a Free Stay token instead of paying.']),
      ],
    },
    {
      id: 'countries',
      title: byMap('Countries', 'Regions'),
      table: 'cityRent',
      lines: myanmar
        ? [
            'A region is complete when one player owns all of its cities.',
            'In a complete region, rent on empty cities doubles and building becomes possible.',
          ]
        : [
            'A country is complete when one player owns all of its cities.',
            'In a complete country, rent on empty cities doubles and building becomes possible.',
          ],
    },
    {
      id: 'houses',
      title: 'Houses and hotels',
      lines: myanmar
        ? [
            'You need the whole region, with none of its cities mortgaged.',
            'Land on any city of the region, and during that move you can build on every city of it.',
            'Build evenly: a city gets its next house only when every city in the region has as many. With one house on each, any of them can get a second.',
            'You may build several houses in one landing if the even rule and your cash allow it.',
            'After 4 houses you can build a hotel. A hotel costs twice the house cost.',
          ]
        : [
            'You need the whole country, with none of its cities mortgaged.',
            'Land on any city of the country, and during that move you can build on every city of it.',
            'Build evenly: a city gets its next house only when every city in the country has as many. With one house on each, any of them can get a second.',
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
      title: byMap('Airports', 'Transport'),
      table: 'airportRent',
      lines: myanmar
        ? [
            'The two airports, the Expressway and the Muse Border Gate are the transport spaces. They never have buildings.',
            'Rent grows with the number of transport spaces the owner holds.',
            `Passing over the Expressway or the Muse Border Gate without stopping costs a ${money(MYANMAR.toll)} toll for its owner (none when it is yours, unowned or mortgaged).`,
          ]
        : ['Airports never have buildings.', 'Rent grows with the number of airports the owner holds.'],
    },
    {
      id: 'companies',
      title: 'Companies',
      table: 'companies',
      lines: myanmar
        ? [
            `Land on another player’s company, roll two dice and pay the total times ${andList(
              (RULES.companyMultipliers ?? []).map(String),
            ).replace(/ and /, ' or ')}, by how many companies the owner holds.`,
          ]
        : ['Land on another player’s company, roll two dice and pay the total times the company’s multiplier.'],
    },
    {
      id: 'cards',
      title: byMap('Chance and Event cards', 'Chance and News cards'),
      switches: ['chance', 'event'],
      lines: myanmar
        ? [
            'Land on Chance or News to draw a card, then do what it says.',
            'Chance mostly affects you: money, movement, merit and military service. A merit point cancels a bad Chance card.',
            `The lottery: pay ${money(MYANMAR.lotteryTicket)} and roll two dice. 12 wins ${money(3000)}, 10 or 11 wins ${money(500)}, 7 to 9 wins ${money(100)}.`,
            'News is Myanmar news. Some cards change rents or trading until the next turn of the player who drew it. Active news shows at the top of the screen.',
            'Call-up exemption: keep it until you need it. You can trade it.',
          ]
        : [
            'Land on Chance or Event to draw a card, then do what it says.',
            'Chance mostly affects you: money, movement, Jail and bonus cards.',
            'Events are world news. They can affect everyone, and some change rents or building costs for one round. Active events show at the top of the screen.',
            'Free House: your next house is free, in a country you land in.',
            'Get Out of Jail: keep it until you need it. You can trade it.',
          ],
    },
    myanmar
      ? null
      : {
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
      title: byMap('Jail', 'Military service'),
      lines: myanmar
        ? [
            'You are called up by the Call-up letter space, by a Chance card, or by rolling three doubles in one turn. You go to the Military camp and choose at once:',
            `Pay a tenth of your cash, at least ${money(MYANMAR.draftPayMin)}, and you are free.`,
            `Hide: free, but you skip ${MYANMAR.draftHideTurns} turns.`,
            `Flee: ${money(MYANMAR.draftFleeCost)} takes you straight to Chiang Mai (without taking the pot). You skip ${MYANMAR.draftFleeTurns} turn and still collect rent.`,
            `Serve: free. You skip ${MYANMAR.draftServeTurns} turns and get ${money(MYANMAR.draftServeBonus)} on return, and a rank (see Military rank).`,
            'Your rent still comes in during military service, whichever way you chose.',
            'A merit point or a Call-up exemption card frees you at once, also at the start of a skipped turn.',
            'Landing on the Military camp during a normal move is just visiting.',
          ]
        : [
            'You go to Jail from the Go To Jail space, from a card, or by rolling three doubles in one turn.',
            `To leave: pay ${money(BALANCE.jailFine)}, use a Get Out of Jail card, or roll doubles.`,
            'Rolling doubles moves you out by that roll, with no extra roll.',
            `After three failed rolls you must pay ${money(BALANCE.jailFine)} and move.`,
            'In Jail you still collect rent, trade and bid.',
            'Landing on the Jail space during a normal move is just visiting.',
          ],
    },
    myanmar
      ? {
          id: 'merit',
          title: 'Merit',
          lines: [
            `Land on a pagoda (Shwedagon, Kyaiktiyo or Mahamuni) and you may donate ${money(MYANMAR.meritDonation)} for 1 merit point. You keep at most ${MYANMAR.meritMax}.`,
            'Spend a merit point to leave military service at once, to skip one rent owed to a player, or to cancel a bad Chance card.',
            'Merit points cannot be traded.',
          ],
        }
      : null,
    myanmar
      ? {
          id: 'companyEvents',
          title: 'Myanmar news and inflation',
          lines: [
            'Blackout: until the next turn of the player who drew it, city rents are halved and YESC earns double.',
            'Internet cut: until then only the owner of MPT can offer trades. Offers can still be accepted or rejected.',
            'Fuel shortage: every player skips their next turn, except the owner of Denko and players in military service.',
            `Inflation: city rents rise ${MYANMAR.inflationStep}% for the rest of the game, and again after every ${MYANMAR.inflationEvery} rounds. The rate shows at the top of the screen. The owner of KBZ Bank pays city rent without it.`,
            'Earthquake: one die; 1, 3 or 5 destroys every building in the Mandalay region, 2, 4 or 6 every building in Anyar, with no refund.',
            `Community donation: every player puts ${money(MYANMAR.potDonation)} into the pot.`,
            `A player who fled to Chiang Mai receives ${money(MYANMAR.remittance)} from home at the start of every round while there.`,
          ],
        }
      : null,
    myanmar
      ? {
          id: 'rank',
          title: 'Military rank',
          lines: [
            'Rank comes only from serving in the army: when you are called up, choose Serve.',
            `When your service ends, one die is rolled: an even number adds ${MYANMAR.rankEven} ranks, an odd number adds ${MYANMAR.rankOdd}. Rank ${MYANMAR.rankMax} is the highest. Serve again to climb higher.`,
            'Your rank stays for the rest of the game. You lose it only if you are brought down as the general, or go bankrupt.',
            'Every player sees every rank: on the player cards and chips (the gold number on the token), and in each player’s property list.',
            `A rank brings an army salary, but you collect half rent while you have one (see Army salary).`,
            `From rank ${MYANMAR.noBuyRank} you may not buy land. When you land on a property for sale, you go past it: it stays for sale and is not auctioned. You do not bid in auctions either.`,
            `The player with the highest rank, ${MYANMAR.generalMinRank} or more, is the general (see The general’s powers).`,
          ],
        }
      : null,
    myanmar
      ? {
          id: 'salary',
          title: 'Army salary',
          table: 'salary',
          lines: [
            `With a rank you draw an army salary from the bank: your rank × ${money(MYANMAR.salaryPerRank)}.`,
            `It is paid when you come back from serving (on top of the ${money(MYANMAR.draftServeBonus)} return pay), and again every time you pass Start (on top of the Start money).`,
            'Because the army pays you, you collect half rent on all your properties (cities, transport and companies) while you have a rank. The rent panel says so.',
            'Tolls are not rent: you collect them in full.',
          ],
        }
      : null,
    myanmar
      ? {
          id: 'general',
          title: 'The general’s powers',
          switches: ['general'],
          lines: [
            `The general is the one player with the highest rank, ${MYANMAR.generalMinRank} or more. Of equal ranks, whoever got there first stays general; whoever climbs higher takes over, and the old general keeps their rank. A medal marks the general.`,
            `Power: once every ${MYANMAR.powerEveryRounds} rounds, on their own turn (before or after rolling), the general presses Use power and rolls two dice.`,
            'The general does not choose who: the power hits the richest player, the highest net worth (cash, land, buildings and loans) of everyone but the general.',
            `${MYANMAR.powerMoneyUpTo} or less: ${MYANMAR.powerMoneyPercent}% of that player’s cash, at least ${money(MYANMAR.powerMoneyMin)} and at most ${money(MYANMAR.powerMoneyMax)}. More than ${MYANMAR.powerMoneyUpTo}: one of their properties, never one with buildings, in a region with buildings, or pledged for a loan; the general picks which. If they have none, the next richest who has one loses it.`,
            `The player hit can block it once with ${MYANMAR.powerBlockMerit} merit points.`,
            `Unrest: every other player holds ${MYANMAR.unrestCups} unrest cups. After each use of power there is a 20-second window: everyone else may show a cup, and everyone sees who did. At ${MYANMAR.unrestToDepose} cups in all (2 with two players), the general falls at once: that use is cancelled, the general loses all rank, and everyone gets their cups back.`,
            'Bribes: before a use of power the general may offer a player money to hold back. If they take it, it is paid at once and they cannot show unrest at the next use.',
            'The line under the pot shows who is general, the unrest so far, and when the power is ready again.',
            'The general is a house rule: the host can switch it off before the game. Rank, the army salary, half rent and the rank 4 land rule stay.',
          ],
        }
      : null,
    myanmar
      ? {
          id: 'loans',
          title: 'Loans',
          lines: [
            'Ask another player for a loan whenever the game is between decisions, even on someone else’s turn: the amount, the interest each round, the rounds to pay it back, and at least one of your properties as collateral.',
            'The other player accepts, rejects or answers with new terms. Only one offer, trade or loan, is on the table at a time.',
            `Interest is simple: each round adds the rate on the amount lent, up to ${MYANMAR.loanMaxMultiple} times the amount at most. The rate is at most ${MYANMAR.loanMaxRatePercent}% a round.`,
            `Pay back on your own turn from the Loans list. Passing Start pays back ${MYANMAR.loanStartRepayPercent}% of the debt when you have the cash.`,
            'At the end of the term the debt, with its interest, is paid from the borrower’s cash. If the cash does not cover it, the borrower pays what they have and the lender takes the collateral too. If the borrower goes bankrupt, the lender takes the collateral before anyone else.',
            'Collateral cannot be mortgaged or traded, and its region cannot be built on, until the loan is paid back. A chain on the tile marks it.',
          ],
        }
      : null,
    myanmar
      ? null
      : {
          id: 'vacation',
          title: 'Vacation',
          switches: ['vacation'],
          lines: ['Land on Vacation and your next turn is skipped, once.', 'You still own everything and still collect rent.'],
        },
    {
      id: 'taxes',
      title: byMap('Taxes and Free Parking', 'Tax, pagodas and Chiang Mai'),
      lines: myanmar
        ? [
            `${specialName('incomeTax')}: pay ${money(RULES.incomeTax)}.`,
            'Taxes and fines (paying out of military service, fleeing, the broker, the porter card) go into the community pot, shown in the middle of the board and on Chiang Mai.',
            'Land on Chiang Mai and you take everything in the pot.',
            'Pagodas: you may donate for a merit point.',
          ]
        : [`Income Tax: pay ${money(RULES.incomeTax)}. Luxury Tax: pay ${money(RULES.luxuryTax)}.`, 'Free Parking: nothing happens.'],
    },
    {
      id: 'mortgages',
      title: 'Mortgages',
      lines: [
        'Short of cash? Mortgage a property to the bank for half its price. You keep it, but it earns no rent.',
        byMap('For a city, sell all buildings in that country first.', 'For a city, sell all buildings in that region first.'),
        'To unmortgage, pay the mortgage value plus 10%.',
        byMap(
          'You cannot build in a country while one of its cities is mortgaged.',
          'You cannot build in a region while one of its cities is mortgaged.',
        ),
      ],
    },
    {
      id: 'trading',
      title: 'Trading',
      lines: [
        byMap(
          'Any player can offer a trade to one other player, on anyone’s turn, whenever the game is between decisions: properties, Get Out of Jail cards and cash, in any mix.',
          'Any player can offer a trade to one other player, on anyone’s turn, whenever the game is between decisions: properties, Call-up exemption cards and cash, in any mix.',
        ),
        'Everyone sees the offer. The other player accepts it, rejects it or answers with a counter-offer, and the talks go on until one of you accepts or rejects. Nobody can be forced.',
        'Whoever made the offer on the table can withdraw it. The game waits while an offer is on the table.',
        byMap(
          'Cities in a country with buildings cannot be traded until the buildings are sold.',
          'Cities in a region with buildings cannot be traded until the buildings are sold.',
        ),
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
        'If a player is gone, the host can play for them or remove them (bankrupt to the bank): open their properties from their card or chip.',
        'Chat with the table: on a large screen the chat is open beside the board and you can type at any time; on a phone use the Chat tab, in the lobby the Chat button. Stamps are quick reactions that land on your card.',
        'Animation speed and sound are chosen on each device.',
      ],
    },
  ];
  return topics.filter((t): t is RuleTopic => t !== null);
}

/** Two-line explanations behind the small help buttons (spec 14, Comfort). */
/** Two-line explanations for the map in play. */
export function quickHelp(): Readonly<Record<'freeStay' | 'companies' | 'airports' | 'building', { lines: [string, string]; topic: RuleTopicId }>> {
  const myanmar = onMyanmar();
  return {
    freeStay: {
      lines: ['Use a Free Stay token to skip rent on another player’s city.', 'Not for airports, companies, taxes or cards. You hold at most 3.'],
      topic: 'freeStay',
    },
    companies: {
      lines: myanmar
        ? [
            'Landing on someone’s company: roll two dice.',
            `You pay the total times ${(RULES.companyMultipliers ?? []).join(', ').replace(/, (\d+)$/, ' or $1')}, by how many companies the owner holds.`,
          ]
        : ['Landing on someone’s company: roll two dice.', 'You pay the total times the company’s multiplier.'],
      topic: 'companies',
    },
    airports: {
      lines: [
        byMap('Airport rent depends on how many airports the owner holds.', 'Transport rent depends on how many transport spaces the owner holds.'),
        `From ${money(RULES.airportRent[0] as number)} for one up to ${money(RULES.airportRent[AIRPORTS.length - 1] as number)} for all ${COUNT_WORDS[AIRPORTS.length] ?? AIRPORTS.length}.`,
      ],
      topic: 'airports',
    },
    building: {
      lines: [
        byMap(
          'Own the whole country, then land on any of its cities to build on all of them.',
          'Own the whole region, then land on any of its cities to build on all of them.',
        ),
        'Build evenly; after 4 houses comes a hotel.',
      ],
      topic: 'houses',
    },
  };
}

export const RULE_LINK = 'Open the rule guide';

// ---------------------------------------------------------------------------------------------
// The rule guide in Burmese (Myanmar map, owner's request, D114). The same topics and tables as
// ruleTopics() on the Myanmar map, shown when this device reads the map in Burmese.

/** The guide is in Burmese: the Myanmar map, on a device that reads it in Burmese (D114). */
export function burmeseGuide(): boolean {
  return onMyanmar() && language() === 'my';
}

/** Whole numbers in Burmese digits. */
function dMy(n: number): string {
  return burmeseDigits(n.toLocaleString('en-US'));
}

/** The rule guide's own words in Burmese. */
export const RULES_MY = {
  title: 'စည်းကမ်းလမ်းညွှန်',
  search: 'စည်းကမ်း ရှာရန်',
  noMatch: 'ရှာတာ မတွေ့ပါ။',
  topics: 'ခေါင်းစဉ်များ',
  close: 'ပိတ်ရန်',
  offInGame: (what: string) => `${what} ကို ဒီပွဲမှာ ပိတ်ထားတယ်။`,
  switches: { freeStay: 'Free Stay', vacation: 'Vacation', auction: 'လေလံ', chance: 'ကံစမ်းမဲ', event: 'သတင်း', general: 'ဗိုလ်ချုပ်' } as Record<
    'freeStay' | 'vacation' | 'auction' | 'chance' | 'event' | 'general',
    string
  >,
  tableLevel: 'အဆောက်အအုံ',
  tableRent: 'ငှားခ',
  tableOwned: 'ပိုင်တဲ့ အရေအတွက်',
  tableCompanies: 'ပိုင်တဲ့ ကုမ္ပဏီ',
  tableRank: 'ရာထူး',
  tableSalary: 'တစ်ကြိမ် ရတဲ့ လစာ',
  cityRentIntro: 'မြို့ရဲ့ အခြေခံ ငှားခရဲ့ အဆ:',
  baseRent: 'အခြေခံ',
  incomplete: 'အုပ်စု မပြည့်သေး',
  completeEmpty: 'အုပ်စု ပြည့်၊ အိမ် မရှိ',
  houses: (n: number) => `အိမ် ${dMy(n)} လုံး`,
  hotel: 'ဟိုတယ်',
  count: (n: number) => `${dMy(n)} ခု`,
  diceTimes: (m: number) => `အန်စာပေါင်း × ${dMy(m)}`,
  rank: (n: number) => `ရာထူး ${dMy(n)}`,
  times: (n: number) => dMy(n),
  language: 'ဘာသာ',
};

export function ruleTopicsMy(): readonly RuleTopic[] {
  const M = MYANMAR;
  const mults = (RULES.companyMultipliers ?? []).map(dMy);
  const multText = `${mults.slice(0, -1).join('၊ ')} သို့မဟုတ် ${mults[mults.length - 1] ?? ''}`;
  return [
    {
      id: 'quickStart',
      title: 'အမြန် စတင်ရန်',
      lines: [
        'အန်စာ လှိမ့်ပြီး နာရီလက်တံအတိုင်း ရွှေ့ပါ။',
        'ဘယ်သူမှ မပိုင်သေးတဲ့ မြေကွက်ပေါ် ဆိုက်ရင် ဝယ်နိုင်တယ်၊ မဝယ်ရင် အားလုံး လေလံဆွဲနိုင်တယ်။',
        'တခြားသူ ပိုင်တဲ့ မြေကွက်ပေါ် ဆိုက်ရင် ငှားခ ပေးရတယ်။',
        'အုပ်စုတစ်ခုရဲ့ မြို့အားလုံး ပိုင်ရင် ငှားခ ၂ ဆ ဖြစ်တယ်။ ပြီးရင် အဲဒီ အုပ်စုထဲက မြို့တစ်မြို့ပေါ် ဆိုက်တိုင်း မြို့အားလုံးမှာ အိမ်ဆောက်လို့ရတယ်။',
        `စတင်ရာ ဖြတ်ရင် ${money(RULES.startBonus)} ရတယ်။`,
        'Quick ပွဲ: နောက်ဆုံး round ပြီးချိန်မှာ အချမ်းသာဆုံးသူ နိုင်တယ်။ Normal ပွဲ: ဒေဝါလီ မခံရဘဲ နောက်ဆုံး ကျန်သူ နိုင်တယ်။',
        'အဝါရောင် ခလုတ်က နောက် ဘာလုပ်ရမလဲ အမြဲ ပြတယ်။',
      ],
    },
    {
      id: 'yourTurn',
      title: 'သင့်အလှည့်',
      ordered: true,
      lines: [
        '"I’m ready" ကို နှိပ်ပြီး "Roll dice" ကို နှိပ်ပါ။',
        'သင့်အရုပ် ရွှေ့သွားမယ်။ ဆိုက်တဲ့ ကွက်က ပြောတဲ့အတိုင်း လုပ်ပါ။',
        'အန်စာ မလှိမ့်ခင် ဒါမှမဟုတ် လှိမ့်ပြီးမှာ ရောင်းဝယ်လဲလှယ်၊ ပေါင်နှံ၊ အဆောက်အအုံ ရောင်းလို့ရတယ်။',
        'အန်စာ အတူတူ ကျရင် ထပ်လှိမ့်ရတယ်။ အလှည့်တစ်ခုထဲ ၃ ကြိမ် ဆက်ကျရင် စစ်မှုထမ်းစခန်း ရောက်တယ်။',
        '"End turn" ကို နှိပ်ပြီး စက်ကို နောက်တစ်ယောက် ပေးပါ။',
      ],
    },
    {
      id: 'worldStart',
      title: 'စတင်ရာ',
      lines: [
        `ဖြတ်သွားတိုင်း ဒါမှမဟုတ် ဆိုက်တိုင်း ${money(RULES.startBonus)} ရတယ်။`,
        'ကတ်က နောက်ပြန် ရွှေ့ခိုင်းရင် ဒါမှမဟုတ် စစ်မှုထမ်းစခန်းကို ပို့ခံရရင် ဘာမှ မရဘူး။',
      ],
    },
    {
      id: 'buying',
      title: 'ဝယ်ခြင်းနဲ့ လေလံ',
      switches: ['auction'],
      lines: [
        'ဘယ်သူမှ မပိုင်သေးတဲ့ မြို့၊ သယ်ယူပို့ဆောင်ရေးကွက် ဒါမှမဟုတ် ကုမ္ပဏီပေါ် ဆိုက်ရင် သတ်မှတ်ဈေးနဲ့ ဝယ်လို့ရတယ်။',
        'အဖြူရောင် ကွက်တွေ ရောင်းဖို့ ကျန်သေးတယ်။ ကိုယ်ပိုင်တဲ့ ကွက်က ကိုယ့်အရောင် ဖြစ်သွားတယ်။',
        `မဝယ်ရင် လေလံတင်တယ်။ ကိုယ်ပါ အားလုံး ဈေးတင်လို့ရတယ်။ ${money(BALANCE.auctionMinBid)} ကစတယ်။`,
        'လေလံမှာ တစ်ယောက်ပြီးတစ်ယောက် ဈေးတင်တယ် ဒါမှမဟုတ် ထွက်တယ်။ နောက်ဆုံး ကျန်တဲ့သူ နိုင်ပြီး ဘဏ်ကို ပေးရတယ်။',
      ],
    },
    {
      id: 'citiesRent',
      title: 'မြို့နဲ့ ငှားခ',
      lines: [
        'တခြားသူ့ မြို့ပေါ် ဆိုက်ရင် ငှားခ ပေးရတယ်။ ကွက်ပေါ်မှာ အခု ပေးရမယ့် ငှားခ ပြထားတယ်။',
        'ပေါင်ထားတဲ့ မြို့က ငှားခ မကောက်ရဘူး။',
      ],
    },
    {
      id: 'countries',
      title: 'အုပ်စုများ',
      table: 'cityRent',
      lines: [
        'ကစားသမား တစ်ယောက်က အုပ်စုတစ်ခုရဲ့ မြို့အားလုံး ပိုင်ရင် အုပ်စု ပြည့်တယ်။',
        'အုပ်စု ပြည့်ရင် အိမ် မရှိသေးတဲ့ မြို့တွေရဲ့ ငှားခ ၂ ဆ ဖြစ်ပြီး အိမ်ဆောက်လို့ ရလာတယ်။',
      ],
    },
    {
      id: 'houses',
      title: 'အိမ်နဲ့ ဟိုတယ်',
      lines: [
        'အုပ်စု တစ်ခုလုံး ပိုင်ရမယ်၊ ပေါင်ထားတဲ့ မြို့ မရှိရဘူး။',
        'အုပ်စုထဲက မြို့တစ်မြို့ပေါ် ဆိုက်ရင် အဲဒီ အလှည့်မှာ အုပ်စုထဲ မြို့တိုင်းမှာ ဆောက်လို့ရတယ်။',
        'တန်းတူ ဆောက်ရမယ်: အုပ်စုထဲ မြို့တိုင်းမှာ အိမ် အရေအတွက် တူမှ နောက်တစ်လုံး ဆောက်လို့ရတယ်။ မြို့တိုင်း ၁ လုံးစီ ရှိရင် ဘယ်မြို့မဆို ဒုတိယ တစ်လုံး ဆောက်လို့ရတယ်။',
        'တန်းတူ စည်းကမ်းနဲ့ ပိုက်ဆံ လောက်ရင် တစ်ခါ ဆိုက်တုန်း အိမ် အများကြီး ဆောက်လို့ရတယ်။',
        'အိမ် ၄ လုံး ပြီးရင် ဟိုတယ် ဆောက်လို့ရတယ်။ ဟိုတယ်က အိမ်ဈေးရဲ့ ၂ ဆ။',
      ],
    },
    {
      id: 'selling',
      title: 'အဆောက်အအုံ ရောင်းခြင်း',
      lines: [
        'ကိုယ့်အလှည့်မှာ ဒါမှမဟုတ် ကြွေးရှိတဲ့အခါ ရောင်းလို့ရတယ်။ ဆောက်ခရဲ့ တစ်ဝက် ပြန်ရတယ်။',
        'တန်းတူ ရောင်းရမယ်၊ အိမ် အများဆုံး မြို့ကနေ စရောင်းပါ။ ဟိုတယ် ရောင်းရင် အိမ် ၄ လုံး ကျန်တယ်။',
      ],
    },
    {
      id: 'airports',
      title: 'သယ်ယူပို့ဆောင်ရေး',
      table: 'airportRent',
      lines: [
        'လေဆိပ် ၂ ခု၊ အမြန်လမ်းနဲ့ မူဆယ် နယ်စပ်ဂိတ်က သယ်ယူပို့ဆောင်ရေး ကွက်တွေ။ အဆောက်အအုံ ဆောက်လို့ မရဘူး။',
        'ပိုင်ရှင် ပိုင်တဲ့ အရေအတွက် များလေ ငှားခ များလေ။',
        `အမြန်လမ်း ဒါမှမဟုတ် မူဆယ် နယ်စပ်ဂိတ်ကို မရပ်ဘဲ ဖြတ်ရင် ပိုင်ရှင်ကို ဂိတ်ခ ${money(M.toll)} ပေးရတယ် (ကိုယ်ပိုင်ရင်၊ ဘယ်သူမှ မပိုင်ရင်၊ ပေါင်ထားရင် မပေးရ)။`,
      ],
    },
    {
      id: 'companies',
      title: 'ကုမ္ပဏီများ',
      table: 'companies',
      lines: [
        `တခြားသူ့ ကုမ္ပဏီပေါ် ဆိုက်ရင် အန်စာ ၂ လုံး လှိမ့်ပြီး ပေါင်းလဒ်ကို ပိုင်ရှင် ပိုင်တဲ့ ကုမ္ပဏီ အရေအတွက်အလိုက် ${multText} နဲ့ မြှောက်ပြီး ပေးရတယ်။`,
      ],
    },
    {
      id: 'cards',
      title: 'ကံစမ်းမဲနဲ့ သတင်းကတ်',
      switches: ['chance', 'event'],
      lines: [
        'ကံစမ်းမဲ ဒါမှမဟုတ် သတင်း ကွက်ပေါ် ဆိုက်ရင် ကတ် တစ်ချပ် ဆွဲပြီး ကတ် ပြောတဲ့အတိုင်း လုပ်ပါ။',
        'ကံစမ်းမဲက အများအားဖြင့် ကိုယ့်ကိုပဲ သက်ရောက်တယ်: ပိုက်ဆံ၊ ရွှေ့တာ၊ ကုသိုလ်နဲ့ စစ်မှုထမ်း။ ကုသိုလ် ၁ မှတ်နဲ့ ဆိုးတဲ့ ကံစမ်းမဲကတ်ကို ချေဖျက်လို့ရတယ်။',
        `ထီ: ${money(M.lotteryTicket)} ပေးပြီး အန်စာ ၂ လုံး လှိမ့်။ ၁၂ ဆို ${money(3000)}၊ ၁၀ သို့မဟုတ် ၁၁ ဆို ${money(500)}၊ ၇ မှ ၉ ဆို ${money(100)} ရတယ်။`,
        'သတင်းက မြန်မာ့ သတင်း။ တချို့ ကတ်တွေက ဆွဲတဲ့သူရဲ့ နောက်အလှည့် ရောက်တဲ့အထိ ငှားခ ဒါမှမဟုတ် ရောင်းဝယ်လဲလှယ်မှုကို ပြောင်းတယ်။ သက်ရောက်နေတဲ့ သတင်းကို ဖန်သားပြင် အပေါ်မှာ ပြတယ်။',
        'ခေါ်စာ ကင်းလွတ်ခွင့်ကတ်: လိုတဲ့အထိ သိမ်းထားလို့ရတယ်။ ရောင်းဝယ်လဲလှယ်လို့လည်း ရတယ်။',
      ],
    },
    {
      id: 'jail',
      title: 'စစ်မှုထမ်း',
      lines: [
        'ခေါ်စာရောက်ပြီ ကွက်ပေါ် ဆိုက်ရင်၊ ကံစမ်းမဲ ဒါမှမဟုတ် သတင်းကတ်ကြောင့်၊ ဒါမှမဟုတ် အလှည့်တစ်ခုထဲ အန်စာ အတူတူ ၃ ကြိမ် ကျရင် စစ်မှုထမ်း ခေါ်ခံရတယ်။ စစ်မှုထမ်းစခန်း ရောက်ပြီး ချက်ချင်း ရွေးရတယ်:',
        `ငွေပေး ရှောင်: လက်ကျန်ငွေရဲ့ ၁၀% (အနည်းဆုံး ${money(M.draftPayMin)}) ပေးပြီး ချက်ချင်း လွတ်တယ်။`,
        `ရှောင်ပုန်း: အခမဲ့၊ ဒါပေမဲ့ အလှည့် ${dMy(M.draftHideTurns)} ခု ကျော်ရတယ်။`,
        `ထွက်ပြေး: ${money(M.draftFleeCost)} ပေးပြီး ချင်းမိုင်ကို တန်းရောက်တယ် (အိုး မယူရ)။ အလှည့် ${dMy(M.draftFleeTurns)} ခု ကျော်ရတယ်။`,
        `တက်: အခမဲ့။ အလှည့် ${dMy(M.draftServeTurns)} ခု ကျော်ပြီး ပြန်လာရင် ${money(M.draftServeBonus)} နဲ့ ရာထူး ရတယ် (စစ်ရာထူး ကြည့်ပါ)။`,
        'ဘယ်လို ရွေးရွေး စစ်မှုထမ်းနေစဉ် ငှားခ ဆက်ရတယ်။',
        'ကုသိုလ် ၁ မှတ် ဒါမှမဟုတ် ခေါ်စာ ကင်းလွတ်ခွင့်ကတ်နဲ့ ချက်ချင်း လွတ်လို့ရတယ်၊ ကျော်ရမယ့် အလှည့် အစမှာလည်း ရတယ်။',
        'ပုံမှန် ရွှေ့ရင်း စစ်မှုထမ်းစခန်း ပေါ် ဆိုက်တာက လာလည်တာ သက်သက်ပဲ။',
      ],
    },
    {
      id: 'merit',
      title: 'ကုသိုလ်',
      lines: [
        `ဘုရား (ရွှေတိဂုံ၊ ကျိုက်ထီးရိုး၊ မဟာမုနိ) ပေါ် ဆိုက်ရင် ${money(M.meritDonation)} လှူပြီး ကုသိုလ် ၁ မှတ် ရနိုင်တယ်။ အများဆုံး ${dMy(M.meritMax)} မှတ်ပဲ သိမ်းလို့ရတယ်။`,
        'ကုသိုလ် ၁ မှတ်နဲ့ စစ်မှုထမ်းက ချက်ချင်း လွတ်တာ၊ တခြားသူကို ပေးရမယ့် ငှားခ ၁ ကြိမ် ကျော်တာ၊ ဆိုးတဲ့ ကံစမ်းမဲကတ် ချေဖျက်တာ လုပ်လို့ရတယ်။',
        'ကုသိုလ်ကို ရောင်းဝယ်လဲလှယ်လို့ မရဘူး။',
      ],
    },
    {
      id: 'companyEvents',
      title: 'မြန်မာ့ သတင်းနဲ့ ငွေကြေးဖောင်းပွ',
      lines: [
        'မီးပျက်: ဆွဲတဲ့သူရဲ့ နောက်အလှည့် ရောက်တဲ့အထိ မြို့ငှားခ တစ်ဝက် ကျပြီး YESC က ၂ ဆ ရတယ်။',
        'အင်တာနက် ဖြတ်: အဲဒီအထိ MPT ပိုင်သူ တစ်ယောက်ပဲ ရောင်းဝယ်လဲလှယ်ဖို့ ဒါမှမဟုတ် ချေးငွေ ကမ်းလှမ်းလို့ရတယ်။ ကမ်းလှမ်းချက်ကို လက်ခံတာ၊ ငြင်းတာတော့ ရတယ်။',
        'ဓာတ်ဆီ ပြတ်: Denko ပိုင်သူနဲ့ စစ်မှုထမ်းနေသူတွေ မှလွဲ၍ ကစားသမားတိုင်း နောက်အလှည့် ၁ ခု ကျော်ရတယ်။',
        `ငွေကြေးဖောင်းပွ: မြို့ငှားခ ${dMy(M.inflationStep)}% တက်ပြီး ပွဲဆုံးတဲ့အထိ ကျန်တယ်၊ round ${dMy(M.inflationEvery)} ခု ပြီးတိုင်း ထပ်တက်တယ်။ နှုန်းကို ဖန်သားပြင် အပေါ်မှာ ပြတယ်။ KBZ ဘဏ် ပိုင်သူက မြို့ငှားခ ပေးတဲ့အခါ ဖောင်းပွမှု မခံရ။`,
        'ငလျင်: အန်စာ ၁ လုံး။ ၁၊ ၃၊ ၅ ဆို မန္တလေး အုပ်စု၊ ၂၊ ၄၊ ၆ ဆို အညာ အုပ်စုရဲ့ အိမ်/ဟိုတယ် အားလုံး ပြိုတယ်၊ ပြန်ပိုက်ဆံ မရဘူး။',
        `ရပ်ကွက် လှူဒါန်းပွဲ: ကစားသမားတိုင်း ${money(M.potDonation)} စီ အိုးထဲ ထည့်ရတယ်။`,
        `ချင်းမိုင်ကို ထွက်ပြေးထားသူက အဲဒီမှာ ရှိနေစဉ် round တိုင်း အစမှာ အိမ်က ${money(M.remittance)} ပို့ပေးတယ်။`,
      ],
    },
    {
      id: 'rank',
      title: 'စစ်ရာထူး',
      lines: [
        'ရာထူးက စစ်မှုထမ်းမှ ရတယ်: ခေါ်ခံရတဲ့အခါ "တက်" (Serve) ကို ရွေးပါ။',
        `စစ်မှုထမ်း ပြီးတဲ့အခါ အန်စာ ၁ လုံး လှိမ့်တယ်: စုံကိန်းဆို ရာထူး +${dMy(M.rankEven)}၊ မကိန်းဆို +${dMy(M.rankOdd)}။ အမြင့်ဆုံး ရာထူး ${dMy(M.rankMax)}။ ထပ်တက်ချင်ရင် ထပ်ထမ်းပါ။`,
        'ရာထူးက ပွဲဆုံးတဲ့အထိ ကျန်တယ်။ ဗိုလ်ချုပ်အဖြစ် ဖြုတ်ချခံရမှ ဒါမှမဟုတ် ဒေဝါလီ ခံရမှ ပျက်တယ်။',
        'ဘယ်သူ ဘာရာထူးလဲ ကစားသမားတိုင်း မြင်ရတယ်: ကစားသမားကတ်နဲ့ chip တွေပေါ် (အရုပ်ပေါ်က ရွှေရောင် နံပါတ်)၊ တစ်ယောက်ချင်းရဲ့ မြေစာရင်းထဲမှာ။',
        'ရာထူးရှိရင် စစ်လစာ ရတယ်၊ ဒါပေမဲ့ ရာထူးရှိနေသရွေ့ ငှားခ တစ်ဝက်ပဲ ရတယ် (စစ်လစာ ကြည့်ပါ)။',
        `ရာထူး ${dMy(M.noBuyRank)} ကစပြီး မြေ မဝယ်ရဘူး။ ရောင်းဖို့ကျန်တဲ့ မြေကွက်ပေါ် ဆိုက်ရင် ကျော်သွားမယ်: ဆက်ရောင်းဖို့ ကျန်ပြီး လေလံ မတင်ဘူး။ လေလံမှာလည်း ဈေးတင်ခွင့် မရှိဘူး။`,
        `ရာထူး ${dMy(M.generalMinRank)} နဲ့အထက် ရာထူး အမြင့်ဆုံးသူက ဗိုလ်ချုပ် ဖြစ်တယ် (ဗိုလ်ချုပ် အာဏာ ကြည့်ပါ)။`,
      ],
    },
    {
      id: 'salary',
      title: 'စစ်လစာ',
      table: 'salary',
      lines: [
        `ရာထူးရှိရင် ဘဏ်က စစ်လစာ ပေးတယ်: ရာထူး × ${money(M.salaryPerRank)}။`,
        `စစ်မှုထမ်းပြီး ပြန်လာချိန် (ပြန်လာငွေ ${money(M.draftServeBonus)} အပြင်) ရတယ်၊ စတင်ရာ ဖြတ်တိုင်း (စတင်ရာငွေ အပြင်) ထပ်ရတယ်။`,
        'တပ်က လစာ ပေးနေလို့ ရာထူးရှိနေသရွေ့ ကိုယ်ပိုင်မြေ အားလုံး (မြို့၊ သယ်ယူပို့ဆောင်ရေး၊ ကုမ္ပဏီ) ရဲ့ ငှားခ တစ်ဝက်ပဲ ရတယ်။ ငှားခပေးတဲ့ panel မှာ ပြပေးတယ်။',
        'ဂိတ်ခက ငှားခ မဟုတ်လို့ အပြည့် ရတယ်။',
      ],
    },
    {
      id: 'general',
      title: 'ဗိုလ်ချုပ် အာဏာ',
      switches: ['general'],
      lines: [
        `ဗိုလ်ချုပ်က ရာထူး ${dMy(M.generalMinRank)} နဲ့အထက်ရှိပြီး ရာထူး အမြင့်ဆုံး ကစားသမား တစ်ယောက်တည်း။ ရာထူး တူရင် အရင်ရောက်သူက ဆက်ထိန်းတယ်။ ကျော်တက်သူ ပေါ်ရင် အာဏာ ပြောင်းတယ်၊ အရင်ဗိုလ်ချုပ်ရဲ့ ရာထူး မပျက်ဘူး။ ဗိုလ်ချုပ်ကို ဆုတံဆိပ် အမှတ်အသားနဲ့ ပြတယ်။`,
        `အာဏာ: round ${dMy(M.powerEveryRounds)} ခုမှာ တစ်ကြိမ်၊ ကိုယ့်အလှည့်မှာ (အန်စာ မလှိမ့်ခင် ဒါမှမဟုတ် လှိမ့်ပြီး) "Use power" ကို နှိပ်ပြီး အန်စာ ၂ လုံး လှိမ့်တယ်။`,
        'ဘယ်သူ့ကို ထိမလဲ ဗိုလ်ချုပ်က မရွေးရဘူး: ဗိုလ်ချုပ်ကလွဲ၍ ပိုင်ဆိုင်မှု (ပိုက်ဆံ၊ မြေ၊ အဆောက်အအုံ၊ ချေးငွေ) အများဆုံး ကစားသမားကို အာဏာ ထိတယ်။',
        `${dMy(M.powerMoneyUpTo)} နဲ့အောက်: အဲဒီ ကစားသမားရဲ့ လက်ကျန်ငွေ ${dMy(M.powerMoneyPercent)}% (အနည်းဆုံး ${money(M.powerMoneyMin)}၊ အများဆုံး ${money(M.powerMoneyMax)}) ယူတယ်။ ${dMy(M.powerMoneyUpTo)} ထက်များရင်: သူ့မြေ ၁ ကွက် သိမ်းတယ်၊ ဘယ်ကွက်လဲ ဗိုလ်ချုပ် ရွေးတယ် (အဆောက်အအုံ ရှိတဲ့ မြေ၊ အဆောက်အအုံ ရှိတဲ့ အုပ်စုထဲက မြို့၊ ချေးငွေအတွက် အပေါင်ထားတဲ့ မြေ မသိမ်းရ)။ သိမ်းလို့ရတဲ့ မြေ မရှိရင် နောက်ထပ် အချမ်းသာဆုံး ဖြစ်ပြီး မြေရှိသူက ခံရတယ်။`,
        `ခံရသူက ကုသိုလ် ${dMy(M.powerBlockMerit)} မှတ် သုံးပြီး တစ်ကြိမ် တားလို့ရတယ်။`,
        `မကျေနပ်မှု: ဗိုလ်ချုပ် မဟုတ်တဲ့ ကစားသမားတိုင်း မကျေနပ်မှု ခွက် ${dMy(M.unrestCups)} ခု ရှိတယ်။ အာဏာ သုံးတိုင်း စက္ကန့် ၂၀ အတွင်း ကျန်သူတွေ ခွက် ပြမလား ဆုံးဖြတ်ရတယ်၊ ဘယ်သူ ပြလဲ အားလုံး မြင်ရတယ်။ စုစုပေါင်း ${dMy(M.unrestToDepose)} ခု ပြည့်တာနဲ့ (၂ ယောက်ပွဲမှာ ၂ ခု) ဗိုလ်ချုပ် ချက်ချင်း ပြုတ်တယ်: အဲဒီ အာဏာ ပယ်ဖျက်ခံရပြီး ဗိုလ်ချုပ်ရဲ့ ရာထူး အကုန် ပျက်တယ်၊ အားလုံး ခွက် ပြန်ရတယ်။`,
        'လာဘ်ပေးခြင်း: အာဏာ မသုံးခင် ဗိုလ်ချုပ်က ကစားသမား တစ်ယောက်ကို မကျေနပ်မှု မပြဖို့ ပိုက်ဆံ ကမ်းလှမ်းလို့ရတယ် ("Bribe" ခလုတ်)။ လက်ခံရင် ချက်ချင်း ပေးပြီး နောက် အာဏာ သုံးမှုမှာ သူ ခွက် မပြရတော့ဘူး။',
        'အိုးရဲ့ အောက်က စာကြောင်းမှာ ဗိုလ်ချုပ် ဘယ်သူလဲ၊ မကျေနပ်မှု ဘယ်လောက် ရှိပြီလဲ၊ အာဏာ ဘယ်တော့ ပြန်သုံးလို့ရလဲ ပြတယ်။',
        'ဗိုလ်ချုပ်က အိမ်စည်းကမ်း (House rules) တစ်ခု: ပွဲမစခင် အခန်းရှင်က ပိတ်လို့ရတယ်။ ရာထူး၊ စစ်လစာ၊ ငှားခ တစ်ဝက်နဲ့ ရာထူး ၄ မြေ မဝယ်ရ စည်းကမ်း ဆက်ရှိတယ်။',
      ],
    },
    {
      id: 'loans',
      title: 'ချေးငွေ',
      lines: [
        'ဆုံးဖြတ်ချက်တွေကြားမှာ (တခြားသူ့ အလှည့် ဖြစ်ဖြစ်) "Loan" ခလုတ်နဲ့ တခြား ကစားသမားဆီ ချေးငွေ တောင်းလို့ရတယ်: ပမာဏ၊ round တစ်ခုလျှင် အတိုးနှုန်း၊ ပြန်ဆပ်ရမယ့် round အရေအတွက်နဲ့ အပေါင်မြေ အနည်းဆုံး ၁ ကွက်။',
        'ချေးပေးသူက လက်ခံ၊ ငြင်း ဒါမှမဟုတ် စည်းကမ်းသစ်နဲ့ ပြန်ညှိလို့ရတယ်။ ကမ်းလှမ်းချက် တစ်ခုပဲ (Trade ဖြစ်ဖြစ် ချေးငွေ ဖြစ်ဖြစ်) တစ်ချိန်တည်း တင်ထားလို့ရတယ်။',
        `အတိုးက ရိုးရိုးအတိုး: round တိုင်း ချေးတဲ့ ပမာဏပေါ် အတိုးနှုန်း ပေါင်းတယ်၊ အများဆုံး ချေးတဲ့ ပမာဏရဲ့ ${dMy(M.loanMaxMultiple)} ဆ။ အတိုးနှုန်း အများဆုံး round တစ်ခုလျှင် ${dMy(M.loanMaxRatePercent)}%။`,
        `ကိုယ့်အလှည့်မှာ ချေးငွေစာရင်းကနေ ပြန်ဆပ်လို့ရတယ်။ စတင်ရာ ဖြတ်တိုင်း ပိုက်ဆံ ရှိရင် အကြွေးရဲ့ ${dMy(M.loanStartRepayPercent)}% အလိုအလျောက် ဆပ်တယ်။`,
        'သက်တမ်း ပြည့်ရင် အရင်း + အတိုးကို ချေးသူ့ ပိုက်ဆံထဲက ဆပ်တယ်။ ပိုက်ဆံ မလောက်ရင် ရှိသလောက် ပေးပြီး အပေါင်မြေကိုပါ ချေးပေးသူ ယူတယ်။ ချေးသူ ဒေဝါလီ ခံရရင် ချေးပေးသူက အခြားသူတွေထက် အရင် အပေါင်မြေ ရတယ်။',
        'အပေါင်မြေကို ချေးငွေ ဆပ်ပြီးတဲ့အထိ ပေါင်လို့၊ ရောင်းဝယ်လဲလှယ်လို့ မရဘူး၊ အဲဒီ အုပ်စုမှာ အိမ်ဆောက်လို့ မရဘူး။ ကွက်ပေါ်မှာ ကြိုးကွင်း အမှတ်အသား ပြတယ်။',
      ],
    },
    {
      id: 'taxes',
      title: 'အခွန်၊ ဘုရားနဲ့ ချင်းမိုင်',
      lines: [
        `ဝင်ငွေခွန်: ${money(RULES.incomeTax)} ပေးရတယ်။`,
        'အခွန်နဲ့ ဒဏ်ကြေးတွေ (စစ်မှုထမ်း ရှောင်ငွေ၊ ထွက်ပြေးခ၊ ပွဲစားခ၊ ပေါ်တာကတ်) ရပ်ကွက် လှူဒါန်းပွဲ အိုးထဲ ဝင်တယ်။ အိုးကို ဘုတ်အလယ်နဲ့ ချင်းမိုင်ကွက်ပေါ်မှာ ပြတယ်။',
        'ချင်းမိုင်ပေါ် ဆိုက်ရင် အိုးထဲက အကုန် ယူရတယ်။',
        'ဘုရား: ကုသိုလ်အတွက် လှူလို့ရတယ်။',
      ],
    },
    {
      id: 'mortgages',
      title: 'ပေါင်နှံခြင်း',
      lines: [
        'ပိုက်ဆံ မလောက်ရင် မြေကို ဘဏ်မှာ ဈေးတစ်ဝက်နဲ့ ပေါင်လို့ရတယ်။ မြေ ကိုယ်ပိုင်ပဲ၊ ဒါပေမဲ့ ငှားခ မရဘူး။',
        'မြို့ကို ပေါင်ရင် အရင်ဆုံး အဲဒီ အုပ်စုထဲက အဆောက်အအုံ အားလုံး ရောင်းရမယ်။',
        'ပေါင်ရွေးရင် ပေါင်ငွေ + ၁၀% ပေးရတယ်။',
        'အုပ်စုထဲက မြို့တစ်မြို့ ပေါင်ထားရင် အဲဒီ အုပ်စုမှာ ဆောက်လို့ မရဘူး။',
      ],
    },
    {
      id: 'trading',
      title: 'ရောင်းဝယ်လဲလှယ်ခြင်း',
      lines: [
        'ဆုံးဖြတ်ချက်တွေကြားမှာ ဘယ်သူ့ အလှည့် ဖြစ်ဖြစ် ကစားသမားတိုင်း တခြား တစ်ယောက်ကို ကမ်းလှမ်းလို့ရတယ်: မြေ၊ ခေါ်စာ ကင်းလွတ်ခွင့်ကတ်နဲ့ ပိုက်ဆံ ကြိုက်သလို ရောလို့ရတယ်။',
        'ကမ်းလှမ်းချက်ကို အားလုံး မြင်ရတယ်။ တစ်ဖက်က လက်ခံ၊ ငြင်း ဒါမှမဟုတ် ပြန်ကမ်းလှမ်းလို့ရပြီး တစ်ယောက်ယောက် လက်ခံ ဒါမှမဟုတ် ငြင်းတဲ့အထိ ညှိလို့ရတယ်။ ဘယ်သူ့ကိုမှ အတင်း မလုပ်ခိုင်းရဘူး။',
        'ကမ်းလှမ်းထားသူက ပြန်ရုပ်သိမ်းလို့ရတယ်။ ကမ်းလှမ်းချက် ရှိနေစဉ် ပွဲ စောင့်နေမယ်။',
        'အဆောက်အအုံ ရှိတဲ့ အုပ်စုထဲက မြို့တွေကို အဆောက်အအုံ မရောင်းခင် လဲလှယ်လို့ မရဘူး။',
        'ပေါင်ထားတဲ့ မြေက လဲလှယ်ပြီးလည်း ပေါင်ထားတဲ့အတိုင်း ကျန်တယ်။',
      ],
    },
    {
      id: 'debt',
      title: 'အကြွေးနဲ့ ဒေဝါလီ',
      lines: [
        'မပေးနိုင်ရင် ပိုက်ဆံ ရှာပါ: အဆောက်အအုံ ရောင်း၊ မြေ ပေါင် ဒါမှမဟုတ် လဲလှယ်ပါ။',
        'ဒါတောင် မလောက်ရင် ဒေဝါလီ ခံရပြီး ပွဲက ထွက်ရတယ်။',
        'ကစားသမားကို ကြွေးရှိရင် ကျန်တာ အကုန် သူ ရတယ်။ ဘဏ်ကို ကြွေးရှိရင် ကိုယ့်မြေတွေ ပြန်ရောင်းဖို့ ဖြစ်သွားတယ်။',
      ],
    },
    {
      id: 'winning',
      title: 'နိုင်ခြင်း',
      lines: [
        'Quick ပွဲ: round ကန့်သတ်ချက် ပြည့်ရင် ဒါမှမဟုတ် ပထမဆုံး ဒေဝါလီ ခံရရင် ပြီးတယ်။ ပိုင်ဆိုင်မှု အများဆုံးသူ နိုင်တယ်။',
        'Normal ပွဲ: နောက်ဆုံး ကျန်တဲ့သူ နိုင်တယ်။',
        'ပိုင်ဆိုင်မှု = ပိုက်ဆံ + မြေ (ဈေးအတိုင်း၊ ပေါင်ထားရင် တစ်ဝက်) + အဆောက်အအုံ (ဆောက်ခ) + ချေးငွေ (ရရန်ရှိတာ ပေါင်း၊ ပေးရန်ရှိတာ နုတ်)။',
      ],
    },
    {
      id: 'controls',
      title: 'ထိန်းချုပ်ခြင်း',
      lines: [
        'Space ဒါမှမဟုတ် Enter က အဝါရောင် ခလုတ်ကို နှိပ်တယ်။ B ဝယ်၊ P ကျော်၊ T လဲလှယ်၊ R ဒီလမ်းညွှန် ဖွင့်။',
        'ကွက်တစ်ကွက်ပေါ် mouse တင် ဒါမှမဟုတ် ထိရင် အသေးစိတ် မြင်ရတယ်။ ကစားသမားကို နှိပ်ရင် ပိုင်တာတွေ မြင်ရတယ်။',
        'ဘယ်နေရာ နှိပ်နှိပ် animation ကျော်တယ်။ Animation အမြန်နှုန်းက Settings ထဲမှာ။',
      ],
    },
    {
      id: 'online',
      title: 'Online ကစားခြင်း',
      lines: [
        'အခန်း ဖွင့်ပြီး link ဒါမှမဟုတ် စာလုံး ၄ လုံး code ကို ပို့ပါ။ သူငယ်ချင်းတွေ browser၊ ဖုန်း၊ ကွန်ပျူတာ ဘာကမဆို ဝင်လို့ရတယ်။',
        'အားလုံး နာမည် ရိုက်ပြီး ထိုင်ခုံ ယူတယ်။ စက်တစ်လုံးမှာ ထိုင်ခုံ အများကြီး ယူလို့ရတယ်။',
        'အခန်းရှင်က setting ရွေးပြီး ၂ ယောက်ကနေ ၆ ယောက်အထိနဲ့ ပွဲ စတယ်။',
        'ကိုယ့် ဆုံးဖြတ်ချက်ကိုပဲ လုပ်ရတယ်။ အန်စာ၊ ရွှေ့တာ၊ ကတ်၊ ပိုက်ဆံ အားလုံးကို အားလုံး တိုက်ရိုက် မြင်ရတယ်။',
        'လေလံ ဈေးတင်တာနဲ့ Trade အဖြေကို ကိုယ့်စက်ကနေ လုပ်ရတယ်။',
        'လိုင်း ပြတ်သွားရင် link ကို ပြန်ဖွင့်ပြီး ကိုယ့်ထိုင်ခုံ ပြန်ယူပါ။ ပွဲ စောင့်နေမယ်၊ အချိန်ကန့်သတ်ချက် မရှိဘူး။',
        'ကစားသမား တစ်ယောက် ပျောက်နေရင် အခန်းရှင်က သူ့ကိုယ်စား ကစားပေးလို့ ဒါမှမဟုတ် ဖယ်ရှားလို့ (ဘဏ်ကို ဒေဝါလီ) ရတယ်: သူ့ကတ် ဒါမှမဟုတ် chip ကနေ မြေစာရင်း ဖွင့်ပါ။',
        'Chat: ဖန်သားပြင်ကြီးမှာ ဘုတ်ဘေးမှာ chat ဖွင့်ထားပြီး အချိန်မရွေး စာရိုက်လို့ရတယ်။ ဖုန်းမှာ Chat tab၊ lobby မှာ Chat ခလုတ်။ Stamp တွေက ကိုယ့်ကတ်ပေါ် ကျလာတဲ့ အမြန် တုံ့ပြန်ချက်တွေ။',
        'Animation အမြန်နှုန်းနဲ့ အသံကို စက်တစ်လုံးချင်း ရွေးတယ်။',
      ],
    },
  ];
}
