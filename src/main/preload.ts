import { IpcRendererEvent, contextBridge, ipcRenderer } from 'electron';
import { RenderSet, TwitchSettings } from '../common/types';

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
  watch: (start: boolean): Promise<void> => ipcRenderer.invoke('watch', start),
  play: (dirName: string): Promise<void> => ipcRenderer.invoke('play', dirName),
  queue: (dirName: string): Promise<void> =>
    ipcRenderer.invoke('queue', dirName),
  markPlayed: (dirName: string, played: boolean): Promise<RenderSet[]> =>
    ipcRenderer.invoke('markPlayed', dirName, played),
  getGenerateOverlay: (): Promise<boolean> =>
    ipcRenderer.invoke('getGenerateOverlay'),
  setGenerateOverlay: (newGenerateOverlay: boolean) =>
    ipcRenderer.invoke('setGenerateOverlay', newGenerateOverlay),
  getTwitchSettings: (): Promise<TwitchSettings> =>
    ipcRenderer.invoke('getTwitchSettings'),
  setTwitchSettings: (
    newTwitchSettings: TwitchSettings,
  ): Promise<TwitchSettings> =>
    ipcRenderer.invoke('setTwitchSettings', newTwitchSettings),
  getTwitchTokens: (code: string): Promise<void> =>
    ipcRenderer.invoke('getTwitchTokens', code),
  openOverlayDir: (): Promise<void> => ipcRenderer.invoke('openOverlayDir'),
  openTempDir: (): Promise<void> => ipcRenderer.invoke('openTempDir'),
  getVersion: (): Promise<string> => ipcRenderer.invoke('getVersion'),
  getLatestVersion: (): Promise<string> =>
    ipcRenderer.invoke('getLatestVersion'),
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
