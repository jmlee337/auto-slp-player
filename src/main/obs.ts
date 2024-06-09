import OBSWebSocket from 'obs-websocket-js';
import { BrowserWindow } from 'electron';
import { OBSConnectionStatus, OBSSettings } from '../common/types';

export default class OBSConnection {
  private dolphinVersionPromise: Promise<string> | null = null;

  private mainWindow: BrowserWindow;

  private maxDolphins: number = 0;

  private obsConnected: boolean = false;

  private obsWebSocket: OBSWebSocket | null = null;

  constructor(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow;
  }

  setDolphinVersionPromise(dolphinVersionPromise: Promise<string>) {
    this.dolphinVersionPromise = dolphinVersionPromise;
  }

  private async checkObsSetup() {
    if (this.obsWebSocket === null || !this.obsConnected) {
      return;
    }

    /**
     * [{"sceneIndex":0,"sceneName":"quad 4","sceneUuid":"f843d4e5-f9ec-44da-9a8c-0a9ffe52b440"},
     *  {"sceneIndex":1,"sceneName":"quad 3","sceneUuid":"87769989-619c-4c46-b42e-362a43452250"},
     *  {"sceneIndex":2,"sceneName":"quad 2","sceneUuid":"b07436ab-0eda-47be-99d8-ba33f420f4f4"},
     *  {"sceneIndex":3,"sceneName":"quad 1","sceneUuid":"7eb22cbe-b737-4de2-b8a5-0ce61cf591ad"}]
     */
    const { scenes } = await this.obsWebSocket.call('GetSceneList');
    const sceneNames = new Set(scenes.map((scene) => scene.sceneName));
    for (let i = 1; i <= this.maxDolphins; i += 1) {
      const sceneName = `quad ${i}`;
      if (!sceneNames.has(sceneName)) {
        this.mainWindow.webContents.send(
          'obsConnectionStatus',
          OBSConnectionStatus.OBS_NOT_SETUP,
          `Scene "${sceneName}" not found.`,
        );
        return;
      }
      /**
       * [{"inputKind":"browser_source","isGroup":null,"sceneItemBlendMode":"OBS_BLEND_NORMAL","sceneItemEnabled":false,"sceneItemId":10,"sceneItemIndex":0,"sceneItemLocked":true,"sceneItemTransform":{"alignment":5,"boundsAlignment":0,"boundsHeight":0,"boundsType":"OBS_BOUNDS_NONE","boundsWidth":0,"cropBottom":0,"cropLeft":0,"cropRight":0,"cropTop":0,"height":492,"positionX":880,"positionY":0,"rotation":0,"scaleX":1,"scaleY":1,"sourceHeight":492,"sourceWidth":400,"width":400},"sourceName":"Browser","sourceType":"OBS_SOURCE_TYPE_INPUT","sourceUuid":"c8d1a976-b255-4a77-a193-b12463546c83"},
       *  {"inputKind":"game_capture","isGroup":null,"sceneItemBlendMode":"OBS_BLEND_NORMAL","sceneItemEnabled":true,"sceneItemId":15,"sceneItemIndex":1,"sceneItemLocked":true,"sceneItemTransform":{"alignment":5,"boundsAlignment":0,"boundsHeight":1,"boundsType":"OBS_BOUNDS_NONE","boundsWidth":1,"cropBottom":0,"cropLeft":0,"cropRight":0,"cropTop":0,"height":0,"positionX":660,"positionY":540,"rotation":0,"scaleX":1.03125,"scaleY":1.0305343866348267,"sourceHeight":0,"sourceWidth":0,"width":0},"sourceName":"dolphin 3","sourceType":"OBS_SOURCE_TYPE_INPUT","sourceUuid":"8e1a48ce-1b69-46e7-98ba-fe3bf7fd597f"},
       *  {"inputKind":"game_capture","isGroup":null,"sceneItemBlendMode":"OBS_BLEND_NORMAL","sceneItemEnabled":true,"sceneItemId":14,"sceneItemIndex":2,"sceneItemLocked":true,"sceneItemTransform":{"alignment":5,"boundsAlignment":0,"boundsHeight":0,"boundsType":"OBS_BOUNDS_NONE","boundsWidth":0,"cropBottom":0,"cropLeft":0,"cropRight":0,"cropTop":0,"height":0,"positionX":0,"positionY":540,"rotation":0,"scaleX":1.03125,"scaleY":1.0305343866348267,"sourceHeight":0,"sourceWidth":0,"width":0},"sourceName":"dolphin 2","sourceType":"OBS_SOURCE_TYPE_INPUT","sourceUuid":"90a2c347-ad1e-4ce8-b68e-286adc96696d"},
       *  {"inputKind":"game_capture","isGroup":null,"sceneItemBlendMode":"OBS_BLEND_NORMAL","sceneItemEnabled":true,"sceneItemId":13,"sceneItemIndex":3,"sceneItemLocked":true,"sceneItemTransform":{"alignment":5,"boundsAlignment":0,"boundsHeight":0,"boundsType":"OBS_BOUNDS_NONE","boundsWidth":0,"cropBottom":0,"cropLeft":0,"cropRight":0,"cropTop":0,"height":0,"positionX":660,"positionY":0,"rotation":0,"scaleX":1.03125,"scaleY":1.0305343866348267,"sourceHeight":0,"sourceWidth":0,"width":0},"sourceName":"dolphin 1","sourceType":"OBS_SOURCE_TYPE_INPUT","sourceUuid":"472771e8-8a4d-4fe7-8974-6a0e0c660941"},
       *  {"inputKind":"game_capture","isGroup":null,"sceneItemBlendMode":"OBS_BLEND_NORMAL","sceneItemEnabled":true,"sceneItemId":12,"sceneItemIndex":4,"sceneItemLocked":true,"sceneItemTransform":{"alignment":5,"boundsAlignment":0,"boundsHeight":0,"boundsType":"OBS_BOUNDS_NONE","boundsWidth":0,"cropBottom":0,"cropLeft":0,"cropRight":0,"cropTop":0,"height":0,"positionX":0,"positionY":0,"rotation":0,"scaleX":1.03125,"scaleY":1.0305343866348267,"sourceHeight":0,"sourceWidth":0,"width":0},"sourceName":"dolphin 0","sourceType":"OBS_SOURCE_TYPE_INPUT","sourceUuid":"2aab46b4-e356-4708-8165-33bd139a9f95"}]
       */
      // eslint-disable-next-line no-await-in-loop
      const { sceneItems } = await this.obsWebSocket.call('GetSceneItemList', {
        sceneName,
      });
      const sourceNames = new Set(
        sceneItems
          .filter((sceneItem) => sceneItem.inputKind === 'game_capture')
          .map((sceneItem) => sceneItem.sourceName),
      );
      for (let j = 0; j < i; j += 1) {
        const sourceName = `dolphin ${j}`;
        if (!sourceNames.has(sourceName)) {
          this.mainWindow.webContents.send(
            'obsConnectionStatus',
            OBSConnectionStatus.OBS_NOT_SETUP,
            `Game Capture "${sourceName}" not found in scene "${sceneName}".`,
          );
          return;
        }
        if (i === this.maxDolphins) {
          // {"capture_mode":"window","priority":1,"window":"Faster Melee - Slippi (3.4.2) - Playback | 51441:wxWindowNR:Slippi Dolphin.exe"}
          // eslint-disable-next-line no-await-in-loop
          const { inputSettings } = await this.obsWebSocket.call(
            'GetInputSettings',
            { inputName: sourceName },
          );
          if (inputSettings.capture_mode !== 'window') {
            this.mainWindow.webContents.send(
              'obsConnectionStatus',
              OBSConnectionStatus.OBS_NOT_SETUP,
              `Game Capture "${sourceName}" not set to mode "Capture specific window".`,
            );
            return;
          }
          if (inputSettings.priority !== 1) {
            this.mainWindow.webContents.send(
              'obsConnectionStatus',
              OBSConnectionStatus.OBS_NOT_SETUP,
              `Game Capture "${sourceName}" not set to window match priority "Window title must match".`,
            );
            return;
          }
          if (
            !(inputSettings.window as string).startsWith(
              'Faster Melee - Slippi (',
            )
          ) {
            this.mainWindow.webContents.send(
              'obsConnectionStatus',
              OBSConnectionStatus.OBS_NOT_SETUP,
              `Game Capture "${sourceName}" window not set to Slippi Dolphin.`,
            );
            return;
          }
        }
      }
    }
    this.mainWindow.webContents.send(
      'obsConnectionStatus',
      OBSConnectionStatus.READY,
    );
  }

