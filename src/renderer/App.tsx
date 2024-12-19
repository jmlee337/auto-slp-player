import { MemoryRouter as Router, Routes, Route } from 'react-router-dom';
import { useEffect, useState } from 'react';
import './App.css';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  InputBase,
  List,
  ListItem,
  ListItemText,
  Stack,
  SvgIcon,
  Tooltip,
} from '@mui/material';
import {
  Check,
  PlayArrow,
  PlayCircle,
  PlaylistAddCheck,
  PriorityHigh,
  Report,
  Stop,
  SubdirectoryArrowRight,
  Tv,
  Visibility,
  WebAsset,
} from '@mui/icons-material';
import { IpcRendererEvent } from 'electron';
import {
  OBSConnectionStatus,
  RenderSet,
  Stream,
  TwitchSettings,
} from '../common/types';
import Settings from './Settings';

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

function Hello() {
  const [appError, setAppError] = useState('');
  const [appErrorDialogOpen, setAppErrorDialogOpen] = useState(false);
  const showAppErrorDialog = (message: string) => {
    setAppError(message);
    setAppErrorDialogOpen(true);
  };

  const [appVersion, setAppVersion] = useState('');
  const [latestAppVersion, setLatestAppVersion] = useState('');
  const [dolphinPath, setDolphinPath] = useState('');
  const [isoPath, setIsoPath] = useState('');
  const [maxDolphins, setMaxDolphins] = useState(1);
  const [generateOverlay, setGenerateOverlay] = useState(false);
  const [generateTimestamps, setGenerateTimestamps] = useState(false);
  const [twitchChannel, setTwitchChannel] = useState('');
  const [twitchSettings, setTwitchSettings] = useState<TwitchSettings>({
    enabled: false,
    accessToken: '',
    refreshToken: '',
    clientId: '',
    clientSecret: '',
  });
  const [dolphinVersion, setDolphinVersion] = useState('');
  const [dolphinVersionError, setDolphinVersionError] = useState('');
  const [obsConnectionEnabled, setObsConnectionEnabled] = useState(false);
  const [obsProtocol, setObsProtocol] = useState('');
  const [obsAddress, setObsAddress] = useState('');
  const [obsPort, setObsPort] = useState('');
  const [obsPassword, setObsPassword] = useState('');
  const [numDolphins, setNumDolphins] = useState(0);
  const [obsConnectionStatus, setObsConnectionStatus] = useState(
    OBSConnectionStatus.OBS_NOT_CONNECTED,
  );
  const [streamingState, setStreamingState] = useState('');
  const [twitchBotConnected, setTwitchBotConnected] = useState(false);
  const [twitchBotError, setTwitchBotError] = useState('');
  const [gotSettings, setGotSettings] = useState(false);
  useEffect(() => {
    const inner = async () => {
      const appVersionPromise = window.electron.getVersion();
      const dolphinPathPromise = window.electron.getDolphinPath();
      const isoPathPromise = window.electron.getIsoPath();
      const maxDolphinsPromise = window.electron.getMaxDolphins();
      const generateOverlayPromise = window.electron.getGenerateOverlay();
      const generateTimestampsPromise = window.electron.getGenerateTimestamps();
      const twitchChannelPromise = window.electron.getTwitchChannel();
      const twitchSettingsPromise = window.electron.getTwitchSettings();
      const dolphinVersionPromise = window.electron.getDolphinVersion();
      const obsConnectionEnabledPromise =
        window.electron.getObsConnectionEnabled();
      const obsSettingsPromise = window.electron.getObsSettings();
      const numDolphinsPromise = window.electron.getNumdolphins();
      const obsConnectionStatusPromise =
        window.electron.getObsConnectionStatus();
      const streamingStatePromise = window.electron.getStreamingState();
      const twitchBotStatusPromise = window.electron.getTwitchBotStatus();

      // req network
      const latestAppVersionPromise = window.electron.getLatestVersion();

      setAppVersion(await appVersionPromise);
      setDolphinPath(await dolphinPathPromise);
      setIsoPath(await isoPathPromise);
      setMaxDolphins(await maxDolphinsPromise);
      setGenerateOverlay(await generateOverlayPromise);
      setGenerateTimestamps(await generateTimestampsPromise);
      setTwitchChannel(await twitchChannelPromise);
      setTwitchSettings(await twitchSettingsPromise);
      setDolphinVersion((await dolphinVersionPromise).version);
      setDolphinVersionError((await dolphinVersionPromise).error);
      setObsConnectionEnabled(await obsConnectionEnabledPromise);
      setObsProtocol((await obsSettingsPromise).protocol);
      setObsAddress((await obsSettingsPromise).address);
      setObsPort((await obsSettingsPromise).port);
      setObsPassword((await obsSettingsPromise).password);
      setNumDolphins(await numDolphinsPromise);
      setObsConnectionStatus(await obsConnectionStatusPromise);
      setStreamingState(await streamingStatePromise);
      setTwitchBotConnected((await twitchBotStatusPromise).connected);
      setTwitchBotError((await twitchBotStatusPromise).error);

      // req network
      try {
        setLatestAppVersion(await latestAppVersionPromise);
      } catch {
        showAppErrorDialog(
          'Unable to check for updates. Are you connected to the internet?',
        );
      }

      setGotSettings(true);
    };
    inner();
  }, []);

  const [watchDir, setWatchDir] = useState('');
  const [dolphinsOpening, setDolphinsOpening] = useState(false);
  const [queuedSetDirName, setQueuedSetDirName] = useState('');
  const [renderSets, setRenderSets] = useState<RenderSet[]>([]);
  const [obsError, setObsError] = useState('');
  const [obsErrorDialogOpen, setObsErrorDialogOpen] = useState(false);
  useEffect(() => {
    window.electron.onDolphins(
      (event: IpcRendererEvent, newNumDolphins: number) => {
        setNumDolphins(newNumDolphins);
      },
    );
    window.electron.onObsConnectionStatus(
      (
        event: IpcRendererEvent,
        newStatus: OBSConnectionStatus,
        message?: string,
      ) => {
        setObsConnectionStatus(newStatus);
        if (newStatus === OBSConnectionStatus.READY) {
          setObsError('');
          setObsErrorDialogOpen(false);
        } else {
          if (newStatus === OBSConnectionStatus.OBS_NOT_CONNECTED) {
            setObsError('OBS disconnected.');
          } else if (newStatus === OBSConnectionStatus.OBS_NOT_SETUP) {
            setObsError(message!);
          }
          setObsErrorDialogOpen(true);
        }
      },
    );
    window.electron.onStreaming((event: IpcRendererEvent, state: string) => {
      setStreamingState(state);
    });
    window.electron.onPlaying(
      (
        event: IpcRendererEvent,
        newRenderSets: RenderSet[],
        newQueuedSetDirName: string,
      ) => {
        setQueuedSetDirName(newQueuedSetDirName);
        setRenderSets(newRenderSets);
      },
    );
    window.electron.onTwitchBotStatus((event, { connected, error }) => {
      setTwitchBotConnected(connected);
      setTwitchBotError(error);
    });
    window.electron.onUnzip(
      (
        event: IpcRendererEvent,
        newRenderSets: RenderSet[],
        newQueuedSetDirName: string,
      ) => {
        setQueuedSetDirName(newQueuedSetDirName);
        setRenderSets(newRenderSets);
      },
    );
  }, []);

  const [obsConnecting, setObsConnecting] = useState(false);
  let obsButtonIcon;
  if (obsConnecting) {
    obsButtonIcon = <CircularProgress size="24px" />;
  } else if (obsConnectionStatus === OBSConnectionStatus.OBS_NOT_SETUP) {
    obsButtonIcon = <PriorityHigh />;
  } else if (obsConnectionStatus === OBSConnectionStatus.READY) {
    obsButtonIcon = <Check />;
  }

  let streamingMsg = 'Start Stream';
  if (streamingState === 'OBS_WEBSOCKET_OUTPUT_STARTING') {
    streamingMsg = 'Starting...';
  } else if (streamingState === 'OBS_WEBSOCKET_OUTPUT_STARTED') {
    streamingMsg = 'Streaming';
  }

  let watchFolderMsg = 'Set watch folder...';
  if (!dolphinPath && !isoPath) {
    watchFolderMsg = 'Must set dolphin path and ISO path';
  } else if (!dolphinPath) {
    watchFolderMsg = 'Must set dolphin path';
  } else if (!isoPath) {
    watchFolderMsg = 'Must set ISO path';
  }
  return (
    <>
      <Stack direction="row">
        <InputBase
          disabled
          size="small"
          value={watchDir || watchFolderMsg}
          style={{ flexGrow: 1 }}
        />
        <Tooltip arrow title={watchFolderMsg}>
          <IconButton
            disabled={!dolphinPath || !isoPath}
            onClick={async () => {
              setWatchDir(await window.electron.chooseWatchDir());
            }}
          >
            <Visibility />
          </IconButton>
        </Tooltip>
      </Stack>
      <Stack
        direction="row"
        marginTop="8px"
        justifyContent="flex-end"
        spacing="8px"
      >
        <Settings
          dolphinPath={dolphinPath}
          setDolphinPath={setDolphinPath}
          isoPath={isoPath}
          setIsoPath={setIsoPath}
          generateOverlay={generateOverlay}
          setGenerateOverlay={setGenerateOverlay}
          generateTimestamps={generateTimestamps}
          setGenerateTimestamps={setGenerateTimestamps}
          maxDolphins={maxDolphins}
          setMaxDolphins={setMaxDolphins}
          twitchChannel={twitchChannel}
          setTwitchChannel={setTwitchChannel}
          twitchSettings={twitchSettings}
          setTwitchSettings={setTwitchSettings}
          twitchBotConnected={twitchBotConnected}
          twitchBotError={twitchBotError}
          dolphinVersion={dolphinVersion}
          setDolphinVersion={setDolphinVersion}
          dolphinVersionError={dolphinVersionError}
          setDolphinVersionError={setDolphinVersionError}
          obsConnectionEnabled={obsConnectionEnabled}
          obsProtocol={obsProtocol}
          setObsProtocol={setObsProtocol}
          obsAddress={obsAddress}
          setObsAddress={setObsAddress}
          obsPort={obsPort}
          setObsPort={setObsPort}
          obsPassword={obsPassword}
          setObsPassword={setObsPassword}
          appVersion={appVersion}
          latestAppVersion={latestAppVersion}
          gotSettings={gotSettings}
        />
        <Button
          disabled={numDolphins === maxDolphins || dolphinsOpening}
          endIcon={
            dolphinsOpening ? <CircularProgress size="24px" /> : <WebAsset />
          }
          onClick={async () => {
            setDolphinsOpening(true);
            try {
              await window.electron.openDolphins();
            } finally {
              setDolphinsOpening(false);
            }
          }}
          variant="contained"
        >
          {numDolphins === maxDolphins ? 'Dolphins Open' : 'Open Dolphins'}{' '}
          {`(${numDolphins})`}
        </Button>
        <Button
          disabled={
            !dolphinVersion ||
            (numDolphins < maxDolphins &&
              obsConnectionStatus === OBSConnectionStatus.OBS_NOT_CONNECTED) ||
            obsConnectionStatus === OBSConnectionStatus.READY
          }
          endIcon={obsButtonIcon}
          onClick={async () => {
            if (obsConnectionStatus === OBSConnectionStatus.OBS_NOT_CONNECTED) {
              try {
                setObsConnecting(true);
                await window.electron.connectObs();
              } catch (e: any) {
                const message = e instanceof Error ? e.message : e;
                setObsError(message);
                setObsErrorDialogOpen(true);
              } finally {
                setObsConnecting(false);
              }
            } else if (
              obsConnectionStatus === OBSConnectionStatus.OBS_NOT_SETUP
            ) {
              setObsErrorDialogOpen(true);
            }
          }}
          variant="contained"
        >
          {obsConnectionStatus === OBSConnectionStatus.OBS_NOT_CONNECTED
            ? 'Connect to OBS'
            : 'OBS Connected'}
        </Button>
        <Button
          disabled={
            streamingState === 'OBS_WEBSOCKET_OUTPUT_STARTING' ||
            streamingState === 'OBS_WEBSOCKET_OUTPUT_STARTED' ||
            obsConnectionStatus !== OBSConnectionStatus.READY
          }
          endIcon={
            streamingState === 'OBS_WEBSOCKET_OUTPUT_STARTING' ||
            streamingState === 'OBS_WEBSOCKET_OUTPUT_STARTED' ? (
              <CircularProgress size="24px" />
            ) : (
              <PlayCircle />
            )
          }
          onClick={async () => {
            await window.electron.startStream();
          }}
          variant="contained"
        >
          {streamingMsg}
        </Button>
      </Stack>
      {renderSets && (
        <List>
          {renderSets.map((renderSet) => (
            <ListItem
              dense
              disablePadding
              key={renderSet.dirName}
              style={{
                gap: '8px',
                opacity: renderSet.played ? '50%' : '100%',
              }}
            >
              <Checkbox
                checked={!renderSet.played}
                disableRipple
                onClick={async () => {
                  const {
                    renderSets: newRenderSets,
                    queuedSetDirName: newQueuedSetDirName,
                  } = await window.electron.markPlayed(
                    renderSet.dirName,
                    !renderSet.played,
                  );
                  setRenderSets(newRenderSets);
                  setQueuedSetDirName(newQueuedSetDirName);
                }}
              />
              {renderSet.invalidReason && (
                <Tooltip arrow title={renderSet.invalidReason}>
                  <Report style={{ padding: '9px' }} />
                </Tooltip>
              )}
              {renderSet.context ? (
                <Stack direction="row" flexGrow={1} spacing="8px">
                  <ListItemText primaryTypographyProps={{ noWrap: true }}>
                    {renderSet.context.namesLeft} vs{' '}
                    {renderSet.context.namesRight}
                  </ListItemText>
                  {twitchChannel &&
                    renderSet.context.startgg?.stream &&
                    (renderSet.context.startgg.stream.domain !== 'twitch' ||
                      renderSet.context.startgg.stream.path !==
                        twitchChannel) && (
                      <TwitchStreamIcon
                        stream={renderSet.context.startgg.stream}
                      />
                    )}
                  {twitchChannel &&
                    renderSet.context.challonge?.stream &&
                    (renderSet.context.challonge.stream.domain !== 'twitch' ||
                      renderSet.context.challonge.stream.path !==
                        twitchChannel) && (
                      <TwitchStreamIcon
                        stream={renderSet.context.challonge.stream}
                      />
                    )}
                  <ListItemText sx={{ flexGrow: 0, flexShrink: 0 }}>
                    {renderSet.context.startgg &&
                      `${renderSet.context.startgg.fullRoundText} `}
                    {renderSet.context.challonge &&
                      `${renderSet.context.challonge.fullRoundText} `}
                    (BO{renderSet.context.bestOf})
                  </ListItemText>
                  {renderSet.context.startgg && (
                    <ListItemText sx={{ flexGrow: 0, flexShrink: 0 }}>
                      {renderSet.context.startgg.eventName},{' '}
                      {renderSet.context.startgg.phaseName}
                    </ListItemText>
                  )}
                  {renderSet.context.challonge && (
                    <ListItemText sx={{ flexGrow: 0, flexShrink: 0 }}>
                      {renderSet.context.challonge.tournamentName}
                    </ListItemText>
                  )}
                  <ListItemText sx={{ flexGrow: 0, flexShrink: 0 }}>
                    {renderSet.context.duration}
                  </ListItemText>
                </Stack>
              ) : (
                <ListItemText>{renderSet.dirName}</ListItemText>
              )}
              {renderSet.playing ? (
                <Tooltip arrow title="Stop">
                  <IconButton
                    onClick={async () => {
                      window.electron.stop(renderSet.dirName);
                    }}
                  >
                    <Stop />
                  </IconButton>
                </Tooltip>
              ) : (
                <Tooltip arrow title="Play next">
                  <IconButton
                    onClick={async () => {
                      window.electron.queue(renderSet.dirName);
                      setQueuedSetDirName(renderSet.dirName);
                    }}
                  >
                    <SubdirectoryArrowRight />
                  </IconButton>
                </Tooltip>
              )}
              <Tooltip arrow title="Play now">
                <IconButton
                  onClick={() => {
                    window.electron.play(renderSet.dirName);
                  }}
                >
                  <PlayArrow />
                </IconButton>
              </Tooltip>
              <Box padding="8px" height="24px" width="24px">
                {renderSet.playing && (
                  <Tooltip arrow title="Playing...">
                    <CircularProgress size="24px" />
                  </Tooltip>
                )}
                {renderSet.dirName === queuedSetDirName && (
                  <Tooltip arrow title="Next...">
                    <PlaylistAddCheck />
                  </Tooltip>
                )}
              </Box>
            </ListItem>
          ))}
        </List>
      )}
      <Dialog
        open={obsErrorDialogOpen}
        onClose={() => {
          setObsErrorDialogOpen(false);
        }}
      >
        <DialogContent>
          <Alert severity="error">{obsError}</Alert>
        </DialogContent>
      </Dialog>
      <Dialog
        open={appErrorDialogOpen}
        onClose={() => {
          setAppError('');
          setAppErrorDialogOpen(false);
        }}
      >
        <DialogTitle>Error!</DialogTitle>
        <DialogContent>
          <DialogContentText>
            You may want to copy or screenshot this error:
          </DialogContentText>
          <Alert severity="error">{appError}</Alert>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Hello />} />
      </Routes>
    </Router>
  );
}
