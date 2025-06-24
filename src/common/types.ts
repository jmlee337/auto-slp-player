export type ContextSlot = {
  displayNames?: string[];
  ports?: number[];
  prefixes?: string[];
  pronouns?: string[];
  score?: number;
};

// in game 1 port order
export type ContextScore = {
  slots?: [ContextSlot, ContextSlot];
};

export type ContextPlayer = {
  name?: string;
  characters?: string[];
};

// in bracket schema order
export type ContextPlayers = {
  entrant1?: ContextPlayer[];
  entrant2?: ContextPlayer[];
};

export type Stream = {
  domain: string;
  path: string;
};

export type Context = {
  bestOf?: number;
  durationMs?: number;
  scores?: ContextScore[];
  finalScore?: ContextScore;
  players?: ContextPlayers;
  startgg?: {
    tournament?: {
      name?: string;
      location?: string;
    };
    event?: {
      id?: number;
      name?: string;
      slug?: string;
      hasSiblings?: boolean;
    };
    phase?: {
      id?: number;
      name?: string;
      hasSiblings?: boolean;
    };
    phaseGroup?: {
      id?: number;
      name?: string;
      bracketType?: number;
      hasSiblings?: boolean;
      waveId?: number | null;
    };
    set?: {
      id?: number | string;
      fullRoundText?: string;
      ordinal?: number | null;
      round?: number;
      stream?: Stream | null;
    };
  };
  challonge?: {
    tournament?: {
      name?: string;
      slug?: string;
      tournamentType?: string;
    };
    set?: {
      fullRoundText?: string;
      ordinal?: number | null;
      round?: number;
      stream?: Stream | null;
    };
  };
  startMs?: number;
};

export type MainContextSlot = {
  displayNames: string[];
  prefixes: string[];
  pronouns: string[];
  score: number;
};

// in game 1 port order
export type MainContextScore = {
  // slots.length === 2
  slots: MainContextSlot[];
};

export type MainContextPlayer = {
  name: string;
  characters: string[];
};

// in bracket schema order
export type MainContextPlayers = {
  entrant1: MainContextPlayer[];
  entrant2: MainContextPlayer[];
};

export type MainContextStartgg = {
  tournament: {
    name: string;
    location: string;
  };
  event: {
    name: string;
    slug: string;
    hasSiblings: boolean;
  };
  phase: {
    id: number;
    name: string;
    hasSiblings: boolean;
  };
  phaseGroup: {
    id: number;
    name: string;
    /**
     * 1: SINGLE_ELIMINATION
     * 2: DOUBLE_ELIMINATION
     * 3: ROUND_ROBIN
     * 4: SWISS
     * https://developer.start.gg/reference/brackettype.doc
     */
    bracketType: number;
    hasSiblings: boolean;
    waveId: number | null;
  };
  set: {
    id: number | null;
    fullRoundText: string;
    ordinal: number | null;
    round: number;
    stream: Stream | null;
  };
};

export type MainContextChallonge = {
  tournament: {
    name: string;
    slug: string;
    // can be 'swiss' or 'round robin' among others
    tournamentType: string;
  };
  set: {
    fullRoundText: string;
    ordinal: number | null;
    round: number;
    stream: Stream | null;
  };
};

export type MainContext = {
  bestOf: number;
  durationMs: number;
  scores: MainContextScore[];
  finalScore?: MainContextScore;
  players?: MainContextPlayers;
  startgg?: MainContextStartgg;
  challonge?: MainContextChallonge;
  startMs: number;
};

export enum SetType {
  UNKNOWN,
  DIR,
  ZIP,
}

export type AvailableSet = {
  context?: MainContext;
  invalidReason: string;
  originalPath: string;
  playedMs: number;
  playing: boolean;
  replayPaths: string[];
  type: SetType;
};

export type RendererContext = {
  bestOf: number;
  duration: string;
  namesLeft: string;
  namesRight: string;
  players?: MainContextPlayers;
  startgg?: {
    eventName: string;
    phaseName: string;
    phaseGroupName: string;
    fullRoundText: string;
    stream: Stream | null;
  };
  challonge?: {
    tournamentName: string;
    fullRoundText: string;
    stream: Stream | null;
  };
};

export type RendererSet = {
  context?: RendererContext;
  invalidReason: string;
  originalPath: string;
  played: boolean;
  playing: boolean;
};

export type RendererQueue = {
  id: string;
  name: string;
  sets: RendererSet[];
  nextSetOriginalPath: string;
};

export type TwitchSettings = {
  enabled: boolean;
  clientId: string;
  clientSecret: string;
  accessToken: string;
  refreshToken: string;
};

export type OverlaySet = {
  roundName: string;
  bestOf: number;
  isFinal: boolean;
  leftPrefixes: string[];
  leftNames: string[];
  leftPronouns: string[];
  leftScore: number;
  rightPrefixes: string[];
  rightNames: string[];
  rightPronouns: string[];
  rightScore: number;
};

export type OverlayStartgg = {
  tournamentName: string;
  location: string;
  eventName: string;
  phaseName: string;
  phaseGroupName: string;
};

export type OverlayChallonge = {
  tournamentName: string;
};

export type OverlayContext = {
  sets: OverlaySet[];
  startgg?: OverlayStartgg;
  challonge?: OverlayChallonge;
};

export enum OBSConnectionStatus {
  OBS_NOT_CONNECTED = 0,
  OBS_NOT_SETUP = 1,
  READY = 2,
}

export type OBSSettings = {
  protocol: string;
  address: string;
  port: string;
  password: string;
};

export enum SplitOption {
  NONE,
  EVENT,
  PHASE,
}

export type TwitchClient = {
  clientId: string;
  clientSecret: string;
};

export enum TwitchStatus {
  STOPPED,
  STARTING,
  STARTED,
}

export enum ObsGamecaptureResult {
  NOT_APPLICABLE,
  PASS,
  FAIL,
}

export type ApiPhaseGroup = {
  tournamentName: string;
  eventSlug: string;
  eventName: string;
  eventHasSiblings: boolean;
  phaseId: number;
  phaseName: string;
  phaseHasSiblings: boolean;
  phaseGroupId: number;
  phaseGroupName: string;
  phaseGroupHasSiblings: boolean;
  /**
   * 1: SINGLE_ELIMINATION
   * 2: DOUBLE_ELIMINATION
   * 3: ROUND_ROBIN
   * 4: SWISS
   * https://developer.start.gg/reference/brackettype.doc
   */
  phaseGroupBracketType: number;
};

export type ApiSet = ApiPhaseGroup & {
  id: number;
  entrant1Names: string[];
  entrant1Prefixes: string[];
  entrant2Names: string[];
  entrant2Prefixes: string[];
  fullRoundText: string;
};
