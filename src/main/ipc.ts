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
  readFile,
  rm,
  unlink,
  writeFile,
} from 'fs/promises';
import path from 'path';
import { Ports } from '@slippi/slippi-js';
import { spawn } from 'child_process';
import { AccessToken } from '@twurple/auth';
import { deleteZipDir, scan, unzip } from './unzip';
import {
  AvailableSet,
  MainContextChallonge,
  MainContextStartgg,
  ObsGamecaptureResult,
  OBSSettings,
  OverlayChallonge,
  OverlayContext,
  OverlaySet,
  OverlayStartgg,
  SetType,
  SplitOption,
  TwitchClient,
  TwitchStatus,
} from '../common/types';
import { Dolphin, DolphinEvent } from './dolphin';
import { toRendererSet } from './set';
import OBSConnection from './obs';
import Queue from './queue';
import Twitch from './twitch';

// taken from https://semver.org/#is-there-a-suggested-regular-expression-regex-to-check-a-semver-string
// via https://github.com/project-slippi/slippi-launcher/blob/ae8bb69e235b6e46b24bc966aeaa80f45030c6f9/src/dolphin/install/ishiiruka_installation.ts#L23-L24
// ty nikki
const SEMVER_REGEX =
  /(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-((?:0|[1-9][0-9]*|[0-9]*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9][0-9]*|[0-9]*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?/;

function willNotSpoil(
  setA: AvailableSet,
  setB: AvailableSet,
  splitOption: SplitOption,
) {
  const aStartgg = setA.context?.startgg;
  const bStartgg = setB.context?.startgg;
  const aChallonge = setA.context?.challonge;
  const bChallonge = setB.context?.challonge;
  if (
    (!aStartgg && !bStartgg && !aChallonge && !bChallonge) ||
    Boolean(aStartgg) !== Boolean(bStartgg) ||
    Boolean(aChallonge) !== Boolean(bChallonge)
  ) {
    return true;
  }
  if (aStartgg && bStartgg) {
    // sets in diff events can never spoil each other
    // sets in diff phases are non spoiling if splitting by phase
    if (
      aStartgg.event.slug !== bStartgg.event.slug ||
      (aStartgg.phase.id !== bStartgg.phase.id &&
        splitOption === SplitOption.PHASE)
    ) {
      return true;
    }

    // if splitting by phase then same phase
    // if any other split then we need to verify same phase
    if (
      splitOption === SplitOption.PHASE ||
      aStartgg.phase.id === bStartgg.phase.id
    ) {
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
      if (aStartgg.set.ordinal !== null && bStartgg.set.ordinal !== null) {
        if (
          aStartgg.set.round < 0 &&
          bStartgg.set.round > 0 &&
          bStartgg.set.fullRoundText !== 'Grand Final' &&
          bStartgg.set.fullRoundText !== 'Grand Final Reset' &&
          aStartgg.set.ordinal < bStartgg.set.ordinal
        ) {
          return true;
        }
        if (
          bStartgg.set.round < 0 &&
          aStartgg.set.round > 0 &&
          aStartgg.set.fullRoundText !== 'Grand Final' &&
          aStartgg.set.fullRoundText !== 'Grand Final Reset' &&
          bStartgg.set.ordinal < aStartgg.set.ordinal
        ) {
          return true;
        }
      }
    }
  }
  if (aChallonge && bChallonge) {
    // sets in diff brackets are non spoiling if splitting
    if (
      aChallonge.tournament.slug !== bChallonge.tournament.slug &&
      splitOption !== SplitOption.NONE
    ) {
      return true;
    }

    // if splitting then same bracket
    // if not splitting then we need to verify same bracket
    if (
      splitOption !== SplitOption.NONE ||
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
      if (aChallonge.set.ordinal !== null && bChallonge.set.ordinal !== null) {
        if (
          aChallonge.set.round < 0 &&
          bChallonge.set.round > 0 &&
          bChallonge.set.fullRoundText !== 'Grand Final' &&
          bChallonge.set.fullRoundText !== 'Grand Final Reset' &&
          aChallonge.set.ordinal < bChallonge.set.ordinal
        ) {
          return true;
        }
        if (
          bChallonge.set.round < 0 &&
          aChallonge.set.round > 0 &&
          aChallonge.set.fullRoundText !== 'Grand Final' &&
          aChallonge.set.fullRoundText !== 'Grand Final Reset' &&
          bChallonge.set.ordinal < aChallonge.set.ordinal
        ) {
          return true;
        }
      }
    }
  }
  return false;
}

export default async function setupIPCs(
  mainWindow: BrowserWindow,
  resourcesPath: string,
): Promise<void> {
  const store = new Store<{
    twitchBotEnabled: boolean;
    twitchClient: TwitchClient;
    twitchAccessToken: AccessToken;
    stealth: boolean;
  }>();
  let dolphinPath = '';
  if (store.has('dolphinPath')) {
    dolphinPath = store.get('dolphinPath') as string;
  } else {
    let defaultPath = path.join(
      app.getPath('appData'),
      'Slippi Launcher',
      'playback',
    );
    if (process.platform === 'win32') {
      defaultPath = path.join(defaultPath, 'Slippi Dolphin.exe');
    } else if (process.platform === 'darwin') {
      defaultPath = path.join(
        defaultPath,
        'Slippi Dolphin.app',
        'Contents',
        'MacOS',
        'Slippi Dolphin',
      );
    } else if (process.platform === 'linux') {
      defaultPath = path.join(defaultPath, 'Slippi_Playback-x86_64.AppImage');
    } else {
      throw new Error('unsupported platform???');
    }
    try {
      await access(defaultPath);
      dolphinPath = defaultPath;
      store.set('dolphinPath', dolphinPath);
    } catch {
      // just catch
    }
  }

  let isoPath = store.has('isoPath') ? (store.get('isoPath') as string) : '';
  let maxDolphins = store.has('maxDolphins')
    ? (store.get('maxDolphins') as number)
    : 1;
  let generateTimestamps = store.has('generateTimestamps')
    ? (store.get('generateTimestamps') as boolean)
    : true;
  let addDelay = store.has('addDelay')
    ? (store.get('addDelay') as boolean)
    : false;
  let splitOption: SplitOption = store.has('splitOption')
    ? (store.get('splitOption') as SplitOption)
    : SplitOption.EVENT;

  let obsSettings: OBSSettings = store.has('obsSettings')
    ? (store.get('obsSettings') as OBSSettings)
    : { protocol: 'ws', address: '127.0.0.1', port: '4455', password: '' };

  // twitch
  let twitchUserName = '';
  let twitchBotEnabled = store.get('twitchBotEnabled', false);
  let twitchClient: TwitchClient = store.get('twitchClient', {
    clientId: '',
    clientSecret: '',
  });
  let twitchAccessToken: AccessToken | null = null;
  if (store.has('twitchAccessToken')) {
    twitchAccessToken = store.get('twitchAccessToken');
  }
  let stealth: boolean = store.get('stealth', false);
  let twitchBotStatus = TwitchStatus.STOPPED;
  let twitchBotStatusMessage = '';
  let twitchCallbackServerStatus = TwitchStatus.STOPPED;
  let twitchCallbackServerPort = 0;
  const twitch = new Twitch(
    twitchClient,
    twitchAccessToken,
    twitchBotEnabled,
    stealth,
    (accessToken) => {
      twitchAccessToken = accessToken;
      store.set('twitchAccessToken', twitchAccessToken);
    },
    (userName) => {
      twitchUserName = userName;
      mainWindow.webContents.send('twitchUserName', twitchUserName);
    },
    (botStatus, botStatusMessage) => {
      twitchBotStatus = botStatus;
      twitchBotStatusMessage = botStatusMessage;
      mainWindow.webContents.send(
        'twitchBotStatus',
        twitchBotStatus,
        twitchBotStatusMessage,
      );
    },
    (callbackServerStatus, callbackServerPort) => {
      twitchCallbackServerStatus = callbackServerStatus;
      twitchCallbackServerPort = callbackServerPort;
      mainWindow.webContents.send(
        'twitchCallbackServerStatus',
        twitchCallbackServerStatus,
        twitchCallbackServerPort,
      );
    },
  );
  twitch.initialize();

  ipcMain.removeAllListeners('getTwitchUserName');
  ipcMain.handle('getTwitchUserName', () => {
    return twitchUserName;
  });

  ipcMain.removeAllListeners('getTwitchBotStatus');
  ipcMain.handle('getTwitchBotStatus', () => ({
    status: twitchBotStatus,
    message: twitchBotStatusMessage,
  }));

  ipcMain.removeAllListeners('getTwitchCallbackServerStatus');
  ipcMain.handle('getTwitchCallbackServerStatus', () => ({
    status: twitchCallbackServerStatus,
    port: twitchCallbackServerPort,
  }));

  ipcMain.removeAllListeners('startTwitchCallbackServer');
  ipcMain.handle('startTwitchCallbackServer', () =>
    twitch.startCallbackServer(),
  );

  ipcMain.removeAllListeners('stopTwitchCallbackServer');
  ipcMain.handle('stopTwitchCallbackServer', () => twitch.stopCallbackServer());

  ipcMain.removeAllListeners('getTwitchBotEnabled');
  ipcMain.handle('getTwitchBotEnabled', () => twitchBotEnabled);
  ipcMain.removeAllListeners('setTwitchBotEnabled');
  ipcMain.handle(
    'setTwitchBotEnabled',
    (event, newTwitchBotEnabled: boolean) => {
      twitchBotEnabled = newTwitchBotEnabled;
      store.set('twitchBotEnabled', twitchBotEnabled);
      twitch.setBotEnabled(twitchBotEnabled);
    },
  );

  ipcMain.removeAllListeners('getTwitchClient');
  ipcMain.handle('getTwitchClient', () => twitchClient);
  ipcMain.removeAllListeners('setTwitchClient');
  ipcMain.handle('setTwitchClient', (event, newTwitchClient: TwitchClient) => {
    twitchClient = newTwitchClient;
    store.set('twitchClient', twitchClient);
    twitch.setClient(twitchClient);
  });

  ipcMain.removeAllListeners('getStealth');
  ipcMain.handle('getStealth', () => stealth);
  ipcMain.removeAllListeners('setStealth');
  ipcMain.handle('setStealth', (event, newStealth: boolean) => {
    stealth = newStealth;
    store.set('stealth', stealth);
    twitch.setStealth(stealth);
  });

  const overlayPath = path.join(app.getPath('userData'), 'overlay');

  const obsGamecapturePromise =
    process.platform === 'linux'
      ? new Promise<void>((resolve, reject) => {
          const process = spawn('obs-gamecapture');
          process.stdout.on('data', () => {
            resolve();
          });
          process.on('close', () => {
            reject(new Error('obs-gamecapture did not output'));
          });
          process.on('error', (e) => {
            reject(e);
          });
        })
      : null;

  let setupObs = store.get('setupObs', true) as boolean;

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
      reject(new Error(`Invalid dolphin path: ${e.message}`));
    });
  };
  let dolphinVersionPromise = dolphinPath
    ? new Promise(dolphinVersionPromiseFn)
    : null;

  const obsConnection = new OBSConnection(
    mainWindow,
    path.join(overlayPath, 'default.html'),
    path.join(overlayPath, 'default 2.html'),
    path.join(overlayPath, 'default 34.html'),
  );
  obsConnection.setSetup(setupObs);
  obsConnection.setMaxDolphins(maxDolphins);
  if (dolphinVersionPromise) {
    obsConnection.setDolphinVersionPromise(dolphinVersionPromise);
  }

  ipcMain.removeHandler('getSetupObs');
  ipcMain.handle('getSetupObs', () => setupObs);
  ipcMain.removeHandler('setSetupObs');
  ipcMain.handle('setSetupObs', (event, newSetupObs: boolean) => {
    store.set('setupObs', newSetupObs);
    setupObs = newSetupObs;
    obsConnection.setSetup(setupObs);
  });

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

  const tempDir = path.join(app.getPath('temp'), 'auto-slp-player');
  try {
    await access(tempDir).catch(() => mkdir(tempDir));
  } catch (e: any) {
    if (e instanceof Error) {
      throw new Error(`Could not make temp dir: ${e.message}`);
    }
  }

  const originalPathToPlayedMs = new Map<string, number>();
  const playingSets: Map<number, AvailableSet> = new Map();
  const tryingPorts = new Set<number>();
  const willNotSpoilPlayingSets = (prospectiveSet: AvailableSet) => {
    return Array.from(playingSets.values()).every((playingSet) =>
      willNotSpoil(playingSet, prospectiveSet, splitOption),
    );
  };

  const idToQueue = new Map<string, Queue>();
  const queueIds: string[] = [];
  const getQueues = () => queueIds.map((queueId) => idToQueue.get(queueId)!);
  const sendQueues = () => {
    mainWindow.webContents.send(
      'queues',
      getQueues().map((queue) => queue.toRendererQueue()),
      playingSets.size + tryingPorts.size < maxDolphins,
    );
  };

  ipcMain.removeHandler('getMaxDolphins');
  ipcMain.handle('getMaxDolphins', () => maxDolphins);

  ipcMain.removeHandler('setMaxDolphins');
  ipcMain.handle('setMaxDolphins', (event, newMaxDolphins: number) => {
    store.set('maxDolphins', newMaxDolphins);
    maxDolphins = newMaxDolphins;
    obsConnection.setMaxDolphins(maxDolphins);
    sendQueues();
  });

  const dolphins: Map<number, Dolphin> = new Map();
  const gameIndices: Map<number, number> = new Map();
  let lastStartggTournamentName = '';
  let lastStartggTournamentLocation = '';
  let lastStartggEventName = '';
  let lastStartggEventSlug = '';
  let lastChallongeTournamentName = '';
  let lastChallongeTournamentSlug = '';
  const updateOverlayAndTwitchBot = async () => {
    const overlayFilePath = path.join(overlayPath, 'overlay.json');
    let startggTournamentName = lastStartggTournamentName;
    let startggTournamentLocation = lastStartggTournamentLocation;
    let startggEventName = lastStartggEventName;
    let startggPhaseName = '';
    let startggPhaseGroupName = '';
    let challongeTournamentName = lastChallongeTournamentName;
    const sets: OverlaySet[] = [];

    const eventSlugs = new Set<string>();
    let eventHasSiblings = false;
    const phaseIds = new Set<number>();
    let phaseHasSiblings = false;
    const phaseGroupIds = new Set<number>();
    let phaseGroupHasSiblings = false;
    const challongeSlugs = new Set<string>();
    const entriesWithContexts = Array.from(playingSets.entries()).filter(
      ([, playingSet]) => playingSet.context,
    );
    let representativeStartgg: MainContextStartgg | undefined;
    let representativeChallonge: MainContextChallonge | undefined;
    entriesWithContexts.forEach(([, playingSet]) => {
      const startgg = playingSet.context?.startgg;
      const challonge = playingSet.context?.challonge;
      if (startgg) {
        eventSlugs.add(startgg.event.slug);
        eventHasSiblings = startgg.event.hasSiblings;
        phaseIds.add(startgg.phase.id);
        phaseHasSiblings = startgg.phase.hasSiblings;
        phaseGroupIds.add(startgg.phaseGroup.id);
        phaseGroupHasSiblings = startgg.phaseGroup.hasSiblings;
      } else if (challonge) {
        challongeSlugs.add(challonge.tournament.slug);
      }
    });
    if (entriesWithContexts.length > 0) {
      const representativePlayingSet = entriesWithContexts[0][1];
      representativeStartgg = representativePlayingSet.context?.startgg;
      representativeChallonge = representativePlayingSet.context?.challonge;
      if (representativeStartgg) {
        startggTournamentName = representativeStartgg.tournament.name;
        startggTournamentLocation = representativeStartgg.tournament.location;
        startggEventName =
          eventSlugs.size === 1 && eventHasSiblings
            ? representativeStartgg.event.name
            : '';
        startggPhaseName =
          phaseIds.size === 1 && phaseHasSiblings
            ? representativeStartgg.phase.name
            : '';
        startggPhaseGroupName =
          phaseGroupIds.size === 1 && phaseGroupHasSiblings
            ? `Pool ${representativeStartgg.phaseGroup.name}`
            : '';
      } else if (representativeChallonge) {
        challongeTournamentName =
          challongeSlugs.size === 1
            ? representativeChallonge.tournament.name
            : '';
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
            roundName =
              context.challonge.tournament.tournamentType === 'round robin'
                ? 'Round Robin'
                : context.challonge.set.fullRoundText;
            if (challongeSlugs.size > 1) {
              roundName = `${context.challonge.tournament.name}, ${roundName}`;
            }
          }
          const { slots } =
            gameIndex >= 0 ? context.scores[gameIndex] : context.finalScore!;
          sets[setIndex] = {
            roundName,
            bestOf: context.bestOf,
            isFinal: gameIndex < 0,
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
    const startgg: OverlayStartgg | undefined = representativeStartgg
      ? {
          tournamentName: startggTournamentName,
          location: startggTournamentLocation,
          eventName: startggEventName,
          phaseName: startggPhaseName,
          phaseGroupName: startggPhaseGroupName,
        }
      : undefined;
    const challonge: OverlayChallonge | undefined = representativeChallonge
      ? {
          tournamentName: challongeTournamentName,
        }
      : undefined;
    const overlayContext: OverlayContext = {
      sets,
      startgg,
      challonge,
    };
    await writeFile(overlayFilePath, JSON.stringify(overlayContext));

    const urls: string[] = [];
    if (representativeStartgg) {
      urls.push(
        ...Array.from(eventSlugs).map(
          (eventSlug) => `https://www.start.gg/${eventSlug}`,
        ),
      );
    } else if (lastStartggEventSlug) {
      urls.push(`https://www.start.gg/${lastStartggEventSlug}`);
    }
    if (representativeChallonge) {
      urls.push(
        ...Array.from(challongeSlugs).map(
          (challongeSlug) => `https://challonge.com/${challongeSlug}`,
        ),
      );
    } else if (lastChallongeTournamentSlug) {
      urls.push(`https://challonge.com/${lastChallongeTournamentSlug}`);
    }
    twitch.setBrackets({
      spoilers:
        representativeStartgg !== undefined ||
        representativeChallonge !== undefined,
      urls,
    });
  };
  const failedPorts = new Set<number>();
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
  const playDolphin = async (
    queue: Queue,
    set: AvailableSet,
    port?: number,
  ) => {
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
    originalPathToPlayedMs.set(set.originalPath, set.playedMs);
    queue.dequeue(set);

    if (set.type === SetType.ZIP) {
      await unzip(set, tempDir);
    }
    await dolphins.get(actualPort)!.play(set.replayPaths);

    if (generateTimestamps) {
      const writeTimestamps = async () => {
        const timecode = await obsConnection.getTimecode();
        if (timecode) {
          const rendererSet = toRendererSet(set);
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
    sendQueues();
  };
  startDolphin = async (port: number) => {
    if (dolphins.get(port)) {
      return Promise.resolve();
    }

    const newDolphin = new Dolphin(
      dolphinPath,
      isoPath,
      tempDir,
      port,
      addDelay,
    );
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
            lastStartggTournamentLocation = startgg.tournament.location;
            lastStartggEventName = startgg.event.name;
            lastStartggEventSlug = startgg.event.slug;
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
        getQueues().forEach((queue) => {
          queue.clearNextSet();
        });
      }
      obsConnection.setDolphins(dolphins);

      updateOverlayAndTwitchBot();
      obsConnection.transition(playingSets);
      mainWindow.webContents.send('dolphins', dolphins.size);
      sendQueues();
    });
    newDolphin.on(DolphinEvent.PLAYING, (newGameIndex: number) => {
      gameIndices.set(port, newGameIndex);
      updateOverlayAndTwitchBot();
    });
    newDolphin.on(DolphinEvent.ENDING, () => {
      const playingSet = playingSets.get(port);
      if (playingSet?.context?.finalScore) {
        gameIndices.set(port, -1);
        updateOverlayAndTwitchBot();
      }
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

      const maybePlaySets = async (queues: Queue[]): Promise<number> => {
        let setsPlayed = 0;
        for (const queue of queues) {
          let { nextSet } = queue.peek();
          while (nextSet && willNotSpoilPlayingSets(nextSet)) {
            await playDolphin(queue, nextSet);
            setsPlayed += 1;
            if (playingSets.size + tryingPorts.size >= maxDolphins) {
              return setsPlayed;
            }
            nextSet = queue.peek().nextSet;
          }
        }
        return setsPlayed;
      };
      const setsPlayed = await maybePlaySets(getQueues());
      obsConnection.transition(playingSets);
      if (setsPlayed > 0) {
        return;
      }

      // if we reach here, we didn't play any sets
      if (playingSets.size === 0) {
        const startgg = playingSet.context?.startgg;
        const challonge = playingSet.context?.challonge;
        if (startgg) {
          lastStartggTournamentName = startgg.tournament.name;
          lastStartggTournamentLocation = startgg.tournament.location;
          lastStartggEventName = startgg.event.name;
          lastStartggEventSlug = startgg.event.slug;
        } else if (challonge) {
          lastChallongeTournamentName = challonge.tournament.name;
          lastChallongeTournamentSlug = challonge.tournament.slug;
        }
      }
      sendQueues();
      updateOverlayAndTwitchBot();
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
    const toOpen = maxDolphins - dolphins.size - tryingPorts.size;
    for (let i = 0; i < toOpen; i += 1) {
      await startDolphinWithoutPort();
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

  let watchDir = '';
  ipcMain.removeHandler('getWatchDir');
  ipcMain.handle('getWatchDir', () => watchDir);

  let watcher: FSWatcher | undefined;
  ipcMain.removeHandler('chooseWatchDir');
  ipcMain.handle('chooseWatchDir', async (): Promise<string> => {
    const openDialogRes = await dialog.showOpenDialog({
      properties: ['openDirectory', 'showHiddenFiles'],
    });
    if (openDialogRes.canceled) {
      return watchDir;
    }
    const [newWatchDir] = openDialogRes.filePaths;
    if (newWatchDir === watchDir) {
      return watchDir;
    }
    watchDir = newWatchDir;

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
          twitchUserName,
        );
        const playingEntry = Array.from(playingSets.entries()).find(
          ([, set]) => set.originalPath === newSet.originalPath,
        );
        if (playingEntry) {
          newSet.playing = true;
          playingSets.set(playingEntry[0], newSet);
        }

        let queueId = '';
        let queueName = 'Unknown';
        if (splitOption !== SplitOption.NONE && newSet.context) {
          if (newSet.context.startgg) {
            if (splitOption === SplitOption.EVENT) {
              queueId = `e:${newSet.context.startgg.event.slug}`;
              queueName = newSet.context.startgg.event.name;
            } else {
              queueId = `p:${newSet.context.startgg.phase.id}`;
              queueName = newSet.context.startgg.event.hasSiblings
                ? `${newSet.context.startgg.event.name}, ${newSet.context.startgg.phase.name}`
                : newSet.context.startgg.phase.name;
            }
          } else if (newSet.context.challonge) {
            queueId = `c:${newSet.context.challonge.tournament.slug}`;
            queueName = newSet.context.challonge.tournament.name;
          }
        }
        const queueIsNew = !idToQueue.has(queueId);
        const queue = idToQueue.get(queueId) ?? new Queue(queueId, queueName);
        const hadPlayable = queue.hasPlayable();
        const wasExhausted = queue.isExhuasted();
        queue.enqueue(newSet);
        if (queueIsNew) {
          idToQueue.set(queueId, queue);
          queueIds.push(queueId);
        }

        if (newSet.playing) {
          sendQueues();
          return;
        }

        if (
          newSet.playedMs === 0 &&
          playingSets.size + tryingPorts.size < maxDolphins &&
          (queue.getCalculatedNextSet() === newSet ||
            (wasExhausted && queue.getLast() === newSet)) &&
          willNotSpoilPlayingSets(newSet) &&
          !queue.isManuallyStopped()
        ) {
          await playDolphin(queue, newSet);
          obsConnection.transition(playingSets);
        } else {
          const { nextSet, nextSetIsManual } = queue.peek();
          if ((nextSet || !hadPlayable) && !nextSetIsManual) {
            queue.setCalculatedNextSet();
          }
          sendQueues();
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
    (
      event: IpcMainInvokeEvent,
      queueId: string,
      originalPath: string,
      played: boolean,
    ) => {
      const queue = idToQueue.get(queueId);
      if (!queue) {
        throw new Error(`no such queue: ${queueId}`);
      }
      const setToMark = queue.find(originalPath);

      setToMark.playedMs = played ? Date.now() : 0;
      originalPathToPlayedMs.set(setToMark.originalPath, setToMark.playedMs);
      queue.sortSets();

      const { nextSet, nextSetIsManual } = queue.peek();
      if (
        nextSet &&
        (!nextSetIsManual || (originalPath === nextSet?.originalPath && played))
      ) {
        queue.setCalculatedNextSet();
      }

      sendQueues();
    },
  );
  ipcMain.removeHandler('stop');
  ipcMain.handle(
    'stop',
    async (
      event: IpcMainInvokeEvent,
      queueId: string,
      originalPath: string,
    ) => {
      const queue = idToQueue.get(queueId);
      if (!queue) {
        throw new Error(`no such queue: ${queueId}`);
      }
      const setToStop = queue.find(originalPath);

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

        sendQueues();
        updateOverlayAndTwitchBot();
        obsConnection.transition(playingSets);
      }
    },
  );
  ipcMain.removeHandler('playNext');
  ipcMain.handle(
    'playNext',
    (event: IpcMainInvokeEvent, queueId: string, originalPath: string) => {
      const queue = idToQueue.get(queueId);
      if (!queue) {
        throw new Error(`no such queue: ${queueId}`);
      }

      queue.setNextSetManually(originalPath);
      sendQueues();
    },
  );
  ipcMain.removeHandler('unqueue');
  ipcMain.handle('unqueue', (event, queueId: string) => {
    const queue = idToQueue.get(queueId);
    if (!queue) {
      throw new Error(`no such queue: ${queueId}`);
    }

    queue.clearNextSetManually();
    sendQueues();
  });
  ipcMain.removeHandler('playNow');
  ipcMain.handle(
    'playNow',
    async (
      event: IpcMainInvokeEvent,
      queueId: string,
      originalPath: string,
    ) => {
      const queue = idToQueue.get(queueId);
      if (!queue) {
        throw new Error(`no such queue: ${queueId}`);
      }
      const setToPlay = queue.find(originalPath);

      if (playingSets.size + tryingPorts.size < maxDolphins) {
        await playDolphin(queue, setToPlay);
        obsConnection.transition(playingSets);
      }
    },
  );

  ipcMain.removeHandler('getGenerateTimestamps');
  ipcMain.handle('getGenerateTimestamps', () => generateTimestamps);
  ipcMain.removeHandler('setGenerateTimestamps');
  ipcMain.handle(
    'setGenerateTimestamps',
    (event: IpcMainInvokeEvent, newGenerateTimestamps: boolean) => {
      store.set('generateTimestamps', newGenerateTimestamps);
      generateTimestamps = newGenerateTimestamps;
    },
  );

  ipcMain.removeHandler('getTimestamps');
  ipcMain.handle('getTimestamps', async () => {
    try {
      return await readFile(path.join(tempDir, 'timestamps.txt'), {
        encoding: 'utf8',
      });
    } catch {
      return '';
    }
  });

  ipcMain.removeHandler('clearTimestamps');
  ipcMain.handle('clearTimestamps', () =>
    rm(path.join(tempDir, 'timestamps.txt'), { force: true }),
  );

  ipcMain.removeHandler('getAddDelay');
  ipcMain.handle('getAddDelay', () => addDelay);

  ipcMain.removeHandler('setAddDelay');
  ipcMain.handle('setAddDelay', (event, newAddDelay: boolean) => {
    store.set('addDelay', newAddDelay);
    addDelay = newAddDelay;
    for (const dolphin of dolphins.values()) {
      dolphin.setAddDelay(addDelay);
    }
  });

  ipcMain.removeHandler('getSplitOption');
  ipcMain.handle('getSplitOption', () => splitOption);

  ipcMain.removeHandler('setSplitOption');
  ipcMain.handle(
    'setSplitOption',
    (event: IpcMainInvokeEvent, newSplitOption: SplitOption) => {
      if (splitOption !== newSplitOption) {
        store.set('splitOption', newSplitOption);
        splitOption = newSplitOption;

        const allSets: AvailableSet[] = [];
        getQueues().forEach((queue) => {
          allSets.push(...queue.getSets());
        });

        idToQueue.clear();
        queueIds.length = 0;
        if (splitOption === SplitOption.EVENT) {
          const idToNewQueue = new Map<
            string,
            { name: string; sets: AvailableSet[] }
          >();
          allSets.forEach((set) => {
            let queueId = '';
            let name = 'Unknown';
            if (set.context?.startgg) {
              queueId = `e:${set.context.startgg.event.slug}`;
              name = set.context.startgg.event.name;
            } else if (set.context?.challonge) {
              queueId = `c:${set.context.challonge.tournament.slug}`;
              name = set.context.challonge.tournament.name;
            }
            if (idToNewQueue.has(queueId)) {
              idToNewQueue.get(queueId)!.sets.push(set);
            } else {
              idToNewQueue.set(queueId, { name, sets: [set] });
            }
          });
          Array.from(idToNewQueue.entries()).forEach(([queueId, newQueue]) => {
            idToQueue.set(
              queueId,
              new Queue(queueId, newQueue.name, newQueue.sets),
            );
            queueIds.push(queueId);
          });
        } else if (splitOption === SplitOption.PHASE) {
          const idToNewQueue = new Map<
            string,
            { name: string; sets: AvailableSet[] }
          >();
          allSets.forEach((set) => {
            let queueId = '';
            let name = 'Unknown';
            if (set.context?.startgg) {
              queueId = `p:${set.context.startgg.phase.id}`;
              name = set.context.startgg.event.hasSiblings
                ? `${set.context.startgg.event.name}, ${set.context.startgg.phase.name}`
                : set.context.startgg.phase.name;
            } else if (set.context?.challonge) {
              queueId = `c:${set.context.challonge.tournament.slug}`;
              name = set.context.challonge.tournament.name;
            }
            if (idToNewQueue.has(queueId)) {
              idToNewQueue.get(queueId)!.sets.push(set);
            } else {
              idToNewQueue.set(queueId, { name, sets: [set] });
            }
          });
          Array.from(idToNewQueue.entries()).forEach(([queueId, newQueue]) => {
            idToQueue.set(
              queueId,
              new Queue(queueId, newQueue.name, newQueue.sets),
            );
            queueIds.push(queueId);
          });
        } else {
          // SplitOption.NONE
          idToQueue.set('', new Queue('', 'Unknown', allSets));
          queueIds.push('');
        }
        getQueues().forEach((queue) => {
          queue.sortSets();
          if (queue.isPlaying()) {
            queue.setCalculatedNextSet();
          } else {
            queue.clearNextSet();
          }
        });
        sendQueues();
      }
    },
  );

  ipcMain.removeHandler('getQueues');
  ipcMain.handle('getQueues', () =>
    getQueues().map((queue) => queue.toRendererQueue()),
  );
  ipcMain.removeHandler('getCanPlay');
  ipcMain.handle(
    'getCanPlay',
    () => playingSets.size + tryingPorts.size < maxDolphins,
  );
  ipcMain.removeHandler('incrementQueuePriority');
  ipcMain.handle('incrementQueuePriority', (event, queueId: string) => {
    const i = queueIds.indexOf(queueId);
    if (i === -1) {
      throw new Error('no such queue id');
    }
    if (i === 0) {
      throw new Error('queue already max priority');
    }
    [queueIds[i - 1], queueIds[i]] = [queueIds[i], queueIds[i - 1]];
    sendQueues();
  });
  ipcMain.removeHandler('decrementQueuePriority');
  ipcMain.handle('decrementQueuePriority', (event, queueId: string) => {
    const i = queueIds.indexOf(queueId);
    if (i === -1) {
      throw new Error('no such queue id');
    }
    if (i === queueIds.length - 1) {
      throw new Error('queue already min priority');
    }
    [queueIds[i], queueIds[i + 1]] = [queueIds[i + 1], queueIds[i]];
    sendQueues();
  });

  ipcMain.removeHandler('checkObsGamecapture');
  ipcMain.handle('checkObsGamecapture', async () => {
    if (process.platform !== 'linux') {
      return ObsGamecaptureResult.NOT_APPLICABLE;
    }
    if (!obsGamecapturePromise) {
      throw new Error('unreachable');
    }

    try {
      await obsGamecapturePromise;
      return ObsGamecaptureResult.PASS;
    } catch {
      return ObsGamecaptureResult.FAIL;
    }
  });

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

  app.on('before-quit', async (event) => {
    if (dolphins.size > 0) {
      event.preventDefault();
      for (const [port, dolphin] of dolphins) {
        dolphin.removeAllListeners();
        dolphin.close();
        dolphins.delete(port);
      }
    }
    if (playingSets.size > 0) {
      event.preventDefault();
      for (const [port, playingSet] of playingSets) {
        try {
          await deleteZipDir(playingSet, tempDir);
        } catch {
          // just catch
        } finally {
          playingSets.delete(port);
        }
      }
    }
    if (event.defaultPrevented) {
      app.quit();
    }
  });

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
  await writeFile(
    path.join(overlayPath, 'overlay.json'),
    JSON.stringify({ sets: [] }),
  );
}
