export type AvailableSetContext = {
  bestOf: number;
  gameCount: number;
  slots: string[][];
};

export type AvailableSet = {
  dirName: string;
  replayPaths: string[];
  context?: AvailableSetContext;
};

export type DolphinComm = {
  mode: 'queue';
  commandId: string;
  queue: { path: string }[];
};
