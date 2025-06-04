import { IpcRendererEvent, contextBridge, ipcRenderer } from 'electron';
import {
  OBSConnectionStatus,
  ObsGamecaptureResult,
  OBSSettings,
  RendererQueue,
  SplitOption,
  TwitchClient,
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
  getStreamingState: (): Promise<string> =>
    ipcRenderer.invoke('getStreamingState'),
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
  getGenerateTimestamps: (): Promise<boolean> =>
    ipcRenderer.invoke('getGenerateTimestamps'),
  setGenerateTimestamps: (newGenerateTimestamps: boolean) =>
    ipcRenderer.invoke('setGenerateTimestamps', newGenerateTimestamps),
  getTimestamps: (): Promise<string> => ipcRenderer.invoke('getTimestamps'),
  getAddDelay: (): Promise<boolean> => ipcRenderer.invoke('getAddDelay'),
  setAddDelay: (addDelay: boolean): Promise<void> =>
    ipcRenderer.invoke('setAddDelay', addDelay),
  getSplitOption: (): Promise<SplitOption> =>
    ipcRenderer.invoke('getSplitOption'),
  setSplitOption: (newSplitOption: SplitOption): Promise<void> =>
    ipcRenderer.invoke('setSplitOption', newSplitOption),
  getSplitByWave: (): Promise<boolean> => ipcRenderer.invoke('getSplitByWave'),
  setSplitByWave: (splitByWave: boolean): Promise<void> =>
    ipcRenderer.invoke('setSplitByWave', splitByWave),

  // twitch
  getTwitchUserName: (): Promise<string> =>
    ipcRenderer.invoke('getTwitchUserName'),
  getTwitchBotEnabled: (): Promise<boolean> =>
    ipcRenderer.invoke('getTwitchBotEnabled'),
  setTwitchBotEnabled: (twitchBotEnabled: boolean): Promise<void> =>
    ipcRenderer.invoke('setTwitchBotEnabled', twitchBotEnabled),
  getTwitchBotStatus: (): Promise<{ status: TwitchStatus; message: string }> =>
    ipcRenderer.invoke('getTwitchBotStatus'),
  getTwitchClient: (): Promise<TwitchClient> =>
    ipcRenderer.invoke('getTwitchClient'),
  setTwitchClient: (twitchClient: TwitchClient): Promise<void> =>
    ipcRenderer.invoke('setTwitchClient', twitchClient),
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
  checkObsGamecapture: (): Promise<ObsGamecaptureResult> =>
    ipcRenderer.invoke('checkObsGamecapture'),
  getDolphinVersion: (): Promise<{ version: string; error: string }> =>
    ipcRenderer.invoke('getDolphinVersion'),
  getSetupObs: (): Promise<boolean> => ipcRenderer.invoke('getSetupObs'),
  setSetupObs: (setupObs: boolean): Promise<void> =>
    ipcRenderer.invoke('setSetupObs', setupObs),
  getObsSettings: (): Promise<OBSSettings> =>
    ipcRenderer.invoke('getObsSettings'),
  setObsSettings: (settings: OBSSettings) =>
    ipcRenderer.invoke('setObsSettings', settings),
  openOverlayDir: (): Promise<void> => ipcRenderer.invoke('openOverlayDir'),
  openTempDir: (): Promise<void> => ipcRenderer.invoke('openTempDir'),
  clearTempDir: (): Promise<void> => ipcRenderer.invoke('clearTempDir'),
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
  onStreaming: (callback: (event: IpcRendererEvent, state: string) => void) => {
    ipcRenderer.removeAllListeners('streaming');
    ipcRenderer.on('streaming', callback);
  },
  update: (): Promise<void> => ipcRenderer.invoke('update'),
};

contextBridge.exposeInMainWorld('electron', electronHandler);

export type ElectronHandler = typeof electronHandler;
