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
import { AvailableSet } from '../common/types';
import { Dolphin, DolphinEvent } from './dolphin';

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
      return dolphinPath;
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
      return isoPath;
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
      return watchDir;
    }
    [watchDir] = openDialogRes.filePaths;
    return watchDir;
  });

  let watcher: FSWatcher | undefined;
  const tempPath = path.join(app.getPath('temp'), 'auto-slp-player');
  try {
    await access(tempPath).catch(() => mkdir(tempPath));
  } catch (e: any) {
    if (e instanceof Error) {
      throw new Error(`Could not make temp dir: ${e.message}`);
    }
  }
  const availableSets: AvailableSet[] = [];
  let playingSet: AvailableSet | null = null;
  let queuedSet: AvailableSet | null = null;
  let dolphin: Dolphin | null = null;
  const playDolphin = (set: AvailableSet) => {
    if (!dolphin) {
      dolphin = new Dolphin(dolphinPath, isoPath, tempPath);
      dolphin.on(DolphinEvent.CLOSE, () => {
        playingSet = null;
        queuedSet = null;
        mainWindow.webContents.send('playing', '');
        if (dolphin) {
          dolphin.removeAllListeners();
          dolphin = null;
        }
      });
      dolphin.on(DolphinEvent.ENDED, () => {
        if (queuedSet) {
          playDolphin(queuedSet);
          queuedSet = null;
          return;
        }

        if (playingSet === null) {
          mainWindow.webContents.send('playing', '');
          return;
        }
        const index = availableSets.findIndex(
          (value) => value.dirName === playingSet!.dirName,
        );
        if (index === -1 || index + 1 >= availableSets.length) {
          playingSet = null;
          mainWindow.webContents.send('playing', '');
          return;
        }
        playDolphin(availableSets[index + 1]);
      });
      dolphin.on(DolphinEvent.START_FAILED, () => {
        if (dolphin) {
          dolphin.close();
        }
      });
    }

    dolphin.play(set.replayPaths);
    playingSet = set;
    mainWindow.webContents.send('playing', set.dirName);
  };
  ipcMain.removeHandler('watch');
  ipcMain.handle('watch', async (event: IpcMainInvokeEvent, start: boolean) => {
    if (start) {
      availableSets.length = 0;
      const normalizedDir =
        process.platform === 'win32'
          ? watchDir.split(path.win32.sep).join(path.posix.sep)
          : watchDir;
      const glob = `${normalizedDir}/*.zip`;
      watcher = watch(glob);
      watcher.on('add', async (newZipPath) => {
        try {
          const newSet = await unzip(newZipPath, tempPath);
          availableSets.push(newSet);
          availableSets.sort((a, b) => a.dirName.localeCompare(b.dirName));
          mainWindow.webContents.send('unzip', availableSets);
          if (!playingSet) {
            playDolphin(newSet);
          }
        } catch (e: any) {
          if (e instanceof Error) {
            console.log(e.message);
          }
        }
      });
    } else if (watcher) {
      await watcher.close();
    }
  });

  ipcMain.removeHandler('play');
  ipcMain.handle('play', (event: IpcMainInvokeEvent, set: AvailableSet) => {
    playDolphin(set);
  });

  ipcMain.removeHandler('queue');
  ipcMain.handle('queue', (event: IpcMainInvokeEvent, set: AvailableSet) => {
    queuedSet = set;
  });

  ipcMain.removeHandler('getVersion');
  ipcMain.handle('getVersion', () => app.getVersion());

  ipcMain.removeHandler('getLatestVersion');
  ipcMain.handle('getLatestVersion', async () => {
    const response = await fetch(
      'https://api.github.com/repos/jmlee337/auto-slp-player/releases',
    );
    const json = await response.json();
    return json[0].tag_name;
  });
}
