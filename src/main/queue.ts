import { AvailableSet, RendererQueue } from '../common/types';
import { toRendererSet } from './set';

export default class Queue {
  private id: string;

  private name: string;

  private sets: AvailableSet[];

  private nextSet: AvailableSet | null;

  private nextSetIsManual: boolean;

  constructor(id: string, name: string, sets: AvailableSet[] = []) {
    this.id = id;
    this.name = name;
    this.sets = sets;
    this.nextSet = null;
    this.nextSetIsManual = false;
  }

  public sortSets() {
    this.sets.sort((a, b) => {
      if (a.context?.startgg && b.context?.startgg) {
        const aStartgg = a.context.startgg;
        const bStartgg = b.context.startgg;
        const eventNameCompare = aStartgg.event.name.localeCompare(
          bStartgg.event.name,
        );
        if (eventNameCompare) {
          return eventNameCompare;
        }
        const phaseIdCompare = aStartgg.phase.id - bStartgg.phase.id;
        if (phaseIdCompare) {
          return phaseIdCompare;
        }
        if (
          aStartgg.phaseGroup.bracketType === 3 &&
          bStartgg.phaseGroup.bracketType === 3
        ) {
          // RR pools may not actually be played in round order,
          // and there's also no inter-round dependencies
          return (
            a.context.startMs +
            a.context.durationMs -
            (b.context.startMs - b.context.durationMs)
          );
        }
        const aRound = aStartgg.set.round;
        const bRound = bStartgg.set.round;
        if (aRound !== bRound) {
          if (aStartgg.set.ordinal !== null && bStartgg.set.ordinal !== null) {
            return aStartgg.set.ordinal - bStartgg.set.ordinal;
          }
          // only non-DE so this comparison is safe
          return aRound - bRound;
        }
        if (a.playedMs && b.playedMs) {
          return a.playedMs - b.playedMs;
        }
        if (a.playedMs && !b.playedMs) {
          return -1;
        }
        if (!a.playedMs && b.playedMs) {
          return 1;
        }
        return b.context.durationMs - a.context.durationMs;
      }
      if (a.context?.challonge && b.context?.challonge) {
        const aChallonge = a.context.challonge;
        const bChallonge = b.context.challonge;
        const tournamentNameCompare = aChallonge.tournament.name.localeCompare(
          bChallonge.tournament.name,
        );
        if (tournamentNameCompare) {
          return tournamentNameCompare;
        }
        if (
          aChallonge.tournament.tournamentType === 'round robin' &&
          bChallonge.tournament.tournamentType === 'round robin'
        ) {
          // RR pools may not actually be played in round order,
          // and there's also no inter-round dependencies
          return (
            a.context.startMs +
            a.context.durationMs -
            (b.context.startMs - b.context.durationMs)
          );
        }
        const aRound = aChallonge.set.round;
        const bRound = bChallonge.set.round;
        if (aRound !== bRound) {
          const aOrdinal = aChallonge.set.ordinal;
          const bOrdinal = bChallonge.set.ordinal;
          if (aOrdinal !== null && bOrdinal !== null) {
            return aOrdinal - bOrdinal;
          }
          // only if swiss so this comparison is safe
          return aRound - bRound;
        }
        if (a.playedMs && b.playedMs) {
          return a.playedMs - b.playedMs;
        }
        if (a.playedMs && !b.playedMs) {
          return -1;
        }
        if (!a.playedMs && b.playedMs) {
          return 1;
        }
        return b.context.durationMs - a.context.durationMs;
      }
      if (a.context && b.context) {
        return (
          a.context.startMs +
          a.context.durationMs -
          (b.context.startMs - b.context.durationMs)
        );
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
    };
  }

  public getSets(): AvailableSet[] {
    return this.sets;
  }
}