  setMaxDolphins(maxDophins: number) {
    this.maxDolphins = maxDophins;
    this.checkObsSetup();
  }

  async connect(settings: OBSSettings) {
    if (!this.obsWebSocket) {
      this.obsWebSocket = new OBSWebSocket();
      this.obsWebSocket.on('ConnectionClosed', () => {
        this.obsConnected = false;
        this.mainWindow.webContents.send(
          'obsConnectionStatus',
          OBSConnectionStatus.OBS_NOT_CONNECTED,
        );
      });
      this.obsWebSocket.on('SceneListChanged', () => {
        this.checkObsSetup();
      });
      this.obsWebSocket.on(
        'SceneItemRemoved',
        ({
          sceneName,
          sourceName,
        }: {
          sceneName: string;
          sourceName: string;
        }) => {
          for (let i = 1; i <= this.maxDolphins; i += 1) {
            if (sceneName === `quad ${i}`) {
              for (let j = 0; j < i; j += 1) {
                if (sourceName === `dolphin ${j}`) {
                  this.mainWindow.webContents.send(
                    'obsConnectionStatus',
                    OBSConnectionStatus.OBS_NOT_SETUP,
                    `Game Capture "${sourceName}" not found in scene "${sceneName}".`,
                  );
                  return;
                }
              }
            }
          }
        },
      );
      this.obsWebSocket.on(
        'SceneItemCreated',
        ({
          sceneName,
          sourceName,
        }: {
          sceneName: string;
          sourceName: string;
        }) => {
          for (let i = 1; i <= this.maxDolphins; i += 1) {
            if (sceneName === `quad ${i}`) {
              for (let j = 0; j < i; j += 1) {
                if (sourceName === `dolphin ${j}`) {
                  this.checkObsSetup();
                  return;
                }
              }
            }
          }
        },
      );
      this.obsWebSocket.on(
        'InputNameChanged',
        ({
          oldInputName,
          inputName,
        }: {
          oldInputName: string;
          inputName: string;
        }) => {
          for (let i = 0; i < this.maxDolphins; i += 1) {
            const dolphinName = `dolphin ${i}`;
            if (oldInputName === dolphinName || inputName === dolphinName) {
              this.checkObsSetup();
              return;
            }
          }
        },
      );
      this.obsWebSocket.on(
        'InputSettingsChanged',
        ({ inputName }: { inputName: string }) => {
          for (let i = 0; i < this.maxDolphins; i += 1) {
            if (inputName === `dolphin ${i}`) {
              this.checkObsSetup();
              return;
            }
          }
        },
      );
    }
    if (!this.obsConnected) {
      await this.obsWebSocket.connect(
        `${settings.protocol}://${settings.address}:${settings.port}`,
        settings.password.length > 0 ? settings.password : undefined,
      );
      this.obsConnected = true;

      await this.checkObsSetup();
    }
  }
}
