import { RendererQueue } from '../common/types';
import Queue from './Queue';

export default function QueueTabPanel({
  queue,
  canPlay,
  twitchChannel,
  visibleQueueId,
}: {
  queue: RendererQueue;
  canPlay: boolean;
  twitchChannel: string;
  visibleQueueId: string;
}) {
  return (
    <div
      role="tabpanel"
      hidden={queue.id !== visibleQueueId}
      id={`queue-tabpanel-${queue.id}`}
      aria-labelledby={`queue-tab-${queue.id}`}
    >
      {queue.id === visibleQueueId && (
        <Queue queue={queue} canPlay={canPlay} twitchChannel={twitchChannel} />
      )}
    </div>
  );
}
