import { FSWatcher, watch } from 'chokidar';
import {
  BrowserWindow,
  IpcMainInvokeEvent,
  app,
  dialog,
  ipcMain,
} from 'electron';
import Store from 'electron-store';
import { access, mkdir } from 'fs/promises';
import path from 'path';
import unzip from './unzip';

export default async function setupIPCs(
  mainWindow: BrowserWindow,
): Promise<void> {
  const store = new Store();
  let dolphinPath = store.has('dolphinPath')
    ? (store.get('dolphinPath') as string)
    : '';
  let isoPath = store.has('isoPath') ? (store.get('isoPath') as string) : '';

  ipcMain.removeHandler('getDolphinPath');
  ipcMain.handle('getDolphinPath', (): string => dolphinPath);

  ipcMain.removeHandler('chooseDolphinPath');
  ipcMain.handle('chooseDolphinPath', async (): Promise<string> => {
    const openDialogRes = await dialog.showOpenDialog({
      properties: ['openFile', 'showHiddenFiles'],
    });
    if (openDialogRes.canceled) {
      return '';
    }
    [dolphinPath] = openDialogRes.filePaths;
    store.set('dolphinPath', dolphinPath);
    return dolphinPath;
  });

  ipcMain.removeHandler('getIsoPath');
  ipcMain.handle('getIsoPath', (): string => isoPath);

  ipcMain.removeHandler('chooseIsoPath');
  ipcMain.handle('chooseIsoPath', async (): Promise<string> => {
    const openDialogRes = await dialog.showOpenDialog({
      filters: [
        {
          name: 'Melee ISO',
          extensions: ['iso', 'gcm', 'gcz', 'ciso'],
        },
      ],
      properties: ['openFile', 'showHiddenFiles'],
    });
    if (openDialogRes.canceled) {
      return '';
    }
    [isoPath] = openDialogRes.filePaths;
    store.set('isoPath', isoPath);
    return isoPath;
  });

  let watchDir = '';
  ipcMain.removeHandler('chooseWatchDir');
  ipcMain.handle('chooseWatchDir', async (): Promise<string> => {
    const openDialogRes = await dialog.showOpenDialog({
      properties: ['openDirectory', 'showHiddenFiles'],
    });
    if (openDialogRes.canceled) {
      return '';
    }
    [watchDir] = openDialogRes.filePaths;
    return watchDir;
  });

  let watcher: FSWatcher | undefined;
  const tempPath = path.join(app.getPath('temp'), 'auto-slp-player');
  try {
    await access(tempPath).catch(() => mkdir(tempPath));
  } catch (e: any) {
    throw new Error(`Could not make temp dir: ${e}`);
  }
  const availableSets: string[] = [];
  ipcMain.removeHandler('watch');
  ipcMain.handle('watch', async (event: IpcMainInvokeEvent, start: boolean) => {
    if (start) {
      const normalizedDir =
        process.platform === 'win32'
          ? watchDir.split(path.win32.sep).join(path.posix.sep)
          : watchDir;
      const glob = `${normalizedDir}/*.zip`;
      watcher = watch(glob);
      watcher.on('add', async (newZipPath) => {
        try {
          const unzipped = await unzip(newZipPath, tempPath);
          availableSets.push(unzipped);
          mainWindow.webContents.send('unzip', availableSets);
        } catch (e: any) {
          if (e instanceof Error) {
            console.log(e.message);
          }
        }
      });
    } else if (watcher) {
      await watcher.close();
      availableSets.length = 0;
    }
  });
}
