import { AvailableSet, RendererQueue } from '../common/types';
import { toRendererSet } from './set';

export default class Queue {
  private id: string;

  private name: string;

  private hasWave: boolean;

  private sets: AvailableSet[];

  private nextSet: AvailableSet | null;

  private nextSetIsManual: boolean;

  public paused: boolean;

  private shouldCheckOvertime: boolean;

  public allottedDurationMs: number;

  private playbackStartedMs: number;

  private liveStartedMs: number;

  constructor(
    id: string,
    name: string,
    hasWave: boolean,
    sets: AvailableSet[] = [],
  ) {
    this.id = id;
    this.name = name;
    this.hasWave = hasWave;
    this.sets = sets;
    this.nextSet = null;
    this.nextSetIsManual = false;
    this.paused = false;
    this.shouldCheckOvertime = hasWave;
    this.allottedDurationMs = 0;
    this.playbackStartedMs = Number.POSITIVE_INFINITY;
    this.liveStartedMs = Number.POSITIVE_INFINITY;

    this.sets.forEach((set) => {
      if (this.shouldCheckOvertime) {
        if (set?.context?.startgg) {
          if (
            !(
              set.context.startgg.phaseGroup.bracketType === 3 ||
              set.context.startgg.phaseGroup.bracketType === 4
            )
          ) {
            this.shouldCheckOvertime = false;
          }
        } else if (set?.context?.challonge) {
          if (
            !(
              set.context.challonge.tournament.tournamentType === 'swiss' ||
              set.context.challonge.tournament.tournamentType === 'round robin'
            )
          ) {
            this.shouldCheckOvertime = false;
          }
        } else {
          this.shouldCheckOvertime = false;
        }
      }

      if (set.playedMs > 0) {
        this.playbackStartedMs = Math.min(this.playbackStartedMs, set.playedMs);
      }

      if (set.context) {
        this.liveStartedMs = Math.min(this.liveStartedMs, set.context.startMs);
      }
    });
  }

  public getId() {
    return this.id;
  }

  public sortSets() {
    this.sets.sort((a, b) => {
      if (a.playedMs && !b.playedMs) {
        return -1;
      }
      if (!a.playedMs && b.playedMs) {
        return 1;
      }
      if (a.context && b.context) {
        if (a.context.startMs === b.context.startMs) {
          return b.context.durationMs - a.context.durationMs;
        }
        return a.context.startMs - b.context.startMs;
      }
      if (!a.context && b.context) {
        return -1;
      }
      if (a.context && !b.context) {
        return 1;
      }
      return a.originalPath.localeCompare(b.originalPath);
    });
  }

  public setQualifiesToPlayNext(set: AvailableSet) {
    const playableAndPlayingSets = this.sets.filter(
      (queueSet) => queueSet.playing || queueSet.playedMs === 0,
    );
    const setI = playableAndPlayingSets.indexOf(set);
    if (setI === -1) {
      return false;
    }

    if (this.sets.length === 1) {
      return true;
    }
    if (playableAndPlayingSets[0] === set && !this.isPlaying()) {
      return true;
    }

    const preceedingI =
      setI === 0 ? playableAndPlayingSets.length - 1 : setI - 1;
    return playableAndPlayingSets[preceedingI].playing;
  }

  public maybePlayNext(set: AvailableSet) {
    if (set.playing || set.playedMs !== 0) {
      return;
    }
    const playableAndPlayingSets = this.sets.filter(
      (queueSet) => queueSet.playing || queueSet.playedMs === 0,
    );
    const setI = playableAndPlayingSets.indexOf(set);
    if (setI === -1) {
      return;
    }

    if (!this.nextSet) {
      this.nextSet = set;
      this.nextSetIsManual = false;
      return;
    }

    if (this.nextSetIsManual) {
      return;
    }

    if (setI === 0) {
      if (
        playableAndPlayingSets[playableAndPlayingSets.length - 1].playing &&
        playableAndPlayingSets[setI + 1] === this.nextSet
      ) {
        this.nextSet = set;
        this.nextSetIsManual = false;
      }
    } else if (setI === playableAndPlayingSets.length - 1) {
      if (
        playableAndPlayingSets[setI - 1].playing &&
        playableAndPlayingSets[0] === this.nextSet
      ) {
        this.nextSet = set;
        this.nextSetIsManual = false;
      }
    } else if (
      playableAndPlayingSets[setI - 1].playing &&
      playableAndPlayingSets[setI + 1] === this.nextSet
    ) {
      this.nextSet = set;
      this.nextSetIsManual = false;
    }
  }

