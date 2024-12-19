import { IpcRendererEvent, contextBridge, ipcRenderer } from 'electron';
import {
  OBSConnectionStatus,
  OBSSettings,
  RenderSet,
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
  chooseWatchDir: (): Promise<string> => ipcRenderer.invoke('chooseWatchDir'),
  getNumdolphins: (): Promise<number> => ipcRenderer.invoke('getNumDolphins'),
  openDolphins: (): Promise<void> => ipcRenderer.invoke('openDolphins'),
  getObsConnectionStatus: (): Promise<OBSConnectionStatus> =>
    ipcRenderer.invoke('getObsConnectionStatus'),
  getStreamingState: (): Promise<string> =>
    ipcRenderer.invoke('getStreamingState'),
  connectObs: (): Promise<void> => ipcRenderer.invoke('connectObs'),
  startStream: (): Promise<void> => ipcRenderer.invoke('startStream'),
  play: (dirName: string): Promise<void> => ipcRenderer.invoke('play', dirName),
  stop: (dirName: string): Promise<void> => ipcRenderer.invoke('stop', dirName),
  queue: (dirName: string): Promise<void> =>
    ipcRenderer.invoke('queue', dirName),
  markPlayed: (
    dirName: string,
    played: boolean,
  ): Promise<{ renderSets: RenderSet[]; queuedSetDirName: string }> =>
    ipcRenderer.invoke('markPlayed', dirName, played),
  getGenerateOverlay: (): Promise<boolean> =>
    ipcRenderer.invoke('getGenerateOverlay'),
  setGenerateOverlay: (newGenerateOverlay: boolean) =>
    ipcRenderer.invoke('setGenerateOverlay', newGenerateOverlay),
  getGenerateTimestamps: (): Promise<boolean> =>
    ipcRenderer.invoke('getGenerateTimestamps'),
  setGenerateTimestamps: (newGenerateTimestamps: boolean) =>
    ipcRenderer.invoke('setGenerateTimestamps', newGenerateTimestamps),
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
  getDolphinVersion: (): Promise<{ version: string; error: string }> =>
    ipcRenderer.invoke('getDolphinVersion'),
  getObsConnectionEnabled: (): Promise<boolean> =>
    ipcRenderer.invoke('getObsConnectionEnabled'),
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
  onStreaming: (callback: (event: IpcRendererEvent, state: string) => void) => {
    ipcRenderer.removeAllListeners('streaming');
    ipcRenderer.on('streaming', callback);
  },
  onPlaying: (
    callback: (
      event: IpcRendererEvent,
      renderSets: RenderSet[],
      queuedSetDirName: string,
    ) => void,
  ) => {
    ipcRenderer.removeAllListeners('playing');
    ipcRenderer.on('playing', callback);
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
  onUnzip: (
    callback: (
      event: IpcRendererEvent,
      renderSets: RenderSet[],
      queuedSetDirName: string,
    ) => void,
  ) => {
    ipcRenderer.removeAllListeners('unzip');
    ipcRenderer.on('unzip', callback);
  },
};

contextBridge.exposeInMainWorld('electron', electronHandler);

export type ElectronHandler = typeof electronHandler;
