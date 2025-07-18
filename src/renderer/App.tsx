import { MemoryRouter as Router, Routes, Route } from 'react-router-dom';
import { SyntheticEvent, useCallback, useEffect, useState } from 'react';
import './App.css';
import {
  Alert,
  AppBar,
  Dialog,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  Stack,
  Tab,
  Tabs,
  Tooltip,
  Typography,
} from '@mui/material';
import { Add, Pause, PlayArrow, Remove } from '@mui/icons-material';
import { RendererQueue } from '../common/types';
import Settings from './Settings';
import Queue from './Queue';
import QueueTabPanel from './QueueTabPanel';
import Timestamps from './Timestamps';
import Setup from './Setup';
import Mirror from './Mirror';

function Hello() {
  const [appError, setAppError] = useState('');
  const [appErrorDialogOpen, setAppErrorDialogOpen] = useState(false);
  const showAppErrorDialog = useCallback((message: string) => {
    setAppError(message);
    setAppErrorDialogOpen(true);
  }, []);

  const [dolphinPath, setDolphinPath] = useState('');
  const [isoPath, setIsoPath] = useState('');
  const [maxDolphins, setMaxDolphins] = useState(1);
  const [numDolphins, setNumDolphins] = useState(0);
  const [dolphinVersion, setDolphinVersion] = useState('');
  const [dolphinVersionError, setDolphinVersionError] = useState('');
  const [shouldSetupAndAutoSwitchObs, setShouldSetupAndAutoSwitchObs] =
    useState(false);
  const [twitchUserName, setTwitchUserName] = useState('');
  const [canPlay, setCanPlay] = useState(false);
  const [queues, setQueues] = useState<RendererQueue[]>([]);
  const [visibleQueue, setVisibleQueue] = useState<RendererQueue | null>(null);
  const [visibleQueueId, setVisibleQueueId] = useState('');
  const [gotSettings, setGotSettings] = useState(false);
  useEffect(() => {
    const inner = async () => {
      const dolphinPathPromise = window.electron.getDolphinPath();
      const isoPathPromise = window.electron.getIsoPath();
      const maxDolphinsPromise = window.electron.getMaxDolphins();
      const numDolphinsPromise = window.electron.getNumDolphins();
      const dolphinVersionPromise = window.electron.getDolphinVersion();
      const shouldSetupAndAutoSwitchObsPromise =
        window.electron.getShouldSetupAndAutoSwitchObs();
      const twitchUserNamePromise = window.electron.getTwitchUserName();
      const canPlayPromise = window.electron.getCanPlay();
      const queuesPromise = window.electron.getQueues();

      setDolphinPath(await dolphinPathPromise);
      setIsoPath(await isoPathPromise);
      setMaxDolphins(await maxDolphinsPromise);
      setNumDolphins(await numDolphinsPromise);
      setDolphinVersion((await dolphinVersionPromise).version);
      setDolphinVersionError((await dolphinVersionPromise).error);
      setShouldSetupAndAutoSwitchObs(await shouldSetupAndAutoSwitchObsPromise);
      const initialTwitchUserName = await twitchUserNamePromise;
      setTwitchUserName((prev) => prev || initialTwitchUserName);
      setCanPlay(await canPlayPromise);

      const initialQueues = await queuesPromise;
      setQueues(initialQueues);
      setVisibleQueue(initialQueues.length > 0 ? initialQueues[0] : null);
      setVisibleQueueId(initialQueues.length > 0 ? initialQueues[0].id : '');

      setGotSettings(true);
    };
    inner();
  }, []);

  useEffect(() => {
    window.electron.onDolphins((event, newNumDolphins: number) => {
      setNumDolphins(newNumDolphins);
    });
    window.electron.onQueues((event, newQueues, newCanPlay) => {
      setVisibleQueue((oldVisibleQueue) => {
        if (newQueues.length === 0) {
          return oldVisibleQueue;
        }
        if (oldVisibleQueue) {
          const newOldVisibleQueue = newQueues.find(
            (queue) => queue.id === oldVisibleQueue.id,
          );
          if (newOldVisibleQueue) {
            return newOldVisibleQueue;
          }
        }
        return newQueues[0];
      });
      setVisibleQueueId((oldVisibleQueueId) => {
        if (newQueues.length === 0) {
          return oldVisibleQueueId;
        }
        if (
          oldVisibleQueueId &&
          newQueues.some((queue) => queue.id === oldVisibleQueueId)
        ) {
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

  let watchFolderMsg = 'Set watch folder...';
  if (!dolphinPath && !isoPath) {
    watchFolderMsg = 'Must set dolphin path and ISO path';
  } else if (!dolphinPath) {
    watchFolderMsg = 'Must set dolphin path';
  } else if (!isoPath) {
    watchFolderMsg = 'Must set ISO path';
  }

  const [settingQueuePaused, setSettingQueuePaused] = useState(false);
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
        <Stack direction="row" marginTop="8px" justifyContent="space-between">
          <Stack direction="row" justifyContent="flex-start" spacing="8px">
            <Tooltip
              title={visibleQueue && visibleQueue.paused ? 'Play' : 'Pause'}
            >
              <IconButton
                disabled={
                  visibleQueue === null ||
                  queues.length < 2 ||
                  settingQueuePaused
                }
                onClick={async () => {
                  setSettingQueuePaused(true);
                  try {
                    await window.electron.setQueuePaused(
                      visibleQueueId,
                      !visibleQueue!.paused,
                    );
                  } catch {
                    // just catch
                  } finally {
                    setSettingQueuePaused(false);
                  }
                }}
              >
                {visibleQueue === null && <Pause />}
                {visibleQueue &&
                  (visibleQueue.paused ? <PlayArrow /> : <Pause />)}
              </IconButton>
            </Tooltip>
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
          </Stack>
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
              maxDolphins={maxDolphins}
              setMaxDolphins={setMaxDolphins}
              twitchUserName={twitchUserName}
              dolphinVersion={dolphinVersion}
              setDolphinVersion={setDolphinVersion}
              dolphinVersionError={dolphinVersionError}
              setDolphinVersionError={setDolphinVersionError}
              shouldSetupAndAutoSwitchObs={shouldSetupAndAutoSwitchObs}
              setShouldSetupAndAutoSwitchObs={setShouldSetupAndAutoSwitchObs}
              gotSettings={gotSettings}
              showAppErrorDialog={showAppErrorDialog}
            />
            <Setup
              watchFolderMsg={watchFolderMsg}
              watchFolderDisabled={!dolphinPath || !isoPath}
              maxDolphins={maxDolphins}
              numDolphins={numDolphins}
              dolphinVersion={dolphinVersion}
              shouldSetupAndAutoSwitchObs={shouldSetupAndAutoSwitchObs}
            />
            <Mirror canPlay={canPlay} numDolphins={numDolphins} />
            <Timestamps />
          </Stack>
        </Stack>
        {queues.length > 1 && (
          <Tabs
            value={visibleQueueId}
            onChange={(event: SyntheticEvent, value: any) => {
              if (typeof value === 'string') {
                const newVisibleQueue = queues.find(
                  (queue) => queue.id === value,
                );
                if (newVisibleQueue) {
                  setVisibleQueue(newVisibleQueue);
                  setVisibleQueueId(value);
                }
              }
            }}
            aria-label="Queues"
            variant="scrollable"
          >
            {queues.map((queue) => (
              <Tab
                key={queue.id}
                label={queue.name}
                icon={queue.paused ? <Pause /> : undefined}
                iconPosition="end"
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
