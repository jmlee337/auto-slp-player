import {
  Box,
  Checkbox,
  CircularProgress,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Stack,
  SvgIcon,
  Tooltip,
} from '@mui/material';
import {
  PlayArrow,
  PlaylistAddCheck,
  PlaylistRemove,
  Report,
  Stop,
  SubdirectoryArrowRight,
  Tv,
} from '@mui/icons-material';
import { useState } from 'react';
import { RendererQueue, RendererSet, Stream } from '../common/types';

function TwitchStreamIcon({ stream }: { stream: Stream }) {
  let icon = <Tv />;
  if (stream.domain === 'twitch') {
    icon = (
      <SvgIcon>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
        >
          <path
            d="M2.149 0l-1.612 4.119v16.836h5.731v3.045h3.224l3.045-3.045h4.657l6.269-6.269v-14.686h-21.314zm19.164 13.612l-3.582 3.582h-5.731l-3.045 3.045v-3.045h-4.836v-15.045h17.194v11.463zm-3.582-7.343v6.262h-2.149v-6.262h2.149zm-5.731 0v6.262h-2.149v-6.262h2.149z"
            fillRule="evenodd"
            clipRule="evenodd"
          />
        </svg>
      </SvgIcon>
    );
  } else if (stream.domain === 'youtube') {
    icon = (
      <SvgIcon>
        <svg
          fill="#000000"
          width="24px"
          height="24px"
          viewBox="0 0 32 32"
          version="1.1"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M12.932 20.459v-8.917l7.839 4.459zM30.368 8.735c-0.354-1.301-1.354-2.307-2.625-2.663l-0.027-0.006c-3.193-0.406-6.886-0.638-10.634-0.638-0.381 0-0.761 0.002-1.14 0.007l0.058-0.001c-0.322-0.004-0.701-0.007-1.082-0.007-3.748 0-7.443 0.232-11.070 0.681l0.434-0.044c-1.297 0.363-2.297 1.368-2.644 2.643l-0.006 0.026c-0.4 2.109-0.628 4.536-0.628 7.016 0 0.088 0 0.176 0.001 0.263l-0-0.014c-0 0.074-0.001 0.162-0.001 0.25 0 2.48 0.229 4.906 0.666 7.259l-0.038-0.244c0.354 1.301 1.354 2.307 2.625 2.663l0.027 0.006c3.193 0.406 6.886 0.638 10.634 0.638 0.38 0 0.76-0.002 1.14-0.007l-0.058 0.001c0.322 0.004 0.702 0.007 1.082 0.007 3.749 0 7.443-0.232 11.070-0.681l-0.434 0.044c1.298-0.362 2.298-1.368 2.646-2.643l0.006-0.026c0.399-2.109 0.627-4.536 0.627-7.015 0-0.088-0-0.176-0.001-0.263l0 0.013c0-0.074 0.001-0.162 0.001-0.25 0-2.48-0.229-4.906-0.666-7.259l0.038 0.244z" />
        </svg>
      </SvgIcon>
    );
  }
  return (
    <Tooltip arrow title={`Streamed on ${stream.domain}: ${stream.path}`}>
      {icon}
    </Tooltip>
  );
}

