import { FSWatcher, watch } from 'chokidar';
import { IpcMainInvokeEvent, app, dialog, ipcMain } from 'electron';
import Store from 'electron-store';
import { createWriteStream } from 'fs';
import { access, mkdir, rmdir } from 'fs/promises';
import path from 'path';
import { open } from 'yauzl';

export default async function setupIPCs(): Promise<void> {
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

  ipcMain.removeHandler('watch');
  ipcMain.handle('watch', async (event: IpcMainInvokeEvent, start: boolean) => {
    if (start) {
      const normalizedDir =
        process.platform === 'win32'
          ? watchDir.split(path.win32.sep).join(path.posix.sep)
          : watchDir;
      const glob = `${normalizedDir}/*.zip`;
      watcher = watch(glob);
      watcher.on('add', (newZipPath) => {
        open(newZipPath, { lazyEntries: true }, async (openErr, zipFile) => {
          if (openErr) return;
          const unzipDir = path.join(
            tempPath,
            path.basename(newZipPath, '.zip'),
          );
          try {
            await mkdir(unzipDir);
          } catch (e: any) {
            return;
          }

          zipFile.on('entry', async (entry) => {
            if (
              entry.fileName === 'context.json' ||
              entry.fileName.endsWith('.slp')
            ) {
              zipFile.openReadStream(
                entry,
                async (openReadStreamErr, readStream) => {
                  if (openReadStreamErr) {
                    await rmdir(unzipDir);
                    zipFile.close();
                    return;
                  }

                  readStream.on('end', () => {
                    zipFile.readEntry();
                  });
                  const unzipPath = path.join(unzipDir, entry.fileName);
                  const writeStream = createWriteStream(unzipPath);
                  readStream.pipe(writeStream);
                },
              );
            } else {
              await rmdir(unzipDir);
              zipFile.close();
            }
          });
          zipFile.readEntry();
        });
      });
    } else if (watcher) {
      await watcher.close();
    }
  });
}
