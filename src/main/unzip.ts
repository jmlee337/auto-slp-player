import { createWriteStream } from 'fs';
import { rm } from 'fs/promises';
import path from 'path';
import yauzl from 'yauzl-promise';
import { emptyDir } from 'fs-extra';
import { text } from 'node:stream/consumers';
import { pipeline } from 'stream/promises';
import { AvailableSet, MainContext, SetType } from '../common/types';
import { toMainContext } from './set';

export async function scan(
  originalPath: string,
  originalPathToPlayedMs: Map<string, number>,
  mirroredSetIds: Set<number>,
  twitchChannel: string,
): Promise<AvailableSet> {
  const twitchChannelLower = twitchChannel.toLowerCase();
  const zip = await yauzl.open(originalPath);
  let context: MainContext | undefined;
  let numReplays = 0;
  try {
    for await (const entry of zip) {
      if (entry.filename === 'context.json') {
        try {
          const readStream = await entry.openReadStream();
          context = toMainContext(JSON.parse(await text(readStream)));
        } catch (e: any) {
          throw new Error(
            `failed to read zipped context.json: ${
              e instanceof Error ? e.message : e
            }`,
          );
        }
      } else if (entry.filename.endsWith('.slp')) {
        numReplays += 1;
      } else {
        throw new Error(`invalid zip contents: ${entry.filename}`);
      }
    }
  } finally {
    zip.close();
  }

  const stream = context?.startgg?.set.stream || context?.challonge?.set.stream;
  const wasStreamedOnAnotherChannel =
    twitchChannelLower &&
    stream &&
    (stream.domain !== 'twitch' ||
      stream.path.toLowerCase() !== twitchChannelLower);
  const sggSetId = context?.startgg?.set.id;
  const wasMirroredLive = sggSetId && mirroredSetIds.has(sggSetId);
  if (
    (!context || wasStreamedOnAnotherChannel || wasMirroredLive) &&
    !originalPathToPlayedMs.has(originalPath)
  ) {
    originalPathToPlayedMs.set(originalPath, context?.startMs ?? Date.now());
  }
  return {
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
  };
}

export async function unzip(set: AvailableSet, tempDir: string): Promise<void> {
  if (set.type !== SetType.ZIP) {
    return;
  }
  set.replayPaths.length = 0;

  const replayPaths = new Set<string>();
  const unzipDir = path.join(tempDir, path.basename(set.originalPath, '.zip'));
  await emptyDir(unzipDir);
  const zip = await yauzl.open(set.originalPath);
  try {
    for await (const entry of zip) {
      if (entry.filename.endsWith('.slp')) {
        try {
          const readStream = await entry.openReadStream();
          const unzipPath = path.join(unzipDir, entry.filename);
          const writeStream = createWriteStream(unzipPath);
          await pipeline(readStream, writeStream);
          replayPaths.add(unzipPath);
        } catch (e: any) {
          throw new Error(
            `failed to unzip file: ${entry.filename}, ${
              e instanceof Error ? e.message : e
            }`,
          );
        }
      } else if (entry.filename !== 'context.json') {
        throw new Error(`invalid zip contents: ${entry.filename}`);
      }
    }
  } catch (e: any) {
    await rm(unzipDir, { recursive: true, force: true });
    throw e;
  } finally {
    zip.close();
  }
  set.replayPaths.push(...Array.from(replayPaths));
  set.replayPaths.sort();
}

async function deleteInner(unzipDir: string, timeoutMs: number) {
  if (timeoutMs) {
    return new Promise<boolean>((resolve) => {
      setTimeout(async () => {
        try {
          await rm(unzipDir, { recursive: true, force: true });
          resolve(true);
        } catch {
          resolve(false);
        }
      }, timeoutMs);
    });
  }
  try {
    await rm(unzipDir, { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}

export async function deleteZipDir(
  set: AvailableSet,
  tempDir: string,
): Promise<void> {
  if (set.type !== SetType.ZIP) {
    return;
  }

  const unzipDir = path.join(tempDir, path.basename(set.originalPath, '.zip'));
  let success = await deleteInner(unzipDir, 0);
  if (!success) {
    let retries = 0;
    while (!success && retries < 3) {
      success = await deleteInner(unzipDir, 250 * 2 ** retries);
      retries += 1;
    }
    if (!success) {
      throw new Error('timed out trying to delete');
    }
  }
}
