export type AvailableSetContext = {
  bestOf: number;
  gameCount: number;
  slots: string[][];
};

export type AvailableSet = {
  dirName: string;
  fullPath: string;
  context?: AvailableSetContext;
};
