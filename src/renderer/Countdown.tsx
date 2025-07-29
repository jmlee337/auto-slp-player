import { format } from 'date-fns';
import { memo } from 'react';
import { useTimer } from 'react-timer-hook';

function Countdown({
  playedMs,
  durationMs,
}: {
  playedMs: number;
  durationMs: number;
}) {
  const { totalMilliseconds } = useTimer({
    autoStart: true,
    expiryTimestamp: new Date(playedMs + durationMs),
  });

  return format(new Date(totalMilliseconds), 'm:ss');
}

export default memo(Countdown);
