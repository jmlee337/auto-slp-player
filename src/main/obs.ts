import OBSWebSocket, { RequestBatchRequest } from 'obs-websocket-js';
import { BrowserWindow } from 'electron';
import { getOpenWindows } from 'magic-active-win';
import {
  AvailableSet,
  OBSConnectionStatus,
  OBSSettings,
} from '../common/types';
import { Dolphin } from './dolphin';

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

  private pidToPort: Map<number, number>;

  private portToUuid: Map<number, string>;

  private sceneNameToUuidToSceneItemId: Map<string, Map<string, number>>;

  private streamingState: string;

  private overlay01Path: string;

  private overlay2Path: string;

  private overlay34Path: string;

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
    this.pidToPort = new Map();
    this.portToUuid = new Map();
    this.sceneNameToUuidToSceneItemId = new Map();
    this.streamingState = '';
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

  private async checkObsSetup() {
    if (
      this.obsWebSocket === null ||
      this.connectionStatus === OBSConnectionStatus.OBS_NOT_CONNECTED ||
      !this.dolphinVersionPromise ||
      !(process.platform === 'win32' || process.platform === 'darwin')
    ) {
      return;
    }
    if (this.dolphinPorts.length < this.maxDolphins) {
      this.setConnectionStatus(
        OBSConnectionStatus.OBS_NOT_SETUP,
        `${this.dolphinPorts.length} dolphins open. Expected ${this.maxDolphins}.`,
      );
      return;
    }

    const portToUuid = new Map<number, string>();
    let inputKind = '';
    if (process.platform === 'win32') {
      inputKind = 'game_capture';
    } else if (process.platform === 'darwin') {
      inputKind = 'screen_capture';
    }
    const truncPorts = this.dolphinPorts.slice(0, this.maxDolphins);
    const { inputs } = await this.obsWebSocket.call('GetInputList', {
      inputKind,
    });
    if (process.platform === 'win32') {
      const prefix = await this.getPrefix();
      const expectedPortStrs = new Set(
        truncPorts.map((port) => port.toString()),
      );
      await Promise.all(
        inputs.map(async (input) => {
          const { inputUuid } = input as { inputUuid: string };
          // {"capture_audio":true,"capture_mode":"window","priority":1,"window":"Faster Melee - Slippi (3.4.2) - Playback | 51441:wxWindowNR:Slippi Dolphin.exe"}
          const { inputSettings } = await this.obsWebSocket!.call(
            'GetInputSettings',
            { inputUuid },
          );
          if (
            inputSettings.capture_audio &&
            inputSettings.capture_mode === 'window' &&
            inputSettings.priority === 1
          ) {
            const { window } = inputSettings as { window: string };
            const endI = window.indexOf(':');
            if (window.startsWith(prefix) && endI > prefix.length) {
              const portStr = window.slice(endI - 5, endI);
              if (expectedPortStrs.has(portStr)) {
                expectedPortStrs.delete(portStr);
                portToUuid.set(Number.parseInt(portStr, 10), inputUuid);
              }
            }
          }
        }),
      );
      if (expectedPortStrs.size !== 0) {
        const notFound = Array.from(expectedPortStrs.keys()).sort().join(', ');
        this.setConnectionStatus(
          OBSConnectionStatus.OBS_NOT_SETUP,
          `Inputs not found for dolphin(s): ${notFound}. Check the "Window", "Window match priority" ("Window title must match"), and "Capture Audio" (enabled) settings on your Game Capture inputs.`,
        );
        return;
      }
    } else if (process.platform === 'darwin') {
      const expectedPorts = new Set(truncPorts);
      const expectedPids = new Set(
        Array.from(this.pidToPort.entries())
          .filter(([, port]) => expectedPorts.has(port))
          .map(([pid]) => pid),
      );
      await Promise.all(
        inputs.map(async (input) => {
          const { inputUuid } = input as { inputUuid: string };
          // {"application":"com.project-slippi.dolphin","show_cursor":false,"show_empty_names":false,"show_hidden_windows":false,"type":1,"window":15540}
          const { inputSettings } = await this.obsWebSocket!.call(
            'GetInputSettings',
            { inputUuid },
          );
          const windowToPid = new Map<number, number>();
          (
            await getOpenWindows({
              accessibilityPermission: false,
              screenRecordingPermission: false,
            })
          ).forEach((window) => {
            const pid = window.owner.processId;
            if (this.pidToPort.has(pid)) {
              windowToPid.set(window.id, pid);
            }
          });
          const pid = windowToPid.get(inputSettings.window as number);
          if (inputSettings.type === 1 && pid) {
            if (expectedPids.has(pid)) {
              expectedPids.delete(pid);
              portToUuid.set(this.pidToPort.get(pid)!, inputUuid);
            }
          }
        }),
      );
      if (expectedPids.size !== 0) {
        const notFound = Array.from(expectedPids.keys())
          .map((pid) => this.pidToPort.get(pid)!)
          .sort((a, b) => a - b)
          .join(', ');
        this.setConnectionStatus(
          OBSConnectionStatus.OBS_NOT_SETUP,
          `Inputs not found for dolphin(s): ${notFound}. Check the "Window" and "Method" ("Window Capture") settings on your macOS Screen Capture inputs.`,
        );
        return;
      }
    }
    this.portToUuid = portToUuid;

    /**
     * [{"sceneIndex":0,"sceneName":"quad 4","sceneUuid":"f843d4e5-f9ec-44da-9a8c-0a9ffe52b440"},
     *  {"sceneIndex":1,"sceneName":"quad 3","sceneUuid":"87769989-619c-4c46-b42e-362a43452250"},
     *  {"sceneIndex":2,"sceneName":"quad 2","sceneUuid":"b07436ab-0eda-47be-99d8-ba33f420f4f4"},
     *  {"sceneIndex":3,"sceneName":"quad 1","sceneUuid":"7eb22cbe-b737-4de2-b8a5-0ce61cf591ad"}]
     */
    const { scenes } = await this.obsWebSocket.call('GetSceneList');
    const sceneNames = new Set(scenes.map((scene) => scene.sceneName));
    for (let i = 0; i <= this.maxDolphins; i += 1) {
      if (i !== 2) {
        const sceneName = `quad ${i}`;
        if (!sceneNames.has(sceneName)) {
          this.setConnectionStatus(
            OBSConnectionStatus.OBS_NOT_SETUP,
            `Scene "${sceneName}" not found.`,
          );
          return;
        }
        if (i !== 0) {
          const expectedUuids = new Set(portToUuid.values());
          const uuidToSceneItemId = new Map<string, number>();
          /**
           * [{"inputKind":"browser_source","isGroup":null,"sceneItemBlendMode":"OBS_BLEND_NORMAL","sceneItemEnabled":false,"sceneItemId":10,"sceneItemIndex":0,"sceneItemLocked":true,"sceneItemTransform":{"alignment":5,"boundsAlignment":0,"boundsHeight":0,"boundsType":"OBS_BOUNDS_NONE","boundsWidth":0,"cropBottom":0,"cropLeft":0,"cropRight":0,"cropTop":0,"height":492,"positionX":880,"positionY":0,"rotation":0,"scaleX":1,"scaleY":1,"sourceHeight":492,"sourceWidth":400,"width":400},"sourceName":"Browser","sourceType":"OBS_SOURCE_TYPE_INPUT","sourceUuid":"c8d1a976-b255-4a77-a193-b12463546c83"},
           *  {"inputKind":"game_capture","isGroup":null,"sceneItemBlendMode":"OBS_BLEND_NORMAL","sceneItemEnabled":true,"sceneItemId":15,"sceneItemIndex":1,"sceneItemLocked":true,"sceneItemTransform":{"alignment":5,"boundsAlignment":0,"boundsHeight":1,"boundsType":"OBS_BOUNDS_NONE","boundsWidth":1,"cropBottom":0,"cropLeft":0,"cropRight":0,"cropTop":0,"height":0,"positionX":660,"positionY":540,"rotation":0,"scaleX":1.03125,"scaleY":1.0305343866348267,"sourceHeight":0,"sourceWidth":0,"width":0},"sourceName":"dolphin 3","sourceType":"OBS_SOURCE_TYPE_INPUT","sourceUuid":"8e1a48ce-1b69-46e7-98ba-fe3bf7fd597f"},
           *  {"inputKind":"game_capture","isGroup":null,"sceneItemBlendMode":"OBS_BLEND_NORMAL","sceneItemEnabled":true,"sceneItemId":14,"sceneItemIndex":2,"sceneItemLocked":true,"sceneItemTransform":{"alignment":5,"boundsAlignment":0,"boundsHeight":0,"boundsType":"OBS_BOUNDS_NONE","boundsWidth":0,"cropBottom":0,"cropLeft":0,"cropRight":0,"cropTop":0,"height":0,"positionX":0,"positionY":540,"rotation":0,"scaleX":1.03125,"scaleY":1.0305343866348267,"sourceHeight":0,"sourceWidth":0,"width":0},"sourceName":"dolphin 2","sourceType":"OBS_SOURCE_TYPE_INPUT","sourceUuid":"90a2c347-ad1e-4ce8-b68e-286adc96696d"},
           *  {"inputKind":"game_capture","isGroup":null,"sceneItemBlendMode":"OBS_BLEND_NORMAL","sceneItemEnabled":true,"sceneItemId":13,"sceneItemIndex":3,"sceneItemLocked":true,"sceneItemTransform":{"alignment":5,"boundsAlignment":0,"boundsHeight":0,"boundsType":"OBS_BOUNDS_NONE","boundsWidth":0,"cropBottom":0,"cropLeft":0,"cropRight":0,"cropTop":0,"height":0,"positionX":660,"positionY":0,"rotation":0,"scaleX":1.03125,"scaleY":1.0305343866348267,"sourceHeight":0,"sourceWidth":0,"width":0},"sourceName":"dolphin 1","sourceType":"OBS_SOURCE_TYPE_INPUT","sourceUuid":"472771e8-8a4d-4fe7-8974-6a0e0c660941"},
           *  {"inputKind":"game_capture","isGroup":null,"sceneItemBlendMode":"OBS_BLEND_NORMAL","sceneItemEnabled":true,"sceneItemId":12,"sceneItemIndex":4,"sceneItemLocked":true,"sceneItemTransform":{"alignment":5,"boundsAlignment":0,"boundsHeight":0,"boundsType":"OBS_BOUNDS_NONE","boundsWidth":0,"cropBottom":0,"cropLeft":0,"cropRight":0,"cropTop":0,"height":0,"positionX":0,"positionY":0,"rotation":0,"scaleX":1.03125,"scaleY":1.0305343866348267,"sourceHeight":0,"sourceWidth":0,"width":0},"sourceName":"dolphin 0","sourceType":"OBS_SOURCE_TYPE_INPUT","sourceUuid":"2aab46b4-e356-4708-8165-33bd139a9f95"}]
           */
          const { sceneItems } = await this.obsWebSocket.call(
            'GetSceneItemList',
            { sceneName },
          );
          sceneItems
            .filter((sceneItem) => sceneItem.inputKind === inputKind)
            .forEach(async (sceneItem) => {
              const { sourceUuid } = sceneItem as { sourceUuid: string };
              if (expectedUuids.has(sourceUuid)) {
                expectedUuids.delete(sourceUuid);
                const { sceneItemId } = sceneItem as { sceneItemId: number };
                uuidToSceneItemId.set(sourceUuid, sceneItemId);
              }
            });
          if (expectedUuids.size !== 0) {
            this.setConnectionStatus(
              OBSConnectionStatus.OBS_NOT_SETUP,
              `Scene: "quad ${i}" doesn't contain all dolphin game inputs.`,
            );
            return;
          }
          this.sceneNameToUuidToSceneItemId.set(sceneName, uuidToSceneItemId);
        }
      }
    }
    if (this.maxDolphins > 1) {
      const expectedScenes = [{ sceneName: 'quad 2 12', indices: [0, 1] }];
      if (this.maxDolphins > 2) {
        expectedScenes.push(
          { sceneName: 'quad 2 13', indices: [0, 2] },
          { sceneName: 'quad 2 23', indices: [1, 2] },
        );
        if (this.maxDolphins > 3) {
          expectedScenes.push(
            { sceneName: 'quad 2 14', indices: [0, 3] },
            { sceneName: 'quad 2 24', indices: [1, 3] },
            { sceneName: 'quad 2 34', indices: [2, 3] },
          );
        }
      }
      for (const { sceneName, indices } of expectedScenes) {
        if (!sceneNames.has(sceneName)) {
          this.setConnectionStatus(
            OBSConnectionStatus.OBS_NOT_SETUP,
            `Scene "${sceneName}" not found.`,
          );
          return;
        }
        const expectedPorts = indices.map((index) => this.dolphinPorts[index]);
        const expectedUuids = new Set(
          expectedPorts.map((port) => portToUuid.get(port)!),
        );
        const uuidToSceneItemId = new Map<string, number>();
        /**
         * [{"inputKind":"browser_source","isGroup":null,"sceneItemBlendMode":"OBS_BLEND_NORMAL","sceneItemEnabled":false,"sceneItemId":10,"sceneItemIndex":0,"sceneItemLocked":true,"sceneItemTransform":{"alignment":5,"boundsAlignment":0,"boundsHeight":0,"boundsType":"OBS_BOUNDS_NONE","boundsWidth":0,"cropBottom":0,"cropLeft":0,"cropRight":0,"cropTop":0,"height":492,"positionX":880,"positionY":0,"rotation":0,"scaleX":1,"scaleY":1,"sourceHeight":492,"sourceWidth":400,"width":400},"sourceName":"Browser","sourceType":"OBS_SOURCE_TYPE_INPUT","sourceUuid":"c8d1a976-b255-4a77-a193-b12463546c83"},
         *  {"inputKind":"game_capture","isGroup":null,"sceneItemBlendMode":"OBS_BLEND_NORMAL","sceneItemEnabled":true,"sceneItemId":15,"sceneItemIndex":1,"sceneItemLocked":true,"sceneItemTransform":{"alignment":5,"boundsAlignment":0,"boundsHeight":1,"boundsType":"OBS_BOUNDS_NONE","boundsWidth":1,"cropBottom":0,"cropLeft":0,"cropRight":0,"cropTop":0,"height":0,"positionX":660,"positionY":540,"rotation":0,"scaleX":1.03125,"scaleY":1.0305343866348267,"sourceHeight":0,"sourceWidth":0,"width":0},"sourceName":"dolphin 3","sourceType":"OBS_SOURCE_TYPE_INPUT","sourceUuid":"8e1a48ce-1b69-46e7-98ba-fe3bf7fd597f"},
         *  {"inputKind":"game_capture","isGroup":null,"sceneItemBlendMode":"OBS_BLEND_NORMAL","sceneItemEnabled":true,"sceneItemId":14,"sceneItemIndex":2,"sceneItemLocked":true,"sceneItemTransform":{"alignment":5,"boundsAlignment":0,"boundsHeight":0,"boundsType":"OBS_BOUNDS_NONE","boundsWidth":0,"cropBottom":0,"cropLeft":0,"cropRight":0,"cropTop":0,"height":0,"positionX":0,"positionY":540,"rotation":0,"scaleX":1.03125,"scaleY":1.0305343866348267,"sourceHeight":0,"sourceWidth":0,"width":0},"sourceName":"dolphin 2","sourceType":"OBS_SOURCE_TYPE_INPUT","sourceUuid":"90a2c347-ad1e-4ce8-b68e-286adc96696d"},
         *  {"inputKind":"game_capture","isGroup":null,"sceneItemBlendMode":"OBS_BLEND_NORMAL","sceneItemEnabled":true,"sceneItemId":13,"sceneItemIndex":3,"sceneItemLocked":true,"sceneItemTransform":{"alignment":5,"boundsAlignment":0,"boundsHeight":0,"boundsType":"OBS_BOUNDS_NONE","boundsWidth":0,"cropBottom":0,"cropLeft":0,"cropRight":0,"cropTop":0,"height":0,"positionX":660,"positionY":0,"rotation":0,"scaleX":1.03125,"scaleY":1.0305343866348267,"sourceHeight":0,"sourceWidth":0,"width":0},"sourceName":"dolphin 1","sourceType":"OBS_SOURCE_TYPE_INPUT","sourceUuid":"472771e8-8a4d-4fe7-8974-6a0e0c660941"},
         *  {"inputKind":"game_capture","isGroup":null,"sceneItemBlendMode":"OBS_BLEND_NORMAL","sceneItemEnabled":true,"sceneItemId":12,"sceneItemIndex":4,"sceneItemLocked":true,"sceneItemTransform":{"alignment":5,"boundsAlignment":0,"boundsHeight":0,"boundsType":"OBS_BOUNDS_NONE","boundsWidth":0,"cropBottom":0,"cropLeft":0,"cropRight":0,"cropTop":0,"height":0,"positionX":0,"positionY":0,"rotation":0,"scaleX":1.03125,"scaleY":1.0305343866348267,"sourceHeight":0,"sourceWidth":0,"width":0},"sourceName":"dolphin 0","sourceType":"OBS_SOURCE_TYPE_INPUT","sourceUuid":"2aab46b4-e356-4708-8165-33bd139a9f95"}]
         */
        const { sceneItems } = await this.obsWebSocket.call(
          'GetSceneItemList',
          { sceneName },
        );
        sceneItems
          .filter((sceneItem) => sceneItem.inputKind === inputKind)
          .forEach(async (sceneItem) => {
            const { sourceUuid } = sceneItem as { sourceUuid: string };
            if (expectedUuids.has(sourceUuid)) {
              expectedUuids.delete(sourceUuid);
              const { sceneItemId } = sceneItem as { sceneItemId: number };
              uuidToSceneItemId.set(sourceUuid, sceneItemId);
            }
          });
        if (expectedUuids.size !== 0) {
          const expectedPortsStr = expectedPorts.join(', ');
          this.setConnectionStatus(
            OBSConnectionStatus.OBS_NOT_SETUP,
            `Scene: "${sceneName}" should contain game inputs for dolphins: ${expectedPortsStr}.`,
          );
          return;
        }
        this.sceneNameToUuidToSceneItemId.set(sceneName, uuidToSceneItemId);
      }
    }
    this.setConnectionStatus(OBSConnectionStatus.READY);
  }

  setMaxDolphins(maxDophins: number) {
    this.maxDolphins = maxDophins;
  }

  setDolphins(dolphins: Map<number, Dolphin>) {
    this.dolphinPorts = Array.from(dolphins.keys()).sort((a, b) => a - b);
    this.pidToPort = new Map(
      Array.from(dolphins.entries()).map(([port, dolphin]) => [
        dolphin.pid,
        port,
      ]),
    );
  }

  private async setupObs() {
    if (
      this.obsWebSocket === null ||
      this.connectionStatus === OBSConnectionStatus.OBS_NOT_CONNECTED ||
      !this.dolphinVersionPromise ||
      !(process.platform === 'win32' || process.platform === 'darwin')
    ) {
      return;
    }
    // tood check dolphin scale
    // todo check 1920x1080

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
      const overlayName = exepctedSceneNameToOverlayName.get(sceneName)!;
      const { inputs } = await this.obsWebSocket.call('GetInputList', {
        inputKind: 'browser_source',
      });
      let sceneItemId = 0;
      if (inputs.find((input) => input.inputName === overlayName)) {
        sceneItemId = (
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
        sceneItemId = (
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
        sceneItemId,
        sceneItemTransform: { positionX, positionY },
      });
      await this.obsWebSocket.call('SetSceneItemLocked', {
        sceneName,
        sceneItemId,
        sceneItemLocked: true,
      });
    }
    if (sceneCollectionIsNew) {
      await this.obsWebSocket.call('RemoveScene', { sceneName: 'Scene' });
    }

    const inputKind =
      process.platform === 'darwin' ? 'screen_capture' : 'game_capture';
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
            if (
              !itemName
                .slice(startsWith.length)
                .match('^[0-9][0-9][0-9][0-9][0-9]$')
            ) {
              return false;
            }
            return true;
          })
          .map((propertyItem) => propertyItem.itemValue as number);
      };
      let retries = 0;
      let windows: number[] = [];
      while (windows.length < this.maxDolphins) {
        if (retries === 4) {
          this.setConnectionStatus(
            OBSConnectionStatus.OBS_NOT_SETUP,
            'Must open all dolphins',
          );
          return;
        }
        if (retries > 0) {
          await timeout(1000 * 2 ** (retries - 1));
        }
        windows = await getWindows(this.obsWebSocket);
        retries += 1;
      }
      for (let i = 0; i < this.maxDolphins; i += 1) {
        await this.obsWebSocket.call('SetInputSettings', {
          inputName: expectedInputNames[i],
          inputSettings: { window: windows[i] },
        });
      }
    } else {
      // windows todo
    }
    const sceneNameToExpectedSourceNames = new Map([
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
      for (let i = 0; i < expectedSourceNames.length; i += 1) {
        const sceneItemId = sourceNameToSceneItemId.get(
          expectedSourceNames[i],
        )!;
        await this.obsWebSocket.call('SetSceneItemLocked', {
          sceneName,
          sceneItemId,
          sceneItemLocked: false,
        });
        const { sourceHeight, sourceWidth } = (
          await this.obsWebSocket.call('GetSceneItemTransform', {
            sceneName,
            sceneItemId,
          })
        ).sceneItemTransform as { sourceHeight: number; sourceWidth: number };
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
    }
    this.setConnectionStatus(OBSConnectionStatus.READY);
  }

  async connect(settings: OBSSettings) {
    if (!this.obsWebSocket) {
      this.obsWebSocket = new OBSWebSocket();
      this.obsWebSocket.on('ConnectionClosed', () => {
        this.setConnectionStatus(OBSConnectionStatus.OBS_NOT_CONNECTED);
      });
      this.obsWebSocket.on('StreamStateChanged', ({ outputState }) => {
        this.streamingState = outputState;
        this.mainWindow.webContents.send('streaming', outputState);
      });
    }
    if (this.connectionStatus === OBSConnectionStatus.OBS_NOT_CONNECTED) {
      await this.obsWebSocket.connect(
        `${settings.protocol}://${settings.address}:${settings.port}`,
        settings.password.length > 0 ? settings.password : undefined,
      );
      this.connectionStatus = OBSConnectionStatus.OBS_NOT_SETUP;
      await this.setupObs();
    }
  }

  async transition(playingSets: Map<number, AvailableSet>) {
    if (
      !this.obsWebSocket ||
      this.connectionStatus === OBSConnectionStatus.OBS_NOT_CONNECTED
    ) {
      return;
    }
    const ports = Array.from(playingSets.keys()).sort((a, b) => a - b);
    if (ports.length > this.maxDolphins) {
      throw new Error('more playing than max dolphins?');
    }

    let sceneName = `quad ${ports.length}`;
    const isQuad2SpecialCase = ports.length === 2 && this.maxDolphins > 2;
    if (isQuad2SpecialCase) {
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
        const uuid = this.portToUuid.get(port);
        if (uuid) {
          requests.push({
            requestType: 'SetInputMute',
            requestData: {
              inputUuid: uuid,
              inputMuted: port !== ports[0],
            },
          });
        }
      });
      if (!isQuad2SpecialCase) {
        const enabledPorts = new Set(ports);
        this.dolphinPorts.forEach((port) => {
          const uuid = this.portToUuid.get(port);
          if (uuid) {
            const sceneItemId = this.sceneNameToUuidToSceneItemId
              .get(sceneName)
              ?.get(uuid);
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

  getStreamingState() {
    return this.streamingState;
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
