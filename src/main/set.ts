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
  const startggPhaseGroupBracketType = context.startgg?.phaseGroup?.bracketType;
  const startggFullRoundText = context.startgg?.set?.fullRoundText;
  const startggRound = context.startgg?.set?.round;
  const startggOrdinal = context.startgg?.set?.ordinal;
  const startggStream = context.startgg?.set?.stream;
  const startggStreamDomain = context.startgg?.set?.stream?.domain;
  const startggStreamPath = context.startgg?.set?.stream?.path;
  if (
    typeof startggTournamentName === 'string' &&
    typeof startggEventName === 'string' &&
    typeof startggEventSlug === 'string' &&
    Number.isInteger(startggPhaseId) &&
    typeof startggPhaseName === 'string' &&
    Number.isInteger(startggPhaseGroupId) &&
    typeof startggPhaseGroupName === 'string' &&
    Number.isInteger(startggPhaseGroupBracketType) &&
    typeof startggFullRoundText === 'string' &&
    Number.isInteger(startggRound) &&
    (startggOrdinal === null || Number.isFinite(startggOrdinal)) &&
    startggStream !== undefined &&
    (startggStream === null ||
      (typeof startggStreamDomain === 'string' &&
        typeof startggStreamPath === 'string'))
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
        bracketType: startggPhaseGroupBracketType!,
      },
      set: {
        fullRoundText: startggFullRoundText,
        round: startggRound!,
        ordinal: startggOrdinal as number | null,
        stream: startggStream,
      },
    };
  }

  const challongeTournamentName = context.challonge?.tournament?.name;
  const challongeTournamentSlug = context.challonge?.tournament?.slug;
  const challongeTournamentType = context.challonge?.tournament?.tournamentType;
  const challongeFullRoundText = context.challonge?.set?.fullRoundText;
  const challongeRound = context.challonge?.set?.round;
  const challongeOrdinal = context.challonge?.set?.ordinal;
  const challongeStream = context.challonge?.set?.stream;
  const challongeStreamDomain = context.challonge?.set?.stream?.domain;
  const challongeStreamPath = context.challonge?.set?.stream?.path;
  if (
    typeof challongeTournamentName === 'string' &&
    typeof challongeTournamentSlug === 'string' &&
    typeof challongeTournamentType === 'string' &&
    typeof challongeFullRoundText === 'string' &&
    Number.isInteger(challongeRound) &&
    (challongeOrdinal === null || Number.isInteger(challongeOrdinal)) &&
    challongeStream !== undefined &&
    (challongeStream === null ||
      (typeof challongeStreamDomain === 'string' &&
        typeof challongeStreamPath === 'string'))
  ) {
    mainContext.challonge = {
      tournament: {
        name: challongeTournamentName,
        slug: challongeTournamentSlug,
        tournamentType: challongeTournamentType,
      },
      set: {
        fullRoundText: challongeFullRoundText,
        ordinal: challongeOrdinal as number | null,
        round: challongeRound!,
        stream: challongeStream,
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
        stream: set.context.startgg.set.stream,
      };
    }
    if (set.context.challonge) {
      renderSet.context.challonge = {
        tournamentName: set.context.challonge.tournament.name,
        fullRoundText: set.context.challonge.set.fullRoundText,
        stream: set.context.challonge.set.stream,
      };
    }
  }
  return renderSet;
}
