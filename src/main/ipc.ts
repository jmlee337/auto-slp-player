import { FSWatcher, watch } from 'chokidar';
import {
  BrowserWindow,
  IpcMainInvokeEvent,
  app,
  dialog,
  ipcMain,
  shell,
} from 'electron';
import Store from 'electron-store';
import { access, mkdir } from 'fs/promises';
import path from 'path';
import { RefreshingAuthProvider } from '@twurple/auth';
import { Bot, createBotCommand } from '@twurple/easy-bot';
import unzip from './unzip';
import { AvailableSet, TwitchSettings } from '../common/types';
import { Dolphin, DolphinEvent } from './dolphin';

export default async function setupIPCs(
  mainWindow: BrowserWindow,
): Promise<void> {
  const store = new Store();
  let dolphinPath = store.has('dolphinPath')
    ? (store.get('dolphinPath') as string)
    : '';
  let isoPath = store.has('isoPath') ? (store.get('isoPath') as string) : '';
  let twitchSettings: TwitchSettings = store.has('twitchSettings')
    ? (store.get('twitchSettings') as TwitchSettings)
    : {
        enabled: false,
        channelName: '',
        accessToken: '',
        refreshToken: '',
        clientId: '',
        clientSecret: '',
      };

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
  const tempDir = path.join(app.getPath('temp'), 'auto-slp-player');
  try {
    await access(tempDir).catch(() => mkdir(tempDir));
  } catch (e: any) {
    if (e instanceof Error) {
      throw new Error(`Could not make temp dir: ${e.message}`);
    }
  }
  const playedSetDirNames: Set<string> = new Set();
  const availableSets: AvailableSet[] = [];
  let playingSet: AvailableSet | null = null;
  let queuedSet: AvailableSet | null = null;
  let dolphin: Dolphin | null = null;
  const playDolphin = (set: AvailableSet) => {
    if (!dolphin) {
      dolphin = new Dolphin(dolphinPath, isoPath, tempDir);
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
        if (index === -1) {
          playingSet = null;
          mainWindow.webContents.send('playing', '');
          return;
        }
        for (let i = index + 1; i < availableSets.length; i += 1) {
          if (!playedSetDirNames.has(availableSets[i].dirName)) {
            playDolphin(availableSets[i]);
            return;
          }
        }
        playingSet = null;
        mainWindow.webContents.send('playing', '');
      });
      dolphin.on(DolphinEvent.START_FAILED, () => {
        if (dolphin) {
          dolphin.close();
        }
      });
    }

    playingSet = set;
    set.played = true;
    playedSetDirNames.add(set.dirName);
    dolphin.play(set.replayPaths);
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
          const newSet = await unzip(newZipPath, tempDir, playedSetDirNames);
          availableSets.push(newSet);
          availableSets.sort((a, b) => a.dirName.localeCompare(b.dirName));
          if (!playingSet && !newSet.played) {
            newSet.played = true;
            playDolphin(newSet);
          }
          mainWindow.webContents.send('unzip', availableSets);
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

  ipcMain.removeHandler('markPlayed');
  ipcMain.handle(
    'markPlayed',
    (event: IpcMainInvokeEvent, dirName: string, played: boolean) => {
      const set = availableSets.find(
        (availableSet) => availableSet.dirName === dirName,
      );
      if (!set) {
        throw new Error(`set does not exist: ${dirName}`);
      }
      set.played = played;
      if (played) {
        playedSetDirNames.add(set.dirName);
      } else {
        playedSetDirNames.delete(set.dirName);
      }
      return availableSets;
    },
  );

  ipcMain.removeHandler('play');
  ipcMain.handle('play', (event: IpcMainInvokeEvent, set: AvailableSet) => {
    playDolphin(set);
  });

  ipcMain.removeHandler('queue');
  ipcMain.handle('queue', (event: IpcMainInvokeEvent, set: AvailableSet) => {
    queuedSet = set;
  });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let twitchBot: Bot | null;
  const maybeStartTwitchBot = async (newTwitchSettings: TwitchSettings) => {
    if (
      !newTwitchSettings.enabled ||
      !newTwitchSettings.channelName ||
      !newTwitchSettings.clientId ||
      !newTwitchSettings.clientSecret ||
      !newTwitchSettings.accessToken ||
      !newTwitchSettings.refreshToken
    ) {
      return;
    }

    const authProvider = new RefreshingAuthProvider({
      clientId: newTwitchSettings.clientId,
      clientSecret: newTwitchSettings.clientSecret,
    });
    authProvider.onRefresh((userId, token) => {
      twitchSettings.accessToken = token.accessToken;
      twitchSettings.refreshToken = token.refreshToken!;
      store.set('twitchSettings', newTwitchSettings);
    });
    await authProvider.addUserForToken(
      {
        accessToken: newTwitchSettings.accessToken,
        refreshToken: newTwitchSettings.refreshToken,
        expiresIn: 0,
        obtainmentTimestamp: 0,
      },
      ['chat'],
    );

    twitchBot = new Bot({
      authProvider,
      channel: twitchSettings.channelName,
      commands: [
        createBotCommand('help', (params, { say }) => {
          say('!help, !bracket, !score, !set');
        }),
        createBotCommand('bracket', (params, { say }) => {
          say('TODO');
        }),
        createBotCommand('score', (params, { say }) => {
          say('TODO');
        }),
        createBotCommand('set', (params, { say }) => {
          say('TODO');
        }),
      ],
    });
  };

  ipcMain.removeHandler('getTwitchSettings');
  ipcMain.handle('getTwitchSettings', () => {
    return twitchSettings;
  });

  ipcMain.removeHandler('setTwitchSettings');
  ipcMain.handle(
    'setTwitchSettings',
    async (event: IpcMainInvokeEvent, newTwitchSettings: TwitchSettings) => {
      const channelDiff =
        twitchSettings.channelName !== newTwitchSettings.channelName;
      const clientIdDiff =
        twitchSettings.clientId !== newTwitchSettings.clientId;
      const clientSecretDiff =
        twitchSettings.clientSecret !== newTwitchSettings.clientSecret;
      if (
        channelDiff ||
        clientIdDiff ||
        clientSecretDiff ||
        twitchSettings.enabled !== newTwitchSettings.enabled
      ) {
        const actualNewTwitchSettings: TwitchSettings = {
          enabled: newTwitchSettings.enabled,
          channelName: newTwitchSettings.channelName,
          clientId: newTwitchSettings.clientId,
          clientSecret: newTwitchSettings.clientSecret,
          accessToken: twitchSettings.accessToken,
          refreshToken: twitchSettings.refreshToken,
        };
        if (!newTwitchSettings.enabled || clientIdDiff || clientSecretDiff) {
          twitchBot = null;
          if (clientIdDiff || clientSecretDiff) {
            actualNewTwitchSettings.accessToken = '';
            actualNewTwitchSettings.refreshToken = '';
            if (clientIdDiff) {
              actualNewTwitchSettings.clientSecret = '';
            }
          }
        } else {
          // channelDiff || twitchSettings.enabled
          await maybeStartTwitchBot(actualNewTwitchSettings);
        }
        store.set('twitchSettings', actualNewTwitchSettings);
        twitchSettings = actualNewTwitchSettings;
        return twitchSettings;
      }
      return twitchSettings;
    },
  );

  ipcMain.removeHandler('getTwitchTokens');
  ipcMain.handle(
    'getTwitchTokens',
    async (event: IpcMainInvokeEvent, code: string) => {
      const response = await fetch(
        `https://id.twitch.tv/oauth2/token?client_id=${twitchSettings.clientId}&client_secret=${twitchSettings.clientSecret}&code=${code}&grant_type=authorization_code&redirect_uri=http://localhost`,
        { method: 'post' },
      );
      const json = await response.json();
      const accessToken = json.access_token;
      const refreshToken = json.refresh_token;
      if (
        !accessToken ||
        typeof accessToken !== 'string' ||
        !refreshToken ||
        typeof refreshToken !== 'string'
      ) {
        throw new Error('failed to get Twitch tokens');
      }
      twitchSettings.accessToken = accessToken;
      twitchSettings.refreshToken = refreshToken;
      store.set('twitchSettings', twitchSettings);
      maybeStartTwitchBot(twitchSettings);
    },
  );
  maybeStartTwitchBot(twitchSettings);

  ipcMain.removeHandler('openTempDir');
  ipcMain.handle('openTempDir', () => {
    shell.openPath(tempDir);
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
