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
  IconButton,
  InputBase,
  List,
  ListItem,
  ListItemText,
  Stack,
  Tooltip,
} from '@mui/material';
import {
  Check,
  PlayArrow,
  PlayCircle,
  PlaylistAddCheck,
  PriorityHigh,
  StopCircle,
  SubdirectoryArrowRight,
  Visibility,
  WebAsset,
} from '@mui/icons-material';
import { IpcRendererEvent } from 'electron';
import {
  OBSConnectionStatus,
  RenderSet,
  TwitchSettings,
} from '../common/types';
import Settings from './Settings';

function Hello() {
  const [appVersion, setAppVersion] = useState('');
  const [latestAppVersion, setLatestAppVersion] = useState('');
  const [dolphinPath, setDolphinPath] = useState('');
  const [isoPath, setIsoPath] = useState('');
  const [maxDolphins, setMaxDolphins] = useState(1);
  const [generateOverlay, setGenerateOverlay] = useState(false);
  const [twitchSettings, setTwitchSettings] = useState<TwitchSettings>({
    enabled: false,
    channelName: '',
    accessToken: '',
    refreshToken: '',
    clientId: '',
    clientSecret: '',
  });
  const [dolphinVersion, setDolphinVersion] = useState('');
  const [obsConnectionEnabled, setObsConnectionEnabled] = useState(false);
  const [obsProtocol, setObsProtocol] = useState('');
  const [obsAddress, setObsAddress] = useState('');
  const [obsPort, setObsPort] = useState('');
  const [obsPassword, setObsPassword] = useState('');
  const [numDolphins, setNumDolphins] = useState(0);
  const [obsConnectionStatus, setObsConnectionStatus] = useState(
    OBSConnectionStatus.OBS_NOT_CONNECTED,
  );
  const [gotSettings, setGotSettings] = useState(false);
  useEffect(() => {
    const inner = async () => {
      const appVersionPromise = window.electron.getVersion();
      const latestAppVersionPromise = window.electron.getLatestVersion();
      const dolphinPathPromise = window.electron.getDolphinPath();
      const isoPathPromise = window.electron.getIsoPath();
      const maxDolphinsPromise = window.electron.getMaxDolphins();
      const generateOverlayPromise = window.electron.getGenerateOverlay();
      const twitchSettingsPromise = window.electron.getTwitchSettings();
      const dolphinVersionPromise = window.electron.getDolphinVersion();
      const obsConnectionEnabledPromise =
        window.electron.getObsConnectionEnabled();
      const obsSettingsPromise = window.electron.getObsSettings();
      const numDolphinsPromise = window.electron.getNumdolphins();
      const obsConnectionStatusPromise =
        window.electron.getObsConnectionStatus();
      setAppVersion(await appVersionPromise);
      setLatestAppVersion(await latestAppVersionPromise);
      setDolphinPath(await dolphinPathPromise);
      setIsoPath(await isoPathPromise);
      setMaxDolphins(await maxDolphinsPromise);
      setGenerateOverlay(await generateOverlayPromise);
      setTwitchSettings(await twitchSettingsPromise);
      setDolphinVersion(await dolphinVersionPromise);
      setObsConnectionEnabled(await obsConnectionEnabledPromise);
      setObsProtocol((await obsSettingsPromise).protocol);
      setObsAddress((await obsSettingsPromise).address);
      setObsPort((await obsSettingsPromise).port);
      setObsPassword((await obsSettingsPromise).password);
      setNumDolphins(await numDolphinsPromise);
      setObsConnectionStatus(await obsConnectionStatusPromise);
      setGotSettings(true);
    };
    inner();
  }, []);

  const [watchDir, setWatchDir] = useState('');
  const [watching, setWatching] = useState(false);
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
  return (
    <>
      <Stack direction="row">
        <InputBase
          disabled
          size="small"
          value={watchDir || 'Set watch folder...'}
          style={{ flexGrow: 1 }}
        />
        <Tooltip arrow title="Set watch folder">
          <IconButton
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
          maxDolphins={maxDolphins}
          setMaxDolphins={setMaxDolphins}
          twitchSettings={twitchSettings}
          setTwitchSettings={setTwitchSettings}
          obsConnectionEnabled={obsConnectionEnabled}
          setObsConnectionEnabled={setObsConnectionEnabled}
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
            !obsConnectionEnabled ||
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
          disabled={!dolphinPath || !isoPath || !watchDir}
          endIcon={watching ? <StopCircle /> : <PlayCircle />}
          onClick={async () => {
            const newWatching = !watching;
            await window.electron.watch(newWatching);
            setWatching(newWatching);
          }}
          variant="contained"
        >
          {watching ? 'Stop Folder Watch' : 'Start Folder Watch'}
        </Button>
      </Stack>
      {renderSets && (
        <List>
          {renderSets.map((renderSet) => (
            <ListItem
              dense
              disablePadding
              key={renderSet.dirName}
              style={{ gap: '8px', opacity: renderSet.played ? '50%' : '100%' }}
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
              {renderSet.context ? (
                <Stack direction="row" flexGrow={1} spacing="8px">
                  <ListItemText primaryTypographyProps={{ noWrap: true }}>
                    {renderSet.context.namesLeft} vs{' '}
                    {renderSet.context.namesRight}
                  </ListItemText>
                  <ListItemText sx={{ flexGrow: 0, flexShrink: 0 }}>
                    {renderSet.context.startgg &&
                      renderSet.context.startgg.fullRoundText}{' '}
                    (BO{renderSet.context.bestOf})
                  </ListItemText>
                  {renderSet.context.startgg && (
                    <ListItemText sx={{ flexGrow: 0, flexShrink: 0 }}>
                      {renderSet.context.startgg.eventName},{' '}
                      {renderSet.context.startgg.phaseName}
                    </ListItemText>
                  )}
                  <ListItemText sx={{ flexGrow: 0, flexShrink: 0 }}>
                    {renderSet.context.duration}
                  </ListItemText>
                </Stack>
              ) : (
                <ListItemText>{renderSet.dirName}</ListItemText>
              )}
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
