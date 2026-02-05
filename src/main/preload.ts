import { IpcRendererEvent, contextBridge, ipcRenderer } from 'electron';
import {
  ApiPhaseGroup,
  ApiSet,
  OBSConnectionStatus,
  ObsGamecaptureResult,
  OBSSettings,
  Remote,
  RendererQueue,
  SplitOption,
  TwitchClient,
  TwitchPrediction,
  TwitchStatus,
} from '../common/types';

const electronHandler = {
  getDolphinPath: (): Promise<string> => ipcRenderer.invoke('getDolphinPath'),
  chooseDolphinPath: (): Promise<string> =>
    ipcRenderer.invoke('chooseDolphinPath'),
  getIsoPath: (): Promise<string> => ipcRenderer.invoke('getIsoPath'),
  chooseIsoPath: (): Promise<string> => ipcRenderer.invoke('chooseIsoPath'),
  getMaxDolphins: (): Promise<number> => ipcRenderer.invoke('getMaxDolphins'),
  setMaxDolphins: (maxDolphins: number): Promise<void> =>
    ipcRenderer.invoke('setMaxDolphins', maxDolphins),
  getWatchDir: (): Promise<string> => ipcRenderer.invoke('getWatchDir'),
  chooseWatchDir: (): Promise<string> => ipcRenderer.invoke('chooseWatchDir'),
  getNumDolphins: (): Promise<number> => ipcRenderer.invoke('getNumDolphins'),
  openDolphins: (): Promise<void> => ipcRenderer.invoke('openDolphins'),
  getObsConnectionStatus: (): Promise<OBSConnectionStatus> =>
    ipcRenderer.invoke('getObsConnectionStatus'),
  getStreamOutputStatus: (): Promise<string> =>
    ipcRenderer.invoke('getStreamOutputStatus'),
  connectObs: (): Promise<void> => ipcRenderer.invoke('connectObs'),
  startStream: (): Promise<void> => ipcRenderer.invoke('startStream'),
  markPlayed: (
    queueId: string,
    originalPath: string,
    played: boolean,
  ): Promise<void> =>
    ipcRenderer.invoke('markPlayed', queueId, originalPath, played),
  stop: (queueId: string, originalPath: string): Promise<void> =>
    ipcRenderer.invoke('stop', queueId, originalPath),
  playNext: (queueId: string, originalPath: string): Promise<void> =>
    ipcRenderer.invoke('playNext', queueId, originalPath),
  playNow: (queueId: string, originalPath: string): Promise<void> =>
    ipcRenderer.invoke('playNow', queueId, originalPath),
  getTimestamps: (): Promise<string> => ipcRenderer.invoke('getTimestamps'),
  getSggApiKey: (): Promise<string> => ipcRenderer.invoke('getSggApiKey'),
  setSggApiKey: (sggApiKey: string): Promise<void> =>
    ipcRenderer.invoke('setSggApiKey', sggApiKey),
  setSggVodUrls: (baseYoutubeUrl: string): Promise<void> =>
    ipcRenderer.invoke('setSggVodUrls', baseYoutubeUrl),
  getSplitOption: (): Promise<SplitOption> =>
    ipcRenderer.invoke('getSplitOption'),
  setSplitOption: (newSplitOption: SplitOption): Promise<void> =>
    ipcRenderer.invoke('setSplitOption', newSplitOption),
  getSplitByWave: (): Promise<boolean> => ipcRenderer.invoke('getSplitByWave'),
  setSplitByWave: (splitByWave: boolean): Promise<void> =>
    ipcRenderer.invoke('setSplitByWave', splitByWave),
  getCheckOvertime: (): Promise<boolean> =>
    ipcRenderer.invoke('getCheckOvertime'),
  setCheckOvertime: (checkOvertime: boolean): Promise<void> =>
    ipcRenderer.invoke('setCheckOvertime', checkOvertime),

  // twitch
  getTwitchUserName: (): Promise<string> =>
    ipcRenderer.invoke('getTwitchUserName'),
  getTwitchBotEnabled: (): Promise<boolean> =>
    ipcRenderer.invoke('getTwitchBotEnabled'),
  setTwitchBotEnabled: (twitchBotEnabled: boolean): Promise<void> =>
    ipcRenderer.invoke('setTwitchBotEnabled', twitchBotEnabled),
  getTwitchBotStatus: (): Promise<{ status: TwitchStatus; message: string }> =>
    ipcRenderer.invoke('getTwitchBotStatus'),
  getTwitchPredictionsEnabled: (): Promise<boolean> =>
    ipcRenderer.invoke('getTwitchPredictionsEnabled'),
  setTwitchPredictionsEnabled: (
    twitchPredictionsEnabled: boolean,
  ): Promise<void> =>
    ipcRenderer.invoke('setTwitchPredictionsEnabled', twitchPredictionsEnabled),
  getAutoTwitchPredictions: (): Promise<boolean> =>
    ipcRenderer.invoke('getAutoTwitchPredictions'),
  setAutoTwitchPredictions: (autoTwitchPredictions: boolean): Promise<void> =>
    ipcRenderer.invoke('setAutoTwitchPredictions', autoTwitchPredictions),
  getTwitchPrediction: (): Promise<TwitchPrediction | null> =>
    ipcRenderer.invoke('getTwitchPrediction'),
  createTwitchPrediction: (set: ApiSet): Promise<void> =>
    ipcRenderer.invoke('createTwitchPrediction', set),
  cancelTwitchPrediction: (): Promise<void> =>
    ipcRenderer.invoke('cancelTwitchPrediction'),
  lockTwitchPrediction: (): Promise<void> =>
    ipcRenderer.invoke('lockTwitchPrediction'),
  resolveTwitchPrediction: (): Promise<void> =>
    ipcRenderer.invoke('resolveTwitchPrediction'),
  resolveTwitchPredictionWithWinner: (winnerName: string): Promise<void> =>
    ipcRenderer.invoke('resolveTwitchPredictionWithWinner', winnerName),
  getTwitchClient: (): Promise<TwitchClient> =>
    ipcRenderer.invoke('getTwitchClient'),
  setTwitchClient: (twitchClient: TwitchClient): Promise<void> =>
    ipcRenderer.invoke('setTwitchClient', twitchClient),
  clearTwitchClient: (): Promise<void> =>
    ipcRenderer.invoke('clearTwitchClient'),
  getMusicOff: (): Promise<boolean> => ipcRenderer.invoke('getMusicOff'),
  setMusicOff: (musicOff: boolean): Promise<void> =>
    ipcRenderer.invoke('setMusicOff', musicOff),
  getStealth: (): Promise<boolean> => ipcRenderer.invoke('getStealth'),
  setStealth: (stealth: boolean): Promise<void> =>
    ipcRenderer.invoke('setStealth', stealth),
  getTwitchCallbackServerStatus: (): Promise<{
    status: TwitchStatus;
    port: number;
  }> => ipcRenderer.invoke('getTwitchCallbackServerStatus'),
  startTwitchCallbackServer: (): Promise<void> =>
    ipcRenderer.invoke('startTwitchCallbackServer'),
  stopTwitchCallbackServer: (): Promise<void> =>
    ipcRenderer.invoke('stopTwitchCallbackServer'),
  onTwitchUserName: (
    callback: (event: IpcRendererEvent, userName: string) => void,
  ) => {
    ipcRenderer.removeAllListeners('twitchUserName');
    ipcRenderer.on('twitchUserName', callback);
  },
  onTwitchBotStatus: (
    callback: (
      event: IpcRendererEvent,
      status: TwitchStatus,
      message: string,
    ) => void,
  ) => {
    ipcRenderer.removeAllListeners('twitchBotStatus');
    ipcRenderer.on('twitchBotStatus', callback);
  },
  onTwitchPrediction: (
    callback: (
      event: IpcRendererEvent,
      twitchPrediction: TwitchPrediction | null,
    ) => void,
  ) => {
    ipcRenderer.removeAllListeners('twitchPrediction');
    ipcRenderer.on('twitchPrediction', callback);
  },
  onTwitchCallbackServerStatus: (
    callback: (
      event: IpcRendererEvent,
      status: TwitchStatus,
      port: number,
    ) => void,
  ) => {
    ipcRenderer.removeAllListeners('twitchCallbackServerStatus');
    ipcRenderer.on('twitchCallbackServerStatus', callback);
  },

  getQueues: (): Promise<RendererQueue[]> => ipcRenderer.invoke('getQueues'),
  getCanPlay: (): Promise<boolean> => ipcRenderer.invoke('getCanPlay'),
  incrementQueuePriority: (queueId: string): Promise<void> =>
    ipcRenderer.invoke('incrementQueuePriority', queueId),
  decrementQueuePriority: (queueId: string): Promise<void> =>
    ipcRenderer.invoke('decrementQueuePriority', queueId),
  setQueuePaused: (queueId: string, paused: boolean): Promise<void> =>
    ipcRenderer.invoke('setQueuePaused', queueId, paused),
  checkObsGamecapture: (): Promise<ObsGamecaptureResult> =>
    ipcRenderer.invoke('checkObsGamecapture'),
  getDolphinVersion: (): Promise<{
    dolphinVersion: string;
    dolphinVersionError: string;
  }> => ipcRenderer.invoke('getDolphinVersion'),
  getShouldSetupAndAutoSwitchObs: (): Promise<boolean> =>
    ipcRenderer.invoke('getShouldSetupAndAutoSwitchObs'),
  setShouldSetupAndAutoSwitchObs: (
    shouldSetupAndAutoSwitchObs: boolean,
  ): Promise<void> =>
    ipcRenderer.invoke(
      'ShouldSetupAndAutoSwitchObs',
      shouldSetupAndAutoSwitchObs,
    ),
  getObsSettings: (): Promise<OBSSettings> =>
    ipcRenderer.invoke('getObsSettings'),
  setObsSettings: (settings: OBSSettings) =>
    ipcRenderer.invoke('setObsSettings', settings),
  openOverlayDir: (): Promise<void> => ipcRenderer.invoke('openOverlayDir'),
  openTempDir: (): Promise<void> => ipcRenderer.invoke('openTempDir'),
  clearTempDir: (): Promise<void> => ipcRenderer.invoke('clearTempDir'),

  // mirroring
  getMirrorDir: (): Promise<string> => ipcRenderer.invoke('getMirrorDir'),
  chooseMirrorDir: (): Promise<string> => ipcRenderer.invoke('chooseMirrorDir'),
  getIsMirroring: (): Promise<boolean> => ipcRenderer.invoke('getIsMirroring'),
  startMirroring: (): Promise<boolean> => ipcRenderer.invoke('startMirroring'),
  stopMirroring: (): Promise<boolean> => ipcRenderer.invoke('stopMirroring'),
  getMirrorShowScore: (): Promise<boolean> =>
    ipcRenderer.invoke('getMirrorShowScore'),
  setMirrorShowScore: (mirrorShowScore: boolean): Promise<void> =>
    ipcRenderer.invoke('setMirrorShowScore', mirrorShowScore),
  getMirrorScore: (): Promise<[number, number]> =>
    ipcRenderer.invoke('getMirrorScore'),
  setMirrorScore: (mirrorScore: [number, number]): Promise<void> =>
    ipcRenderer.invoke('setMirrorScore', mirrorScore),

  getRemote: (): Promise<Remote> => ipcRenderer.invoke('getRemote'),
  setRemote: (remote: Remote): Promise<void> =>
    ipcRenderer.invoke('setRemote', remote),
  connectToOfflineMode: (port: number): Promise<void> =>
    ipcRenderer.invoke('connectToOfflineMode', port),
  loadPhaseGroups: (slug: string): Promise<void> =>
    ipcRenderer.invoke('loadPhaseGroups', slug),
  getPhaseGroups: (): Promise<{
    phaseGroups: ApiPhaseGroup[];
    tournamentSlugs: string[];
  }> => ipcRenderer.invoke('getPhaseGroups'),
  getPendingSets: (phaseGroupId: number): Promise<ApiSet[]> =>
    ipcRenderer.invoke('getPendingSets', phaseGroupId),
  getMirrorSet: (): Promise<ApiSet | null> =>
    ipcRenderer.invoke('getMirrorSet'),
  setMirrorSet: (set: ApiSet | null): Promise<void> =>
    ipcRenderer.invoke('setMirrorSet', set),

  getVersion: (): Promise<string> => ipcRenderer.invoke('getVersion'),
  getLatestVersion: (): Promise<string> =>
    ipcRenderer.invoke('getLatestVersion'),
  copyToClipboard: (text: string): Promise<void> =>
    ipcRenderer.invoke('copyToClipboard', text),
  onDolphins: (
    callback: (event: IpcRendererEvent, numDolphins: number) => void,
  ) => {
    ipcRenderer.removeAllListeners('dolphins');
    ipcRenderer.on('dolphins', callback);
  },
  onMirroring: (
    callback: (event: IpcRendererEvent, isMirroring: boolean) => void,
  ) => {
    ipcRenderer.removeAllListeners('mirroring');
    ipcRenderer.on('mirroring', callback);
  },
  onOfflineModeStatus: (
    callback: (event: IpcRendererEvent, address: string, error: string) => void,
  ) => {
    ipcRenderer.removeAllListeners('offlineModeStatus');
    ipcRenderer.on('offlineModeStatus', callback);
  },
  onObsConnectionStatus: (
    callback: (
      event: IpcRendererEvent,
      status: OBSConnectionStatus,
      message?: string,
    ) => void,
  ) => {
    ipcRenderer.removeAllListeners('obsConnectionStatus');
    ipcRenderer.on('obsConnectionStatus', callback);
  },
  onQueues: (
    callback: (
      event: IpcRendererEvent,
      queues: RendererQueue[],
      canPlay: boolean,
    ) => void,
  ) => {
    ipcRenderer.removeAllListeners('queues');
    ipcRenderer.on('queues', callback);
  },
  onStreamOutputStatus: (
    callback: (event: IpcRendererEvent, outputStatus: string) => void,
  ) => {
    ipcRenderer.removeAllListeners('streamOutputStatus');
    ipcRenderer.on('streamOutputStatus', callback);
  },
  update: (): Promise<void> => ipcRenderer.invoke('update'),
};

contextBridge.exposeInMainWorld('electron', electronHandler);

export type ElectronHandler = typeof electronHandler;
