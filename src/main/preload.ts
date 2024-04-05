import { IpcRendererEvent, contextBridge, ipcRenderer } from 'electron';
import { AvailableSet } from '../common/types';

const electronHandler = {
  getDolphinPath: (): Promise<string> => ipcRenderer.invoke('getDolphinPath'),
  chooseDolphinPath: (): Promise<string> =>
    ipcRenderer.invoke('chooseDolphinPath'),
  getIsoPath: (): Promise<string> => ipcRenderer.invoke('getIsoPath'),
  chooseIsoPath: (): Promise<string> => ipcRenderer.invoke('chooseIsoPath'),
  chooseWatchDir: (): Promise<string> => ipcRenderer.invoke('chooseWatchDir'),
  watch: (start: boolean): Promise<void> => ipcRenderer.invoke('watch', start),
  play: (set: AvailableSet): Promise<void> => ipcRenderer.invoke('play', set),
  onUnzip: (
    callback: (event: IpcRendererEvent, availableSets: AvailableSet[]) => void,
  ) => {
    ipcRenderer.removeAllListeners('unzip');
    ipcRenderer.on('unzip', callback);
  },
};

contextBridge.exposeInMainWorld('electron', electronHandler);

export type ElectronHandler = typeof electronHandler;
