import { IpcRendererEvent, contextBridge, ipcRenderer } from 'electron';
import {
  OBSConnectionStatus,
  OBSSettings,
  RendererQueue,
  SplitOption,
  TwitchSettings,
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
  unqueue: (queueId: string): Promise<void> =>
    ipcRenderer.invoke('unqueue', queueId),
  playNow: (queueId: string, originalPath: string): Promise<void> =>
    ipcRenderer.invoke('playNow', queueId, originalPath),
  getGenerateTimestamps: (): Promise<boolean> =>
    ipcRenderer.invoke('getGenerateTimestamps'),
  setGenerateTimestamps: (newGenerateTimestamps: boolean) =>
    ipcRenderer.invoke('setGenerateTimestamps', newGenerateTimestamps),
  getAddDelay: (): Promise<boolean> => ipcRenderer.invoke('getAddDelay'),
  setAddDelay: (addDelay: boolean): Promise<void> =>
    ipcRenderer.invoke('setAddDelay', addDelay),
  getSplitOption: (): Promise<SplitOption> =>
    ipcRenderer.invoke('getSplitOption'),
  setSplitOption: (newSplitOption: SplitOption): Promise<void> =>
    ipcRenderer.invoke('setSplitOption', newSplitOption),
  getTwitchChannel: (): Promise<string> =>
    ipcRenderer.invoke('getTwitchChannel'),
  setTwitchChannel: (twitchChannel: string): Promise<void> =>
    ipcRenderer.invoke('setTwitchChannel', twitchChannel),
  getTwitchSettings: (): Promise<TwitchSettings> =>
    ipcRenderer.invoke('getTwitchSettings'),
  setTwitchSettings: (
    newTwitchSettings: TwitchSettings,
  ): Promise<TwitchSettings> =>
    ipcRenderer.invoke('setTwitchSettings', newTwitchSettings),
  getTwitchTokens: (code: string): Promise<void> =>
    ipcRenderer.invoke('getTwitchTokens', code),
  getTwitchBotStatus: (): Promise<{ connected: boolean; error: string }> =>
    ipcRenderer.invoke('getTwitchBotStatus'),
  getQueues: (): Promise<RendererQueue[]> => ipcRenderer.invoke('getQueues'),
  getCanPlay: (): Promise<boolean> => ipcRenderer.invoke('getCanPlay'),
  incrementQueuePriority: (queueId: string): Promise<void> =>
    ipcRenderer.invoke('incrementQueuePriority', queueId),
  decrementQueuePriority: (queueId: string): Promise<void> =>
    ipcRenderer.invoke('decrementQueuePriority', queueId),
  getDolphinVersion: (): Promise<{ version: string; error: string }> =>
    ipcRenderer.invoke('getDolphinVersion'),
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
    callback: (event: IpcRendererEvent, status: OBSConnectionStatus) => void,
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
  onTwitchBotStatus: (
    callback: (
      event: IpcRendererEvent,
      status: { connected: boolean; error: string },
    ) => void,
  ) => {
    ipcRenderer.removeAllListeners('twitchBotStatus');
    ipcRenderer.on('twitchBotStatus', callback);
  },
  update: (): Promise<void> => ipcRenderer.invoke('update'),
};

contextBridge.exposeInMainWorld('electron', electronHandler);

export type ElectronHandler = typeof electronHandler;