function QueueSet({
  set,
  queueId,
  queueNextOriginalPath,
  canPlay,
  twitchChannel,
}: {
  set: RendererSet;
  queueId: string;
  queueNextOriginalPath: string;
  canPlay: boolean;
  twitchChannel: string;
}) {
  const [stopping, setStopping] = useState(false);
  const [starting, setStarting] = useState(false);

  return (
    <ListItem
      dense
      disablePadding
      key={set.originalPath}
      style={{
        gap: '8px',
        opacity: set.played ? '0.54' : '100%',
      }}
    >
      <Checkbox
        checked={!set.played}
        disableRipple
        onClick={() => {
          window.electron.markPlayed(queueId, set.originalPath, !set.played);
        }}
      />
      {set.invalidReason && (
        <Tooltip arrow title={set.invalidReason}>
          <Report style={{ padding: '9px' }} />
        </Tooltip>
      )}
      {set.context ? (
        <Stack direction="row" flexGrow={1} spacing="8px">
          <ListItemText primaryTypographyProps={{ noWrap: true }}>
            {set.context.namesLeft} vs {set.context.namesRight}
          </ListItemText>
          {twitchChannel &&
            set.context.startgg?.stream &&
            (set.context.startgg.stream.domain !== 'twitch' ||
              set.context.startgg.stream.path !== twitchChannel) && (
              <TwitchStreamIcon stream={set.context.startgg.stream} />
            )}
          {twitchChannel &&
            set.context.challonge?.stream &&
            (set.context.challonge.stream.domain !== 'twitch' ||
              set.context.challonge.stream.path !== twitchChannel) && (
              <TwitchStreamIcon stream={set.context.challonge.stream} />
            )}
          <ListItemText sx={{ flexGrow: 0, flexShrink: 0 }}>
            {set.context.startgg && `${set.context.startgg.fullRoundText} `}
            {set.context.challonge && `${set.context.challonge.fullRoundText} `}
            (BO{set.context.bestOf})
          </ListItemText>
          {set.context.startgg && (
            <ListItemText sx={{ flexGrow: 0, flexShrink: 0 }}>
              {set.context.startgg.eventName}, {set.context.startgg.phaseName}
            </ListItemText>
          )}
          {set.context.challonge && (
            <ListItemText sx={{ flexGrow: 0, flexShrink: 0 }}>
              {set.context.challonge.tournamentName}
            </ListItemText>
          )}
          <ListItemText sx={{ flexGrow: 0, flexShrink: 0 }}>
            {set.context.duration}
          </ListItemText>
        </Stack>
      ) : (
        <ListItemText>{set.originalPath}</ListItemText>
      )}
      {set.playing && (
        <Tooltip arrow placement="left" title="Stop">
          <IconButton
            style={{ color: 'rgba(0, 0, 0, 1' }}
            onClick={async () => {
              setStopping(true);
              try {
                await window.electron.stop(queueId, set.originalPath);
              } catch {
                // ignore
              }
              setStopping(false);
            }}
          >
            {stopping ? <CircularProgress size="24px" /> : <Stop />}
          </IconButton>
        </Tooltip>
      )}
      {!set.playing && set.originalPath !== queueNextOriginalPath && (
        <Tooltip arrow placement="left" title="Play next">
          <IconButton
            onClick={() => {
              window.electron.playNext(queueId, set.originalPath);
            }}
          >
            <SubdirectoryArrowRight />
          </IconButton>
        </Tooltip>
      )}
      {!set.playing && set.originalPath === queueNextOriginalPath && (
        <Tooltip arrow placement="left" title="Cancel next">
          <IconButton
            onClick={() => {
              window.electron.unqueue(queueId);
            }}
          >
            <PlaylistRemove />
          </IconButton>
        </Tooltip>
      )}
      <Tooltip arrow title="Play now">
        <IconButton
          disabled={!canPlay || set.playing}
          style={
            set.played && (!canPlay || set.playing)
              ? { color: 'rgba(0, 0, 0, 0.5)' }
              : {}
          }
          onClick={async () => {
            setStarting(true);
            try {
              await window.electron.playNow(queueId, set.originalPath);
            } catch {
              // ignore
            }
            setStarting(false);
          }}
        >
          {starting ? <CircularProgress size="24px" /> : <PlayArrow />}
        </IconButton>
      </Tooltip>
      <Box padding="8px" height="24px" width="24px">
        {set.playing && (
          <Tooltip arrow title="Playing...">
            <CircularProgress size="24px" />
          </Tooltip>
        )}
        {set.originalPath === queueNextOriginalPath && (
          <Tooltip arrow title="Next...">
            <PlaylistAddCheck />
          </Tooltip>
        )}
      </Box>
    </ListItem>
  );
}

export default function Queue({
  queue,
  canPlay,
  twitchChannel,
}: {
  queue: RendererQueue;
  canPlay: boolean;
  twitchChannel: string;
}) {
  return (
    <List>
      {queue.sets.map((set) => (
        <QueueSet
          set={set}
          queueId={queue.id}
          queueNextOriginalPath={queue.nextSetOriginalPath}
          canPlay={canPlay}
          twitchChannel={twitchChannel}
        />
      ))}
    </List>
  );
}
