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
  FileHandle,
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
import { parseStream, writeToString } from 'fast-csv';
import { createReadStream } from 'fs';
import { format, parse } from 'date-fns';
import ini from 'ini';
import os from 'os';
import { deleteZipDir, scan, unzip } from './unzip';
import {
  ApiPhaseGroup,
  ApiSet,
  AvailableSet,
  DOLPHIN_USER_SUBDIR,
  MainContextChallonge,
  MainContextStartgg,
  OBSConnectionStatus,
  ObsGamecaptureResult,
  OBSSettings,
  OverlayChallonge,
  OverlayContext,
  OverlaySet,
  OverlaySetType,
  OverlayStartgg,
  SetType,
  SplitOption,
  TwitchClient,
  TwitchPrediction,
  TwitchStatus,
} from '../common/types';
import { Dolphin, DolphinEvent } from './dolphin';
import { toApiPhaseGroup, toRendererSet } from './set';
import OBSConnection from './obs';
import Queue from './queue';
import Twitch from './twitch';
import { getEntrantName } from '../common/commonUtil';
import { wrappedFetch } from './util';

// taken from https://semver.org/#is-there-a-suggested-regular-expression-regex-to-check-a-semver-string
// via https://github.com/project-slippi/slippi-launcher/blob/ae8bb69e235b6e46b24bc966aeaa80f45030c6f9/src/dolphin/install/ishiiruka_installation.ts#L23-L24
// ty nikki
const SEMVER_REGEX =
  /(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-((?:0|[1-9][0-9]*|[0-9]*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9][0-9]*|[0-9]*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?/;

function getDefaultMirrorDir() {
  let root = app.getPath('home');
  if (process.platform === 'win32') {
    try {
      root = app.getPath('documents');
    } catch {
      // just catch
    }
  }
  return path.join(root, 'Slippi', 'Spectate');
}

async function getDolphinVersion(dolphinPath: string) {
  try {
    const dolphinVersion = await new Promise<string>((resolve, reject) => {
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
    });
    return { dolphinVersion, dolphinVersionError: '' };
  } catch (e: any) {
    const dolphinVersionError =
      e instanceof Error ? e.message : (e.toString() as string);
    return { dolphinVersion: '', dolphinVersionError };
  }
}

function getUserDir(dolphinPath: string) {
  if (process.platform === 'win32') {
    if (dolphinPath) {
      return path.join(path.dirname(dolphinPath), 'User');
    }
    return path.join(
      app.getPath('appData'),
      'Slippi Launcher',
      'playback',
      'User',
    );
  }
  if (process.platform === 'darwin') {
    return path.join(
      os.homedir(),
      'Library',
      'Application Support',
      'com.project-slippi.dolphin',
      'playback',
      'User',
    );
  }
  if (process.platform === 'linux') {
    return path.join(os.homedir(), '.config', 'SlippiPlayback');
  }
  throw new Error('unreachable');
}

async function getUserDolphinGFX(dolphinPath: string) {
  const defaultUserDir = getUserDir(dolphinPath);

  let dolphinIni: {
    [key: string]: any;
  } = {};
  const dolphinIniPath = path.join(defaultUserDir, 'Config', 'Dolphin.ini');
  try {
    dolphinIni = ini.parse(
      await readFile(dolphinIniPath, { encoding: 'utf8' }),
    );
  } catch {
    // just catch
  }

  let gfxIni: {
    [key: string]: any;
  } = {};
  const gfxIniPath = path.join(defaultUserDir, 'Config', 'GFX.ini');
  try {
    gfxIni = ini.parse(await readFile(gfxIniPath, { encoding: 'utf8' }));
  } catch {
    // just catch
  }

  return { dolphinIni, gfxIni };
}

async function writeUserConfig(
  tempDir: string,
  dolphinIni: {
    [key: string]: any;
  },
  gfxIni: {
    [key: string]: any;
  },
) {
  const configDir = path.join(tempDir, DOLPHIN_USER_SUBDIR, 'Config');
  try {
    await mkdir(configDir, { recursive: true });
  } catch (e: any) {
    if (e instanceof Error) {
      throw new Error(`Could not make config dir: ${e.message}`);
    }
  }

  if (dolphinIni.Core) {
    dolphinIni.Core.AdapterRumble0 = false;
    dolphinIni.Core.AdapterRumble1 = false;
    dolphinIni.Core.AdapterRumble2 = false;
    dolphinIni.Core.AdapterRumble3 = false;
  } else {
    dolphinIni.Core = {
      AdapterRumble0: false,
      AdapterRumble1: false,
      AdapterRumble2: false,
      AdapterRumble3: false,
    };
  }
  if (dolphinIni.Display) {
    dolphinIni.Display.Fullscreen = false;
    dolphinIni.Display.KeepWindowOnTop = false;
    dolphinIni.Display.RenderToMain = true;
    dolphinIni.Display.RenderWindowAutoSize = true;
  } else {
    dolphinIni.Display = {
      Fullscreen: false,
      KeepWindowOnTop: false,
      RenderToMain: true,
      RenderWindowAutoSize: true,
    };
  }
  if (dolphinIni.Interface) {
    dolphinIni.Interface.HideCursor = false;
    dolphinIni.Interface.ShowToolbar = true;
    dolphinIni.Interface.ShowStatusbar = true;
    dolphinIni.Interface.ShowSeekbar = false;
  } else {
    dolphinIni.Interface = {
      HideCursor: false,
      ShowToolbar: true,
      ShowStatusbar: true,
      ShowSeekbar: false,
    };
  }
  const dolphinConfigPath = path.join(configDir, 'Dolphin.ini');
  await writeFile(dolphinConfigPath, ini.stringify(dolphinIni));

  if (gfxIni.Settings) {
    gfxIni.Settings.AspectRatio = 0;
  } else {
    gfxIni.Settings = {
      AspectRatio: 0,
    };
  }
  const gfxConfigPath = path.join(configDir, 'GFX.ini');
  await writeFile(gfxConfigPath, ini.stringify(gfxIni));

  const hotkeysConfigPath = path.join(configDir, 'Hotkeys.ini');
  await writeFile(
    hotkeysConfigPath,
    ini.stringify({
      Hotkeys1: {
        Device: '/0/',
      },
    }),
  );
}

function getGameSettingsPath(tempDir: string) {
  return path.join(tempDir, DOLPHIN_USER_SUBDIR, 'GameSettings', 'GALE01.ini');
}

async function writeGameSettings(
  musicOff: boolean,
  stealth: boolean,
  tempDir: string,
) {
  const gameSettingsDir = path.join(
    tempDir,
    DOLPHIN_USER_SUBDIR,
    'GameSettings',
  );
  try {
    await mkdir(gameSettingsDir, { recursive: true });
  } catch (e: any) {
    if (e instanceof Error) {
      throw new Error(`Could not make config dir: ${e.message}`);
    }
  }

  let iniStr = '[Gecko_Enabled]\n$Optional: Hide Waiting For Game\n';
  if (musicOff) {
    iniStr += '$Optional: Game Music OFF\n';
  }
  if (stealth) {
    iniStr += '\n[Gecko_Disabled]\n$Optional: Show Player Names\n';
  }
  await writeFile(getGameSettingsPath(tempDir), iniStr);
}

export default async function setupIPCs(
  mainWindow: BrowserWindow,
  resourcesPath: string,
): Promise<void> {
  const store = new Store<{
    autoTwitchPredictions: boolean;
    checkOvertime: boolean;
    mirrorDir: string;
    mirrorShowScore: boolean;
    musicOff: boolean;
    sggApiKey: string;
    splitByWave: boolean;
    stealth: boolean;
    twitchBotEnabled: boolean;
    twitchPredictionsEnabled: boolean;
    twitchClient: TwitchClient;
    twitchAccessToken: AccessToken;
  }>();
  let sggApiKey = store.get('sggApiKey', '');
  let dolphinPath = '';
  let dolphinVersion = '';
  let dolphinVersionError = '';
  if (store.has('dolphinPath')) {
    dolphinPath = store.get('dolphinPath') as string;
    ({ dolphinVersion, dolphinVersionError } =
      await getDolphinVersion(dolphinPath));
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

    const dolphinVersionRet = await getDolphinVersion(defaultPath);
    if (
      dolphinVersionRet.dolphinVersion &&
      !dolphinVersionRet.dolphinVersionError
    ) {
      dolphinPath = defaultPath;
      store.set('dolphinPath', dolphinPath);
      ({ dolphinVersion, dolphinVersionError } = dolphinVersionRet);
    }
  }

  let isoPath = store.has('isoPath') ? (store.get('isoPath') as string) : '';
  let maxDolphins = store.has('maxDolphins')
    ? (store.get('maxDolphins') as number)
    : 1;
  let musicOff: boolean = store.get('musicOff', false);
  let stealth: boolean = store.get('stealth', false);
  let splitOption: SplitOption = store.has('splitOption')
    ? (store.get('splitOption') as SplitOption)
    : SplitOption.EVENT;
  let splitByWave: boolean = store.get('splitByWave', true);
  let checkOvertime: boolean = store.get('checkOvertime', true);

  const tempDir = path.join(app.getPath('temp'), 'auto-slp-player');
  try {
    await mkdir(tempDir, { recursive: true });
  } catch (e: any) {
    if (e instanceof Error) {
      throw new Error(`Could not make temp dir: ${e.message}`);
    }
  }

  const initUserDolphinGFX = await getUserDolphinGFX(dolphinPath);
  await writeUserConfig(
    tempDir,
    initUserDolphinGFX.dolphinIni,
    initUserDolphinGFX.gfxIni,
  );

  try {
    await access(getGameSettingsPath(tempDir));
  } catch {
    await writeGameSettings(musicOff, stealth, tempDir);
  }

  let obsSettings: OBSSettings = store.has('obsSettings')
    ? (store.get('obsSettings') as OBSSettings)
    : { protocol: 'ws', address: '127.0.0.1', port: '4455', password: '' };

  // twitch
  let twitchUserName = '';
  let twitchBotEnabled = store.get('twitchBotEnabled', false);
  let twitchPredictionsEnabled = store.get('twitchPredictionsEnabled', false);
  let twitchClient: TwitchClient = store.get('twitchClient', {
    clientId: '',
    clientSecret: '',
  });
  let twitchAccessToken: AccessToken | null = null;
  if (store.has('twitchAccessToken')) {
    twitchAccessToken = store.get('twitchAccessToken');
  }
  let twitchBotStatus = TwitchStatus.STOPPED;
  let twitchBotStatusMessage = '';
  let twitchPrediction: TwitchPrediction | null = null;
  let twitchCallbackServerStatus = TwitchStatus.STOPPED;
  let twitchCallbackServerPort = 0;
  const twitch = new Twitch(
    twitchClient,
    twitchAccessToken,
    twitchBotEnabled,
    twitchPredictionsEnabled,
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
    (newTwitchPrediction) => {
      twitchPrediction = newTwitchPrediction;
      mainWindow.webContents.send('twitchPrediction', twitchPrediction);
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

  ipcMain.removeAllListeners('getTwitchPrediction');
  ipcMain.handle('getTwitchPrediction', () => twitchPrediction);

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
    async (event, newTwitchBotEnabled: boolean) => {
      await twitch.setBotEnabled(newTwitchBotEnabled);
      store.set('twitchBotEnabled', newTwitchBotEnabled);
      twitchBotEnabled = newTwitchBotEnabled;
    },
  );

  ipcMain.removeAllListeners('getTwitchPredictionsEnabled');
  ipcMain.handle('getTwitchPredictionsEnabled', () => twitchPredictionsEnabled);
  ipcMain.removeAllListeners('setTwitchPredictionsEnabled');
  ipcMain.handle(
    'setTwitchPredictionsEnabled',
    async (event, newTwitchPredictionsEnabled: boolean) => {
      await twitch.setPredictionsEnabled(newTwitchPredictionsEnabled);
      store.set('twitchPredictionsEnabled', newTwitchPredictionsEnabled);
      twitchPredictionsEnabled = newTwitchPredictionsEnabled;
    },
  );

  ipcMain.removeAllListeners('getAutoTwitchPredictions');
  ipcMain.handle('getAutoTwitchPredictions', () =>
    store.get('autoTwitchPredictions', true),
  );
  ipcMain.removeAllListeners('setAutoTwitchPredictions');
  ipcMain.handle(
    'setAutoTwitchPredictions',
    (event, autoTwitchPredictions: boolean) => {
      store.set('autoTwitchPredictions', autoTwitchPredictions);
    },
  );

  ipcMain.removeAllListeners('createTwitchPrediction');
  ipcMain.handle('createTwitchPrediction', (event, set: ApiSet) =>
    twitch.createPrediction(set),
  );

  ipcMain.removeAllListeners('lockTwitchPrediction');
  ipcMain.handle('lockTwitchPrediction', () => twitch.lockPrediction());

  ipcMain.removeAllListeners('resolveTwitchPrediction');
  ipcMain.handle('resolveTwitchPrediction', () => twitch.resolvePrediction());

  ipcMain.removeAllListeners('resolveTwitchPredictionWithWinner');
  ipcMain.handle(
    'resolveTwitchPredictionWithWinner',
    (event, winnerName: string) =>
      twitch.resolvePredictionWithWinner(winnerName),
  );

  ipcMain.removeAllListeners('getTwitchClient');
  ipcMain.handle('getTwitchClient', () => twitchClient);
  ipcMain.removeAllListeners('setTwitchClient');
  ipcMain.handle('setTwitchClient', (event, newTwitchClient: TwitchClient) => {
    twitchClient = newTwitchClient;
    store.set('twitchClient', twitchClient);
    twitch.setClient(twitchClient);
  });

  ipcMain.removeAllListeners('getMusicOff');
  ipcMain.handle('getMusicOff', () => musicOff);
  ipcMain.removeAllListeners('setMusicOff');
  ipcMain.handle('setMusicOff', async (event, newMusicOff: boolean) => {
    await writeGameSettings(newMusicOff, stealth, tempDir);
    store.set('musicOff', newMusicOff);
    musicOff = newMusicOff;
  });

  ipcMain.removeAllListeners('getStealth');
  ipcMain.handle('getStealth', () => stealth);
  ipcMain.removeAllListeners('setStealth');
  ipcMain.handle('setStealth', async (event, newStealth: boolean) => {
    await writeGameSettings(musicOff, newStealth, tempDir);
    twitch.setStealth(newStealth);
    store.set('stealth', newStealth);
    stealth = newStealth;
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

  let shouldSetupAndAutoSwitchObs = store.get('setupObs', true) as boolean;

  const obsConnection = new OBSConnection(
    mainWindow,
    path.join(overlayPath, 'default.html'),
    path.join(overlayPath, 'default 2.html'),
    path.join(overlayPath, 'default 34.html'),
  );
  obsConnection.setShouldSetupAndAutoSwitch(shouldSetupAndAutoSwitchObs);
  obsConnection.setMaxDolphins(maxDolphins);
  obsConnection.setDolphinVersion(dolphinVersion);

  ipcMain.removeHandler('getShouldSetupAndAutoSwitchObs');
  ipcMain.handle(
    'getShouldSetupAndAutoSwitchObs',
    () => shouldSetupAndAutoSwitchObs,
  );
  ipcMain.removeHandler('setShouldSetupAndAutoSwitchObs');
  ipcMain.handle(
    'setShouldSetupAndAutoSwitchObs',
    (event, newShouldSetupAndAutoSwitchObs: boolean) => {
      store.set('setupObs', newShouldSetupAndAutoSwitchObs);
      shouldSetupAndAutoSwitchObs = newShouldSetupAndAutoSwitchObs;
      obsConnection.setShouldSetupAndAutoSwitch(shouldSetupAndAutoSwitchObs);
    },
  );

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
    const [newDolphinPath] = openDialogRes.filePaths;
    const dolphinVersionRet = await getDolphinVersion(newDolphinPath);
    if (dolphinVersionRet.dolphinVersionError) {
      throw new Error(dolphinVersionRet.dolphinVersionError);
    }

    dolphinVersion = dolphinVersionRet.dolphinVersion;
    dolphinVersionError = dolphinVersionRet.dolphinVersionError;
    obsConnection.setDolphinVersion(dolphinVersion);

    dolphinPath = newDolphinPath;
    store.set('dolphinPath', dolphinPath);
    const newUserDolphinGFX = await getUserDolphinGFX(dolphinPath);
    await writeUserConfig(
      tempDir,
      newUserDolphinGFX.dolphinIni,
      newUserDolphinGFX.gfxIni,
    );

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

  const originalPathToPlayedMs = new Map<string, number>();
  const playingSets: Map<number, AvailableSet | null> = new Map();
  const tryingPorts = new Set<number>();
  const willNotSpoilOtherSets = (
    prospectiveSet: AvailableSet,
    otherSets: AvailableSet[],
  ) => {
    if (!prospectiveSet.context) {
      return true;
    }

    const playerNames = new Set<string>();
    const slotDisplayNames = new Set<string>();
    otherSets.forEach((playingSet) => {
      if (
        (prospectiveSet.context?.startgg?.phaseGroup.bracketType === 3 &&
          prospectiveSet.context?.startgg?.phaseGroup.id ===
            playingSet.context?.startgg?.phaseGroup.id) ||
        (prospectiveSet.context?.challonge?.tournament.tournamentType ===
          'round robin' &&
          prospectiveSet.context?.challonge?.tournament.slug ===
            playingSet.context?.challonge?.tournament.slug)
      ) {
        return;
      }

      if (prospectiveSet.context?.players && playingSet.context?.players) {
        playingSet.context.players.entrant1.forEach((player) => {
          playerNames.add(player.name);
        });
        playingSet.context.players.entrant2.forEach((player) => {
          playerNames.add(player.name);
        });
      }
      if (playingSet?.context?.scores) {
        playingSet.context.scores[0].slots.forEach((slot) => {
          slot.displayNames.forEach((displayName) => {
            slotDisplayNames.add(displayName);
          });
        });
      }
    });

    if (prospectiveSet.context.players) {
      return (
        prospectiveSet.context.players.entrant1.every(
          (player) => !playerNames.has(player.name),
        ) &&
        prospectiveSet.context.players.entrant2.every(
          (player) => !playerNames.has(player.name),
        )
      );
    }

    return prospectiveSet.context.scores[0].slots.every((slot) =>
      slot.displayNames.every(
        (displayName) => !slotDisplayNames.has(displayName),
      ),
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

  let watchDir = '';
  const dolphins: Map<number, Dolphin> = new Map();
  const gameIndices: Map<number, number> = new Map();
  let mirrorPort = 0;
  let mirrorSet: ApiSet | null = null;
  let mirrorShowScore = store.get('mirrorShowScore', false);
  let mirrorScore: [number, number] = [0, 0];
  let mirrorWatcher: FSWatcher | undefined;
  let lastStartggTournamentName = '';
  let lastStartggTournamentLocation = '';
  let lastStartggEventName = '';
  let lastStartggEventSlug = '';
  let lastStartggPhaseName = '';
  let lastStartggPhaseGroupName = '';
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
    let anyEventHasSiblings = false;
    const phaseIds = new Set<number>();
    let anyPhaseHasSiblings = false;
    const phaseGroupIds = new Set<number>();
    let anyPhaseGroupHasSiblings = false;
    const challongeSlugs = new Set<string>();
    const playingSetsEntries = Array.from(playingSets.entries());
    let representativeStartgg: MainContextStartgg | undefined;
    let representativeChallonge: MainContextChallonge | undefined;
    playingSetsEntries.forEach(([, playingSet]) => {
      const startgg = playingSet?.context?.startgg;
      const challonge = playingSet?.context?.challonge;
      if (startgg) {
        eventSlugs.add(startgg.event.slug);
        anyEventHasSiblings ||= startgg.event.hasSiblings;
        phaseIds.add(startgg.phase.id);
        anyPhaseHasSiblings ||= startgg.phase.hasSiblings;
        phaseGroupIds.add(startgg.phaseGroup.id);
        anyPhaseGroupHasSiblings ||= startgg.phaseGroup.hasSiblings;
      } else if (challonge) {
        challongeSlugs.add(challonge.tournament.slug);
      }
    });
    if (mirrorSet) {
      eventSlugs.add(mirrorSet.eventSlug);
      anyEventHasSiblings ||= mirrorSet.eventHasSiblings;
      phaseIds.add(mirrorSet.phaseId);
      anyPhaseHasSiblings ||= mirrorSet.phaseHasSiblings;
      phaseGroupIds.add(mirrorSet.phaseGroupId);
      anyPhaseGroupHasSiblings ||= mirrorSet.phaseGroupHasSiblings;
    }
    if (playingSetsEntries.length > 0) {
      const entriesWithStartggContexts = playingSetsEntries.filter(
        ([, set]) => set?.context?.startgg,
      );
      if (entriesWithStartggContexts.length > 0) {
        representativeStartgg =
          entriesWithStartggContexts[0][1]!.context!.startgg!;
      }
      const entriesWithChallongeContexts = playingSetsEntries.filter(
        ([, set]) => set?.context?.challonge,
      );
      if (entriesWithChallongeContexts.length > 0) {
        representativeChallonge =
          entriesWithChallongeContexts[0][1]!.context!.challonge!;
      }

      if (representativeStartgg) {
        startggTournamentName = representativeStartgg.tournament.name;
        lastStartggTournamentName = startggTournamentName;
        startggTournamentLocation = representativeStartgg.tournament.location;
        lastStartggTournamentLocation = startggTournamentLocation;
        startggEventName =
          eventSlugs.size === 1 && anyEventHasSiblings
            ? representativeStartgg.event.name
            : '';
        lastStartggEventName = startggEventName;
        lastStartggEventSlug = representativeStartgg.event.slug;
        startggPhaseName =
          phaseIds.size === 1 && anyPhaseHasSiblings
            ? representativeStartgg.phase.name
            : '';
        lastStartggPhaseName = startggPhaseName;
        startggPhaseGroupName =
          phaseGroupIds.size === 1 && anyPhaseGroupHasSiblings
            ? `Pool ${representativeStartgg.phaseGroup.name}`
            : '';
        lastStartggPhaseGroupName = startggPhaseGroupName;
      } else if (representativeChallonge) {
        challongeTournamentName =
          challongeSlugs.size === 1
            ? representativeChallonge.tournament.name
            : '';
        lastChallongeTournamentName = challongeTournamentName;
        lastChallongeTournamentSlug = representativeChallonge.tournament.slug;
      }
      const obsPorts = obsConnection.getPorts();
      playingSetsEntries.forEach(([port, playingSet]) => {
        const setIndex = obsPorts.indexOf(port);
        if (setIndex === -1) {
          return;
        }

        const context = playingSet?.context;
        if (!context) {
          sets[setIndex] = {
            roundName: '',
            bestOf: -1,
            isFinal: false,
            leftPrefixes: [],
            leftNames: [],
            leftPronouns: [],
            leftScore: -1,
            rightPrefixes: [],
            rightNames: [],
            rightPronouns: [],
            rightScore: -1,
            type: OverlaySetType.CONTEXTLESS,
          };
        } else {
          const gameIndex = gameIndices.get(port);
          if (gameIndex === undefined) {
            throw new Error(`no gameIndex for port ${port}`);
          }

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
            type: OverlaySetType.STANDARD,
          };
        }
      });
    }
    if (mirrorPort) {
      const setIndex = Array.from(dolphins.keys())
        .sort((a, b) => a - b)
        .indexOf(mirrorPort);
      if (setIndex === -1) {
        throw new Error(`no dolphin for port ${mirrorPort}`);
      }

      if (!mirrorSet) {
        sets[setIndex] = {
          roundName: '',
          bestOf: -1,
          isFinal: false,
          leftPrefixes: [],
          leftNames: [],
          leftPronouns: [],
          leftScore: -1,
          rightPrefixes: [],
          rightNames: [],
          rightPronouns: [],
          rightScore: -1,
          type: OverlaySetType.LIVE,
        };
      } else {
        if (!representativeStartgg) {
          startggTournamentName = mirrorSet.tournamentName;
          lastStartggTournamentName = startggTournamentName;
          startggTournamentLocation = mirrorSet.tournamentLocation;
          lastStartggTournamentLocation = startggTournamentLocation;
          startggEventName =
            eventSlugs.size === 1 && anyEventHasSiblings
              ? mirrorSet.eventName
              : '';
          lastStartggEventName = startggEventName;
          lastStartggEventSlug = mirrorSet.eventSlug;
          startggPhaseName =
            phaseIds.size === 1 && anyPhaseHasSiblings
              ? mirrorSet.phaseName
              : '';
          lastStartggPhaseName = startggPhaseName;
          startggPhaseGroupName =
            phaseGroupIds.size === 1 && anyPhaseGroupHasSiblings
              ? `Pool ${mirrorSet.phaseGroupName}`
              : '';
          lastStartggPhaseGroupName = startggPhaseGroupName;
        }

        let roundName =
          mirrorSet.phaseGroupBracketType === 3
            ? 'Round Robin'
            : mirrorSet.fullRoundText;
        if (phaseGroupIds.size > 1 && mirrorSet.phaseGroupHasSiblings) {
          roundName = `Pool ${mirrorSet.phaseGroupName}, ${roundName}`;
        }
        if (phaseIds.size > 1 && mirrorSet.phaseHasSiblings) {
          roundName = `${mirrorSet.phaseName}, ${roundName}`;
        }
        if (eventSlugs.size > 1 && mirrorSet.eventHasSiblings) {
          roundName = `${mirrorSet.eventName}, ${roundName}`;
        }
        sets[setIndex] = {
          roundName,
          bestOf: -1,
          isFinal: false,
          leftPrefixes: mirrorSet.entrant1Prefixes,
          leftNames: mirrorSet.entrant1Names,
          leftPronouns: [],
          leftScore: mirrorShowScore ? mirrorScore[0] : -1,
          rightPrefixes: mirrorSet.entrant2Prefixes,
          rightNames: mirrorSet.entrant2Names,
          rightPronouns: [],
          rightScore: mirrorShowScore ? mirrorScore[1] : -1,
          type: OverlaySetType.LIVE,
        };
      }
    }
    let startgg: OverlayStartgg | undefined;
    if (representativeStartgg) {
      startgg = {
        tournamentName: startggTournamentName,
        location: startggTournamentLocation,
        eventName: startggEventName,
        phaseName: startggPhaseName,
        phaseGroupName: startggPhaseGroupName,
      };
    } else if (lastStartggTournamentName) {
      startgg = {
        tournamentName: lastStartggTournamentName,
        location: lastStartggTournamentLocation,
        eventName: lastStartggEventName,
        phaseName: lastStartggPhaseName,
        phaseGroupName: lastStartggPhaseGroupName,
      };
    }
    let challonge: OverlayChallonge | undefined;
    if (representativeChallonge) {
      challonge = {
        tournamentName: challongeTournamentName,
      };
    } else if (lastChallongeTournamentName) {
      challonge = {
        tournamentName: lastChallongeTournamentName,
      };
    }
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
  obsConnection.setConnectionStatusCallback((newConnectionStatus) => {
    if (newConnectionStatus === OBSConnectionStatus.READY) {
      updateOverlayAndTwitchBot();
    }
  });
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
  let expectedTimecodeOffset = 0;
  const timestampsQueue: string[] = [];
  const writeTimestamps = async (
    entrant1Names: string[],
    entrant2Names: string[],
    phaseName: string,
    fullRoundText: string,
    setId: string,
  ) => {
    const timecode = await obsConnection.getTimecode();
    if (timecode) {
      let adjustedTimecode = timecode;
      const timecodeDate = parse(timecode, 'HH:mm:ss', new Date(0));
      const timecodeTotalS = Math.floor(timecodeDate.getTime() / 1000);
      if (Number.isInteger(timecodeTotalS)) {
        const nowS = Math.floor(Date.now() / 1000);
        const timecodeOffset = nowS - timecodeTotalS;
        if (expectedTimecodeOffset === 0) {
          expectedTimecodeOffset = timecodeOffset;
        } else if (timecodeOffset - expectedTimecodeOffset > 2) {
          const adjustedTimecodeTotalS = nowS - expectedTimecodeOffset;
          adjustedTimecode = format(
            new Date(adjustedTimecodeTotalS * 1000),
            'HH:mm:ss',
          );
        }
      }
      const lineParts = [
        getEntrantName(entrant1Names),
        getEntrantName(entrant2Names),
        phaseName,
        fullRoundText,
        timecode,
        '', // base VOD URL
        setId,
        adjustedTimecode,
      ];
      timestampsQueue.push(await writeToString([lineParts]));

      let file: FileHandle | null = null;
      try {
        file = await open(path.join(watchDir, 'timestamps.csv'), 'a');
        while (timestampsQueue.length > 0) {
          await file.write(`${timestampsQueue[0]}\n`);
          timestampsQueue.shift();
        }
      } finally {
        await file?.close();
      }
    }
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

    if (watchDir && set.context) {
      const hasPlayers = Boolean(set.context.players);
      const rendererSet = !hasPlayers ? toRendererSet(set) : null;
      const entrant1Names = hasPlayers
        ? set.context.players!.entrant1.map((player) => player.name)
        : [rendererSet!.context!.namesLeft];
      const entrant2Names = hasPlayers
        ? set.context.players!.entrant2.map((player) => player.name)
        : [rendererSet!.context!.namesRight];
      writeTimestamps(
        entrant1Names,
        entrant2Names,
        set.context.startgg?.phase.name ?? '',
        set.context.startgg?.set.fullRoundText ?? '',
        set.context.startgg?.set.id
          ? set.context.startgg.set.id.toString(10)
          : '',
      );
    }
    sendQueues();
  };
  const isQueueOvertime = (queue: Queue, queues: Queue[]): boolean => {
    if (
      splitByWave &&
      checkOvertime &&
      queues.length > 1 &&
      queue.getShouldCheckOvertime()
    ) {
      if (queue.allottedDurationMs === 0) {
        const ownLiveStartedMs = queue.getLiveStartedMs();
        const newAllottedDurationMs = queues
          .map((mapQueue) => mapQueue.getLiveStartedMs())
          .reduce((minimumDurationMs, liveStartedMs) => {
            const diff = liveStartedMs - ownLiveStartedMs;
            if (diff > 2700000) {
              // at least 45 minutes apart
              return Math.min(minimumDurationMs, diff);
            }
            return minimumDurationMs;
          }, Number.POSITIVE_INFINITY);
        if (Number.isFinite(newAllottedDurationMs)) {
          queue.allottedDurationMs = newAllottedDurationMs;
        }
      }
      if (
        queue.allottedDurationMs > 0 &&
        Date.now() - queue.getPlaybackStartedMs() > queue.allottedDurationMs
      ) {
        return true;
      }
    }
    return false;
  };
  startDolphin = async (port: number) => {
    if (dolphins.get(port)) {
      return Promise.resolve();
    }

    const newDolphin = new Dolphin(dolphinPath, isoPath, tempDir, port);
    newDolphin.on(DolphinEvent.CLOSE, () => {
      if (port === mirrorPort) {
        mirrorPort = 0;
        mirrorSet = null;
        mirrorWatcher?.close();
        mainWindow.webContents.send('mirroring', false);
      }
      const playingSet = playingSets.get(port);
      if (playingSet) {
        playingSet.playing = false;
        if (playingSet.type === SetType.ZIP) {
          deleteZipDir(playingSet, tempDir);
        }
      }
      playingSets.delete(port);

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
      if (playingSet === null) {
        // always stop to release ended file when mirroring
        await newDolphin.stop();
        return;
      }

      if (playingSet) {
        playingSet.playing = false;
        if (failureReason) {
          playingSet.invalidReason = failureReason;
        }
      }
      playingSets.delete(port);

      const maybePlaySets = async (queues: Queue[]): Promise<number> => {
        let setsPlayed = 0;
        const newTailingQueues: Queue[] = [];
        for (const queue of queues) {
          if (!queue.paused) {
            let { nextSet } = queue.peek();
            while (
              nextSet &&
              willNotSpoilOtherSets(nextSet, queue.getPlayingSets())
            ) {
              await playDolphin(queue, nextSet);
              if (
                newTailingQueues.indexOf(queue) === -1 &&
                isQueueOvertime(queue, queues)
              ) {
                newTailingQueues.push(queue);
              }
              setsPlayed += 1;
              if (playingSets.size + tryingPorts.size >= maxDolphins) {
                return setsPlayed;
              }
              nextSet = queue.peek().nextSet;
            }
          }
        }
        if (newTailingQueues.length > 0) {
          for (const queue of newTailingQueues) {
            queueIds.push(
              queueIds.splice(queueIds.indexOf(queue.getId()), 1)[0],
            );
          }
          sendQueues();
        }
        return setsPlayed;
      };
      const setsPlayed = await maybePlaySets(getQueues());
      obsConnection.transition(playingSets);
      if (playingSets.get(port) === undefined) {
        // try to make sure Dolphin releases previous replays
        await newDolphin.stop();
      }
      if (playingSet && playingSet.type === SetType.ZIP) {
        deleteZipDir(playingSet, tempDir);
      }

      if (setsPlayed > 0) {
        return;
      }

      // if we reach here, we didn't play any sets
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
  ipcMain.removeHandler('getStreamOutputActive');
  ipcMain.handle('getStreamOutputActive', () =>
    obsConnection.getStreamOutputActive(),
  );
  ipcMain.removeHandler('connectObs');
  ipcMain.handle('connectObs', async () => {
    await obsConnection.connect(obsSettings);
  });
  ipcMain.removeHandler('startStream');
  ipcMain.handle('startStream', async () => obsConnection.startStream());

  const getQueueFromSet = (set: AvailableSet) => {
    let queueId = '';
    let queueName = 'Unknown';
    let hasWave = false;
    if (splitOption !== SplitOption.NONE && set.context) {
      if (set.context.startgg) {
        if (splitOption === SplitOption.EVENT) {
          queueId = `e:${set.context.startgg.event.slug}`;
          queueName = set.context.startgg.event.name;
        } else {
          queueId = `p:${set.context.startgg.phase.id}`;
          queueName = set.context.startgg.event.hasSiblings
            ? `${set.context.startgg.event.name}, ${set.context.startgg.phase.name}`
            : set.context.startgg.phase.name;
        }
      } else if (set.context.challonge) {
        queueId = `c:${set.context.challonge.tournament.slug}`;
        queueName = set.context.challonge.tournament.name;
      }
    }
    if (splitByWave && set.context?.startgg?.phaseGroup?.waveId) {
      const { waveId } = set.context.startgg.phaseGroup;
      queueId = `${queueId}w:${waveId}`;
      queueName = `${queueName}, waveId: ${waveId}`;
      hasWave = true;
    }
    return { queueId, queueName, hasWave };
  };

  ipcMain.removeHandler('getWatchDir');
  ipcMain.handle('getWatchDir', () => watchDir);

  const startggTournamentSlugs = new Set<string>();
  const maybeAddStartggTournamentSlug = (availableSet: AvailableSet) => {
    const eventSlug = availableSet.context?.startgg?.event.slug;
    if (eventSlug) {
      const end = eventSlug.indexOf('/event/');
      if (end > 11) {
        startggTournamentSlugs.add(eventSlug.slice(11, end));
      }
    }
  };

  const idToApiPhaseGroup = new Map<number, ApiPhaseGroup>();
  const mirroredSetIds = new Set<number>();
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
          mirroredSetIds,
          twitchUserName,
        );
        maybeAddStartggTournamentSlug(newSet);
        const apiPhaseGroup = toApiPhaseGroup(newSet);
        if (apiPhaseGroup) {
          idToApiPhaseGroup.set(apiPhaseGroup.phaseGroupId, apiPhaseGroup);
        }
        const playingEntry = Array.from(playingSets.entries()).find(
          ([, set]) => set && set.originalPath === newSet.originalPath,
        );
        if (playingEntry) {
          newSet.playing = true;
          playingSets.set(playingEntry[0], newSet);
        }

        const { queueId, queueName, hasWave } = getQueueFromSet(newSet);
        const queueIsNew = !idToQueue.has(queueId);
        const queue =
          idToQueue.get(queueId) ?? new Queue(queueId, queueName, hasWave);
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
          queue.setQualifiesToPlayNext(newSet) &&
          willNotSpoilOtherSets(newSet, queue.getPlayingSets())
        ) {
          await playDolphin(queue, newSet);
          // no need for overtime check here, since we're not behind
          obsConnection.transition(playingSets);
        } else {
          queue.maybePlayNext(newSet);
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
          ([, set]) => set && set === setToStop,
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
        if (isQueueOvertime(queue, getQueues())) {
          queueIds.push(queueIds.splice(queueIds.indexOf(queueId), 1)[0]);
          sendQueues();
        }
        obsConnection.transition(playingSets);
      }
    },
  );

  // entrant1Names, entrant2Names, phaseName, fullRoundText, timecode, base VOD URL, setId
  const readTimestampsCsv = () => {
    return new Promise<string[][]>((resolve, reject) => {
      const stream = createReadStream(path.join(watchDir, 'timestamps.csv')).on(
        'error',
        () => {
          resolve([]);
        },
      );
      const rowsInner: string[][] = [];
      parseStream(stream!)
        .on('data', (row) => {
          rowsInner.push(row);
        })
        .on('end', () => resolve(rowsInner))
        .on('error', (err) => reject(err));
    });
  };

  ipcMain.removeHandler('getTimestamps');
  ipcMain.handle('getTimestamps', async () => {
    if (!watchDir) {
      return '';
    }

    try {
      const rows = await readTimestampsCsv();
      return rows
        .map((row) => {
          const namesLeft = row[0];
          const namesRight = row[1];
          const timecode = row[4];
          if (namesLeft && namesRight && timecode) {
            return `${timecode} ${namesLeft} vs ${namesRight}`;
          }
          return '';
        })
        .filter((line) => line.length > 0)
        .join('\n');
    } catch (e: any) {
      return '';
    }
  });

  ipcMain.removeHandler('getSggApiKey');
  ipcMain.handle('getSggApiKey', () => sggApiKey);
  ipcMain.removeHandler('setSggApiKey');
  ipcMain.handle(
    'setSggApiKey',
    (event: IpcMainInvokeEvent, newSggApiKey: string) => {
      if (newSggApiKey) {
        store.set('sggApiKey', newSggApiKey);
        sggApiKey = newSggApiKey;
      }
    },
  );

  ipcMain.removeHandler('setSggVodUrls');
  ipcMain.handle(
    'setSggVodUrls',
    async (event: IpcMainInvokeEvent, baseYoutubeUrl: string) => {
      if (!sggApiKey) {
        throw new Error('Please set start.gg API key.');
      }
      const rows = await readTimestampsCsv();
      if (rows.length === 0) {
        throw new Error('No timestamps.');
      }

      do {
        const thisTimeRows = rows.slice(0, 500);
        const setIdToVodUrl = new Map<string, string>();
        thisTimeRows.forEach((row) => {
          const setId = row[6];
          const timecodeParts = row[4].split(':');
          if (setId && timecodeParts.length === 3) {
            const timecode = `?t=${timecodeParts[0]}h${timecodeParts[1]}m${timecodeParts[2]}s`;
            const vodUrl = baseYoutubeUrl + timecode;
            setIdToVodUrl.set(setId, vodUrl);
          }
        });
        const inner = Array.from(setIdToVodUrl.entries()).map(
          ([setId, vodUrl]) => {
            return `
              setId${setId}: updateVodUrl(setId: ${setId}, vodUrl: "${vodUrl}") {
                id
              }
            `;
          },
        );
        const query = `mutation UpdateVodUrlsMutation {${inner}\n}`;
        let response: Response | undefined;
        try {
          response = await fetch('https://api.start.gg/gql/alpha', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${sggApiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              query,
            }),
          });
        } catch {
          throw new Error('***You may not be connected to the internet***');
        }
        if (!response.ok) {
          let keyErr = '';
          if (response.status === 400) {
            keyErr = ' ***start.gg API key invalid!***';
          } else if (response.status === 401) {
            keyErr = ' ***start.gg API key expired!***';
          }
          throw new Error(
            `${response.status} - ${response.statusText}.${keyErr}`,
          );
        }
        const json = await response.json();
        if (json.errors) {
          throw new Error(json.errors[0].message);
        }
        rows.splice(0, 500);
      } while (rows.length > 0);
    },
  );

  const requeueAll = () => {
    const allSets: AvailableSet[] = [];
    getQueues().forEach((queue) => {
      allSets.push(...queue.getSets());
    });
    idToQueue.clear();
    queueIds.length = 0;
    const idToNewQueue = new Map<
      string,
      { name: string; hasWave: boolean; sets: AvailableSet[] }
    >();
    allSets.forEach((set) => {
      const { queueId, queueName, hasWave } = getQueueFromSet(set);
      if (idToNewQueue.has(queueId)) {
        idToNewQueue.get(queueId)!.sets.push(set);
      } else {
        idToNewQueue.set(queueId, { name: queueName, hasWave, sets: [set] });
      }
    });
    Array.from(idToNewQueue.entries()).forEach(([queueId, newQueue]) => {
      idToQueue.set(
        queueId,
        new Queue(queueId, newQueue.name, newQueue.hasWave, newQueue.sets),
      );
      queueIds.push(queueId);
    });
    getQueues().forEach((queue) => {
      queue.sortSets();
      queue.setCalculatedNextSet();
    });
    sendQueues();
  };

  ipcMain.removeHandler('getSplitOption');
  ipcMain.handle('getSplitOption', () => splitOption);
  ipcMain.removeHandler('setSplitOption');
  ipcMain.handle(
    'setSplitOption',
    (event: IpcMainInvokeEvent, newSplitOption: SplitOption) => {
      if (splitOption !== newSplitOption) {
        store.set('splitOption', newSplitOption);
        splitOption = newSplitOption;
        requeueAll();
      }
    },
  );

  ipcMain.removeHandler('getSplitByWave');
  ipcMain.handle('getSplitByWave', () => splitByWave);
  ipcMain.removeHandler('setSplitByWave');
  ipcMain.handle(
    'setSplitByWave',
    (event: IpcMainInvokeEvent, newSplitByWave: boolean) => {
      if (splitByWave !== newSplitByWave) {
        store.set('splitByWave', newSplitByWave);
        splitByWave = newSplitByWave;
        requeueAll();
      }
    },
  );

  ipcMain.removeHandler('getCheckOvertime');
  ipcMain.handle('getCheckOvertime', () => checkOvertime);
  ipcMain.removeHandler('setCheckOvertime');
  ipcMain.handle('setCheckOvertime', (event, newCheckOvertime: boolean) => {
    store.set('checkOvertime', newCheckOvertime);
    checkOvertime = newCheckOvertime;
  });

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
  ipcMain.removeHandler('setQueuePaused');
  ipcMain.handle(
    'setQueuePaused',
    (event, queueId: string, paused: boolean) => {
      const queue = idToQueue.get(queueId);
      if (!queue) {
        throw new Error('no such queue id');
      }
      queue.paused = paused;
      sendQueues();
    },
  );

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
  ipcMain.handle('getDolphinVersion', () => ({
    dolphinVersion,
    dolphinVersionError,
  }));

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

  let mirrorDir = store.get('mirrorDir', getDefaultMirrorDir());
  const startMirrorWatcher = () => {
    if (!mirrorPort) {
      throw new Error('mirror port not set');
    }

    const normalizedDir =
      process.platform === 'win32'
        ? mirrorDir.split(path.win32.sep).join(path.posix.sep)
        : mirrorDir;
    const glob = `${normalizedDir}/*.slp`;
    watcher = watch(glob, { ignoreInitial: true });
    watcher.on('add', async (newReplayPath) => {
      const mirrorDolphin = dolphins.get(mirrorPort);
      if (!mirrorDolphin) {
        throw new Error(`mirror dolphin not found (port: ${mirrorPort})`);
      }
      mirrorDolphin.mirror(newReplayPath);
    });
  };
  ipcMain.removeHandler('getMirrorDir');
  ipcMain.handle('getMirrorDir', () => mirrorDir);
  ipcMain.removeHandler('chooseMirrorDir');
  ipcMain.handle('chooseMirrorDir', async () => {
    const openDialogRes = await dialog.showOpenDialog({
      properties: ['openDirectory', 'showHiddenFiles'],
    });
    if (openDialogRes.canceled) {
      return mirrorDir;
    }
    const [newMirrorDir] = openDialogRes.filePaths;
    if (newMirrorDir === mirrorDir) {
      return mirrorDir;
    }
    mirrorDir = newMirrorDir;
    store.set('mirrorDir', mirrorDir);

    if (mirrorWatcher) {
      await mirrorWatcher.close();
      startMirrorWatcher();
    }

    return mirrorDir;
  });
  ipcMain.removeHandler('getIsMirroring');
  ipcMain.handle('getIsMirroring', () => mirrorPort > 0);
  ipcMain.removeHandler('startMirroring');
  ipcMain.handle('startMirroring', (): boolean => {
    if (mirrorPort) {
      return true;
    }

    const eligiblePorts = new Set(dolphins.keys());
    Array.from(playingSets.keys()).forEach((playingPort) => {
      eligiblePorts.delete(playingPort);
    });
    if (eligiblePorts.size === 0) {
      return false;
    }

    [mirrorPort] = Array.from(eligiblePorts.keys()).sort((a, b) => a - b);
    playingSets.set(mirrorPort, null);
    startMirrorWatcher();
    obsConnection.transition(playingSets);
    sendQueues();
    updateOverlayAndTwitchBot();
    return true;
  });
  ipcMain.removeHandler('stopMirroring');
  ipcMain.handle('stopMirroring', async () => {
    await mirrorWatcher?.close();
    dolphins.get(mirrorPort)?.stop();
    playingSets.delete(mirrorPort);
    mirrorPort = 0;
    obsConnection.transition(playingSets);
    sendQueues();
    mirrorSet = null;
    updateOverlayAndTwitchBot();
  });
  ipcMain.removeHandler('getMirrorShowScore');
  ipcMain.handle('getMirrorShowScore', () => mirrorShowScore);
  ipcMain.removeHandler('setMirrorShowScore');
  ipcMain.handle('setMirrorShowScore', (event, newMirrorShowScore: boolean) => {
    store.set('mirrorShowScore', newMirrorShowScore);
    mirrorShowScore = newMirrorShowScore;
    updateOverlayAndTwitchBot();
  });
  ipcMain.removeHandler('getMirrorScore');
  ipcMain.handle('getMirrorScore', () => mirrorScore);
  ipcMain.removeHandler('setMirrorScore');
  ipcMain.handle(
    'setMirrorScore',
    (event, newMirrorScore: [number, number]) => {
      mirrorScore = newMirrorScore;
      updateOverlayAndTwitchBot();
    },
  );

  ipcMain.removeHandler('loadPhaseGroups');
  ipcMain.handle(
    'loadPhaseGroups',
    async (ev: IpcMainInvokeEvent, slug: string) => {
      const tournamentJson = await wrappedFetch(
        `https://api.start.gg/tournament/${slug}?expand[]=event`,
      );
      const events = tournamentJson.entities.event.filter(
        (event: any) => event.videogameId === 1,
      );
      await Promise.all(
        events.map(async (event: any) => {
          const eventJson = await wrappedFetch(
            `https://api.start.gg/${event.slug}?expand[]=phase`,
          );
          await Promise.all(
            eventJson.entities.phase.map(async (phase: any) => {
              const phaseJson = await wrappedFetch(
                `https://api.start.gg/phase/${phase.id}?expand[]=groups`,
              );
              phaseJson.entities.groups.forEach((group: any) => {
                idToApiPhaseGroup.set(group.id, {
                  tournamentName: tournamentJson.entities.tournament.name,
                  tournamentLocation:
                    tournamentJson.entities.tournament.locationDisplayName,
                  eventSlug: event.slug,
                  eventName: event.name,
                  eventHasSiblings: events.length > 1,
                  phaseId: phase.id,
                  phaseName: phase.name,
                  phaseHasSiblings: eventJson.entities.phase.length > 1,
                  phaseGroupId: group.id,
                  phaseGroupName: group.displayIdentifier,
                  phaseGroupHasSiblings: phaseJson.entities.groups.length > 1,
                  phaseGroupBracketType: group.groupTypeId,
                });
              });
            }),
          );
        }),
      );
    },
  );

  ipcMain.removeHandler('getPhaseGroups');
  ipcMain.handle('getPhaseGroups', () => ({
    phaseGroups: Array.from(idToApiPhaseGroup.values()),
    tournamentSlugs: Array.from(startggTournamentSlugs.values()),
  }));

  const idToApiSet = new Map<number, ApiSet>();
  ipcMain.removeHandler('getPendingSets');
  ipcMain.handle(
    'getPendingSets',
    async (event: IpcMainInvokeEvent, phaseGroupId: number) => {
      const phaseGroup = idToApiPhaseGroup.get(phaseGroupId);
      if (!phaseGroup) {
        throw new Error(`no known phaseGroup for id ${phaseGroupId}`);
      }

      const json = await wrappedFetch(
        `https://api.start.gg/phase_group/${phaseGroupId}?expand[]=sets&expand[]=entrants`,
      );
      const { entrants } = json.entities;
      const { sets } = json.entities;
      if (
        !Array.isArray(entrants) ||
        entrants.length === 0 ||
        !Array.isArray(sets) ||
        sets.length === 0
      ) {
        return [];
      }

      const pendingSets = sets.filter((set: any) => set.state !== 3);
      if (pendingSets.length === 0) {
        return [];
      }

      const idToEntrantNames = new Map<number, string[]>();
      const idToEntrantPrefixes = new Map<number, string[]>();
      entrants.forEach((entrant: any) => {
        const { id: entrantId } = entrant;
        if (!Number.isInteger(entrantId)) {
          return;
        }

        const apiParticipants = Array.from(
          Object.values(entrant.mutations.participants),
        );
        const entrantNames = apiParticipants.map(
          (participant: any) => participant.gamerTag,
        );
        if (entrantNames.length > 0) {
          idToEntrantNames.set(entrantId, entrantNames);
        }
        const entrantPrefixes = apiParticipants.map(
          (participant: any) => participant.prefix ?? '',
        );
        if (entrantPrefixes.length > 0) {
          idToEntrantPrefixes.set(entrantId, entrantPrefixes);
        }
      });

      idToApiSet.clear();
      const retSets: ApiSet[] = [];
      pendingSets.forEach((set: any) => {
        const entrant1Names = idToEntrantNames.get(set.entrant1Id);
        const entrant1Prefixes = idToEntrantPrefixes.get(set.entrant1Id);
        const entrant2Names = idToEntrantNames.get(set.entrant2Id);
        const entrant2Prefixes = idToEntrantPrefixes.get(set.entrant2Id);
        if (
          Number.isInteger(set.id) &&
          set.id > 0 &&
          entrant1Names &&
          entrant1Prefixes &&
          entrant2Names &&
          entrant2Prefixes
        ) {
          const retSet: ApiSet = {
            ...phaseGroup,
            id: set.id,
            entrant1Names,
            entrant1Prefixes,
            entrant2Names,
            entrant2Prefixes,
            fullRoundText: set.fullRoundText,
          };
          idToApiSet.set(retSet.id, retSet);
          retSets.push(retSet);
        }
      });
      return retSets;
    },
  );

  ipcMain.removeHandler('getMirrorSet');
  ipcMain.handle('getMirrorSet', () => mirrorSet);

  ipcMain.removeHandler('setMirrorSet');
  ipcMain.handle(
    'setMirrorSet',
    (event: IpcMainInvokeEvent, setId: number | null) => {
      if (!mirrorPort) {
        return;
      }

      if (setId === null) {
        mirrorSet = null;
        updateOverlayAndTwitchBot();
        return;
      }

      const set = idToApiSet.get(setId);
      if (!set) {
        throw new Error(`no known set for id: ${setId}`);
      }

      mirrorSet = set;
      mirroredSetIds.add(setId);
      if (watchDir) {
        writeTimestamps(
          set.entrant1Names,
          set.entrant2Names,
          set.phaseName,
          set.fullRoundText,
          set.id.toString(10),
        );
      }
      updateOverlayAndTwitchBot();
    },
  );

  ipcMain.removeHandler('getVersion');
  ipcMain.handle('getVersion', () => app.getVersion());

  ipcMain.removeHandler('getLatestVersion');
  ipcMain.handle('getLatestVersion', async () => {
    const json = await wrappedFetch(
      'https://api.github.com/repos/jmlee337/auto-slp-player/releases/latest',
    );
    return json.tag_name;
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

  const onWillQuit = (event: Electron.Event) => {
    event.preventDefault();
    (async () => {
      const promises = [twitch.destroy()];
      if (playingSets.size > 0) {
        promises.push(
          ...Array.from(playingSets).map(async ([port, playingSet]) => {
            try {
              if (playingSet) {
                await deleteZipDir(playingSet, tempDir);
              }
            } finally {
              playingSets.delete(port);
            }
          }),
        );
      }
      if (dolphins.size > 0) {
        for (const [port, dolphin] of dolphins) {
          dolphin.removeAllListeners();
          dolphin.close();
          dolphins.delete(port);
        }
      }
      await Promise.allSettled(promises);
      app.removeListener('will-quit', onWillQuit);
      app.quit();
    })();
  };
  app.on('will-quit', onWillQuit);

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