  private getCalculatedNextSet(set?: AvailableSet) {
    // if no sets
    if (this.sets.length === 0) {
      return null;
    }

    // check playing sets
    let upperBound = this.sets.length;
    const earlyI = set ? this.sets.indexOf(set) : -1;
    const playingI = earlyI >= 0 ? earlyI : this.sets.length - 2;
    for (let i = playingI; i >= 0; i -= 1) {
      if (this.sets[i].playing) {
        // find next playable set after last playing set
        for (let j = i + 1; j < upperBound; j += 1) {
          if (this.sets[j].playedMs === 0) {
            return this.sets[j];
          }
        }
        upperBound = i;
      }
    }

    // no playing set with playable set after, check before
    for (let i = 0; i < upperBound; i += 1) {
      if (this.sets[i].playedMs === 0) {
        return this.sets[i];
      }
    }

    // no playable sets at all
    return null;
  }

  public setCalculatedNextSet(set?: AvailableSet) {
    this.nextSetIsManual = false;
    this.nextSet = this.getCalculatedNextSet(set);
  }

  public enqueue(set: AvailableSet) {
    this.sets.push(set);

    this.sortSets();
    if (this.shouldCheckOvertime) {
      if (set?.context?.startgg) {
        if (
          !(
            set.context.startgg.phaseGroup.bracketType === 3 ||
            set.context.startgg.phaseGroup.bracketType === 4
          )
        ) {
          this.shouldCheckOvertime = false;
        }
      } else if (set?.context?.challonge) {
        if (
          !(
            set.context.challonge.tournament.tournamentType === 'swiss' ||
            set.context.challonge.tournament.tournamentType === 'round robin'
          )
        ) {
          this.shouldCheckOvertime = false;
        }
      } else {
        this.shouldCheckOvertime = false;
      }
    }
    if (set.context) {
      this.liveStartedMs = Math.min(this.liveStartedMs, set.context.startMs);
    }
  }

  public peek(): { nextSet: AvailableSet | null; nextSetIsManual: boolean } {
    return { nextSet: this.nextSet, nextSetIsManual: this.nextSetIsManual };
  }

  public dequeue(set: AvailableSet) {
    if (!this.sets.includes(set)) {
      throw new Error(`set not present in queue: ${set.originalPath}`);
    }

    set.invalidReason = '';
    set.playedMs = Date.now();
    set.playing = true;
    this.sortSets();
    this.setCalculatedNextSet(set);
    if (!Number.isFinite(this.playbackStartedMs)) {
      this.playbackStartedMs = set.playedMs;
    }
  }

  public find(originalPath: string): AvailableSet {
    const ret = this.sets.find((set) => set.originalPath === originalPath);
    if (!ret) {
      throw new Error(`no such set: ${originalPath}`);
    }

    return ret;
  }

  public setNextSetManually(originalPath: string): void {
    this.nextSet = this.find(originalPath);
    this.nextSetIsManual = true;
  }

  public clearNextSet(): void {
    this.nextSet = null;
    this.nextSetIsManual = false;
  }

  public isPlaying(): boolean {
    return this.sets.some((set) => set.playing);
  }

  public toRendererQueue(): RendererQueue {
    return {
      id: this.id,
      name: this.name,
      sets: this.sets.map(toRendererSet),
      nextSetOriginalPath: this.nextSet?.originalPath ?? '',
      paused: this.paused,
    };
  }

  public getSets(): AvailableSet[] {
    return this.sets;
  }

  public getShouldCheckOvertime(): boolean {
    return this.sets.length > 0 ? this.shouldCheckOvertime : false;
  }

  public getPlaybackStartedMs(): number {
    if (Number.isFinite(this.playbackStartedMs)) {
      return this.playbackStartedMs;
    }
    return 0;
  }

  public getLiveStartedMs(): number {
    if (Number.isFinite(this.liveStartedMs)) {
      return this.liveStartedMs;
    }
    return 0;
  }

  public getPlayingSets(): AvailableSet[] {
    return this.sets.filter((set) => set.playing);
  }
}
