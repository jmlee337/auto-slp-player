import {
  AvailableSet,
  Context,
  MainContext,
  MainContextScore,
  MainContextSlot,
  RenderSet,
} from '../common/types';

export function toMainContext(context: Context): MainContext | undefined {
  const tournamentName = context.tournament?.name;
  const eventName = context.event?.name;
  const eventSlug = context.event?.slug;
  const phaseId = context.phase?.id;
  const phaseName = context.phase?.name;
  const phaseGroupId = context.phaseGroup?.id;
  const phaseGroupName = context.phaseGroup?.name;

  const bestOf = context.set?.bestOf;
  const fullRoundText = context.set?.fullRoundText;
  const round = context.set?.round;
  const scores = context.set?.scores;
  if (
    !tournamentName ||
    !eventName ||
    !eventSlug ||
    !phaseId ||
    !phaseName ||
    !phaseGroupId ||
    !phaseGroupName ||
    !bestOf ||
    !fullRoundText ||
    !round ||
    !scores ||
    !Array.isArray(scores) ||
    scores.length === 0
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

  return {
    tournament: {
      name: tournamentName,
    },
    event: {
      name: eventName,
      slug: eventSlug,
    },
    phase: {
      id: phaseId,
      name: phaseName,
    },
    phaseGroup: {
      id: phaseGroupId,
      name: phaseGroupName,
    },
    set: {
      bestOf,
      fullRoundText,
      round,
      scores: mainScores,
    },
  };
}

export function toRenderSet(set: AvailableSet): RenderSet {
  const renderSet: RenderSet = {
    dirName: set.dirName,
    played: set.playedMs !== 0,
    playing: set.playing,
  };
  if (set.context) {
    renderSet.context = {
      namesLeft: set.context.set.scores[0].slots[0].displayNames.join(' / '),
      namesRight: set.context.set.scores[0].slots[1].displayNames.join(' / '),
      fullRoundText: set.context.set.fullRoundText,
      bestOf: set.context.set.bestOf,
      eventName: set.context.event.name,
      phaseName: set.context.phase.name,
      phaseGroupName: set.context.phaseGroup.name,
    };
  }
  return renderSet;
}
