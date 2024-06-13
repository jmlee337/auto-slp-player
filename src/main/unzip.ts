import { createWriteStream } from 'fs';
import { access, mkdir, readFile, readdir, rmdir, stat } from 'fs/promises';
import path from 'path';
import yauzl from 'yauzl';
import { AvailableSet, Context } from '../common/types';
import { toMainContext } from './set';

async function getContext(contextPath: string): Promise<Context> {
  try {
    return JSON.parse(await readFile(contextPath, { encoding: 'utf8' }));
  } catch (e: any) {
    return {};
  }
}

async function unzipInner(
  zipPath: string,
  tempDir: string,
  dirNameToPlayedMs: Map<string, number>,
  twitchChannel: string,
): Promise<AvailableSet> {
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, async (openErr, zipFile) => {
      if (openErr) {
        reject(new Error(`failed to open zip file ${openErr.message}`));
        return;
      }
      const unzipDir = path.join(tempDir, path.basename(zipPath, '.zip'));
      try {
        await access(unzipDir);
        const context = toMainContext(
          await getContext(path.join(unzipDir, 'context.json')),
        );
        const replayPaths = (await readdir(unzipDir))
          .filter((existingPath) => existingPath.endsWith('.slp'))
          .map((slpPath) => path.join(unzipDir, slpPath));
        replayPaths.sort();
        const dirName = path.basename(unzipDir);
        const streamedTwitchChannel = context?.startgg?.set.twitchStream;
        if (
          twitchChannel &&
          streamedTwitchChannel &&
          twitchChannel !== streamedTwitchChannel &&
          !dirNameToPlayedMs.has(dirName)
        ) {
          dirNameToPlayedMs.set(dirName, context?.startMs ?? Date.now());
        }
        resolve({
          context,
          dirName,
          playedMs: dirNameToPlayedMs.get(dirName) ?? 0,
          playing: false,
          replayPaths,
        });
      } catch (accessE: any) {
        try {
          await mkdir(unzipDir);
        } catch (mkdirE: any) {
          reject(new Error(`failed to make unzip dir: ${mkdirE}`));
          return;
        }
      }

      let contextPath = '';
      let failureReason = '';
      const replayPaths: string[] = [];
      zipFile.on('close', async () => {
        if (failureReason) {
          reject(new Error(failureReason));
        } else {
          const context = contextPath
            ? toMainContext(await getContext(contextPath))
            : undefined;
          replayPaths.sort();
          const dirName = path.basename(unzipDir);
          const streamedTwitchChannel = context?.startgg?.set.twitchStream;
          if (
            twitchChannel &&
            streamedTwitchChannel &&
            twitchChannel !== streamedTwitchChannel &&
            !dirNameToPlayedMs.has(dirName)
          ) {
            dirNameToPlayedMs.set(dirName, context?.startMs ?? Date.now());
          }
          resolve({
            context,
            dirName,
            playedMs: dirNameToPlayedMs.get(dirName) ?? 0,
            playing: false,
            replayPaths,
          });
        }
      });
      zipFile.on('entry', async (entry) => {
        if (
          entry.fileName === 'context.json' ||
          entry.fileName.endsWith('.slp')
        ) {
          zipFile.openReadStream(
            entry,
            async (openReadStreamErr, readStream) => {
              if (openReadStreamErr) {
                failureReason = `failed to unzip file: ${entry.fileName}, ${openReadStreamErr.message}`;
                await rmdir(unzipDir);
                zipFile.close();
                return;
              }

              const unzipPath = path.join(unzipDir, entry.fileName);
              readStream.on('end', () => {
                if (entry.fileName === 'context.json') {
                  contextPath = unzipPath;
                } else {
                  replayPaths.push(unzipPath);
                }
                zipFile.readEntry();
              });
              const writeStream = createWriteStream(unzipPath);
              readStream.pipe(writeStream);
            },
          );
        } else {
          failureReason = `invalid zip contents: ${entry.fileName}`;
          await rmdir(unzipDir);
          zipFile.close();
        }
      });
      zipFile.readEntry();
    });
  });
}

async function unzipIfSettled(
  zipPath: string,
  tempDir: string,
  dirNameToPlayedMs: Map<string, number>,
  twitchChannel: string,
  lastSize: number,
  timeout: number,
  resolve: (availableSet: AvailableSet) => void,
  reject: (reason?: any) => void,
) {
  setTimeout(async () => {
    const stats = await stat(zipPath);
    const { size } = stats;
    if (size === lastSize) {
      try {
        const availableSet = await unzipInner(
          zipPath,
          tempDir,
          dirNameToPlayedMs,
          twitchChannel,
        );
        resolve(availableSet);
      } catch (e: any) {
        reject(e);
      }
    } else {
      unzipIfSettled(
        zipPath,
        tempDir,
        dirNameToPlayedMs,
        twitchChannel,
        size,
        timeout * 2,
        resolve,
        reject,
      );
    }
  }, timeout);
}

export default async function unzip(
  zipPath: string,
  tempDir: string,
  dirNameToPlayedMs: Map<string, number>,
  twitchChannel: string,
) {
  const stats = await stat(zipPath);
  const lastSize = stats.size;
  return new Promise<AvailableSet>((resolve, reject) => {
    unzipIfSettled(
      zipPath,
      tempDir,
      dirNameToPlayedMs,
      twitchChannel,
      lastSize,
      1000,
      resolve,
      reject,
    );
  });
}
