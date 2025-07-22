import OBSWebSocket, { RequestBatchRequest } from 'obs-websocket-js';
import { BrowserWindow } from 'electron';
import {
  AvailableSet,
  OBSConnectionStatus,
  OBSSettings,
} from '../common/types';
import { Dolphin } from './dolphin';

const BG_IMAGE_INPUT_NAME = 'BG Image';
const BG_COLOR_INPUT_NAME = 'BG Color';
const CHAT_INPUT_NAME = 'Chat';

async function timeout(ms: number) {
  await new Promise<void>((resolve) => {
    setTimeout(() => {
      resolve();
    }, ms);
  });
}

const exepctedSceneNameToOverlayName = new Map([
  ['quad 0', 'Overlay 01'],
  ['quad 1', 'Overlay 01'],
  ['quad 2 12', 'Overlay 2'],
  ['quad 2 13', 'Overlay 2'],
  ['quad 2 14', 'Overlay 2'],
  ['quad 2 23', 'Overlay 2'],
  ['quad 2 24', 'Overlay 2'],
  ['quad 2 34', 'Overlay 2'],
  ['quad 3', 'Overlay 34'],
  ['quad 4', 'Overlay 34'],
]);

export default class OBSConnection {
  private connectionStatus: OBSConnectionStatus;

  private dolphinPorts: number[];

  private dolphinVersionPromise: Promise<string> | null;

  private mainWindow: BrowserWindow;

  private maxDolphins: number;

  private obsWebSocket: OBSWebSocket | null;

  private portToPid: Map<number, number>;

  private portToInputName: Map<number, string>;

  private sceneNameToInputNameToSceneItemId: Map<string, Map<string, number>>;

  private streamOutputActive: boolean;

  private overlay01Path: string;

  private overlay2Path: string;

  private overlay34Path: string;

  private shouldSetupAndAutoSwitch: boolean;

  constructor(
    mainWindow: BrowserWindow,
    overlay01Path: string,
    overlay2Path: string,
    overlay34Path: string,
  ) {
    this.mainWindow = mainWindow;
    this.overlay01Path = overlay01Path;
    this.overlay2Path = overlay2Path;
    this.overlay34Path = overlay34Path;

    this.connectionStatus = OBSConnectionStatus.OBS_NOT_CONNECTED;
    this.dolphinPorts = [];
    this.dolphinVersionPromise = null;
    this.maxDolphins = 0;
    this.obsWebSocket = null;
    this.portToPid = new Map();
    this.portToInputName = new Map();
    this.sceneNameToInputNameToSceneItemId = new Map();
    this.streamOutputActive = false;
    this.shouldSetupAndAutoSwitch = false;
  }

  setShouldSetupAndAutoSwitch(newShouldSetupAndAutoSwitch: boolean) {
    this.shouldSetupAndAutoSwitch = newShouldSetupAndAutoSwitch;
    if (this.shouldSetupAndAutoSwitch) {
      this.setupObsScenesAndSources();
    }
  }

  setDolphinVersionPromise(dolphinVersionPromise: Promise<string>) {
    this.dolphinVersionPromise = dolphinVersionPromise;
  }

  getConnectionStatus() {
    return this.connectionStatus;
  }

  private setConnectionStatus(
    connectionStatus: OBSConnectionStatus,
    errMessage?: string,
  ) {
    this.connectionStatus = connectionStatus;
    this.mainWindow.webContents.send(
      'obsConnectionStatus',
      this.connectionStatus,
      errMessage,
    );
  }

  private async getPrefix() {
    const dolphinVersion = await this.dolphinVersionPromise;
    return `Faster Melee - Slippi (${dolphinVersion}) - Playback | `;
  }

  setMaxDolphins(maxDophins: number) {
    this.maxDolphins = maxDophins;
  }

