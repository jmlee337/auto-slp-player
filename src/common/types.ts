export type AvailableSetContext = {
  bestOf: number;
  gameCount: number;
  slots: string[][];
};

export type AvailableSet = {
  dirName: string;
  replayPaths: string[];
  context?: AvailableSetContext;
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
