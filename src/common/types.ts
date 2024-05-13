export type ContextSlot = {
  displayNames?: string[];
  ports?: number[];
  prefixes?: string[];
  pronouns?: string[];
  score?: number;
};

export type ContextScore = {
  // slots.length === 2
  slots?: ContextSlot[];
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
      id: number;
      fullRoundText?: string;
      round?: number;
    };
  };
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
      round: number;
    };
  };
};

export type AvailableSet = {
  context?: MainContext;
  dirName: string;
  playedMs: number;
  playing: boolean;
  replayPaths: string[];
};

export type RenderContext = {
  namesLeft: string;
  namesRight: string;
  fullRoundText: string;
  bestOf: number;
  eventName: string;
  phaseName: string;
  phaseGroupName: string;
  duration: string;
};

export type RenderSet = {
  context?: RenderContext;
  dirName: string;
  played: boolean;
  playing: boolean;
};

export type DolphinComm = {
  mode: 'queue';
  commandId: string;
  queue: { path: string }[];
};

export type TwitchSettings = {
  enabled: boolean;
  channelName: string;
  clientId: string;
  clientSecret: string;
  accessToken: string;
  refreshToken: string;
};

export type OverlayContext = {
  tournamentName: string;
  eventName: string;
  phaseName: string;
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
  upcoming: { leftNames: string[]; rightNames: string[] }[];
  upcomingRoundName: string;
};