  setDolphins(dolphins: Map<number, Dolphin>) {
    this.dolphinPorts = Array.from(dolphins.keys()).sort((a, b) => a - b);
    this.portToPid = new Map(
      Array.from(dolphins.entries()).map(([port, dolphin]) => [
        port,
        dolphin.pid,
      ]),
    );
    if (this.connectionStatus !== OBSConnectionStatus.OBS_NOT_CONNECTED) {
      this.setConnectionStatus(OBSConnectionStatus.OBS_NOT_SETUP);
      this.setupObsScenesAndSources();
    }
  }

  private async setupObsScenesAndSources(): Promise<boolean> {
    if (
      this.obsWebSocket === null ||
      this.connectionStatus === OBSConnectionStatus.OBS_NOT_CONNECTED ||
      !(
        process.platform === 'win32' ||
        process.platform === 'darwin' ||
        process.platform === 'linux'
      )
    ) {
      return false;
    }

    if (!this.shouldSetupAndAutoSwitch) {
      this.setConnectionStatus(OBSConnectionStatus.READY);
      return true;
    }

    if (!this.dolphinVersionPromise) {
      return false;
    }

    const { baseHeight, baseWidth } =
      await this.obsWebSocket.call('GetVideoSettings');
    if (baseHeight !== 1080 || baseWidth !== 1920) {
      this.setConnectionStatus(
        OBSConnectionStatus.OBS_NOT_SETUP,
        'OBS base/canvas resolution must be 1920x1080',
      );
      return false;
    }

    // scene collection
    const { sceneCollections } = await this.obsWebSocket.call(
      'GetSceneCollectionList',
    );
    let sceneCollectionIsNew = false;
    if (!sceneCollections.includes('auto-slp-player')) {
      await this.obsWebSocket.call('CreateSceneCollection', {
        sceneCollectionName: 'auto-slp-player',
      });
      sceneCollectionIsNew = true;
    }
    await this.obsWebSocket.call('SetCurrentSceneCollection', {
      sceneCollectionName: 'auto-slp-player',
    });

    // scene names
    // { sceneIndex: 0, sceneName: 'Scene', sceneUuid: 'ab5c6ca6-0bed-4a02-97c1-dd40215ff11f' }
    const { scenes } = await this.obsWebSocket.call('GetSceneList');
    const scenesSet = new Set(scenes.map((scene) => scene.sceneName as string));
    const missingSceneNames: string[] = [];
    for (const expectedSceneName of exepctedSceneNameToOverlayName.keys()) {
      if (!scenesSet.has(expectedSceneName)) {
        missingSceneNames.push(expectedSceneName);
      }
    }
    missingSceneNames.reverse();
    for (const sceneName of missingSceneNames) {
      await this.obsWebSocket.call('CreateScene', { sceneName });

      let bgImageSceneItemId = 0;
      if (
        (
          await this.obsWebSocket.call('GetInputList', {
            inputKind: 'image_source',
          })
        ).inputs.find((input) => input.inputName === BG_IMAGE_INPUT_NAME)
      ) {
        bgImageSceneItemId = (
          await this.obsWebSocket.call('CreateSceneItem', {
            sceneName,
            sourceName: BG_IMAGE_INPUT_NAME,
          })
        ).sceneItemId;
      } else {
        bgImageSceneItemId = (
          await this.obsWebSocket.call('CreateInput', {
            sceneName,
            inputName: BG_IMAGE_INPUT_NAME,
            inputKind: 'image_source',
          })
        ).sceneItemId;
      }
      await this.obsWebSocket.call('SetSceneItemLocked', {
        sceneName,
        sceneItemId: bgImageSceneItemId,
        sceneItemLocked: true,
      });

      let bgColorSceneItemId = 0;
      if (
        (
          await this.obsWebSocket.call('GetInputList', {
            inputKind: 'color_source_v3',
          })
        ).inputs.find((input) => input.inputName === BG_COLOR_INPUT_NAME)
      ) {
        bgColorSceneItemId = (
          await this.obsWebSocket.call('CreateSceneItem', {
            sceneName,
            sourceName: BG_COLOR_INPUT_NAME,
          })
        ).sceneItemId;
      } else {
        bgColorSceneItemId = (
          await this.obsWebSocket.call('CreateInput', {
            sceneName,
            inputName: BG_COLOR_INPUT_NAME,
            inputKind: 'color_source_v3',
            inputSettings: {
              color: 0x00000000, // ARGB
            },
          })
        ).sceneItemId;
      }
      await this.obsWebSocket.call('SetSceneItemLocked', {
        sceneName,
        sceneItemId: bgColorSceneItemId,
        sceneItemLocked: true,
      });

      const overlayName = exepctedSceneNameToOverlayName.get(sceneName)!;
      const { inputs } = await this.obsWebSocket.call('GetInputList', {
        inputKind: 'browser_source',
      });
      let overlaySceneItemId = 0;
      if (inputs.find((input) => input.inputName === overlayName)) {
        overlaySceneItemId = (
          await this.obsWebSocket.call('CreateSceneItem', {
            sceneName,
            sourceName: overlayName,
          })
        ).sceneItemId;
      } else {
        const inputSettings = {
          is_local_file: true,
        };
        if (overlayName === 'Overlay 01') {
          Object.assign(inputSettings, {
            height: 1080,
            local_file: this.overlay01Path,
            width: 606,
          });
        } else if (overlayName === 'Overlay 2') {
          Object.assign(inputSettings, {
            height: 291,
            local_file: this.overlay2Path,
            width: 1920,
          });
        } else if (overlayName === 'Overlay 34') {
          Object.assign(inputSettings, {
            height: 1080,
            local_file: this.overlay34Path,
            width: 606,
          });
        } else {
          throw Error;
        }
        overlaySceneItemId = (
          await this.obsWebSocket.call('CreateInput', {
            sceneName,
            inputName: overlayName,
            inputKind: 'browser_source',
            inputSettings,
          })
        ).sceneItemId;
      }
      let positionX = 0;
      let positionY = 0;
      if (overlayName === 'Overlay 01') {
        positionX = 1314;
      } else if (overlayName === 'Overlay 2') {
        positionY = 789;
      } else if (overlayName === 'Overlay 34') {
        positionX = 657;
      }
      await this.obsWebSocket.call('SetSceneItemTransform', {
        sceneName,
        sceneItemId: overlaySceneItemId,
        sceneItemTransform: { positionX, positionY },
      });
      await this.obsWebSocket.call('SetSceneItemLocked', {
        sceneName,
        sceneItemId: overlaySceneItemId,
        sceneItemLocked: true,
      });
    }
    if (sceneCollectionIsNew) {
      await this.obsWebSocket.call('RemoveScene', { sceneName: 'Scene' });
    }

    let inputKind = '';
    if (process.platform === 'darwin') {
      inputKind = 'screen_capture';
    } else if (process.platform === 'linux') {
      inputKind = 'vkcapture-source';
    } else {
      // windows
      inputKind = 'game_capture';
    }
    const { inputs } = await this.obsWebSocket.call('GetInputList', {
      inputKind,
    });
    const inputNames = new Set(
      inputs.map((input) => input.inputName as string),
    );
    const inputNameToInputUuid = new Map(
      inputs.map((input) => [
        input.inputName as string,
        input.inputUuid as string,
      ]),
    );
    const missingInputNames: string[] = [];
    const expectedInputNames = [
      'Slippi Dolphin 1',
      'Slippi Dolphin 2',
      'Slippi Dolphin 3',
      'Slippi Dolphin 4',
    ].slice(0, this.maxDolphins);
    expectedInputNames.forEach((expectedInputName) => {
      if (!inputNames.has(expectedInputName)) {
        missingInputNames.push(expectedInputName);
      }
    });
    missingInputNames.reverse();
    const prefix = await this.getPrefix();
    if (process.platform === 'darwin') {
      for (const inputName of missingInputNames) {
        const { inputUuid } = await this.obsWebSocket.call('CreateInput', {
          sceneName: 'quad 1',
          inputName,
          inputKind,
          inputSettings: {
            show_cursor: false,
            show_hidden_windows: true,
            type: 1,
          },
        });
        inputNameToInputUuid.set(inputName, inputUuid);
        await this.obsWebSocket.call('CreateSourceFilter', {
          sourceName: inputName,
          filterName: 'Crop/Pad',
          filterKind: 'crop_filter',
          filterSettings: { top: 106, bottom: 48, relative: true },
        });
      }

      const getWindows = async (obsWebSocket: OBSWebSocket) => {
        for (let i = 1; i < expectedInputNames.length; i += 1) {
          await obsWebSocket.call('GetInputPropertiesListPropertyItems', {
            inputName: expectedInputNames[i],
            propertyName: 'window',
          });
        }
        const { propertyItems } = await obsWebSocket.call(
          'GetInputPropertiesListPropertyItems',
          {
            inputName: expectedInputNames[0],
            propertyName: 'window',
          },
        );
        const startsWith = `[Slippi Dolphin] ${prefix}`;
        return propertyItems
          .filter((propertyItem) => {
            const itemName = propertyItem.itemName as string;
            if (!itemName.startsWith(startsWith)) {
              return false;
            }
            if (!itemName.slice(-5).match('[0-9][0-9][0-9][0-9][0-9]')) {
              return false;
            }
            return true;
          })
          .map((propertyItem) => ({
            port: parseInt((propertyItem.itemName as string).slice(-5), 10),
            window: propertyItem.itemValue as number,
          }));
      };
      let retries = 0;
      let windows: { port: number; window: number }[] = [];
      while (windows.length < this.maxDolphins) {
        if (retries === 4) {
          this.setConnectionStatus(
            OBSConnectionStatus.OBS_NOT_SETUP,
            'Must open all dolphins',
          );
          return false;
        }
        if (retries > 0) {
          await timeout(1000 * 2 ** (retries - 1));
        }
        windows = (await getWindows(this.obsWebSocket)).sort(
          (a, b) => a.port - b.port,
        );
        retries += 1;
      }
      this.portToInputName.clear();
      for (let i = 0; i < this.maxDolphins; i += 1) {
        await this.obsWebSocket.call('SetInputSettings', {
          inputName: expectedInputNames[i],
          inputSettings: { window: windows[i].window },
        });
        this.portToInputName.set(windows[i].port, expectedInputNames[i]);
      }
    } else if (process.platform === 'linux') {
      for (const inputName of missingInputNames) {
        const { inputUuid } = await this.obsWebSocket.call('CreateInput', {
          sceneName: 'quad 1',
          inputName,
          inputKind,
          inputSettings: {
            show_cursor: false,
          },
        });
        inputNameToInputUuid.set(inputName, inputUuid);
      }
      for (const expectedInputName of expectedInputNames) {
        const { propertyItems } = await this.obsWebSocket.call(
          'GetInputPropertiesListPropertyItems',
          { inputName: expectedInputName, propertyName: 'window' },
        );
        if (
          propertyItems.every(
            (propertyItem) => propertyItem.itemValue !== 'dolphin-emu',
          )
        ) {
          this.setConnectionStatus(
            OBSConnectionStatus.OBS_NOT_SETUP,
            'Could not find Slippi Dolphin (dolphin-emu)',
          );
          return false;
        }

        await this.obsWebSocket.call('SetInputSettings', {
          inputName: expectedInputName,
          inputSettings: { window: 'dolphin-emu' },
        });
      }
      for (let i = 1; i < expectedInputNames.length; i += 1) {
        await this.obsWebSocket.call('GetInputPropertiesListPropertyItems', {
          inputName: expectedInputNames[i],
          propertyName: 'pid',
        });
      }
      const { propertyItems } = await this.obsWebSocket.call(
        'GetInputPropertiesListPropertyItems',
        {
          inputName: expectedInputNames[0],
          propertyName: 'pid',
        },
      );
      const presentPids = new Set(
        propertyItems
          .filter(
            (propertyItem) =>
              propertyItem.itemValue &&
              Number.isInteger(propertyItem.itemValue),
          )
          .map((propertyItem) => propertyItem.itemValue as number),
      );
      const portAndPids = Array.from(this.portToPid).sort(([a], [b]) => a - b);
      if (portAndPids.length < this.maxDolphins) {
        this.setConnectionStatus(
          OBSConnectionStatus.OBS_NOT_SETUP,
          'Must open all dolphins',
        );
        return false;
      }
      for (const [port, pid] of portAndPids) {
        if (!presentPids.has(pid)) {
          this.setConnectionStatus(
            OBSConnectionStatus.OBS_NOT_SETUP,
            `Could not find Slippi Dolphin for port ${port} and PID ${pid}`,
          );
          return false;
        }
      }
      for (let i = 0; i < this.maxDolphins; i += 1) {
        const [port, pid] = portAndPids[i];
        await this.obsWebSocket.call('SetInputSettings', {
          inputName: expectedInputNames[i],
          inputSettings: { pid },
        });
        this.portToInputName.set(port, expectedInputNames[i]);
      }
    } else {
      // windows
      for (const inputName of missingInputNames) {
        const { inputUuid } = await this.obsWebSocket.call('CreateInput', {
          sceneName: 'quad 1',
          inputName,
          inputKind,
          inputSettings: {
            capture_audio: true,
            capture_cursor: false,
            capture_mode: 'window',
            priority: 1,
            show_cursor: false,
          },
        });
        inputNameToInputUuid.set(inputName, inputUuid);
      }

      const getWindows = async (obsWebSocket: OBSWebSocket) => {
        for (let i = 1; i < expectedInputNames.length; i += 1) {
          await obsWebSocket.call('GetInputPropertiesListPropertyItems', {
            inputName: expectedInputNames[i],
            propertyName: 'window',
          });
        }
        const { propertyItems } = await obsWebSocket.call(
          'GetInputPropertiesListPropertyItems',
          {
            inputName: expectedInputNames[0],
            propertyName: 'window',
          },
        );
        const startsWith = `[Slippi Dolphin.exe]: ${prefix}`;
        return propertyItems
          .filter((propertyItem) => {
            const itemName = propertyItem.itemName as string;
            if (!itemName.startsWith(startsWith)) {
              return false;
            }
            if (!itemName.slice(-5).match('[0-9][0-9][0-9][0-9][0-9]')) {
              return false;
            }
            return true;
          })
          .map((propertyItem) => ({
            port: parseInt((propertyItem.itemName as string).slice(-5), 10),
            window: propertyItem.itemValue as string,
          }));
      };
      let retries = 0;
      let windows: { port: number; window: string }[] = [];
      while (windows.length < this.maxDolphins) {
        if (retries === 4) {
          this.setConnectionStatus(
            OBSConnectionStatus.OBS_NOT_SETUP,
            'Must open all dolphins',
          );
          return false;
        }
        if (retries > 0) {
          await timeout(1000 * 2 ** (retries - 1));
        }
        windows = (await getWindows(this.obsWebSocket)).sort(
          (a, b) => a.port - b.port,
        );
        retries += 1;
      }
      this.portToInputName.clear();
      for (let i = 0; i < this.maxDolphins; i += 1) {
        await this.obsWebSocket.call('SetInputSettings', {
          inputName: expectedInputNames[i],
          inputSettings: { window: windows[i].window },
        });
        this.portToInputName.set(windows[i].port, expectedInputNames[i]);
      }
    }
    if (process.platform === 'darwin' || process.platform === 'win32') {
      for (const inputName of expectedInputNames) {
        await this.obsWebSocket.call('SetInputVolume', {
          inputName,
          inputVolumeDb: -6,
        });
      }
    }
    if (
      !(
        await this.obsWebSocket.call('GetInputList', {
          inputKind: 'browser_source',
        })
      ).inputs.find((input) => input.inputName === CHAT_INPUT_NAME)
    ) {
      const { inputUuid } = await this.obsWebSocket.call('CreateInput', {
        sceneName: 'quad 0',
        inputName: CHAT_INPUT_NAME,
        inputKind: 'browser_source',
        inputSettings: {
          height: 291,
          width: 606,
          url: '',
        },
      });
      inputNameToInputUuid.set(CHAT_INPUT_NAME, inputUuid);
    }

    const sceneNameToExpectedSourceNames = new Map([
      ['quad 0', []],
      ['quad 1', [...expectedInputNames]],
    ]);
    if (this.maxDolphins > 1) {
      sceneNameToExpectedSourceNames.set('quad 2 12', [
        'Slippi Dolphin 1',
        'Slippi Dolphin 2',
      ]);
    }
    if (this.maxDolphins > 2) {
      sceneNameToExpectedSourceNames.set('quad 2 13', [
        'Slippi Dolphin 1',
        'Slippi Dolphin 3',
      ]);
      sceneNameToExpectedSourceNames.set('quad 2 23', [
        'Slippi Dolphin 2',
        'Slippi Dolphin 3',
      ]);
      sceneNameToExpectedSourceNames.set('quad 3', [...expectedInputNames]);
    }
    if (this.maxDolphins > 3) {
      sceneNameToExpectedSourceNames.set('quad 2 14', [
        'Slippi Dolphin 1',
        'Slippi Dolphin 4',
      ]);
      sceneNameToExpectedSourceNames.set('quad 2 24', [
        'Slippi Dolphin 2',
        'Slippi Dolphin 4',
      ]);
      sceneNameToExpectedSourceNames.set('quad 2 34', [
        'Slippi Dolphin 3',
        'Slippi Dolphin 4',
      ]);
      sceneNameToExpectedSourceNames.set('quad 4', [...expectedInputNames]);
    }
    for (const [
      sceneName,
      expectedSourceNames,
    ] of sceneNameToExpectedSourceNames.entries()) {
      const { sceneItems } = await this.obsWebSocket.call('GetSceneItemList', {
        sceneName,
      });
      const sourceNameToSceneItemId = new Map(
        sceneItems.map((sceneItem) => [
          sceneItem.sourceName as string,
          sceneItem.sceneItemId as number,
        ]),
      );
      const missingSourceNames: string[] = [];
      if (!sourceNameToSceneItemId.has(CHAT_INPUT_NAME)) {
        missingSourceNames.push(CHAT_INPUT_NAME);
      }
      expectedSourceNames.forEach((expectedSourceName) => {
        if (!sourceNameToSceneItemId.has(expectedSourceName)) {
          missingSourceNames.push(expectedSourceName);
        }
      });
      missingSourceNames.reverse();
      for (const sourceName of missingSourceNames) {
        const { sceneItemId } = await this.obsWebSocket!.call(
          'CreateSceneItem',
          {
            sceneName,
            sourceName,
          },
        );
        sourceNameToSceneItemId.set(sourceName, sceneItemId);
      }
      this.sceneNameToInputNameToSceneItemId.set(
        sceneName,
        sourceNameToSceneItemId,
      );

      const setTransforms = async (obsWebSocket: OBSWebSocket) => {
        for (let i = 0; i < expectedSourceNames.length; i += 1) {
          const sceneItemId = sourceNameToSceneItemId.get(
            expectedSourceNames[i],
          )!;
          await obsWebSocket.call('SetSceneItemLocked', {
            sceneName,
            sceneItemId,
            sceneItemLocked: false,
          });
          const { sourceHeight, sourceWidth } = (
            await obsWebSocket.call('GetSceneItemTransform', {
              sceneName,
              sceneItemId,
            })
          ).sceneItemTransform as { sourceHeight: number; sourceWidth: number };
          if (sourceHeight <= 1 || sourceWidth <= 1) {
            return false;
          }
          if (sceneName === 'quad 1') {
            await this.obsWebSocket!.call('SetSceneItemTransform', {
              sceneName,
              sceneItemId,
              sceneItemTransform: {
                positionX: 0,
                positionY: 0,
                scaleX: 1314 / sourceWidth,
                scaleY: 1080 / sourceHeight,
              },
            });
          } else if (sceneName.startsWith('quad 2')) {
            await this.obsWebSocket!.call('SetSceneItemTransform', {
              sceneName,
              sceneItemId,
              sceneItemTransform: {
                positionX: i === 0 ? 0 : 960,
                positionY: 0,
                scaleX: 960 / sourceWidth,
                scaleY: 789 / sourceHeight,
              },
            });
          } else {
            await this.obsWebSocket!.call('SetSceneItemTransform', {
              sceneName,
              sceneItemId,
              sceneItemTransform: {
                positionX: i % 2 === 0 ? 0 : 1263,
                positionY: i < 2 ? 0 : 540,
                scaleX: 657 / sourceWidth,
                scaleY: 540 / sourceHeight,
              },
            });
          }
          await this.obsWebSocket!.call('SetSceneItemLocked', {
            sceneName,
            sceneItemId,
            sceneItemLocked: true,
          });
        }
        return true;
      };
      let retries = 0;
      let setTransformsSucceeded = false;
      while (!setTransformsSucceeded) {
        if (retries === 6) {
          this.setConnectionStatus(
            OBSConnectionStatus.OBS_NOT_SETUP,
            'OBS failed to capture Slippi Dolphin',
          );
          return false;
        }
        if (retries > 0) {
          await timeout(1000 * 2 ** (retries - 1));
        }
        setTransformsSucceeded = await setTransforms(this.obsWebSocket);
        retries += 1;
      }

      const chatSceneItemId = sourceNameToSceneItemId.get(CHAT_INPUT_NAME)!;
      await this.obsWebSocket.call('SetSceneItemLocked', {
        sceneName,
        sceneItemId: chatSceneItemId,
        sceneItemLocked: false,
      });
      await this.obsWebSocket!.call('SetSceneItemTransform', {
        sceneName,
        sceneItemId: chatSceneItemId,
        sceneItemTransform: {
          positionX:
            sceneName === 'quad 0' || sceneName === 'quad 1' ? 1314 : 657,
          positionY: 789,
        },
      });
      await this.obsWebSocket!.call('SetSceneItemLocked', {
        sceneName,
        sceneItemId: chatSceneItemId,
        sceneItemLocked: true,
      });
    }
    this.setConnectionStatus(OBSConnectionStatus.READY);
    return true;
  }

