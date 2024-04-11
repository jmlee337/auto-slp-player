import { AvailableSet, RenderSet } from '../common/types';

export default function toRenderSet(set: AvailableSet) {
  const renderSet: RenderSet = {
    dirName: set.dirName,
    played: set.played,
  };

  const bestOf = set.context.set?.bestOf;
  const fullRoundText = set.context.set?.fullRoundText;
  const eventName = set.context.event?.name;
  const phaseName = set.context.phase?.name;
  const phaseGroupName = set.context.phaseGroup?.name;
  if (
    !bestOf ||
    !fullRoundText ||
    !eventName ||
    !phaseName ||
    !phaseGroupName
  ) {
    return renderSet;
  }

  const scores = set.context.set?.scores;
  if (!Array.isArray(scores) || scores.length === 0) {
    return renderSet;
  }

  const { slots } = scores[0];
  if (!Array.isArray(slots) || slots.length !== 2) {
    return renderSet;
  }

  const displayNamesLeft = slots[0].displayNames;
  if (!Array.isArray(displayNamesLeft) || displayNamesLeft.length === 0) {
    return renderSet;
  }
  const namesLeft = displayNamesLeft.join(', ');

  const displayNamesRight = slots[1].displayNames;
  if (!Array.isArray(displayNamesRight) || displayNamesRight.length === 0) {
    return renderSet;
  }
  const namesRight = displayNamesRight.join(', ');

  renderSet.context = {
    namesLeft,
    namesRight,
    fullRoundText,
    bestOf,
    eventName,
    phaseName,
    phaseGroupName,
  };
  return renderSet;
}
