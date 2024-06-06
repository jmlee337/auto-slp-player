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
import { access, mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { RefreshingAuthProvider } from '@twurple/auth';
import { Bot, createBotCommand } from '@twurple/easy-bot';
import unzip from './unzip';
import { AvailableSet, OverlayContext, TwitchSettings } from '../common/types';
import { Dolphin, DolphinEvent } from './dolphin';
import { toRenderSet } from './set';

export default async function setupIPCs(
  mainWindow: BrowserWindow,
  resourcesPath: string,
): Promise<void> {
  const store = new Store();
  let dolphinPath = store.has('dolphinPath')
    ? (store.get('dolphinPath') as string)
    : '';
  let isoPath = store.has('isoPath') ? (store.get('isoPath') as string) : '';
  let generateOverlay = store.has('generateOverlay')
    ? (store.get('generateOverlay') as boolean)
    : false;
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

  const dirNameToPlayedMs = new Map<string, number>();
  const availableSets: AvailableSet[] = [];
  const earliestForPhaseRound = new Map<string, string>();
  const sortAvailableSets = () => {
    availableSets.sort((a, b) => {
      if (a.context?.startgg && b.context?.startgg) {
        const aStartgg = a.context.startgg;
        const bStartgg = b.context.startgg;
        const eventNameCompare = aStartgg.event.name.localeCompare(
          bStartgg.event.name,
        );
        if (eventNameCompare) {
          return eventNameCompare;
        }
        const phaseIdCompare = aStartgg.phase.id - bStartgg.phase.id;
        if (phaseIdCompare) {
          return phaseIdCompare;
        }
        const roundCompare = earliestForPhaseRound
          .get(`${aStartgg.phase.id}${aStartgg.set.round}`)!
          .localeCompare(
            earliestForPhaseRound.get(
              `${bStartgg.phase.id}${bStartgg.set.round}`,
            )!,
          );
        if (roundCompare) {
          return roundCompare;
        }
        if (a.playedMs && b.playedMs) {
          return a.playedMs - b.playedMs;
        }
        if (a.playedMs && !b.playedMs) {
          return -1;
        }
        if (!a.playedMs && b.playedMs) {
          return 1;
        }
        if (
          a.context.scores.length !== b.context.scores.length ||
          a.context.bestOf !== b.context.bestOf
        ) {
          const ratioCompare =
            b.context.scores.length / b.context.bestOf -
            a.context.scores.length / a.context.bestOf;
          if (ratioCompare) {
            return ratioCompare;
          }
        }
      } else if (!a.context && b.context) {
        return -1;
      } else if (a.context && !b.context) {
        return 1;
      }
      return a.dirName.localeCompare(b.dirName);
    });
  };

  let playingSet: AvailableSet | null = null;
  let queuedSet: AvailableSet | null = null;
  let gameIndex = 0;
  const writeOverlayJson = async () => {
    if (!generateOverlay) {
      return null;
    }

    const overlayPath = path.join(resourcesPath, 'overlay', 'overlay.json');

    let tournamentName = '';
    let eventName = '';
    let phaseName = '';
    let roundName = '';
    let bestOf = 0;
    let leftPrefixes: string[] = [];
    let leftNames: string[] = [];
    let leftPronouns: string[] = [];
    let leftScore = 0;
    let rightPrefixes: string[] = [];
    let rightNames: string[] = [];
    let rightPronouns: string[] = [];
    let rightScore = 0;
    const upcoming: { leftNames: string[]; rightNames: string[] }[] = [];
    let upcomingRoundName = '';
    if (playingSet && playingSet.context) {
      const { context } = playingSet;
      bestOf = context.bestOf;
      const { slots } = context.scores[gameIndex];
      leftPrefixes = slots[0].prefixes;
      leftNames = slots[0].displayNames;
      leftPronouns = slots[0].pronouns;
      leftScore = slots[0].score;
      rightPrefixes = slots[1].prefixes;
      rightNames = slots[1].displayNames;
      rightPronouns = slots[1].pronouns;
      rightScore = slots[1].score;

      if (context.startgg) {
        tournamentName = context.startgg.tournament.name;
        eventName = context.startgg.event.name;
        phaseName = context.startgg.phase.name;
        roundName = context.startgg.set.fullRoundText;

        const setUpcomingSetsOrRound = (
          round: number,
          dirName: string,
          playing: boolean,
        ) => {
          const sameRoundSets = availableSets.filter(
            (availableSet) =>
              availableSet.context?.startgg?.set.round === round,
          );
          const startingIndex = sameRoundSets.findIndex(
            (availableSet) => availableSet.dirName === dirName,
          );
          if (startingIndex >= 0) {
            if (!playing) {
              upcoming.push({
                leftNames:
                  sameRoundSets[0].context!.scores[0].slots[0].displayNames,
                rightNames:
                  sameRoundSets[0].context!.scores[0].slots[1].displayNames,
              });
            }
            for (let i = startingIndex + 1; i < sameRoundSets.length; i += 1) {
              if (sameRoundSets[i].playedMs === 0) {
                upcoming.push({
                  leftNames:
                    sameRoundSets[i].context!.scores[0].slots[0].displayNames,
                  rightNames:
                    sameRoundSets[i].context!.scores[0].slots[1].displayNames,
                });
              }
            }
          }
          if (upcoming.length === 0) {
            const overallStartingIndex = availableSets.findIndex(
              (availableSet) => availableSet.dirName === dirName,
            );
            if (overallStartingIndex >= 0) {
              for (
                let i = overallStartingIndex + 1;
                i < availableSets.length;
                i += 1
              ) {
                if (availableSets[i].playedMs === 0) {
                  const nextRoundName =
                    availableSets[i].context?.startgg?.set.fullRoundText;
                  if (nextRoundName) {
                    upcomingRoundName = nextRoundName;
                  }
                  break;
                }
              }
            }
          }
        };
        if (queuedSet) {
          if (
            queuedSet.context?.startgg?.set.round === context.startgg.set.round
          ) {
            setUpcomingSetsOrRound(
              queuedSet.context.startgg.set.round,
              queuedSet.dirName,
              false,
            );
          } else if (queuedSet.context?.startgg?.set.fullRoundText) {
            upcomingRoundName = queuedSet.context.startgg.set.fullRoundText;
          }
        } else {
          setUpcomingSetsOrRound(
            context.startgg.set.round,
            playingSet.dirName,
            true,
          );
        }
      }
    }
    const overlayContext: OverlayContext = {
      tournamentName,
      eventName,
      phaseName,
      roundName,
      bestOf,
      leftPrefixes,
      leftNames,
      leftPronouns,
      leftScore,
      rightPrefixes,
      rightNames,
      rightPronouns,
      rightScore,
      upcoming,
      upcomingRoundName,
    };
    return writeFile(overlayPath, JSON.stringify(overlayContext));
  };
  let dolphin: Dolphin | null = null;
  let newDolphin: () => void;
  const playDolphin = (set: AvailableSet) => {
    if (!dolphin) {
      newDolphin();
    }

    playingSet = set;
    gameIndex = 0;
    set.playedMs = Date.now();
    set.playing = true;
    dirNameToPlayedMs.set(set.dirName, set.playedMs);

    const playPromise = dolphin!.play(set.replayPaths);
    sortAvailableSets();
    playPromise
      .then(() => {
        return mainWindow.webContents.send(
          'playing',
          availableSets.map(toRenderSet),
        );
      })
      .catch(() => {});
  };
  newDolphin = () => {
    dolphin = new Dolphin(dolphinPath, isoPath, tempDir);
    dolphin.on(DolphinEvent.CLOSE, () => {
      if (playingSet) {
        playingSet.playing = false;
        playingSet = null;
      }
      gameIndex = 0;
      queuedSet = null;
      mainWindow.webContents.send('playing', availableSets.map(toRenderSet));
      if (dolphin) {
        dolphin.removeAllListeners();
        dolphin = null;
      }
    });
    dolphin.on(DolphinEvent.PLAYING, (newGameIndex: number) => {
      gameIndex = newGameIndex;
      writeOverlayJson();
    });
    dolphin.on(DolphinEvent.ENDED, () => {
      if (playingSet) {
        playingSet.playing = false;
      }

      if (queuedSet) {
        playDolphin(queuedSet);
        queuedSet = null;
        return;
      }

      if (playingSet === null) {
        gameIndex = 0;
        mainWindow.webContents.send('playing', availableSets.map(toRenderSet));
        return;
      }

      const index = availableSets.findIndex(
        (value) => value.dirName === playingSet!.dirName,
      );
      if (index === -1) {
        playingSet = null;
        gameIndex = 0;
        mainWindow.webContents.send('playing', availableSets.map(toRenderSet));
        return;
      }
      for (let i = index + 1; i < availableSets.length; i += 1) {
        if (!dirNameToPlayedMs.get(availableSets[i].dirName)) {
          playDolphin(availableSets[i]);
          return;
        }
      }
      playingSet = null;
      gameIndex = 0;
      mainWindow.webContents.send('playing', availableSets.map(toRenderSet));
    });
    dolphin.on(DolphinEvent.START_FAILED, () => {
      if (dolphin) {
        dolphin.close();
      }
    });
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
          const newSet = await unzip(newZipPath, tempDir, dirNameToPlayedMs);
          if (newSet.dirName === playingSet?.dirName) {
            newSet.playing = true;
          }
          if (newSet.context && newSet.context.startgg) {
            const phaseRoundKey = `${newSet.context.startgg.phase.id}${newSet.context.startgg.set.round}`;
            if (earliestForPhaseRound.has(phaseRoundKey)) {
              if (
                newSet.dirName.localeCompare(
                  earliestForPhaseRound.get(phaseRoundKey)!,
                ) < 0
              ) {
                earliestForPhaseRound.set(phaseRoundKey, newSet.dirName);
              }
            } else {
              earliestForPhaseRound.set(phaseRoundKey, newSet.dirName);
            }
          }
          availableSets.push(newSet);
          if (!playingSet && newSet.playedMs === 0) {
            playDolphin(newSet);
          } else {
            sortAvailableSets();
            writeOverlayJson();
            mainWindow.webContents.send(
              'unzip',
              availableSets.map(toRenderSet),
            );
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
      set.playedMs = played ? Date.now() : 0;
      dirNameToPlayedMs.set(set.dirName, set.playedMs);
      sortAvailableSets();
      writeOverlayJson();
      return availableSets.map(toRenderSet);
    },
  );

  ipcMain.removeHandler('play');
  ipcMain.handle('play', (event: IpcMainInvokeEvent, dirName: string) => {
    const setToPlay = availableSets.find((set) => set.dirName === dirName);
    if (!setToPlay) {
      throw new Error(`no such set to play: ${dirName}`);
    }

    if (playingSet) {
      playingSet.playing = false;
    }
    queuedSet = null;
    playDolphin(setToPlay);
  });

  ipcMain.removeHandler('queue');
  ipcMain.handle('queue', (event: IpcMainInvokeEvent, dirName: string) => {
    const setToQueue = availableSets.find((set) => set.dirName === dirName);
    if (!setToQueue) {
      throw new Error(`no such set to queue: ${dirName}`);
    }
    queuedSet = setToQueue;
    writeOverlayJson();
  });

  ipcMain.removeHandler('getGenerateOverlay');
  ipcMain.handle('getGenerateOverlay', () => {
    return generateOverlay;
  });

  ipcMain.removeHandler('setGenerateOverlay');
  ipcMain.handle(
    'setGenerateOverlay',
    (event: IpcMainInvokeEvent, newGenerateOverlay: boolean) => {
      store.set('generateOverlay', newGenerateOverlay);
      generateOverlay = newGenerateOverlay;
      if (generateOverlay) {
        writeOverlayJson();
      }
    },
  );

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
        createBotCommand('bracket', (params, { say }) => {
          if (!playingSet) {
            return;
          }
          if (!playingSet.context?.startgg) {
            say('unknown');
            return;
          }

          const eventSlug = playingSet.context.startgg.event.slug;
          const phaseId = playingSet.context.startgg.phase.id;
          const phaseGroupId = playingSet.context.startgg.phaseGroup.id;
          say(
            `SPOILERS: https://www.start.gg/${eventSlug}/brackets/${phaseId}/${phaseGroupId}`,
          );
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

  ipcMain.removeHandler('openOverlayDir');
  ipcMain.handle('openOverlayDir', () => {
    shell.openPath(path.join(resourcesPath, 'overlay'));
  });

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