  async connect(settings: OBSSettings) {
    if (!this.obsWebSocket) {
      this.obsWebSocket = new OBSWebSocket();
      this.obsWebSocket.on('ConnectionClosed', () => {
        this.setConnectionStatus(OBSConnectionStatus.OBS_NOT_CONNECTED);
      });
      this.obsWebSocket.on('StreamStateChanged', ({ outputActive }) => {
        this.streamOutputActive = outputActive;
        this.mainWindow.webContents.send(
          'streamOutputActive',
          this.streamOutputActive,
        );
      });
    }
    let canCheckTEB = false;
    if (this.connectionStatus === OBSConnectionStatus.OBS_NOT_CONNECTED) {
      await this.obsWebSocket.connect(
        `${settings.protocol}://${settings.address}:${settings.port}`,
        settings.password.length > 0 ? settings.password : undefined,
      );
      this.connectionStatus = OBSConnectionStatus.OBS_NOT_SETUP;
      canCheckTEB = await this.setupObsScenesAndSources();
    } else if (this.connectionStatus === OBSConnectionStatus.OBS_NOT_SETUP) {
      canCheckTEB = await this.setupObsScenesAndSources();
    }
    if (canCheckTEB) {
      const { parameterValue } = await this.obsWebSocket.call(
        'GetProfileParameter',
        {
          parameterCategory: 'Stream1',
          parameterName: 'EnableMultitrackVideo',
        },
      );
      if (parameterValue === 'true') {
        this.setConnectionStatus(
          OBSConnectionStatus.READY,
          'Multitrack Video (likely Twitch Enhanced Broadcasting) is enabled and will interfere with timestamp generation.',
        );
      }
      const { outputActive } = await this.obsWebSocket.call('GetStreamStatus');
      this.streamOutputActive = outputActive;
      this.mainWindow.webContents.send(
        'streamOutputActive',
        this.streamOutputActive,
      );
    }
  }

