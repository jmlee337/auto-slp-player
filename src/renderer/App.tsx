import { MemoryRouter as Router, Routes, Route } from 'react-router-dom';
import { SyntheticEvent, useEffect, useState } from 'react';
import './App.css';
import {
  Alert,
  AppBar,
  Button,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  InputBase,
  Stack,
  Tab,
  Tabs,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  Add,
  Check,
  PlayCircle,
  PriorityHigh,
  Remove,
  Visibility,
  WebAsset,
} from '@mui/icons-material';
import { IpcRendererEvent } from 'electron';
import {
  OBSConnectionStatus,
  ObsGamecaptureResult,
  RendererQueue,
  SplitOption,
} from '../common/types';
import Settings from './Settings';
import Queue from './Queue';
import QueueTabPanel from './QueueTabPanel';
import Timestamps from './Timestamps';

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
  const [generateTimestamps, setGenerateTimestamps] = useState(false);
  const [addDelay, setAddDelay] = useState(false);
  const [splitOption, setSplitOption] = useState(SplitOption.NONE);
  const [splitByWave, setSplitByWave] = useState(false);
  const [obsGamecaptureResult, setObsGamecaptureResult] = useState(
    ObsGamecaptureResult.NOT_APPLICABLE,
  );
  const [dolphinVersion, setDolphinVersion] = useState('');
  const [dolphinVersionError, setDolphinVersionError] = useState('');
  const [setupObs, setSetupObs] = useState(false);
  const [obsProtocol, setObsProtocol] = useState('');
  const [obsAddress, setObsAddress] = useState('');
  const [obsPort, setObsPort] = useState('');
  const [obsPassword, setObsPassword] = useState('');
  const [numDolphins, setNumDolphins] = useState(0);
  const [obsConnectionStatus, setObsConnectionStatus] = useState(
    OBSConnectionStatus.OBS_NOT_CONNECTED,
  );
  const [streamingState, setStreamingState] = useState('');
  const [twitchUserName, setTwitchUserName] = useState('');
  const [watchDir, setWatchDir] = useState('');
  const [canPlay, setCanPlay] = useState(false);
  const [queues, setQueues] = useState<RendererQueue[]>([]);
  const [visibleQueueId, setVisibleQueueId] = useState('');
  const [gotSettings, setGotSettings] = useState(false);
  useEffect(() => {
    const inner = async () => {
      const appVersionPromise = window.electron.getVersion();
      const dolphinPathPromise = window.electron.getDolphinPath();
      const isoPathPromise = window.electron.getIsoPath();
      const maxDolphinsPromise = window.electron.getMaxDolphins();
      const generateTimestampsPromise = window.electron.getGenerateTimestamps();
      const addDelayPromise = window.electron.getAddDelay();
      const splitOptionPromise = window.electron.getSplitOption();
      const splitByWavePromise = window.electron.getSplitByWave();
      const obsGamecaptureResultPromise = window.electron.checkObsGamecapture();
      const dolphinVersionPromise = window.electron.getDolphinVersion();
      const setupObsPromise = window.electron.getSetupObs();
      const obsSettingsPromise = window.electron.getObsSettings();
      const numDolphinsPromise = window.electron.getNumDolphins();
      const obsConnectionStatusPromise =
        window.electron.getObsConnectionStatus();
      const streamingStatePromise = window.electron.getStreamingState();
      const twitchUserNamePromise = window.electron.getTwitchUserName();
      const watchDirPromise = window.electron.getWatchDir();
      const canPlayPromise = window.electron.getCanPlay();
      const queuesPromise = window.electron.getQueues();

      // req network
      const latestAppVersionPromise = window.electron.getLatestVersion();

      setAppVersion(await appVersionPromise);
      setDolphinPath(await dolphinPathPromise);
      setIsoPath(await isoPathPromise);
      setMaxDolphins(await maxDolphinsPromise);
      setGenerateTimestamps(await generateTimestampsPromise);
      setAddDelay(await addDelayPromise);
      setSplitOption(await splitOptionPromise);
      setSplitByWave(await splitByWavePromise);
      setObsGamecaptureResult(await obsGamecaptureResultPromise);
      setDolphinVersion((await dolphinVersionPromise).version);
      setDolphinVersionError((await dolphinVersionPromise).error);
      setSetupObs(await setupObsPromise);
      setObsProtocol((await obsSettingsPromise).protocol);
      setObsAddress((await obsSettingsPromise).address);
      setObsPort((await obsSettingsPromise).port);
      setObsPassword((await obsSettingsPromise).password);
      setNumDolphins(await numDolphinsPromise);
      setObsConnectionStatus(await obsConnectionStatusPromise);
      setStreamingState(await streamingStatePromise);
      const initialTwitchUserName = await twitchUserNamePromise;
      setTwitchUserName((prev) => prev || initialTwitchUserName);
      setWatchDir(await watchDirPromise);
      setCanPlay(await canPlayPromise);

      const initialQueues = await queuesPromise;
      setQueues(initialQueues);
      setVisibleQueueId(initialQueues.length > 0 ? initialQueues[0].id : '');

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

  const [dolphinsOpening, setDolphinsOpening] = useState(false);
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
        if (message) {
          setObsError(message);
          setObsErrorDialogOpen(true);
        } else if (newStatus === OBSConnectionStatus.OBS_NOT_CONNECTED) {
          setObsError('OBS disconnected.');
          setObsErrorDialogOpen(true);
        } else {
          setObsError('');
          setObsErrorDialogOpen(false);
        }
      },
    );
    window.electron.onStreaming((event: IpcRendererEvent, state: string) => {
      setStreamingState(state);
    });
    window.electron.onQueues((event, newQueues, newCanPlay) => {
      setVisibleQueueId((oldVisibleQueueId) => {
        if (newQueues.length === 0) {
          return oldVisibleQueueId;
        }
        if (newQueues.some((queue) => queue.id === oldVisibleQueueId)) {
          return oldVisibleQueueId;
        }
        return newQueues[0].id;
      });
      setQueues(newQueues);
      setCanPlay(newCanPlay);
    });
    window.electron.onTwitchUserName((event, newTwitchUserName) => {
      setTwitchUserName(newTwitchUserName);
    });
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
      <AppBar
        color="inherit"
        position="sticky"
        style={{
          margin: '-8px -8px 0',
          padding: queues.length > 1 ? '8px 8px 0' : '8px',
          width: 'initial',
        }}
      >
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
        <Stack direction="row" marginTop="8px" justifyContent="space-between">
          {queues.length > 1 && (
            <Stack
              alignItems="center"
              direction="row"
              justifyContent="flex-start"
            >
              <Typography marginRight="8px" variant="button">
                Priority
              </Typography>
              <Tooltip title="Increment" placement="top">
                <IconButton
                  disabled={visibleQueueId === queues[0].id}
                  onClick={() => {
                    window.electron.incrementQueuePriority(visibleQueueId);
                  }}
                >
                  <Add />
                </IconButton>
              </Tooltip>
              <Tooltip title="Decrement" placement="top">
                <IconButton
                  disabled={visibleQueueId === queues[queues.length - 1].id}
                  onClick={() => {
                    window.electron.decrementQueuePriority(visibleQueueId);
                  }}
                >
                  <Remove />
                </IconButton>
              </Tooltip>
            </Stack>
          )}
          <Stack
            direction="row"
            flexGrow="1"
            justifyContent="flex-end"
            spacing="8px"
          >
            <Settings
              dolphinPath={dolphinPath}
              setDolphinPath={setDolphinPath}
              isoPath={isoPath}
              setIsoPath={setIsoPath}
              generateTimestamps={generateTimestamps}
              setGenerateTimestamps={setGenerateTimestamps}
              addDelay={addDelay}
              setAddDelay={setAddDelay}
              splitOption={splitOption}
              setSplitOption={setSplitOption}
              splitByWave={splitByWave}
              setSplitByWave={setSplitByWave}
              maxDolphins={maxDolphins}
              setMaxDolphins={setMaxDolphins}
              twitchUserName={twitchUserName}
              obsGamecaptureResult={obsGamecaptureResult}
              dolphinVersion={dolphinVersion}
              setDolphinVersion={setDolphinVersion}
              dolphinVersionError={dolphinVersionError}
              setDolphinVersionError={setDolphinVersionError}
              setupObs={setupObs}
              setSetupObs={setSetupObs}
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
                dolphinsOpening ? (
                  <CircularProgress size="24px" />
                ) : (
                  <WebAsset />
                )
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
              {`(${numDolphins}/${maxDolphins})`}
            </Button>
            <Button
              disabled={
                !dolphinVersion ||
                (numDolphins < maxDolphins &&
                  obsConnectionStatus ===
                    OBSConnectionStatus.OBS_NOT_CONNECTED &&
                  setupObs) ||
                obsConnecting ||
                obsConnectionStatus === OBSConnectionStatus.READY
              }
              endIcon={obsButtonIcon}
              onClick={async () => {
                if (
                  obsConnectionStatus ===
                    OBSConnectionStatus.OBS_NOT_CONNECTED ||
                  obsConnectionStatus === OBSConnectionStatus.OBS_NOT_SETUP
                ) {
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
            <Timestamps />
          </Stack>
        </Stack>
        {queues.length > 1 && (
          <Tabs
            value={visibleQueueId}
            onChange={(event: SyntheticEvent, value: any) => {
              if (typeof value === 'string') {
                setVisibleQueueId(value);
              }
            }}
            aria-label="Queues"
            variant="scrollable"
          >
            {queues.map((queue) => (
              <Tab
                key={queue.id}
                label={queue.name}
                value={queue.id}
                id={`queue-tab-${queue.id}`}
                aria-controls={`queue-tabpanel-${queue.id}`}
              />
            ))}
          </Tabs>
        )}
      </AppBar>
      {queues.length === 1 && (
        <Queue
          queue={queues[0]}
          canPlay={canPlay}
          twitchChannel={twitchUserName}
        />
      )}
      {queues.length > 1 &&
        queues.map((queue) => (
          <QueueTabPanel
            queue={queue}
            canPlay={canPlay}
            twitchChannel={twitchUserName}
            visibleQueueId={visibleQueueId}
          />
        ))}
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
