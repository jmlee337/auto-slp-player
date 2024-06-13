import OBSWebSocket, { RequestBatchRequest } from 'obs-websocket-js';
import { BrowserWindow } from 'electron';
import {
  AvailableSet,
  OBSConnectionStatus,
  OBSSettings,
} from '../common/types';
import { Dolphin } from './dolphin';

const expectedSceneNums = new Map([
  [1, 2],
  [2, 3],
  [3, 6],
  [4, 10],
]);

export default class OBSConnection {
  private connectionStatus: OBSConnectionStatus;

  private dolphinPorts: number[];

  private dolphinVersionPromise: Promise<string> | null;

  private mainWindow: BrowserWindow;

  private maxDolphins: number;

  private obsWebSocket: OBSWebSocket | null;

  private portToUuid: Map<number, string>;

  private sceneNameToUuidToSceneItemId: Map<string, Map<string, number>>;

  constructor(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow;

    this.connectionStatus = OBSConnectionStatus.OBS_NOT_CONNECTED;
    this.dolphinPorts = [];
    this.dolphinVersionPromise = null;
    this.maxDolphins = 0;
    this.obsWebSocket = null;
    this.portToUuid = new Map();
    this.sceneNameToUuidToSceneItemId = new Map();
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
      !this.dolphinVersionPromise
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

    const prefix = await this.getPrefix();
    const expectedPortStrs = new Set(
      this.dolphinPorts
        .slice(0, this.maxDolphins)
        .map((port) => port.toString()),
    );
    const portToUuid = new Map<number, string>();
    const { inputs } = await this.obsWebSocket.call('GetInputList', {
      inputKind: 'game_capture',
    });
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
            const portStr = window.slice(prefix.length, endI);
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
      if (this.maxDolphins === 2 || i !== 2) {
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
          // eslint-disable-next-line no-await-in-loop
          const { sceneItems } = await this.obsWebSocket.call(
            'GetSceneItemList',
            { sceneName },
          );
          sceneItems
            .filter((sceneItem) => sceneItem.inputKind === 'game_capture')
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
    if (this.maxDolphins > 2) {
      const expectedScenes = [
        { sceneName: 'quad 2 12', indices: [0, 1] },
        { sceneName: 'quad 2 13', indices: [0, 2] },
        { sceneName: 'quad 2 23', indices: [1, 2] },
      ];
      if (this.maxDolphins > 3) {
        expectedScenes.push(
          { sceneName: 'quad 2 14', indices: [0, 3] },
          { sceneName: 'quad 2 24', indices: [1, 3] },
          { sceneName: 'quad 2 34', indices: [2, 3] },
        );
      }
      for (let i = 0; i < expectedScenes.length; i += 1) {
        const { sceneName, indices } = expectedScenes[i];
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
        // eslint-disable-next-line no-await-in-loop
        const { sceneItems } = await this.obsWebSocket.call(
          'GetSceneItemList',
          { sceneName },
        );
        sceneItems
          .filter((sceneItem) => sceneItem.inputKind === 'game_capture')
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
    const expectedSceneNum = expectedSceneNums.get(this.maxDolphins)!;
    if (scenes.length > expectedSceneNum) {
      this.setConnectionStatus(
        OBSConnectionStatus.OBS_NOT_SETUP,
        `Too many scenes. Expected: ${expectedSceneNum}, actual: ${scenes.length}.`,
      );
      return;
    }
    this.setConnectionStatus(OBSConnectionStatus.READY);
  }

  setMaxDolphins(maxDophins: number) {
    this.maxDolphins = maxDophins;
    this.checkObsSetup();
  }

  setDolphins(dolphins: Map<number, Dolphin>) {
    this.dolphinPorts = Array.from(dolphins.keys()).sort((a, b) => a - b);
    this.checkObsSetup();
  }

  async connect(settings: OBSSettings) {
    if (!this.obsWebSocket) {
      this.obsWebSocket = new OBSWebSocket();
      this.obsWebSocket.on('ConnectionClosed', () => {
        this.setConnectionStatus(OBSConnectionStatus.OBS_NOT_CONNECTED);
      });
      this.obsWebSocket.on('CurrentSceneCollectionChanged', () => {
        this.checkObsSetup();
      });
      this.obsWebSocket.on('SceneListChanged', () => {
        this.checkObsSetup();
      });
      this.obsWebSocket.on('SceneItemRemoved', ({ sceneName, sourceUuid }) => {
        if (
          sceneName.startsWith('quad') &&
          new Set(this.portToUuid.values()).has(sourceUuid)
        ) {
          this.checkObsSetup();
        }
      });
      this.obsWebSocket.on('SceneItemCreated', ({ sceneName, sourceUuid }) => {
        if (
          sceneName.startsWith('quad') &&
          new Set(this.portToUuid.values()).has(sourceUuid)
        ) {
          this.checkObsSetup();
        }
      });
      this.obsWebSocket.on(
        'InputSettingsChanged',
        async ({ inputSettings }) => {
          const { window } = inputSettings as { window: string };
          if (window && window.startsWith(await this.getPrefix())) {
            this.checkObsSetup();
          }
        },
      );
    }
    if (this.connectionStatus === OBSConnectionStatus.OBS_NOT_CONNECTED) {
      await this.obsWebSocket.connect(
        `${settings.protocol}://${settings.address}:${settings.port}`,
        settings.password.length > 0 ? settings.password : undefined,
      );
      this.connectionStatus = OBSConnectionStatus.OBS_NOT_SETUP;
      await this.checkObsSetup();
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
}
