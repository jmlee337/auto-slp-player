import { createWriteStream } from 'fs';
import { mkdir, rmdir } from 'fs/promises';
import path from 'path';
import { open } from 'yauzl';

export default async function unzip(zipPath: string, tempPath: string) {
  return new Promise<string>((resolve, reject) => {
    setTimeout(() => {
      open(zipPath, { lazyEntries: true }, async (openErr, zipFile) => {
        if (openErr) {
          reject(new Error(`failed to open zip file ${openErr.message}`));
          return;
        }
        const unzipDir = path.join(tempPath, path.basename(zipPath, '.zip'));
        try {
          await mkdir(unzipDir);
        } catch (e: any) {
          reject(new Error('failed to make unzip dir'));
          return;
        }

        let failureReason = '';
        zipFile.on('close', () => {
          if (failureReason) {
            reject(new Error(failureReason));
          } else {
            resolve(unzipDir);
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

                readStream.on('end', () => {
                  zipFile.readEntry();
                });
                const unzipPath = path.join(unzipDir, entry.fileName);
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
