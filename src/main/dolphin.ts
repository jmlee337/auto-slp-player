import { ChildProcess, execFile, spawn } from 'child_process';
import EventEmitter from 'events';
import path from 'path';
import { writeFile } from 'fs/promises';
import {
  ConnectionEvent,
  ConnectionStatus,
  DolphinConnection,
  DolphinMessageType,
} from '@slippi/slippi-js';
import { DolphinComm } from '../common/types';

export enum DolphinEvent {
  CLOSE = 'close',
  ENDED = 'ended',
  PLAYING = 'playing',
  START_FAILED = 'start_failed',
  START_READY = 'start_ready',
}

export class Dolphin extends EventEmitter {
  pid: number;

  private commPath: string;

  private commNum: number;

  private dolphinConnection: DolphinConnection;

  private dolphinPath: string;

  private isoPath: string;

  private port: number;

  private process: ChildProcess | null;

  private gameIndex: number;

  private replayPaths: string[];

  private ignoreEndGame: boolean;

  private waitingForStart: boolean;

  constructor(
    dolphinPath: string,
    isoPath: string,
    tempDir: string,
    port: number,
  ) {
    super();
    this.pid = 0;

    this.commNum = 0;
    this.dolphinPath = dolphinPath;
    this.isoPath = isoPath;
    this.port = port;
    this.process = null;
    this.gameIndex = 0;
    this.replayPaths = [];
    this.ignoreEndGame = false;
    this.waitingForStart = false;

    this.commPath = path.join(tempDir, `${port}.json`);
    this.dolphinConnection = new DolphinConnection();
    this.dolphinConnection.on(ConnectionEvent.MESSAGE, (messageEvent) => {
      switch (messageEvent.type) {
        case DolphinMessageType.END_GAME:
          if (this.ignoreEndGame) {
            break;
          }
          this.gameIndex += 1;
          if (this.gameIndex >= this.replayPaths.length) {
            this.emit(DolphinEvent.ENDED);
          } else {
            this.waitingForStart = true;
            setTimeout(() => {
              if (this.waitingForStart) {
                this.emit(
                  DolphinEvent.ENDED,
                  `Failed to play game ${
                    this.gameIndex + 1
                  }. Probably missing ${path.basename(
                    this.replayPaths[this.gameIndex],
                  )}`,
                );
              }
            }, 5000);
          }
          break;
        case DolphinMessageType.START_GAME:
          this.waitingForStart = false;
          this.emit(DolphinEvent.PLAYING, this.gameIndex);
          break;
        default:
      }
    });
  }

  private async writeComm(replayPaths: string[]) {
    const comm: DolphinComm = {
      mode: 'queue',
      commandId: this.commNum.toString(),
      gameStation: `${this.port}`,
      queue: replayPaths.map((replayPath) => ({ path: replayPath })),
    };
    this.commNum += 1;
    this.gameIndex = 0;
    this.replayPaths = replayPaths;
    await writeFile(this.commPath, JSON.stringify(comm));
    // If we interrupt a replay in progress Dolphin will emit an END_GAME event
    // before starting our new replay. This would cause us to miscount so
    // ignore that.
    this.ignoreEndGame = true;
    this.waitingForStart = true;
    setTimeout(() => {
      this.ignoreEndGame = false;
      if (replayPaths.length > 0 && this.waitingForStart) {
        this.emit(
          DolphinEvent.ENDED,
          `Failed to play game 1. Probably missing ${path.basename(
            replayPaths[0],
          )}`,
        );
      }
    }, 5000);
  }

  private async connectToDolphin(): Promise<void> {
    if (this.dolphinConnection.getStatus() === ConnectionStatus.CONNECTED) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.dolphinConnection.removeAllListeners(
          ConnectionEvent.STATUS_CHANGE,
        );
        reject(new Error('timed out connecting to dolphin'));
      }, 5000);

      const connectionChangeHandler = (status: ConnectionStatus) => {
        switch (status) {
          case ConnectionStatus.CONNECTED: {
            this.dolphinConnection.removeListener(
              ConnectionEvent.STATUS_CHANGE,
              connectionChangeHandler,
            );
            clearTimeout(timer);
            resolve();
            break;
          }
          case ConnectionStatus.DISCONNECTED: {
            this.dolphinConnection.removeListener(
              ConnectionEvent.STATUS_CHANGE,
              connectionChangeHandler,
            );
            clearTimeout(timer);
            reject(new Error('failed to connect to dolphin'));
            break;
          }
          default:
        }
      };
      this.dolphinConnection.on(
        ConnectionEvent.STATUS_CHANGE,
        connectionChangeHandler,
      );

      // Actually initiate the connection
      this.dolphinConnection.connect('127.0.0.1', this.port).catch(reject);
    });
  }

  public async open() {
    if (this.process) {
      return;
    }

    await this.writeComm([]);
    const params = [
      '-b',
      '-e',
      this.isoPath,
      '-i',
      this.commPath,
      '--slippi-spectator-port',
      `${this.port}`,
    ];
    if (process.platform === 'darwin') {
      this.process = execFile(this.dolphinPath, params, {
        // 100MB
        maxBuffer: 1000 * 1000 * 100,
      });
    } else {
      this.process = spawn(this.dolphinPath, params);
    }

    this.process.on('spawn', async () => {
      this.pid = this.process!.pid!;
      try {
        await this.connectToDolphin();
        this.emit(DolphinEvent.START_READY);
      } catch (e: any) {
        this.emit(DolphinEvent.START_FAILED, this.process !== null);
      }
    });
    this.process.on('close', (code) => {
      this.dolphinConnection.disconnect();
      this.process!.removeAllListeners();
      this.process = null;
      this.emit(DolphinEvent.CLOSE, code);
    });
  }

  public async play(replayPaths: string[]) {
    if (!this.process) {
      throw new Error('dolphin not open');
    }

    return this.writeComm(replayPaths);
  }

  public close() {
    if (!this.process) {
      return true;
    }
    return this.process.kill();
  }
}
