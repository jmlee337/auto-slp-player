import {
  ApiPhaseGroup,
  AvailableSet,
  Context,
  ContextPlayer,
  MainContext,
  MainContextPlayer,
  MainContextPlayers,
  MainContextScore,
  MainContextSlot,
  RendererSet,
} from '../common/types';

export function toMainContext(context: Context): MainContext | undefined {
  const { bestOf, durationMs, scores, finalScore, startMs } = context;
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
  for (const { slots } of scores) {
    if (!slots || !Array.isArray(slots) || slots.length !== 2) {
      return undefined;
    }

    const mainSlots: MainContextSlot[] = [];
    for (const { displayNames, prefixes, pronouns, score } of slots) {
      if (
        !Array.isArray(displayNames) ||
        displayNames.length === 0 ||
        !Array.isArray(prefixes) ||
        prefixes.length !== displayNames.length ||
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

  let mainFinalScore: undefined | MainContextScore;
  if (finalScore) {
    const { slots } = finalScore;
    if (slots && Array.isArray(slots) && slots.length === 2) {
      const mainFinalScoreSlots: MainContextSlot[] = [];
      for (const { displayNames, prefixes, pronouns, score } of slots) {
        if (
          Array.isArray(displayNames) &&
          displayNames.length > 0 &&
          Array.isArray(prefixes) &&
          prefixes.length === displayNames.length &&
          Array.isArray(pronouns) &&
          pronouns.length === displayNames.length &&
          score !== undefined &&
          Number.isInteger(score)
        ) {
          mainFinalScoreSlots.push({ displayNames, prefixes, pronouns, score });
        }
      }
      if (mainFinalScoreSlots.length === 2) {
        mainFinalScore = { slots: mainFinalScoreSlots };
      }
    }
  }

  let mainPlayers: undefined | MainContextPlayers;
  if (
    Array.isArray(context.players?.entrant1) &&
    context.players.entrant1.length > 0 &&
    Array.isArray(context.players?.entrant2) &&
    context.players.entrant2.length > 0
  ) {
    const playerEveryPred = (player: ContextPlayer) =>
      typeof player.name === 'string' &&
      player.name.length > 0 &&
      Array.isArray(player.characters) &&
      player.characters.length > 0 &&
      player.characters.every(
        (character) => typeof character === 'string' && character.length > 0,
      );
    if (
      context.players.entrant1.every(playerEveryPred) &&
      context.players.entrant2.every(playerEveryPred)
    ) {
      const playerMapPred = (player: ContextPlayer): MainContextPlayer => ({
        name: player.name!,
        characters: player.characters!,
      });
      mainPlayers = {
        entrant1: context.players.entrant1.map(playerMapPred),
        entrant2: context.players.entrant2.map(playerMapPred),
      };
    }
  }

  const mainContext: MainContext = {
    bestOf: bestOf!,
    durationMs: durationMs! + scores.length * 2500,
    scores: mainScores,
    finalScore: mainFinalScore,
    players: mainPlayers,
    startMs: startMs!,
  };

  const startggTournamentName = context.startgg?.tournament?.name;
  const startggTournamentLocation = context.startgg?.tournament?.location ?? '';
  const startggEventName = context.startgg?.event?.name;
  const startggEventSlug = context.startgg?.event?.slug;
  const startggEventHasSiblings = context.startgg?.event?.hasSiblings ?? true;
  const startggPhaseId = context.startgg?.phase?.id;
  const startggPhaseName = context.startgg?.phase?.name;
  const startggPhaseHasSiblings = context.startgg?.phase?.hasSiblings ?? true;
  const startggPhaseGroupId = context.startgg?.phaseGroup?.id;
  const startggPhaseGroupName = context.startgg?.phaseGroup?.name;
  const startggPhaseGroupBracketType = context.startgg?.phaseGroup?.bracketType;
  const startggPhaseGroupHasSiblings =
    context.startgg?.phaseGroup?.hasSiblings ?? true;
  const startggPhaseGroupWaveId = context.startgg?.phaseGroup?.waveId ?? null;
  const startggSetId =
    Number.isInteger(context.startgg?.set?.id) &&
    (context.startgg!.set!.id as number) > 0
      ? (context.startgg!.set!.id as number)
      : null;
  const startggFullRoundText = context.startgg?.set?.fullRoundText;
  const startggRound = context.startgg?.set?.round;
  const startggOrdinal = context.startgg?.set?.ordinal ?? null;
  const startggStream = context.startgg?.set?.stream ?? null;
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
    (startggPhaseGroupWaveId === null ||
      Number.isInteger(startggPhaseGroupWaveId)) &&
    typeof startggFullRoundText === 'string' &&
    Number.isInteger(startggRound) &&
    (startggOrdinal === null || Number.isFinite(startggOrdinal)) &&
    (startggStream === null || (startggStreamDomain && startggStreamPath))
  ) {
    mainContext.startgg = {
      tournament: {
        name: startggTournamentName,
        location: startggTournamentLocation,
      },
      event: {
        name: startggEventName,
        slug: startggEventSlug,
        hasSiblings: startggEventHasSiblings,
      },
      phase: {
        id: startggPhaseId!,
        name: startggPhaseName,
        hasSiblings: startggPhaseHasSiblings,
      },
      phaseGroup: {
        id: startggPhaseGroupId!,
        name: startggPhaseGroupName,
        bracketType: startggPhaseGroupBracketType!,
        hasSiblings: startggPhaseGroupHasSiblings,
        waveId: startggPhaseGroupWaveId,
      },
      set: {
        id: startggSetId,
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
  const challongeOrdinal = context.challonge?.set?.ordinal ?? null;
  const challongeStream = context.challonge?.set?.stream ?? null;
  const challongeStreamDomain = context.challonge?.set?.stream?.domain;
  const challongeStreamPath = context.challonge?.set?.stream?.path;
  if (
    typeof challongeTournamentName === 'string' &&
    typeof challongeTournamentSlug === 'string' &&
    typeof challongeTournamentType === 'string' &&
    typeof challongeFullRoundText === 'string' &&
    Number.isInteger(challongeRound) &&
    (challongeOrdinal === null || Number.isInteger(challongeOrdinal)) &&
    (challongeStream === null || (challongeStreamDomain && challongeStreamPath))
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

export function toRendererSet(set: AvailableSet): RendererSet {
  const rendererSet: RendererSet = {
    originalPath: set.originalPath,
    invalidReason: set.invalidReason,
    playedMs: set.playedMs,
    playing: set.playing,
  };
  if (set.context) {
    rendererSet.context = {
      bestOf: set.context.bestOf,
      players: set.context.players,
      namesLeft: set.context.scores[0].slots[0].displayNames.join(' + '),
      namesRight: set.context.scores[0].slots[1].displayNames.join(' + '),
      durationMs: set.context.durationMs,
    };
    if (set.context.startgg) {
      rendererSet.context.startgg = {
        fullRoundText: set.context.startgg.set.fullRoundText,
        eventName: set.context.startgg.event.name,
        phaseName: set.context.startgg.phase.name,
        phaseGroupName: set.context.startgg.phaseGroup.name,
        stream: set.context.startgg.set.stream,
      };
    }
    if (set.context.challonge) {
      rendererSet.context.challonge = {
        tournamentName: set.context.challonge.tournament.name,
        fullRoundText: set.context.challonge.set.fullRoundText,
        stream: set.context.challonge.set.stream,
      };
    }
  }
  return rendererSet;
}

export function toApiPhaseGroup(set: AvailableSet): ApiPhaseGroup | null {
  if (set.context?.startgg) {
    return {
      tournamentName: set.context.startgg.tournament.name,
      tournamentLocation: set.context.startgg.tournament.location,
      eventSlug: set.context.startgg.event.slug,
      eventName: set.context.startgg.event.name,
      eventHasSiblings: set.context.startgg.event.hasSiblings,
      phaseId: set.context.startgg.phase.id,
      phaseName: set.context.startgg.phase.name,
      phaseHasSiblings: set.context.startgg.phase.hasSiblings,
      phaseGroupId: set.context.startgg.phaseGroup.id,
      phaseGroupName: set.context.startgg.phaseGroup.name,
      phaseGroupHasSiblings: set.context.startgg.phaseGroup.hasSiblings,
      phaseGroupBracketType: set.context.startgg.phaseGroup.bracketType,
    };
  }

  return null;
}
