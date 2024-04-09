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

export type AvailableSet = {
  dirName: string;
  replayPaths: string[];
  context: Context;
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
