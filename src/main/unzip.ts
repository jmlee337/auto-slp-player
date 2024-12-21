import { createWriteStream } from 'fs';
import { rm } from 'fs/promises';
import path from 'path';
import yauzl from 'yauzl';
import { emptyDir } from 'fs-extra';
import { AvailableSet, MainContext, SetType } from '../common/types';
import { toMainContext } from './set';

export async function scan(
  originalPath: string,
  originalPathToPlayedMs: Map<string, number>,
  twitchChannel: string,
): Promise<AvailableSet> {
  const twitchChannelLower = twitchChannel.toLowerCase();
  return new Promise((resolve, reject) => {
    yauzl.open(
      originalPath,
      { lazyEntries: true },
      async (openErr, zipFile) => {
        if (openErr) {
          reject(new Error(`failed to open zip file ${openErr.message}`));
          return;
        }

        let context: MainContext | undefined;
        let failureReason = '';
        let numReplays = 0;
        zipFile.on('close', async () => {
          if (failureReason) {
            reject(new Error(failureReason));
          } else {
            const stream =
              context?.startgg?.set.stream || context?.challonge?.set.stream;
            const wasStreamedOnAnotherChannel =
              twitchChannelLower &&
              stream &&
              (stream.domain !== 'twitch' ||
                stream.path.toLowerCase() !== twitchChannelLower);
            if (
              (!context || wasStreamedOnAnotherChannel) &&
              !originalPathToPlayedMs.has(originalPath)
            ) {
              originalPathToPlayedMs.set(
                originalPath,
                context?.startMs ?? Date.now(),
              );
            }
            resolve({
              context,
              invalidReason: numReplays === 0 ? 'No replays' : '',
              originalPath,
              playedMs:
                numReplays === 0
                  ? Date.now()
                  : originalPathToPlayedMs.get(originalPath) ?? 0,
              playing: false,
              replayPaths: [],
              type: SetType.ZIP,
            });
          }
        });
        zipFile.on('entry', async (entry) => {
          if (entry.fileName === 'context.json') {
            zipFile.openReadStream(
              entry,
              async (openReadStreamErr, readStream) => {
                if (openReadStreamErr) {
                  failureReason = `failed to read zipped context.json: ${openReadStreamErr.message}`;
                  zipFile.close();
                  return;
                }

                let str = '';
                readStream.on('end', () => {
                  context = toMainContext(JSON.parse(str));
                  zipFile.readEntry();
                });
                readStream.setEncoding('utf8');
                readStream.on('data', (chunk) => {
                  str = str.concat(chunk as string);
                });
              },
            );
          } else if (entry.fileName.endsWith('.slp')) {
            numReplays += 1;
            zipFile.readEntry();
          } else {
            failureReason = `invalid zip contents: ${entry.fileName}`;
            zipFile.close();
          }
        });
        zipFile.readEntry();
      },
    );
  });
}

export async function unzip(set: AvailableSet, tempDir: string): Promise<void> {
  if (set.type !== SetType.ZIP) {
    return;
  }

  const unzipDir = path.join(tempDir, path.basename(set.originalPath, '.zip'));
  await emptyDir(unzipDir);
  await new Promise<void>((resolve, reject) => {
    yauzl.open(
      set.originalPath,
      { lazyEntries: true },
      async (openErr, zipFile) => {
        if (openErr) {
          reject(new Error(`failed to open zip file ${openErr.message}`));
          return;
        }

        let failureReason = '';
        zipFile.on('close', async () => {
          if (failureReason) {
            reject(new Error(failureReason));
          } else {
            set.replayPaths.sort();
            resolve();
          }
        });
        zipFile.on('entry', async (entry) => {
          if (entry.fileName === 'context.json') {
            zipFile.readEntry();
          } else if (entry.fileName.endsWith('.slp')) {
            zipFile.openReadStream(
              entry,
              async (openReadStreamErr, readStream) => {
                if (openReadStreamErr) {
                  failureReason = `failed to unzip file: ${entry.fileName}, ${openReadStreamErr.message}`;
                  await rm(unzipDir, { recursive: true, force: true });
                  zipFile.close();
                  return;
                }

                const unzipPath = path.join(unzipDir, entry.fileName);
                readStream.on('end', () => {
                  set.replayPaths.push(unzipPath);
                  zipFile.readEntry();
                });
                const writeStream = createWriteStream(unzipPath);
                readStream.pipe(writeStream);
              },
            );
          } else {
            failureReason = `invalid zip contents: ${entry.fileName}`;
            await rm(unzipDir, { recursive: true, force: true });
            zipFile.close();
          }
        });
        zipFile.readEntry();
      },
    );
  });
}

export async function deleteZipDir(
  set: AvailableSet,
  tempDir: string,
): Promise<void> {
  if (set.type !== SetType.ZIP) {
    return;
  }

  const unzipDir = path.join(tempDir, path.basename(set.originalPath, '.zip'));
  await rm(unzipDir, { recursive: true, force: true });
}