  async transition(playingSets: Map<number, AvailableSet | null>) {
    if (
      !this.obsWebSocket ||
      this.connectionStatus === OBSConnectionStatus.OBS_NOT_CONNECTED ||
      !this.shouldSetupAndAutoSwitch
    ) {
      return;
    }
    const ports = Array.from(playingSets.keys()).sort((a, b) => a - b);
    if (ports.length > this.maxDolphins) {
      throw new Error('more playing than max dolphins?');
    }
    const liveEntries = Array.from(playingSets.entries()).filter(
      ([, set]) => set === null,
    );
    const soundPort = liveEntries.length > 0 ? liveEntries[0][0] : ports[0];

    let sceneName = `quad ${ports.length}`;
    if (ports.length === 2) {
      const postfix = ports
        .map((port) => {
          const i = this.dolphinPorts.indexOf(port);
          if (i < 0) {
            throw new Error('asdf');
          }
          return i + 1;
        })
        .join('');
      sceneName += ` ${postfix}`;
    }
    const requests: RequestBatchRequest[] = [];
    requests.push({
      requestType: 'SetCurrentProgramScene',
      requestData: { sceneName },
    });
    if (ports.length !== 0) {
      this.dolphinPorts.forEach((port) => {
        const inputName = this.portToInputName.get(port);
        if (inputName) {
          requests.push({
            requestType: 'SetInputMute',
            requestData: {
              inputName,
              inputMuted: port !== soundPort,
            },
          });
        }
      });
      if (
        (ports.length === 1 && this.maxDolphins > 1) ||
        (ports.length === 3 && this.maxDolphins > 3)
      ) {
        const enabledPorts = new Set(ports);
        this.dolphinPorts.forEach((port) => {
          const inputName = this.portToInputName.get(port);
          if (inputName) {
            const sceneItemId = this.sceneNameToInputNameToSceneItemId
              .get(sceneName)
              ?.get(inputName);
            if (sceneItemId) {
              requests.push({
                requestType: 'SetSceneItemEnabled',
                requestData: {
                  sceneName,
                  sceneItemId,
                  sceneItemEnabled: enabledPorts.has(port),
                },
              });
            }
          }
        });
      }
    }
    await this.obsWebSocket.callBatch(requests);
  }

  getStreamOutputActive() {
    return this.streamOutputActive;
  }

  async startStream() {
    if (
      !this.obsWebSocket ||
      this.connectionStatus === OBSConnectionStatus.OBS_NOT_CONNECTED
    ) {
      return;
    }

    await this.obsWebSocket.call('StartStream');
  }

  // 00:01:02.116
  async getTimecode() {
    if (
      !this.obsWebSocket ||
      this.connectionStatus === OBSConnectionStatus.OBS_NOT_CONNECTED
    ) {
      return '';
    }

    const { outputTimecode } = await this.obsWebSocket.call('GetStreamStatus');
    return outputTimecode.slice(0, -4);
  }
}
