import { FSWatcher, watch } from 'chokidar';
import {
  BrowserWindow,
  IpcMainInvokeEvent,
  app,
  clipboard,
  dialog,
  ipcMain,
  shell,
} from 'electron';
import Store from 'electron-store';
import { access, mkdir, readdir, rm, unlink, writeFile } from 'fs/promises';
import path from 'path';
import { RefreshingAuthProvider } from '@twurple/auth';
import { Bot, createBotCommand } from '@twurple/easy-bot';
import { Ports } from '@slippi/slippi-js';
import { spawn } from 'child_process';
import { HttpStatusCodeError } from '@twurple/api-call';
import unzip from './unzip';
import {
  AvailableSet,
  OBSSettings,
  OverlayContext,
  OverlaySet,
  TwitchSettings,
} from '../common/types';
import { Dolphin, DolphinEvent } from './dolphin';
import { toRenderSet } from './set';
import OBSConnection from './obs';

// taken from https://semver.org/#is-there-a-suggested-regular-expression-regex-to-check-a-semver-string
// via https://github.com/project-slippi/slippi-launcher/blob/ae8bb69e235b6e46b24bc966aeaa80f45030c6f9/src/dolphin/install/ishiiruka_installation.ts#L23-L24
// ty nikki
const SEMVER_REGEX =
  /(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-((?:0|[1-9][0-9]*|[0-9]*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9][0-9]*|[0-9]*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?/;

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
  let twitchChannel = store.has('twitchChannel')
    ? (store.get('twitchChannel') as string)
    : '';
  let twitchSettings: TwitchSettings = store.has('twitchSettings')
    ? (store.get('twitchSettings') as TwitchSettings)
    : {
        enabled: false,
        accessToken: '',
        refreshToken: '',
        clientId: '',
        clientSecret: '',
      };
  let obsConnectionEnabled = store.has('obsConnectionEnabled')
    ? (store.get('obsConnectionEnabled') as boolean)
    : false;
  let obsSettings: OBSSettings = store.has('obsSettings')
    ? (store.get('obsSettings') as OBSSettings)
    : { protocol: 'ws', address: '127.0.0.1', port: '4455', password: '' };

  const dolphinVersionPromiseFn = (
    resolve: (value: string) => void,
    reject: (reason?: any) => void,
  ) => {
    const process = spawn(dolphinPath, ['--version']);
    process.stdout.on('data', (data: Buffer) => {
      const match = data.toString().match(SEMVER_REGEX);
      if (match) {
        resolve(match[0]);
      }
    });
    process.on('close', () => {
      reject();
    });
  };
  let dolphinVersionPromise = dolphinPath
    ? new Promise(dolphinVersionPromiseFn)
    : null;

  const obsConnection = new OBSConnection(mainWindow);
  obsConnection.setMaxDolphins(maxDolphins);
  if (dolphinVersionPromise) {
    obsConnection.setDolphinVersionPromise(dolphinVersionPromise);
  }

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
    dolphinVersionPromise = new Promise(dolphinVersionPromiseFn);
    obsConnection.setDolphinVersionPromise(dolphinVersionPromise);
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
    obsConnection.setMaxDolphins(maxDolphins);
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
  const earliestForPhaseRound = new Map<string, number>();
  const sortAvailableSets = () => {
    availableSets.sort((a, b) => {
      if (a.invalidReason && !b.invalidReason) {
        return -1;
      }
      if (!a.invalidReason && b.invalidReason) {
        return 1;
      }
      if (a.invalidReason && b.invalidReason) {
        return a.dirName.localeCompare(b.dirName);
      }
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
        const aRound = aStartgg.set.round;
        const bRound = bStartgg.set.round;
        if (Math.sign(aRound) === Math.sign(bRound) && aRound !== bRound) {
          return Math.abs(aRound) - Math.abs(bRound);
        }
        const roundCompare =
          earliestForPhaseRound.get(
            `${aStartgg.phase.id}${aStartgg.set.fullRoundText}`,
          )! -
          earliestForPhaseRound.get(
            `${bStartgg.phase.id}${bStartgg.set.fullRoundText}`,
          )!;
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

  const dolphins: Map<number, Dolphin> = new Map();
  const playingSets: Map<number, AvailableSet> = new Map();
  const gameIndices: Map<number, number> = new Map();
  let queuedSet: AvailableSet | null = null;
  let lastTournamentName = '';
  let lastEventName = '';
  let lastPhaseName = '';
  const writeOverlayJson = async () => {
    if (!generateOverlay) {
      return undefined;
    }

    const overlayPath = path.join(resourcesPath, 'overlay', 'overlay.json');

    let tournamentName = lastTournamentName;
    let eventName = lastEventName;
    let phaseName = lastPhaseName;
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
        lastTournamentName = representativeStartgg.tournament.name;
        eventName = representativeStartgg.event.name;
        lastEventName = representativeStartgg.event.name;
        phaseName = representativeStartgg.phase.name;
        lastPhaseName = representativeStartgg.phase.name;

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
            let prefix = '';
            if (
              queuedSet.context.startgg.phase.id !==
              representativeStartgg.phase.id
            ) {
              prefix = `${queuedSet.context.startgg.phase.name}, `;
            }
            if (
              queuedSet.context.startgg.event.slug !==
              representativeStartgg.event.slug
            ) {
              prefix = `${queuedSet.context.startgg.event.name}, ${prefix}`;
            }
            const roundName = queuedSet.context.startgg.set.fullRoundText;
            upcomingRoundName = `${prefix}${roundName}`;
          }
        }
      }

      const eventSlugs = new Set<string>();
      const phaseIds = new Set<number>();
      const phaseGroupIds = new Set<number>();
      entriesWithContexts.forEach(([, playingSet]) => {
        const startgg = playingSet.context?.startgg;
        if (startgg) {
          eventSlugs.add(startgg.event.slug);
          phaseIds.add(startgg.phase.id);
          phaseGroupIds.add(startgg.phaseGroup.id);
        }
      });
      entriesWithContexts.forEach(([port, playingSet]) => {
        const { context } = playingSet;
        const gameIndex = gameIndices.get(port);
        const setIndex = Array.from(dolphins.keys())
          .sort((a, b) => a - b)
          .indexOf(port);
        if (context && gameIndex !== undefined && setIndex >= 0) {
          let roundName = '';
          if (context.startgg) {
            roundName = context.startgg.set.fullRoundText;
            if (phaseGroupIds.size > 1) {
              roundName = `Pool ${context.startgg.phaseGroup.name}, ${roundName}`;
            }
            if (phaseIds.size > 1) {
              roundName = `${context.startgg.phase.name}, ${roundName}`;
            }
            if (eventSlugs.size > 1) {
              roundName = `${context.startgg.event.name}, ${roundName}`;
            }
          }
          const { slots } = context.scores[gameIndex];
          sets[setIndex] = {
            roundName,
            bestOf: context.bestOf,
            leftPrefixes: slots[0].prefixes,
            leftNames: slots[0].displayNames,
            leftPronouns: slots[0].pronouns,
            leftScore: slots[0].score,
            rightPrefixes: slots[1].prefixes,
            rightNames: slots[1].displayNames,
            rightPronouns: slots[1].pronouns,
            rightScore: slots[1].score,
          };
        }
      });
    }
    const overlayContext: OverlayContext = {
      tournamentName,
      eventName,
      phaseName,
      sets,
      upcoming,
      upcomingRoundName,
    };
    return writeFile(overlayPath, JSON.stringify(overlayContext));
  };
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
  const startDolphinWithoutPort = async () => {
    let actualPort = 0;
    let startedDolphin = false;
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
    if (actualPort === 0) {
      throw new Error('actualPort 0 somehow???');
    }
    return actualPort;
  };
  const playDolphin = async (set: AvailableSet, port?: number) => {
    let actualPort = 0;
    if (!port) {
      if (dolphins.size > playingSets.size) {
        const usableDolphins = new Set(dolphins.keys());
        Array.from(playingSets.keys()).forEach((usedPort) => {
          usableDolphins.delete(usedPort);
        });
        [actualPort] = Array.from(usableDolphins.values()).sort(
          (a, b) => a - b,
        );
      } else {
        actualPort = await startDolphinWithoutPort();
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
        if (
          availableSets[i].playedMs === 0 &&
          !availableSets[i].invalidReason
        ) {
          queuedSet = availableSets[i];
          return;
        }
      }
      queuedSet = null;
    };
    sortAvailableSets();
    queueNextSet(
      availableSets.findIndex((value) => value.dirName === set.dirName),
    );

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
      obsConnection.setDolphins(dolphins);
      obsConnection.transition(playingSets);
      mainWindow.webContents.send('dolphins', dolphins.size);
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
    newDolphin.on(DolphinEvent.ENDED, async (failureReason: string) => {
      const playingSet = playingSets.get(port);
      if (playingSet) {
        playingSet.playing = false;
        if (failureReason) {
          playingSet.invalidReason = failureReason;
        }
        if (queuedSet) {
          const currentPhaseId = playingSet.context?.startgg?.phase.id;
          const currentPhaseGroupId =
            playingSet.context?.startgg?.phaseGroup.id;
          const currentRound = playingSet.context?.startgg?.set.round;
          const nextPhaseId = queuedSet.context?.startgg?.phase.id;
          const nextPhaseGroupId = queuedSet.context?.startgg?.phaseGroup.id;
          const nextRound = queuedSet.context?.startgg?.set.round;
          if (playingSets.size === 1) {
            playingSets.delete(port);
            do {
              // eslint-disable-next-line no-await-in-loop
              await playDolphin(queuedSet);
            } while (
              queuedSet &&
              playingSets.size + tryingPorts.size < maxDolphins &&
              nextPhaseId === queuedSet.context?.startgg?.phase.id &&
              (nextPhaseGroupId !== queuedSet.context?.startgg?.phaseGroup.id ||
                (nextPhaseGroupId ===
                  queuedSet.context?.startgg?.phaseGroup.id &&
                  nextRound === queuedSet.context?.startgg?.set.round))
            );
            obsConnection.transition(playingSets);
            return;
          }
          if (
            currentPhaseId === nextPhaseId &&
            (currentPhaseGroupId !== nextPhaseGroupId ||
              (currentPhaseGroupId === nextPhaseGroupId &&
                currentRound === nextRound))
          ) {
            playDolphin(queuedSet, port);
            return;
          }
        }
      }
      playingSets.delete(port);
      writeOverlayJson();
      setTimeout(() => {
        obsConnection.transition(playingSets);
      }, 1000);
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
        obsConnection.setDolphins(dolphins);
        tryingPorts.delete(port);
        mainWindow.webContents.send('dolphins', dolphins.size);
        resolve();
      });
      newDolphin.open();
    });
  };
  ipcMain.removeHandler('getNumDolphins');
  ipcMain.handle('getNumDolphins', () => dolphins.size);
  ipcMain.removeHandler('openDolphins');
  ipcMain.handle('openDolphins', async () => {
    const prevPlayingSize = playingSets.size;
    const toOpen = maxDolphins - dolphins.size - tryingPorts.size;
    for (let i = 0; i < toOpen; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const port = await startDolphinWithoutPort();
      if (
        playingSets.size > 0 &&
        queuedSet &&
        queuedSet.context?.startgg?.set.round ===
          Array.from(playingSets.values())[0].context?.startgg?.set.round
      ) {
        // eslint-disable-next-line no-await-in-loop
        await playDolphin(queuedSet, port);
      }
    }
    if (playingSets.size !== prevPlayingSize) {
      obsConnection.transition(playingSets);
    }
  });
  ipcMain.removeHandler('getObsConnectionStatus');
  ipcMain.handle('getObsConnectionStatus', () =>
    obsConnection.getConnectionStatus(),
  );
  ipcMain.removeHandler('connectObs');
  ipcMain.handle('connectObs', async () => {
    await obsConnection.connect(obsSettings);
  });
  ipcMain.removeHandler('watch');
  ipcMain.handle('watch', async (event: IpcMainInvokeEvent, start: boolean) => {
    if (start) {
      availableSets.length = 0;
      const normalizedDir =
        process.platform === 'win32'
          ? watchDir.split(path.win32.sep).join(path.posix.sep)
          : watchDir;
      const glob = `${normalizedDir}/*.zip`;
      watcher = watch(glob, { awaitWriteFinish: true });
      watcher.on('add', async (newZipPath) => {
        try {
          const newSet = await unzip(
            newZipPath,
            tempDir,
            dirNameToPlayedMs,
            twitchChannel,
          );
          const playingEntry = Array.from(playingSets.entries()).find(
            ([, set]) => set.dirName === newSet.dirName,
          );
          if (playingEntry) {
            newSet.playing = true;
            playingSets.set(playingEntry[0], newSet);
          }
          if (newSet.context && newSet.context.startgg) {
            const phaseRoundKey = `${newSet.context.startgg.phase.id}${newSet.context.startgg.set.fullRoundText}`;
            const { startMs } = newSet.context;
            if (earliestForPhaseRound.has(phaseRoundKey)) {
              if (startMs < earliestForPhaseRound.get(phaseRoundKey)!) {
                earliestForPhaseRound.set(phaseRoundKey, startMs);
              }
            } else {
              earliestForPhaseRound.set(phaseRoundKey, startMs);
            }
          }
          availableSets.push(newSet);
          sortAvailableSets();
          if (newSet.playing) {
            mainWindow.webContents.send(
              'unzip',
              availableSets.map(toRenderSet),
              queuedSet ? queuedSet.dirName : '',
            );
            return;
          }

          const playingSetsArr = Array.from(playingSets.values());
          let canPlay = playingSetsArr.length === 0;
          let isNext = playingSetsArr.length === 0;
          playingSetsArr.forEach((set) => {
            if (!set.context?.startgg && !newSet.context?.startgg) {
              canPlay = true;
              return;
            }
            if (
              set.context?.startgg?.phase.id ===
              newSet.context?.startgg?.phase.id
            ) {
              if (
                set.context?.startgg?.phaseGroup.id ===
                newSet.context?.startgg?.phaseGroup.id
              ) {
                // If same group must be same round to not spoil.
                if (
                  set.context?.startgg?.set.round ===
                  newSet.context?.startgg?.set.round
                ) {
                  canPlay = true;
                }
              } else {
                // Same phase different group: can never spoil.
                canPlay = true;
              }
            }
          });
          const newSetI = availableSets.indexOf(newSet);
          if (newSetI < 0) {
            throw new Error('could not find newSet in availableSets');
          }
          for (let i = newSetI - 1; i >= 0; i -= 1) {
            if (availableSets[i].playing) {
              isNext = true;
            } else if (
              availableSets[i].playedMs !== 0 ||
              availableSets[i].invalidReason
            ) {
              // eslint-disable-next-line no-continue
              continue;
            }
            break;
          }
          if (
            playingSets.size + tryingPorts.size < maxDolphins &&
            canPlay &&
            isNext
          ) {
            await playDolphin(newSet);
            obsConnection.transition(playingSets);
          } else {
            if (
              isNext &&
              (!queuedSet ||
                (newSet.context &&
                  queuedSet.context &&
                  newSet.context.durationMs > queuedSet.context.durationMs))
            ) {
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
          // const message = e instanceof Error ? e.message : e;
          // console.error(message);
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
      for (let i = availableSets.length - 2; i >= 0; i -= 1) {
        if (availableSets[i].playing) {
          queuedSet = null;
          for (let j = i + 1; j < availableSets.length; j += 1) {
            if (
              availableSets[j].playedMs === 0 &&
              !availableSets[j].invalidReason
            ) {
              queuedSet = availableSets[j];
              break;
            }
          }
          break;
        }
      }
      writeOverlayJson();
      return {
        renderSets: availableSets.map(toRenderSet),
        queuedSetDirName: queuedSet ? queuedSet.dirName : '',
      };
    },
  );

  ipcMain.removeHandler('play');
  ipcMain.handle('play', async (event: IpcMainInvokeEvent, dirName: string) => {
    const setToPlay = availableSets.find((set) => set.dirName === dirName);
    if (!setToPlay) {
      throw new Error(`no such set to play: ${dirName}`);
    }
    if (setToPlay.invalidReason) {
      throw new Error(`cannot play set: ${setToPlay.invalidReason}`);
    }

    if (playingSets.size === 1 && maxDolphins === 1 && tryingPorts.size === 0) {
      const [port, playingSet] = Array.from(playingSets.entries())[0];
      playingSet.playing = false;
      playDolphin(setToPlay, port);
      return;
    }
    if (playingSets.size + tryingPorts.size < maxDolphins) {
      await playDolphin(setToPlay);
      obsConnection.transition(playingSets);
    }
  });

  ipcMain.removeHandler('queue');
  ipcMain.handle('queue', (event: IpcMainInvokeEvent, dirName: string) => {
    const setToQueue = availableSets.find((set) => set.dirName === dirName);
    if (!setToQueue) {
      throw new Error(`no such set to queue: ${dirName}`);
    }
    if (setToQueue.invalidReason) {
      throw new Error(`cannot queue set: ${setToQueue.invalidReason}`);
    }

    queuedSet = setToQueue;
    writeOverlayJson();
  });

  ipcMain.removeHandler('getGenerateOverlay');
  ipcMain.handle('getGenerateOverlay', () => generateOverlay);

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

  ipcMain.removeHandler('getTwitchChannel');
  ipcMain.handle('getTwitchChannel', () => twitchChannel);

  let twitchBot: Bot | null = null;
  let twitchBotStatus = { connected: false, error: '' };
  let lastEventSlug = '';
  let lastPhaseId = 0;
  let lastPhaseGroupId = 0;
  const maybeStartTwitchBot = async (newTwitchSettings: TwitchSettings) => {
    if (
      !twitchChannel ||
      !newTwitchSettings.enabled ||
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
    try {
      await authProvider.addUserForToken(
        {
          accessToken: newTwitchSettings.accessToken,
          refreshToken: newTwitchSettings.refreshToken,
          expiresIn: 0,
          obtainmentTimestamp: 0,
        },
        ['chat'],
      );

      if (twitchBot) {
        twitchBot.chat.quit();
      }
      twitchBotStatus = { connected: false, error: '' };
      mainWindow.webContents.send('twitchBotStatus', twitchBotStatus);
      twitchBot = new Bot({
        authProvider,
        channel: twitchChannel,
        commands: [
          createBotCommand('auto', (params, { say }) => {
            say(
              'This is an auto stream using Slippi replays. Powered by Replay Manager for Slippi and Auto SLP Player: https://github.com/jmlee337',
            );
          }),
          createBotCommand('bracket', (params, { say }) => {
            let eventSlug = lastEventSlug;
            let phaseId = lastPhaseId;
            let phaseGroupId = lastPhaseGroupId;
            const playingSetsWithContextStartgg = Array.from(
              playingSets.values(),
            ).filter(
              (playingSet) => playingSet.context && playingSet.context.startgg,
            );
            if (playingSetsWithContextStartgg.length > 0) {
              const representativeStartgg =
                playingSetsWithContextStartgg[0].context!.startgg!;
              eventSlug = representativeStartgg.event.slug;
              lastEventSlug = representativeStartgg.event.slug;
              phaseId = representativeStartgg.phase.id;
              lastPhaseId = representativeStartgg.phase.id;
              phaseGroupId = representativeStartgg.phaseGroup.id;
              lastPhaseGroupId = representativeStartgg.phaseGroup.id;
            }
            if (eventSlug && phaseId && phaseGroupId) {
              const prefix =
                playingSets.size === 0 && tryingPorts.size === 0
                  ? ''
                  : 'SPOILERS: ';
              say(
                `${prefix}https://www.start.gg/${eventSlug}/brackets/${phaseId}/${phaseGroupId}`,
              );
            }
          }),
          createBotCommand('pronouns', (params, { say }) => {
            say(
              'Pronouns are pulled from start.gg. Update yours here: https://start.gg/admin/profile/profile-settings',
            );
          }),
        ],
      });
      twitchBot.onAuthenticationFailure((text: string) => {
        twitchBotStatus = { connected: false, error: text };
        mainWindow.webContents.send('twitchBotStatus', twitchBotStatus);
      });
      twitchBot.onJoinFailure((event) => {
        twitchBotStatus = { connected: false, error: event.reason };
        mainWindow.webContents.send('twitchBotStatus', false, twitchBotStatus);
      });
      twitchBot.onTokenFetchFailure((error) => {
        twitchBotStatus = { connected: false, error: error.message };
        mainWindow.webContents.send('twitchBotStatus', false, twitchBotStatus);
      });
      twitchBot.onConnect(() => {
        twitchBotStatus = { connected: true, error: '' };
        mainWindow.webContents.send('twitchBotStatus', twitchBotStatus);
      });
    } catch (e: any) {
      if (e instanceof HttpStatusCodeError) {
        twitchBotStatus = { connected: false, error: e.body };
      } else {
        const error = e instanceof Error ? e.message : e;
        twitchBotStatus = { connected: false, error };
      }
      mainWindow.webContents.send('twitchBotStatus', twitchBotStatus);
    }
  };

  ipcMain.removeHandler('setTwitchChannel');
  ipcMain.handle(
    'setTwitchChannel',
    (event: IpcMainInvokeEvent, newTwitchChannel: string) => {
      store.set('twitchChannel', newTwitchChannel);
      twitchChannel = newTwitchChannel;
      maybeStartTwitchBot(twitchSettings);
    },
  );

  ipcMain.removeHandler('getTwitchSettings');
  ipcMain.handle('getTwitchSettings', () => {
    return twitchSettings;
  });

  ipcMain.removeHandler('setTwitchSettings');
  ipcMain.handle(
    'setTwitchSettings',
    async (event: IpcMainInvokeEvent, newTwitchSettings: TwitchSettings) => {
      const clientIdDiff =
        twitchSettings.clientId !== newTwitchSettings.clientId;
      const clientSecretDiff =
        twitchSettings.clientSecret !== newTwitchSettings.clientSecret;
      if (
        clientIdDiff ||
        clientSecretDiff ||
        twitchSettings.enabled !== newTwitchSettings.enabled
      ) {
        const actualNewTwitchSettings: TwitchSettings = {
          enabled: newTwitchSettings.enabled,
          clientId: newTwitchSettings.clientId,
          clientSecret: newTwitchSettings.clientSecret,
          accessToken: twitchSettings.accessToken,
          refreshToken: twitchSettings.refreshToken,
        };
        if (!newTwitchSettings.enabled || clientIdDiff || clientSecretDiff) {
          if (twitchBot) {
            twitchBot.chat.quit();
            twitchBot = null;
          }
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

  ipcMain.removeHandler('getTwitchBotStatus');
  ipcMain.handle('getTwitchBotStatus', () => twitchBotStatus);
  maybeStartTwitchBot(twitchSettings);

  ipcMain.removeHandler('getDolphinVersion');
  ipcMain.handle('getDolphinVersion', async () => dolphinVersionPromise ?? '');

  ipcMain.removeHandler('getObsConnectionEnabled');
  ipcMain.handle('getObsConnectionEnabled', () => obsConnectionEnabled);

  ipcMain.removeHandler('setObsConnectionEnabled');
  ipcMain.handle(
    'setObsConnectionEnabled',
    (event: IpcMainInvokeEvent, enabled: boolean) => {
      store.set('obsConnectionEnabled', enabled);
      obsConnectionEnabled = enabled;
    },
  );

  ipcMain.removeHandler('getObsSettings');
  ipcMain.handle('getObsSettings', () => obsSettings);

  ipcMain.removeHandler('setObsSettings');
  ipcMain.handle(
    'setObsSettings',
    (event: IpcMainInvokeEvent, newObsSettings: OBSSettings) => {
      store.set('obsSettings', newObsSettings);
      obsSettings = newObsSettings;
    },
  );

  ipcMain.removeHandler('openOverlayDir');
  ipcMain.handle('openOverlayDir', () => {
    shell.openPath(path.join(resourcesPath, 'overlay'));
  });

  ipcMain.removeHandler('openTempDir');
  ipcMain.handle('openTempDir', () => {
    shell.openPath(tempDir);
  });

  ipcMain.removeHandler('clearTempDir');
  ipcMain.handle('clearTempDir', async () => {
    const dirents = await readdir(tempDir, { withFileTypes: true });
    await Promise.all(
      dirents.map((dirent) => {
        if (dirent.isFile()) {
          return unlink(path.join(tempDir, dirent.name));
        }
        if (dirent.isDirectory()) {
          return rm(path.join(tempDir, dirent.name), { recursive: true });
        }
        return Promise.resolve();
      }),
    );
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

  ipcMain.removeHandler('copyToClipboard');
  ipcMain.handle(
    'copyToClipboard',
    (event: IpcMainInvokeEvent, text: string) => {
      clipboard.writeText(text);
    },
  );
}
