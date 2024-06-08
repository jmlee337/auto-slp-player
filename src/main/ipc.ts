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
import { Ports } from '@slippi/slippi-js';
import unzip from './unzip';
import {
  AvailableSet,
  OverlayContext,
  OverlaySet,
  TwitchSettings,
} from '../common/types';
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
  let maxDolphins = store.has('maxDolphins')
    ? (store.get('maxDolphins') as number)
    : 1;
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

  ipcMain.removeHandler('getMaxDolphins');
  ipcMain.handle('getMaxDolphins', () => maxDolphins);

  ipcMain.removeHandler('setMaxDolphins');
  ipcMain.handle('setMaxDolphins', (event, newMaxDolphins: number) => {
    store.set('maxDolphins', newMaxDolphins);
    maxDolphins = newMaxDolphins;
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
        return b.context.durationMs - a.context.durationMs;
      }
      if (!a.context && b.context) {
        return -1;
      }
      if (a.context && !b.context) {
        return 1;
      }
      return a.dirName.localeCompare(b.dirName);
    });
  };

  const playingSets: Map<number, AvailableSet> = new Map();
  const gameIndices: Map<number, number> = new Map();
  let queuedSet: AvailableSet | null = null;
  const writeOverlayJson = async () => {
    if (!generateOverlay) {
      return null;
    }

    const overlayPath = path.join(resourcesPath, 'overlay', 'overlay.json');

    let tournamentName = '';
    let eventName = '';
    let phaseName = '';
    let roundName = '';
    const sets: OverlaySet[] = [];
    const upcoming: { leftNames: string[]; rightNames: string[] }[] = [];
    let upcomingRoundName = '';
    const entriesWithContexts = Array.from(playingSets.entries()).filter(
      ([, playingSet]) => playingSet.context,
    ) as [number, AvailableSet][];
    if (entriesWithContexts.length > 0) {
      const representativePlayingSet = entriesWithContexts[0][1];
      const representativeStartgg = representativePlayingSet.context?.startgg;
      if (representativeStartgg) {
        tournamentName = representativeStartgg.tournament.name;
        eventName = representativeStartgg.event.name;
        phaseName = representativeStartgg.phase.name;
        roundName = representativeStartgg.set.fullRoundText;

        if (queuedSet) {
          const round = queuedSet.context?.startgg?.set.round;
          if (round === representativeStartgg.set.round) {
            const sameRoundSets = availableSets.filter(
              (availableSet) =>
                availableSet.context?.startgg?.set.round === round,
            );
            const startI = sameRoundSets.findIndex(
              (set) => set.dirName === queuedSet!.dirName,
            );
            upcoming.push({
              leftNames:
                sameRoundSets[startI].context!.scores[0].slots[0].displayNames,
              rightNames:
                sameRoundSets[startI].context!.scores[0].slots[1].displayNames,
            });
            for (let i = startI + 1; i < sameRoundSets.length; i += 1) {
              if (sameRoundSets[i].playedMs === 0) {
                upcoming.push({
                  leftNames:
                    sameRoundSets[i].context!.scores[0].slots[0].displayNames,
                  rightNames:
                    sameRoundSets[i].context!.scores[0].slots[1].displayNames,
                });
              }
            }
          } else if (queuedSet.context?.startgg?.set.fullRoundText) {
            upcomingRoundName = queuedSet.context.startgg.set.fullRoundText;
          }
        }
      }

      entriesWithContexts.forEach(([port, playingSet]) => {
        const { context } = playingSet;
        const gameIndex = gameIndices.get(port);
        if (context && gameIndex !== undefined) {
          const { slots } = context!.scores[gameIndex];
          sets.push({
            bestOf: context!.bestOf,
            leftPrefixes: slots[0].prefixes,
            leftNames: slots[0].displayNames,
            leftPronouns: slots[0].pronouns,
            leftScore: slots[0].score,
            rightPrefixes: slots[1].prefixes,
            rightNames: slots[1].displayNames,
            rightPronouns: slots[1].pronouns,
            rightScore: slots[1].score,
          });
        }
      });
    }
    const overlayContext: OverlayContext = {
      tournamentName,
      eventName,
      phaseName,
      roundName,
      sets,
      upcoming,
      upcomingRoundName,
    };
    return writeFile(overlayPath, JSON.stringify(overlayContext));
  };
  const dolphins: Map<number, Dolphin> = new Map();
  const failedPorts = new Set<number>();
  const tryingPorts = new Set<number>();
  const getNextPort = () => {
    let tryPort = Ports.DEFAULT;
    const usedPorts = new Set(dolphins.keys());
    while (
      failedPorts.has(tryPort) ||
      tryingPorts.has(tryPort) ||
      usedPorts.has(tryPort)
    ) {
      tryPort += 1;
    }
    tryingPorts.add(tryPort);
    return tryPort;
  };
  let startDolphin: (port: number) => Promise<void>;
  const playDolphin = async (set: AvailableSet, port?: number) => {
    let actualPort = 0;
    if (!port) {
      let startedDolphin = false;
      if (dolphins.size > playingSets.size) {
        const usableDolphins = new Set(dolphins.keys());
        Array.from(playingSets.keys()).forEach((usedPort) => {
          usableDolphins.delete(usedPort);
        });
        [actualPort] = Array.from(usableDolphins.values()).sort(
          (a, b) => a - b,
        );
        startedDolphin = true;
      }
      while (!startedDolphin) {
        try {
          actualPort = getNextPort();
          startedDolphin = true;
          // eslint-disable-next-line no-await-in-loop
          await startDolphin(actualPort);
        } catch (e: any) {
          startedDolphin = false;
        }
      }
    } else {
      actualPort = port;
    }
    if (actualPort === 0) {
      throw new Error('actualPort 0 somehow???');
    }

    gameIndices.set(actualPort, 0);
    playingSets.set(actualPort, set);
    set.playedMs = Date.now();
    set.playing = true;
    dirNameToPlayedMs.set(set.dirName, set.playedMs);

    const queueNextSet = (startI: number) => {
      if (startI < 0) {
        queuedSet = null;
        return;
      }

      for (let i = startI + 1; i < availableSets.length; i += 1) {
        if (availableSets[i].playedMs === 0) {
          queuedSet = availableSets[i];
          return;
        }
      }
      queuedSet = null;
    };
    queueNextSet(
      availableSets.findIndex((value) => value.dirName === set.dirName),
    );
    sortAvailableSets();

    await dolphins.get(actualPort)!.play(set.replayPaths);
    mainWindow.webContents.send(
      'playing',
      availableSets.map(toRenderSet),
      queuedSet ? queuedSet.dirName : '',
    );
  };
  startDolphin = async (port: number) => {
    if (dolphins.get(port)) {
      return Promise.resolve();
    }

    const newDolphin = new Dolphin(dolphinPath, isoPath, tempDir, port);
    newDolphin.on(DolphinEvent.CLOSE, () => {
      const playingSet = playingSets.get(port);
      if (playingSet) {
        playingSet.playing = false;
      }

      newDolphin.removeAllListeners();
      gameIndices.delete(port);
      playingSets.delete(port);
      dolphins.delete(port);
      if (dolphins.size === 0) {
        queuedSet = null;
      }
      mainWindow.webContents.send(
        'playing',
        availableSets.map(toRenderSet),
        queuedSet ? queuedSet.dirName : '',
      );
    });
    newDolphin.on(DolphinEvent.PLAYING, (newGameIndex: number) => {
      gameIndices.set(port, newGameIndex);
      writeOverlayJson();
    });
    newDolphin.on(DolphinEvent.ENDED, async () => {
      const playingSet = playingSets.get(port);
      if (playingSet) {
        playingSet.playing = false;
        if (queuedSet) {
          const currentRound = playingSet.context?.startgg?.set.round;
          const nextRound = queuedSet.context?.startgg?.set.round;
          if (playingSets.size === 1) {
            playingSets.delete(port);
            do {
              // eslint-disable-next-line no-await-in-loop
              await playDolphin(queuedSet);
            } while (
              playingSets.size + tryingPorts.size < maxDolphins &&
              nextRound === queuedSet.context?.startgg?.set.round
            );
            return;
          }
          if (currentRound === nextRound) {
            playDolphin(queuedSet, port);
            return;
          }
        }
      }
      playingSets.delete(port);
      mainWindow.webContents.send(
        'playing',
        availableSets.map(toRenderSet),
        queuedSet ? queuedSet.dirName : '',
      );
    });
    return new Promise<void>((resolve, reject) => {
      newDolphin.on(DolphinEvent.START_FAILED, (connectFailed: boolean) => {
        if (connectFailed) {
          failedPorts.add(port);
        }
        newDolphin.close();
        tryingPorts.delete(port);
        reject();
      });
      newDolphin.on(DolphinEvent.START_READY, () => {
        dolphins.set(port, newDolphin);
        tryingPorts.delete(port);
        resolve();
      });
      newDolphin.open();
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
          if (
            Array.from(playingSets.values()).find(
              (playingSet) => newSet.dirName === playingSet.dirName,
            )
          ) {
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
          sortAvailableSets();
          let canPlay = availableSets.length === 1;
          let isNext = availableSets.length === 1;
          const checkCanPlayIsNext = () => {
            for (let i = availableSets.length - 2; i >= 0; i -= 1) {
              if (availableSets[i].playing) {
                const round = availableSets[i].context?.startgg?.set.round;
                if (
                  round === undefined ||
                  round === newSet.context?.startgg?.set.round
                ) {
                  canPlay = true;
                }
                for (let j = i + 1; j < availableSets.length; j += 1) {
                  if (availableSets[j].playedMs === 0) {
                    if (availableSets[j].dirName === newSet.dirName) {
                      isNext = true;
                    }
                    break;
                  }
                }
                return;
              }
            }
            canPlay = true;
            isNext = true;
          };
          checkCanPlayIsNext();
          if (
            playingSets.size + tryingPorts.size < maxDolphins &&
            newSet.playedMs === 0 &&
            canPlay &&
            isNext
          ) {
            await playDolphin(newSet);
          } else {
            if (isNext) {
              queuedSet = newSet;
            }
            writeOverlayJson();
            mainWindow.webContents.send(
              'unzip',
              availableSets.map(toRenderSet),
              queuedSet ? queuedSet.dirName : '',
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
  ipcMain.handle('play', async (event: IpcMainInvokeEvent, dirName: string) => {
    const setToPlay = availableSets.find((set) => set.dirName === dirName);
    if (!setToPlay) {
      throw new Error(`no such set to play: ${dirName}`);
    }

    if (playingSets.size === 0) {
      await playDolphin(setToPlay);
    }
    if (playingSets.size === 1) {
      const [port, playingSet] = Array.from(playingSets.entries())[0];
      playingSet.playing = false;
      playDolphin(setToPlay, port);
    }
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
          const playingSetsWithContextStartgg = Array.from(
            playingSets.values(),
          ).filter(
            (playingSet) => playingSet.context && playingSet.context.startgg,
          );
          if (playingSetsWithContextStartgg.length === 0) {
            return;
          }
          const representativeStartgg =
            playingSetsWithContextStartgg[0].context!.startgg!;

          const eventSlug = representativeStartgg.event.slug;
          const phaseId = representativeStartgg.phase.id;
          const phaseGroupId = representativeStartgg.phaseGroup.id;
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
