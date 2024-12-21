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
import {
  access,
  copyFile,
  mkdir,
  open,
  readdir,
  rm,
  unlink,
  writeFile,
} from 'fs/promises';
import path from 'path';
import { RefreshingAuthProvider } from '@twurple/auth';
import { Bot, createBotCommand } from '@twurple/easy-bot';
import { Ports } from '@slippi/slippi-js';
import { spawn } from 'child_process';
import { HttpStatusCodeError } from '@twurple/api-call';
import { deleteZipDir, scan, unzip } from './unzip';
import {
  AvailableSet,
  OBSSettings,
  OverlayContext,
  OverlaySet,
  SetType,
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

function willNotSpoil(setA: AvailableSet, setB: AvailableSet) {
  const aStartgg = setA.context?.startgg;
  const bStartgg = setB.context?.startgg;
  const aChallonge = setA.context?.challonge;
  const bChallonge = setB.context?.challonge;
  if (!aStartgg && !bStartgg && !aChallonge && !bChallonge) {
    return true;
  }
  if (aStartgg && bStartgg && aStartgg.phase.id === bStartgg.phase.id) {
    if (aStartgg.phaseGroup.id !== bStartgg.phaseGroup.id) {
      return true;
    }
    if (
      aStartgg.phaseGroup.bracketType === 3 &&
      bStartgg.phaseGroup.bracketType === 3
    ) {
      return true;
    }
    if (aStartgg.set.round === bStartgg.set.round) {
      return true;
    }
  }
  if (
    aChallonge &&
    bChallonge &&
    aChallonge.tournament.slug === bChallonge.tournament.slug
  ) {
    if (
      aChallonge.tournament.tournamentType === 'round robin' &&
      bChallonge.tournament.tournamentType === 'round robin'
    ) {
      return true;
    }
    if (aChallonge.set.round === bChallonge.set.round) {
      return true;
    }
  }
  return false;
}

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
    : true;
  let generateTimestamps = store.has('generateTimestamps')
    ? (store.get('generateTimestamps') as boolean)
    : true;
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
  let obsSettings: OBSSettings = store.has('obsSettings')
    ? (store.get('obsSettings') as OBSSettings)
    : { protocol: 'ws', address: '127.0.0.1', port: '4455', password: '' };

  const overlayPath = path.join(
    app.getPath('documents'),
    'AutoSLPPlayer',
    'overlay',
  );
  const initOverlayDir = async () => {
    await mkdir(overlayPath, { recursive: true });
    await Promise.all(
      [
        'default.html',
        'default 2.html',
        'default 34.html',
        'RobotoCJKSC-Regular.ttf',
      ].map(async (fileName) =>
        copyFile(
          path.join(resourcesPath, 'overlay', fileName),
          path.join(overlayPath, fileName),
        ),
      ),
    );
  };
  if (generateOverlay) {
    await initOverlayDir();
  }

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
      reject(new Error('Valid dolphin path, but could not get version'));
    });
    process.on('error', (e) => {
      reject(`Invalid dolphin path: ${e.message}`);
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
      properties: ['openFile', 'showHiddenFiles', 'treatPackageAsDirectory'],
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

  const tempDir = path.join(app.getPath('temp'), 'auto-slp-player');
  try {
    await access(tempDir).catch(() => mkdir(tempDir));
  } catch (e: any) {
    if (e instanceof Error) {
      throw new Error(`Could not make temp dir: ${e.message}`);
    }
  }

  const availableSets: AvailableSet[] = [];
  let queuedSet: AvailableSet | null = null;
  let wasManuallyQueued = false;
  const sendPlaying = () => {
    mainWindow.webContents.send(
      'playing',
      availableSets.map(toRenderSet),
      queuedSet ? queuedSet.originalPath : '',
    );
  };

  const originalPathToPlayedMs = new Map<string, number>();
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
        if (
          aStartgg.phaseGroup.bracketType === 3 &&
          bStartgg.phaseGroup.bracketType === 3
        ) {
          // RR pools may not actually be played in round order,
          // and there's also no inter-round dependencies
          return (
            a.context.startMs +
            a.context.durationMs -
            (b.context.startMs - b.context.durationMs)
          );
        }
        const aRound = aStartgg.set.round;
        const bRound = bStartgg.set.round;
        if (aRound !== bRound) {
          if (aStartgg.set.ordinal !== null && bStartgg.set.ordinal !== null) {
            return aStartgg.set.ordinal - bStartgg.set.ordinal;
          }
          // only non-DE so this comparison is safe
          return aRound - bRound;
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
      if (a.context?.challonge && b.context?.challonge) {
        const aChallonge = a.context.challonge;
        const bChallonge = b.context.challonge;
        const tournamentNameCompare = aChallonge.tournament.name.localeCompare(
          bChallonge.tournament.name,
        );
        if (tournamentNameCompare) {
          return tournamentNameCompare;
        }
        if (
          aChallonge.tournament.tournamentType === 'round robin' &&
          bChallonge.tournament.tournamentType === 'round robin'
        ) {
          // RR pools may not actually be played in round order,
          // and there's also no inter-round dependencies
          return (
            a.context.startMs +
            a.context.durationMs -
            (b.context.startMs - b.context.durationMs)
          );
        }
        const aRound = aChallonge.set.round;
        const bRound = bChallonge.set.round;
        if (aRound !== bRound) {
          const aOrdinal = aChallonge.set.ordinal;
          const bOrdinal = bChallonge.set.ordinal;
          if (aOrdinal !== null && bOrdinal !== null) {
            return aOrdinal - bOrdinal;
          }
          // only if swiss so this comparison is safe
          return aRound - bRound;
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
      if (a.context && b.context) {
        return (
          a.context.startMs +
          a.context.durationMs -
          (b.context.startMs - b.context.durationMs)
        );
      }
      if (!a.context && b.context) {
        return -1;
      }
      if (a.context && !b.context) {
        return 1;
      }
      return a.originalPath.localeCompare(b.originalPath);
    });
  };

  const playingSets: Map<number, AvailableSet> = new Map();
  const willNotSpoilPlayingSets = (prospectiveSet: AvailableSet) => {
    return Array.from(playingSets.values()).every((playingSet) =>
      willNotSpoil(playingSet, prospectiveSet),
    );
  };

  const dolphins: Map<number, Dolphin> = new Map();
  const gameIndices: Map<number, number> = new Map();
  let lastStartggTournamentName = '';
  let lastStartggEventName = '';
  let lastStartggEventSlug = '';
  let lastStartggPhaseName = '';
  let lastStartggPhaseId = 0;
  let lastStartggPhaseGroupId = 0;
  let lastChallongeTournamentName = '';
  let lastChallongeTournamentSlug = '';
  const writeOverlayJson = async () => {
    if (!generateOverlay) {
      return undefined;
    }

    const overlayFilePath = path.join(overlayPath, 'overlay.json');
    let startggTournamentName = lastStartggTournamentName;
    let startggEventName = lastStartggEventName;
    let startggPhaseName = lastStartggPhaseName;
    let challongeTournamentName = lastChallongeTournamentName;
    const sets: OverlaySet[] = [];
    const upcoming: { leftNames: string[]; rightNames: string[] }[] = [];
    let upcomingRoundName = '';

    const eventSlugs = new Set<string>();
    let eventHasSiblings = false;
    const phaseIds = new Set<number>();
    let phaseHasSiblings = false;
    const phaseGroupIds = new Set<number>();
    const entriesWithContexts = Array.from(playingSets.entries()).filter(
      ([, playingSet]) => playingSet.context,
    ) as [number, AvailableSet][];
    entriesWithContexts.forEach(([, playingSet]) => {
      const startgg = playingSet.context?.startgg;
      if (startgg) {
        eventSlugs.add(startgg.event.slug);
        eventHasSiblings = startgg.event.hasSiblings;
        phaseIds.add(startgg.phase.id);
        phaseHasSiblings = startgg.phase.hasSiblings;
        phaseGroupIds.add(startgg.phaseGroup.id);
      }
    });
    if (entriesWithContexts.length > 0) {
      const representativePlayingSet = entriesWithContexts[0][1];
      const representativeStartgg = representativePlayingSet.context?.startgg;
      const representativeChallonge =
        representativePlayingSet.context?.challonge;
      if (representativeStartgg) {
        startggTournamentName = representativeStartgg.tournament.name;
        startggEventName =
          eventSlugs.size === 1 && eventHasSiblings
            ? representativeStartgg.event.name
            : '';
        startggPhaseName =
          phaseIds.size === 1 && phaseHasSiblings
            ? representativeStartgg.phase.name
            : '';

        if (queuedSet) {
          const queuedSetStartgg = queuedSet.context?.startgg;
          const round = queuedSetStartgg?.set.round;
          const sameRound = round === representativeStartgg.set.round;
          const phaseId = queuedSetStartgg?.phase.id;
          const samePhaseRR =
            queuedSetStartgg?.phaseGroup.bracketType === 3 &&
            representativeStartgg.phaseGroup.bracketType === 3 &&
            phaseId === representativeStartgg.phase.id;
          if (sameRound || samePhaseRR) {
            const sameRoundSets = samePhaseRR
              ? availableSets.filter(
                  (availableSet) =>
                    availableSet.context?.startgg?.phaseGroup.bracketType ===
                      3 && availableSet.context?.startgg?.phase.id === phaseId,
                )
              : availableSets.filter(
                  (availableSet) =>
                    availableSet.context?.startgg?.set.round === round,
                );
            const startI = sameRoundSets.findIndex(
              (set) => set.originalPath === queuedSet!.originalPath,
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
      } else if (representativeChallonge) {
        challongeTournamentName = representativeChallonge.tournament.name;
        if (queuedSet) {
          const round = queuedSet.context?.challonge?.set.round;
          if (round === representativeChallonge.set.round) {
            const sameRoundSets = availableSets.filter(
              (availableSet) =>
                availableSet.context?.challonge?.set.round === round,
            );
            const startI = sameRoundSets.findIndex(
              (set) => set.originalPath === queuedSet!.originalPath,
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
          } else if (queuedSet.context?.challonge?.set.fullRoundText) {
            upcomingRoundName = queuedSet.context.challonge.set.fullRoundText;
          }
        }
      }
      entriesWithContexts.forEach(([port, playingSet]) => {
        const { context } = playingSet;
        const gameIndex = gameIndices.get(port);
        const setIndex = Array.from(dolphins.keys())
          .sort((a, b) => a - b)
          .indexOf(port);
        if (context && gameIndex !== undefined && setIndex >= 0) {
          let roundName = '';
          if (context.startgg) {
            roundName =
              context.startgg.phaseGroup.bracketType === 3
                ? 'Round Robin'
                : context.startgg.set.fullRoundText;
            if (
              phaseGroupIds.size > 1 &&
              context.startgg.phaseGroup.hasSiblings
            ) {
              roundName = `Pool ${context.startgg.phaseGroup.name}, ${roundName}`;
            }
            if (phaseIds.size > 1 && context.startgg.phase.hasSiblings) {
              roundName = `${context.startgg.phase.name}, ${roundName}`;
            }
            if (eventSlugs.size > 1 && context.startgg.event.hasSiblings) {
              roundName = `${context.startgg.event.name}, ${roundName}`;
            }
          } else if (context.challonge) {
            roundName = context.challonge.set.fullRoundText;
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
    const startgg =
      startggTournamentName && startggEventName && startggPhaseName
        ? {
            tournamentName: startggTournamentName,
            eventName: startggEventName,
            phaseName: startggPhaseName,
          }
        : undefined;
    const challonge = challongeTournamentName
      ? {
          tournamentName: challongeTournamentName,
        }
      : undefined;
    const overlayContext: OverlayContext = {
      sets,
      upcoming,
      upcomingRoundName,
      startgg,
      challonge,
    };
    return writeFile(overlayFilePath, JSON.stringify(overlayContext));
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
    set.invalidReason = '';
    set.playedMs = Date.now();
    set.playing = true;
    originalPathToPlayedMs.set(set.originalPath, set.playedMs);

    const queueNextSet = (startI: number) => {
      wasManuallyQueued = false;
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
    sortAvailableSets();
    queueNextSet(
      availableSets.findIndex(
        (value) => value.originalPath === set.originalPath,
      ),
    );

    if (set.type === SetType.ZIP) {
      await unzip(set, tempDir);
    }
    await dolphins.get(actualPort)!.play(set.replayPaths);

    if (generateTimestamps) {
      const writeTimestamps = async () => {
        const timecode = await obsConnection.getTimecode();
        if (timecode) {
          const rendererSet = toRenderSet(set);
          const desc = rendererSet.context
            ? `${rendererSet.context.namesLeft} vs ${rendererSet.context.namesRight}`
            : path.basename(rendererSet.originalPath, '.zip');
          const file = await open(path.join(tempDir, 'timestamps.txt'), 'a');
          await file.write(`${timecode} ${desc}\n`);
          await file.close();
        }
      };
      writeTimestamps();
    }

    sendPlaying();
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
        if (playingSet.type === SetType.ZIP) {
          deleteZipDir(playingSet, tempDir);
        }
        playingSets.delete(port);
        if (playingSets.size === 0) {
          const startgg = playingSet.context?.startgg;
          const challonge = playingSet.context?.challonge;
          if (startgg) {
            lastStartggTournamentName = startgg.tournament.name;
            lastStartggEventName = startgg.event.name;
            lastStartggEventSlug = startgg.event.slug;
            lastStartggPhaseName = startgg.phase.name;
            lastStartggPhaseId = startgg.phase.id;
            lastStartggPhaseGroupId = startgg.phaseGroup.id;
          } else if (challonge) {
            lastChallongeTournamentName = challonge.tournament.name;
            lastChallongeTournamentSlug = challonge.tournament.slug;
          }
        }
      }

      newDolphin.removeAllListeners();
      gameIndices.delete(port);
      dolphins.delete(port);
      if (dolphins.size === 0) {
        wasManuallyQueued = false;
        queuedSet = null;
      }
      obsConnection.setDolphins(dolphins);

      writeOverlayJson();
      obsConnection.transition(playingSets);
      mainWindow.webContents.send('dolphins', dolphins.size);
      sendPlaying();
    });
    newDolphin.on(DolphinEvent.PLAYING, (newGameIndex: number) => {
      gameIndices.set(port, newGameIndex);
      writeOverlayJson();
    });
    newDolphin.on(DolphinEvent.ENDED, async (failureReason: string) => {
      const playingSet = playingSets.get(port);
      if (!playingSet) {
        throw new Error(`playingSet not found for ${port} on ENDED`);
      }

      playingSet.playing = false;
      if (failureReason) {
        playingSet.invalidReason = failureReason;
      }
      if (playingSet.type === SetType.ZIP) {
        deleteZipDir(playingSet, tempDir);
      }

      playingSets.delete(port);
      if (queuedSet) {
        if (playingSets.size === 0) {
          do {
            // eslint-disable-next-line no-await-in-loop
            await playDolphin(queuedSet);
          } while (
            queuedSet &&
            playingSets.size + tryingPorts.size < maxDolphins &&
            willNotSpoilPlayingSets(queuedSet)
          );
          obsConnection.transition(playingSets);
          return;
        }
        if (willNotSpoilPlayingSets(queuedSet)) {
          playDolphin(queuedSet, port);
          return;
        }
      }

      // if we reach here, there's no next set to play
      if (playingSets.size === 0) {
        const startgg = playingSet.context?.startgg;
        const challonge = playingSet.context?.challonge;
        if (startgg) {
          lastStartggTournamentName = startgg.tournament.name;
          lastStartggEventName = startgg.event.name;
          lastStartggEventSlug = startgg.event.slug;
          lastStartggPhaseName = startgg.phase.name;
          lastStartggPhaseId = startgg.phase.id;
          lastStartggPhaseGroupId = startgg.phaseGroup.id;
        } else if (challonge) {
          lastChallongeTournamentName = challonge.tournament.name;
          lastChallongeTournamentSlug = challonge.tournament.slug;
        }
      }

      writeOverlayJson();
      setTimeout(() => {
        obsConnection.transition(playingSets);
      }, 1000);
      sendPlaying();
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
      if (queuedSet && willNotSpoilPlayingSets(queuedSet)) {
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
  ipcMain.removeHandler('getStreamingState');
  ipcMain.handle('getStreamingState', () => obsConnection.getStreamingState());
  ipcMain.removeHandler('connectObs');
  ipcMain.handle('connectObs', async () => {
    await obsConnection.connect(obsSettings);
  });
  ipcMain.removeHandler('startStream');
  ipcMain.handle('startStream', async () => obsConnection.startStream());

  let watcher: FSWatcher | undefined;
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

    if (watcher) {
      await watcher.close();
    }
    const normalizedDir =
      process.platform === 'win32'
        ? watchDir.split(path.win32.sep).join(path.posix.sep)
        : watchDir;
    const glob = `${normalizedDir}/*.zip`;
    watcher = watch(glob, { awaitWriteFinish: true });
    watcher.on('add', async (newZipPath) => {
      try {
        const newSet = await scan(
          newZipPath,
          originalPathToPlayedMs,
          twitchChannel,
        );
        const playingEntry = Array.from(playingSets.entries()).find(
          ([, set]) => set.originalPath === newSet.originalPath,
        );
        if (playingEntry) {
          newSet.playing = true;
          playingSets.set(playingEntry[0], newSet);
        }
        availableSets.push(newSet);
        sortAvailableSets();
        if (newSet.playing) {
          mainWindow.webContents.send(
            'unzip',
            availableSets.map(toRenderSet),
            queuedSet ? queuedSet.originalPath : '',
          );
          return;
        }

        let isNext = playingSets.size === 0;
        const newSetI = availableSets.indexOf(newSet);
        if (newSetI < 0) {
          throw new Error('could not find newSet in availableSets');
        }
        for (let i = newSetI - 1; i >= 0; i -= 1) {
          if (availableSets[i].playing) {
            isNext = true;
          } else if (availableSets[i].playedMs !== 0) {
            // eslint-disable-next-line no-continue
            continue;
          }
          break;
        }
        if (
          playingSets.size + tryingPorts.size < maxDolphins &&
          isNext &&
          willNotSpoilPlayingSets(newSet)
        ) {
          await playDolphin(newSet);
          obsConnection.transition(playingSets);
        } else {
          if (
            isNext &&
            newSet.playedMs === 0 &&
            (queuedSet === null || !wasManuallyQueued)
          ) {
            queuedSet = newSet;
          }
          writeOverlayJson();
          mainWindow.webContents.send(
            'unzip',
            availableSets.map(toRenderSet),
            queuedSet ? queuedSet.originalPath : '',
          );
        }
      } catch (e: any) {
        // const message = e instanceof Error ? e.message : e;
        // console.error(message);
      }
    });

    return watchDir;
  });

  ipcMain.removeHandler('markPlayed');
  ipcMain.handle(
    'markPlayed',
    (event: IpcMainInvokeEvent, originalPath: string, played: boolean) => {
      const set = availableSets.find(
        (availableSet) => availableSet.originalPath === originalPath,
      );
      if (!set) {
        throw new Error(`set does not exist: ${originalPath}`);
      }
      set.playedMs = played ? Date.now() : 0;
      originalPathToPlayedMs.set(set.originalPath, set.playedMs);
      sortAvailableSets();
      if (
        !wasManuallyQueued ||
        (originalPath === queuedSet?.originalPath && played)
      ) {
        for (let i = availableSets.length - 2; i >= 0; i -= 1) {
          if (availableSets[i].playing) {
            queuedSet = null;
            for (let j = i + 1; j < availableSets.length; j += 1) {
              if (availableSets[j].playedMs === 0) {
                queuedSet = availableSets[j];
                break;
              }
            }
            wasManuallyQueued = false;
            break;
          }
        }
      }
      writeOverlayJson();
      return {
        renderSets: availableSets.map(toRenderSet),
        queuedSetDirName: queuedSet ? queuedSet.originalPath : '',
      };
    },
  );

  ipcMain.removeHandler('play');
  ipcMain.handle(
    'play',
    async (event: IpcMainInvokeEvent, originalPath: string) => {
      const setToPlay = availableSets.find(
        (set) => set.originalPath === originalPath,
      );
      if (!setToPlay) {
        throw new Error(`no such set to play: ${originalPath}`);
      }

      if (
        playingSets.size === 1 &&
        maxDolphins === 1 &&
        tryingPorts.size === 0
      ) {
        const [port, playingSet] = Array.from(playingSets.entries())[0];
        playingSet.playing = false;
        await playDolphin(setToPlay, port);
        if (playingSet.type === SetType.ZIP) {
          deleteZipDir(playingSet, tempDir);
        }
        return;
      }
      if (playingSets.size + tryingPorts.size < maxDolphins) {
        await playDolphin(setToPlay);
        obsConnection.transition(playingSets);
      }
    },
  );

  ipcMain.removeHandler('stop');
  ipcMain.handle(
    'stop',
    async (event: IpcMainInvokeEvent, originalPath: string) => {
      const setToStop = availableSets.find(
        (set) => set.originalPath === originalPath,
      );
      if (!setToStop) {
        throw new Error(`no such set to stop: ${originalPath}`);
      }

      if (setToStop.playing) {
        const entry = Array.from(playingSets.entries()).find(
          ([, set]) => set === setToStop,
        )!;
        const [port] = entry;
        await dolphins.get(port)!.stop();
        setToStop.playing = false;
        if (setToStop.type === SetType.ZIP) {
          deleteZipDir(setToStop, tempDir);
        }
        playingSets.delete(port);

        writeOverlayJson();
        obsConnection.transition(playingSets);
        sendPlaying();
      }
    },
  );

  ipcMain.removeHandler('queue');
  ipcMain.handle('queue', (event: IpcMainInvokeEvent, originalPath: string) => {
    const setToQueue = availableSets.find(
      (set) => set.originalPath === originalPath,
    );
    if (!setToQueue) {
      throw new Error(`no such set to queue: ${originalPath}`);
    }

    queuedSet = setToQueue;
    wasManuallyQueued = true;
    writeOverlayJson();
  });

  ipcMain.removeHandler('getGenerateOverlay');
  ipcMain.handle('getGenerateOverlay', () => generateOverlay);

  ipcMain.removeHandler('setGenerateOverlay');
  ipcMain.handle(
    'setGenerateOverlay',
    async (event: IpcMainInvokeEvent, newGenerateOverlay: boolean) => {
      store.set('generateOverlay', newGenerateOverlay);
      generateOverlay = newGenerateOverlay;
      if (generateOverlay) {
        await initOverlayDir();
        await writeOverlayJson();
      }
    },
  );

  ipcMain.removeHandler('getGenerateTimestamps');
  ipcMain.handle('getGenerateTimestamps', () => generateTimestamps);

  ipcMain.removeHandler('setGenerateTimestamps');
  ipcMain.handle(
    'setGenerateTimestamps',
    async (event: IpcMainInvokeEvent, newGenerateTimestamps: boolean) => {
      store.set('generateTimestamps', newGenerateTimestamps);
      generateTimestamps = newGenerateTimestamps;
    },
  );

  ipcMain.removeHandler('getTwitchChannel');
  ipcMain.handle('getTwitchChannel', () => twitchChannel);

  let twitchBot: Bot | null = null;
  let twitchBotStatus = { connected: false, error: '' };
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
            const playingSetsWithContextStartgg = Array.from(
              playingSets.values(),
            ).filter(
              (playingSet) => playingSet.context && playingSet.context.startgg,
            );
            const playingSetsWithContextChallonge = Array.from(
              playingSets.values(),
            ).filter(
              (playingSet) =>
                playingSet.context && playingSet.context.challonge,
            );
            const prefix =
              playingSets.size === 0 && tryingPorts.size === 0
                ? ''
                : 'SPOILERS: ';
            if (playingSetsWithContextStartgg.length > 0) {
              const bracketUrls = new Set<string>();
              playingSetsWithContextStartgg.forEach((set) => {
                const startgg = set.context!.startgg!;
                bracketUrls.add(
                  `${prefix}https://www.start.gg/${startgg.event.slug}/brackets/${startgg.phase.id}/${startgg.phaseGroup.id}`,
                );
              });
              say(Array.from(bracketUrls.values()).join(' '));
            } else if (playingSetsWithContextChallonge.length > 0) {
              const bracketUrls = new Set<string>();
              playingSetsWithContextChallonge.forEach((set) => {
                const challonge = set.context!.challonge!;
                bracketUrls.add(
                  `${prefix}https://challonge.com/${challonge.tournament.slug}`,
                );
              });
              say(Array.from(bracketUrls.values()).join(' '));
            } else if (
              lastStartggEventSlug &&
              lastStartggPhaseId &&
              lastStartggPhaseGroupId
            ) {
              say(
                `${prefix}https://www.start.gg/${lastStartggEventSlug}/brackets/${lastStartggPhaseId}/${lastStartggPhaseGroupId}`,
              );
            } else if (lastChallongeTournamentSlug) {
              say(
                `${prefix}https://challonge.com/${lastChallongeTournamentSlug}`,
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
  ipcMain.handle('getDolphinVersion', async () => {
    try {
      const version = dolphinVersionPromise ? await dolphinVersionPromise : '';
      return { version, error: '' };
    } catch (e: any) {
      const error = e instanceof Error ? e.message : (e.toString() as string);
      return { version: '', error };
    }
  });

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
    shell.openPath(overlayPath);
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

  ipcMain.removeHandler('update');
  ipcMain.handle('update', async () => {
    await shell.openExternal(
      'https://github.com/jmlee337/auto-slp-player/releases/latest',
    );
    app.quit();
  });

  if (process.platform !== 'win32') {
    app.on('will-quit', () => {
      Array.from(dolphins.values()).forEach((dolphin) => {
        dolphin.close();
      });
    });
  }
}
