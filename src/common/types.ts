export type ContextSlot = {
  displayNames?: string[];
  ports?: number[];
  prefixes?: string[];
  pronouns?: string[];
  score?: number;
};

export type ContextScore = {
  game?: number;
  slots?: ContextSlot[];
};

export type Context = {
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
    bestOf?: number;
    fullRoundText?: string;
    round?: number;
    scores?: ContextScore[];
  };
};

export type MainContextSlot = {
  displayNames: string[];
  prefixes: string[];
  pronouns: string[];
  score: number;
};

export type MainContextScore = {
  slots: MainContextSlot[];
};

export type MainContext = {
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
    bestOf: number;
    fullRoundText: string;
    round: number;
    scores: MainContextScore[];
  };
};

export type AvailableSet = {
  context?: MainContext;
  dirName: string;
  playedMs: number;
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
};

export type RenderSet = {
  context?: RenderContext;
  dirName: string;
  played: boolean;
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
