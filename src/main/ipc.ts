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
  const earliestForRound = new Map<number, string>();
  const sortAvailableSets = () => {
    availableSets.sort((a, b) => {
      if (a.context && b.context) {
        const aSet = a.context.set;
        const bSet = b.context.set;
        const roundCompare = earliestForRound
          .get(aSet.round)!
          .localeCompare(earliestForRound.get(bSet.round)!);
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
          aSet.scores.length !== bSet.scores.length ||
          aSet.bestOf !== bSet.bestOf
        ) {
          const ratioCompare =
            bSet.scores.length / bSet.bestOf - aSet.scores.length / aSet.bestOf;
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
      tournamentName = context.tournament.name;
      eventName = context.event.name;
      phaseName = context.phase.name;

      const { set } = context;
      roundName = context.set.fullRoundText;
      bestOf = context.set.bestOf;

      const { slots } = set.scores[gameIndex];
      leftPrefixes = slots[0].prefixes;
      leftNames = slots[0].displayNames;
      leftPronouns = slots[0].pronouns;
      leftScore = slots[0].score;
      rightPrefixes = slots[1].prefixes;
      rightNames = slots[1].displayNames;
      rightPronouns = slots[1].pronouns;
      rightScore = slots[1].score;

      const setUpcomingSetsOrRound = (
        round: number,
        dirName: string,
        playing: boolean,
      ) => {
        const sameRoundSets = availableSets.filter(
          (availableSet) => availableSet.context?.set.round === round,
        );
        const startingIndex = sameRoundSets.findIndex(
          (availableSet) => availableSet.dirName === dirName,
        );
        if (startingIndex >= 0) {
          if (!playing) {
            upcoming.push({
              leftNames:
                sameRoundSets[0].context!.set.scores[0].slots[0].displayNames,
              rightNames:
                sameRoundSets[0].context!.set.scores[0].slots[1].displayNames,
            });
          }
          for (let i = startingIndex + 1; i < sameRoundSets.length; i += 1) {
            if (sameRoundSets[i].playedMs === 0) {
              upcoming.push({
                leftNames:
                  sameRoundSets[i].context!.set.scores[0].slots[0].displayNames,
                rightNames:
                  sameRoundSets[i].context!.set.scores[0].slots[1].displayNames,
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
                  availableSets[i].context?.set.fullRoundText;
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
        if (queuedSet.context?.set.round === playingSet.context.set.round) {
          setUpcomingSetsOrRound(
            queuedSet.context.set.round,
            queuedSet.dirName,
            false,
          );
        } else if (queuedSet.context?.set.fullRoundText) {
          upcomingRoundName = queuedSet.context.set.fullRoundText;
        }
      } else {
        setUpcomingSetsOrRound(
          playingSet.context.set.round,
          playingSet.dirName,
          true,
        );
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
  const playDolphin = (set: AvailableSet) => {
    if (!dolphin) {
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
        if (queuedSet) {
          playDolphin(queuedSet);
          queuedSet = null;
          return;
        }

        if (playingSet === null) {
          gameIndex = 0;
          mainWindow.webContents.send(
            'playing',
            availableSets.map(toRenderSet),
          );
          return;
        }

        playingSet.playing = false;
        const index = availableSets.findIndex(
          (value) => value.dirName === playingSet!.dirName,
        );
        if (index === -1) {
          playingSet = null;
          gameIndex = 0;
          mainWindow.webContents.send(
            'playing',
            availableSets.map(toRenderSet),
          );
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
    }

    playingSet = set;
    gameIndex = 0;
    set.playedMs = Date.now();
    set.playing = true;
    dirNameToPlayedMs.set(set.dirName, set.playedMs);

    const playPromise = dolphin.play(set.replayPaths);
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
          if (newSet.context) {
            const { round } = newSet.context.set;
            if (earliestForRound.has(round)) {
              if (
                newSet.dirName.localeCompare(earliestForRound.get(round)!) < 0
              ) {
                earliestForRound.set(round, newSet.dirName);
              }
            } else {
              earliestForRound.set(round, newSet.dirName);
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
        createBotCommand('help', (params, { say }) => {
          say('!help, !bracket, !score, !set');
        }),
        createBotCommand('bracket', (params, { say }) => {
          if (!playingSet) {
            return;
          }
          if (!playingSet.context) {
            say('unknown');
            return;
          }

          const eventSlug = playingSet.context.event.slug;
          const phaseId = playingSet.context.phase.id;
          const phaseGroupId = playingSet.context.phaseGroup.id;
          say(
            `SPOILERS: https://www.start.gg/${eventSlug}/brackets/${phaseId}/${phaseGroupId}`,
          );
        }),
        createBotCommand('score', (params, { say }) => {
          if (!playingSet) {
            return;
          }
          if (!playingSet.context) {
            say('unknown');
            return;
          }

          const { bestOf, scores } = playingSet.context.set;
          const scoreLeft = scores[gameIndex].slots[0].score;
          const scoreRight = scores[gameIndex].slots[1].score;
          say(`${scoreLeft} - ${scoreRight} (BO${bestOf})`);
        }),
        createBotCommand('set', (params, { say }) => {
          if (!playingSet) {
            return;
          }
          if (!playingSet.context) {
            say('unknown');
            return;
          }

          const tournamentName = playingSet.context.tournament.name;
          const eventName = playingSet.context.event.name;
          const phaseName = playingSet.context.phase.name;
          const phaseGroupName = playingSet.context.phaseGroup.name;
          const bracketContext = `${tournamentName} ${eventName}, ${phaseName} (pool ${phaseGroupName})`;

          const roundName = playingSet.context.set.fullRoundText;
          const { bestOf, round, scores } = playingSet.context.set;
          const fullRoundInfo = `${roundName} (BO${bestOf})`;
          const separator = round > 0 ? '🟩' : '🟥';

          const { slots } = scores[gameIndex];
          const leftPrefixes = slots[0].prefixes;
          const leftNames = slots[0].displayNames;
          const leftPronouns = slots[0].pronouns;
          const leftFullNames: string[] = [];
          for (let i = 0; i < leftPrefixes.length; i += 1) {
            let fullName = '';
            if (leftPrefixes[i]) {
              fullName += `${leftPrefixes[i]} | `;
            }
            fullName += leftNames[i];
            if (leftPronouns[i]) {
              fullName += ` (${leftPronouns[i]})`;
            }
            leftFullNames.push(fullName);
          }
          const rightPrefixes = slots[1].prefixes;
          const rightNames = slots[1].displayNames;
          const rightPronouns = slots[1].pronouns;
          const rightFullNames: string[] = [];
          for (let i = 0; i < rightPrefixes.length; i += 1) {
            let fullName = '';
            if (rightPrefixes[i]) {
              fullName += `${rightPrefixes[i]} | `;
            }
            fullName += rightNames[i];
            if (rightPronouns[i]) {
              fullName += ` (${rightPronouns[i]})`;
            }
            rightFullNames.push(fullName);
          }
          const versus = `${leftFullNames.join(', ')} vs ${rightFullNames.join(
            ', ',
          )}`;

          say(
            `${bracketContext} ${separator} ${fullRoundInfo} ${separator} ${versus}`,
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
