import { createWriteStream } from 'fs';
import { access, mkdir, readFile, rmdir } from 'fs/promises';
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

export default async function unzip(zipPath: string, tempPath: string) {
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
          const context = await getContext(path.join(unzipDir, 'context.json'));
          resolve({
            dirName: path.basename(unzipDir),
            fullPath: unzipDir,
            context,
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
        zipFile.on('close', async () => {
          if (failureReason) {
            reject(new Error(failureReason));
          } else {
            const context = contextPath
              ? await getContext(contextPath)
              : undefined;
            resolve({
              dirName: path.basename(unzipDir),
              fullPath: unzipDir,
              context,
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
