import { IpcRendererEvent, contextBridge, ipcRenderer } from 'electron';
import { AvailableSet, TwitchSettings } from '../common/types';

const electronHandler = {
  getDolphinPath: (): Promise<string> => ipcRenderer.invoke('getDolphinPath'),
  chooseDolphinPath: (): Promise<string> =>
    ipcRenderer.invoke('chooseDolphinPath'),
  getIsoPath: (): Promise<string> => ipcRenderer.invoke('getIsoPath'),
  chooseIsoPath: (): Promise<string> => ipcRenderer.invoke('chooseIsoPath'),
  chooseWatchDir: (): Promise<string> => ipcRenderer.invoke('chooseWatchDir'),
  watch: (start: boolean): Promise<void> => ipcRenderer.invoke('watch', start),
  play: (set: AvailableSet): Promise<void> => ipcRenderer.invoke('play', set),
  queue: (set: AvailableSet): Promise<void> => ipcRenderer.invoke('queue', set),
  markPlayed: (dirName: string, played: boolean): Promise<AvailableSet[]> =>
    ipcRenderer.invoke('markPlayed', dirName, played),
  getTwitchSettings: (): Promise<TwitchSettings> =>
    ipcRenderer.invoke('getTwitchSettings'),
  setTwitchSettings: (
    newTwitchSettings: TwitchSettings,
  ): Promise<TwitchSettings> =>
    ipcRenderer.invoke('setTwitchSettings', newTwitchSettings),
  getTwitchTokens: (code: string): Promise<void> =>
    ipcRenderer.invoke('getTwitchTokens', code),
  openTempDir: (): Promise<void> => ipcRenderer.invoke('openTempDir'),
  getVersion: (): Promise<string> => ipcRenderer.invoke('getVersion'),
  getLatestVersion: (): Promise<string> =>
    ipcRenderer.invoke('getLatestVersion'),
  onPlaying: (callback: (event: IpcRendererEvent, dirName: string) => void) => {
    ipcRenderer.removeAllListeners('playing');
    ipcRenderer.on('playing', callback);
  },
  onUnzip: (
    callback: (event: IpcRendererEvent, availableSets: AvailableSet[]) => void,
  ) => {
    ipcRenderer.removeAllListeners('unzip');
    ipcRenderer.on('unzip', callback);
  },
};

contextBridge.exposeInMainWorld('electron', electronHandler);

export type ElectronHandler = typeof electronHandler;
