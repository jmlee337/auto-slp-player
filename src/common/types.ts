export type ContextSlot = {
  displayNames?: string[];
  ports?: number[];
  prefixes?: string[];
  pronouns?: string[];
  score?: number;
};

export type ContextScore = {
  slots?: [ContextSlot, ContextSlot];
};

export type Stream = {
  domain: string;
  path: string;
};

export type Context = {
  bestOf?: number;
  durationMs?: number;
  scores?: ContextScore[];
  startgg?: {
    tournament?: {
      name?: string;
    };
    event?: {
      id?: number;
      name?: string;
      slug?: string;
    };
    phase?: {
      id?: number;
      name?: string;
    };
    phaseGroup?: {
      id?: number;
      name?: string;
    };
    set?: {
      id?: number;
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
    };
    set?: {
      id?: number;
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

export type MainContextScore = {
  // slots.length === 2
  slots: MainContextSlot[];
};

export type MainContext = {
  bestOf: number;
  durationMs: number;
  scores: MainContextScore[];
  startgg?: {
    tournament: {
      name: string;
    };
    event: {
      name: string;
      slug: string;
    };
    phase: {
      id: number;
      name: string;
    };
    phaseGroup: {
      id: number;
      name: string;
    };
    set: {
      fullRoundText: string;
      ordinal: number | null;
      round: number;
      stream: Stream | null;
    };
  };
  challonge?: {
    tournament: {
      name: string;
      slug: string;
    };
    set: {
      fullRoundText: string;
      ordinal: number | null;
      round: number;
      stream: Stream | null;
    };
  };
  startMs: number;
};

export type AvailableSet = {
  context?: MainContext;
  dirName: string;
  invalidReason: string;
  playedMs: number;
  playing: boolean;
  replayPaths: string[];
};

export type RenderContext = {
  bestOf: number;
  duration: string;
  namesLeft: string;
  namesRight: string;
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

export type RenderSet = {
  context?: RenderContext;
  dirName: string;
  invalidReason: string;
  played: boolean;
  playing: boolean;
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
  leftPrefixes: string[];
  leftNames: string[];
  leftPronouns: string[];
  leftScore: number;
  rightPrefixes: string[];
  rightNames: string[];
  rightPronouns: string[];
  rightScore: number;
};

export type OverlayContext = {
  sets: OverlaySet[];
  upcoming: { leftNames: string[]; rightNames: string[] }[];
  upcomingRoundName: string;
  startgg?: {
    tournamentName: string;
    eventName: string;
    phaseName: string;
  };
  challonge?: {
    tournamentName: string;
  };
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
