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

  const tournamentName = context.startgg?.tournament?.name;
  const eventName = context.startgg?.event?.name;
  const eventSlug = context.startgg?.event?.slug;
  const phaseId = context.startgg?.phase?.id;
  const phaseName = context.startgg?.phase?.name;
  const phaseGroupId = context.startgg?.phaseGroup?.id;
  const phaseGroupName = context.startgg?.phaseGroup?.name;
  const fullRoundText = context.startgg?.set?.fullRoundText;
  const round = context.startgg?.set?.round;
  const twitchStream = context.startgg?.set?.twitchStream;
  if (
    typeof tournamentName !== 'string' ||
    typeof eventName !== 'string' ||
    typeof eventSlug !== 'string' ||
    !Number.isInteger(phaseId) ||
    typeof phaseName !== 'string' ||
    !Number.isInteger(phaseGroupId) ||
    typeof phaseGroupName !== 'string' ||
    typeof fullRoundText !== 'string' ||
    !Number.isInteger(round) ||
    (twitchStream !== null && typeof twitchStream !== 'string')
  ) {
    return mainContext;
  }

  mainContext.startgg = {
    tournament: {
      name: tournamentName,
    },
    event: {
      name: eventName,
      slug: eventSlug,
    },
    phase: {
      id: phaseId!,
      name: phaseName,
    },
    phaseGroup: {
      id: phaseGroupId!,
      name: phaseGroupName,
    },
    set: {
      fullRoundText,
      round: round!,
      twitchStream,
    },
  };
  return mainContext;
}

export function toRenderSet(set: AvailableSet): RenderSet {
  const renderSet: RenderSet = {
    dirName: set.dirName,
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
  }
  return renderSet;
}
