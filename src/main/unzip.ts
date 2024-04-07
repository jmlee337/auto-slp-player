import { createWriteStream } from 'fs';
import { access, mkdir, readFile, readdir, rmdir } from 'fs/promises';
import path from 'path';
import yauzl from 'yauzl';
import { AvailableSet, AvailableSetContext } from '../common/types';

async function getContext(
  contextPath: string,
): Promise<AvailableSetContext | undefined> {
  try {
    const context = JSON.parse(
      await readFile(contextPath, { encoding: 'utf8' }),
    );
    const { set } = context;
    if (!set || !set.bestOf || typeof set.bestOf !== 'number') {
      return undefined;
    }
    const { scores } = set;
    if (!scores || !Array.isArray(scores) || scores.length === 0) {
      return undefined;
    }
    const { slots } = scores[0];
    if (!slots || !Array.isArray(slots) || slots.length !== 2) {
      return undefined;
    }
    const retSlots: string[][] = [];
    for (let i = 0; i < 2; i += 1) {
      const { displayNames } = slots[i];
      if (
        !displayNames ||
        !Array.isArray(displayNames) ||
        displayNames.length < 1 ||
        displayNames.length > 2 ||
        !displayNames.every((displayName) => typeof displayName === 'string')
      ) {
        return undefined;
      }
      retSlots[i] = displayNames as string[];
    }
    return { bestOf: set.bestOf, gameCount: scores.length, slots: retSlots };
  } catch (e: any) {
    return undefined;
  }
}

export default async function unzip(
  zipPath: string,
  tempPath: string,
  playedSetDirNames: Set<string>,
) {
  return new Promise<AvailableSet>((resolve, reject) => {
    setTimeout(() => {
      yauzl.open(zipPath, { lazyEntries: true }, async (openErr, zipFile) => {
        if (openErr) {
          reject(new Error(`failed to open zip file ${openErr.message}`));
          return;
        }
        const unzipDir = path.join(tempPath, path.basename(zipPath, '.zip'));
        try {
          await access(unzipDir);
          const contextPromise = getContext(
            path.join(unzipDir, 'context.json'),
          );
          const replayPaths = (await readdir(unzipDir))
            .filter((existingPath) => existingPath.endsWith('.slp'))
            .map((slpPath) => path.join(unzipDir, slpPath));
          replayPaths.sort();
          const dirName = path.basename(unzipDir);
          resolve({
            dirName,
            replayPaths,
            context: await contextPromise,
            played: playedSetDirNames.has(dirName),
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
              ? await getContext(contextPath)
              : undefined;
            replayPaths.sort();
            const dirName = path.basename(unzipDir);
            resolve({
              dirName,
              replayPaths,
              context,
              played: playedSetDirNames.has(dirName),
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
    }, 1000);
  });
}
