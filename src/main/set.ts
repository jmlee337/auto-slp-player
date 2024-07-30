import { format } from 'date-fns';
import {
  AvailableSet,
  Context,
  MainContext,
  MainContextScore,
  MainContextSlot,
  RenderSet,
} from '../common/types';

export function toMainContext(context: Context): MainContext | undefined {
  const { bestOf, durationMs, scores, startMs } = context;
  if (
    !Number.isInteger(bestOf) ||
    !Number.isInteger(durationMs) ||
    !scores ||
    !Array.isArray(scores) ||
    scores.length === 0 ||
    !Number.isInteger(startMs)
  ) {
    return undefined;
  }

  const mainScores: MainContextScore[] = [];
  for (let i = 0; i < scores.length; i += 1) {
    const { slots } = scores[i];
    if (!slots || !Array.isArray(slots) || slots.length !== 2) {
      return undefined;
    }

    const mainSlots: MainContextSlot[] = [];
    for (let j = 0; j < slots.length; j += 1) {
      const { displayNames, prefixes, pronouns, score } = slots[j];
      if (
        !displayNames ||
        !Array.isArray(displayNames) ||
        displayNames.length === 0 ||
        !prefixes ||
        !Array.isArray(prefixes) ||
        prefixes.length !== displayNames.length ||
        !pronouns ||
        !Array.isArray(pronouns) ||
        pronouns.length !== prefixes.length ||
        score === undefined ||
        !Number.isInteger(score)
      ) {
        return undefined;
      }
      mainSlots.push({ displayNames, prefixes, pronouns, score });
    }
    mainScores.push({ slots: mainSlots });
  }

  const mainContext: MainContext = {
    bestOf: bestOf!,
    durationMs: durationMs!,
    scores: mainScores,
    startMs: startMs!,
  };

  const startggTournamentName = context.startgg?.tournament?.name;
  const startggEventName = context.startgg?.event?.name;
  const startggEventSlug = context.startgg?.event?.slug;
  const startggPhaseId = context.startgg?.phase?.id;
  const startggPhaseName = context.startgg?.phase?.name;
  const startggPhaseGroupId = context.startgg?.phaseGroup?.id;
  const startggPhaseGroupName = context.startgg?.phaseGroup?.name;
  const startggFullRoundText = context.startgg?.set?.fullRoundText;
  const startggRound = context.startgg?.set?.round;
  const startggTwitchStream = context.startgg?.set?.twitchStream;
  if (
    typeof startggTournamentName === 'string' &&
    typeof startggEventName === 'string' &&
    typeof startggEventSlug === 'string' &&
    Number.isInteger(startggPhaseId) &&
    typeof startggPhaseName === 'string' &&
    Number.isInteger(startggPhaseGroupId) &&
    typeof startggPhaseGroupName === 'string' &&
    typeof startggFullRoundText === 'string' &&
    Number.isInteger(startggRound) &&
    (startggTwitchStream === null || typeof startggTwitchStream === 'string')
  ) {
    mainContext.startgg = {
      tournament: {
        name: startggTournamentName,
      },
      event: {
        name: startggEventName,
        slug: startggEventSlug,
      },
      phase: {
        id: startggPhaseId!,
        name: startggPhaseName,
      },
      phaseGroup: {
        id: startggPhaseGroupId!,
        name: startggPhaseGroupName,
      },
      set: {
        fullRoundText: startggFullRoundText,
        round: startggRound!,
        twitchStream: startggTwitchStream,
      },
    };
  }

  const challongeTournamentName = context.challonge?.tournament.name;
  const challongeTournamentSlug = context.challonge?.tournament.slug;
  const challongeFullRoundText = context.challonge?.set.fullRoundText;
  const challongeRound = context.challonge?.set.round;
  const challongeOrdinal = context.challonge?.set.ordinal;
  if (
    typeof challongeTournamentName === 'string' &&
    typeof challongeTournamentSlug === 'string' &&
    typeof challongeFullRoundText === 'string' &&
    Number.isInteger(challongeRound) &&
    (challongeOrdinal === null || Number.isInteger(challongeOrdinal))
  ) {
    mainContext.challonge = {
      tournament: {
        name: challongeTournamentName,
        slug: challongeTournamentSlug,
      },
      set: {
        fullRoundText: challongeFullRoundText,
        round: challongeRound!,
        ordinal: challongeOrdinal as number | null,
      },
    };
  }

  return mainContext;
}

export function toRenderSet(set: AvailableSet): RenderSet {
  const renderSet: RenderSet = {
    dirName: set.dirName,
    invalidReason: set.invalidReason,
    played: set.playedMs !== 0,
    playing: set.playing,
  };
  if (set.context) {
    renderSet.context = {
      bestOf: set.context.bestOf,
      namesLeft: set.context.scores[0].slots[0].displayNames.join(' / '),
      namesRight: set.context.scores[0].slots[1].displayNames.join(' / '),
      duration: format(new Date(set.context.durationMs), 'm:ss'),
    };
    if (set.context.startgg) {
      renderSet.context.startgg = {
        fullRoundText: set.context.startgg.set.fullRoundText,
        eventName: set.context.startgg.event.name,
        phaseName: set.context.startgg.phase.name,
        phaseGroupName: set.context.startgg.phaseGroup.name,
        twitchStream: set.context.startgg.set.twitchStream ?? '',
      };
    }
    if (set.context.challonge) {
      renderSet.context.challonge = {
        tournamentName: set.context.challonge.tournament.name,
        fullRoundText: set.context.challonge.set.fullRoundText,
      };
    }
  }
  return renderSet;
}
