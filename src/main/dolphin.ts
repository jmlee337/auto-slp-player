import { ChildProcess, execFile, spawn } from 'child_process';
import EventEmitter from 'events';
import path from 'path';
import { writeFile } from 'fs/promises';
import { DolphinComm } from '../common/types';

export default class Dolphin extends EventEmitter {
  private commPath: string;

  private commNum: number;

  private dolphinPath: string;

  private isoPath: string;

  private process: ChildProcess | null;

  constructor(dolphinPath: string, isoPath: string, tempPath: string) {
    super();
    this.commPath = path.join(tempPath, 'comm.json');
    this.commNum = 0;
    this.dolphinPath = dolphinPath;
    this.isoPath = isoPath;
    this.process = null;
  }

  private async writeComm(replayPaths: string[]) {
    const comm: DolphinComm = {
      mode: 'queue',
      commandId: this.commNum.toString(),
      queue: replayPaths.map((replayPath) => ({ path: replayPath })),
    };
    this.commNum += 1;
    await writeFile(this.commPath, JSON.stringify(comm));
  }

  public async open(replayPaths: string[] = []) {
    if (this.process) {
      return;
    }

    await this.writeComm(replayPaths);
    const params = ['-b', '-e', this.isoPath, '-i', this.commPath];
    if (process.platform === 'darwin') {
      this.process = execFile(this.dolphinPath, params, {
        // 100MB
        maxBuffer: 1000 * 1000 * 100,
      });
    } else {
      this.process = spawn(this.dolphinPath, params);
    }

    this.process.on('close', (code) => {
      this.emit('close', code);
      this.process = null;
    });
  }

  public async play(replayPaths: string[]) {
    if (this.process) {
      this.writeComm(replayPaths);
      return;
    }
    await this.open(replayPaths);
  }

  public close() {
    if (!this.process) {
      return true;
    }
    return this.process.kill();
  }
}
