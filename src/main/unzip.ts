import { createWriteStream } from 'fs';
import { access, mkdir, readFile, readdir, rmdir } from 'fs/promises';
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

export default async function unzip(
  zipPath: string,
  tempDir: string,
  dirNameToPlayedMs: Map<string, number>,
) {
  return new Promise<AvailableSet>((resolve, reject) => {
    setTimeout(() => {
      yauzl.open(zipPath, { lazyEntries: true }, async (openErr, zipFile) => {
        if (openErr) {
          reject(new Error(`failed to open zip file ${openErr.message}`));
          return;
        }
        const unzipDir = path.join(tempDir, path.basename(zipPath, '.zip'));
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
            context: toMainContext(await contextPromise),
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
    }, 1000);
  });
}
