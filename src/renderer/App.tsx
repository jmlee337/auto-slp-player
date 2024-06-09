import { MemoryRouter as Router, Routes, Route } from 'react-router-dom';
import { useEffect, useState } from 'react';
import './App.css';
import {
  Box,
  Button,
  Checkbox,
  CircularProgress,
  IconButton,
  InputBase,
  List,
  ListItem,
  ListItemText,
  Stack,
  Tooltip,
} from '@mui/material';
import {
  PlayArrow,
  PlayCircle,
  PlaylistAddCheck,
  StopCircle,
  SubdirectoryArrowRight,
  Visibility,
  WebAsset,
} from '@mui/icons-material';
import { IpcRendererEvent } from 'electron';
import { RenderSet, TwitchSettings } from '../common/types';
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
      setAppVersion(await appVersionPromise);
      setLatestAppVersion(await latestAppVersionPromise);
      setDolphinPath(await dolphinPathPromise);
      setIsoPath(await isoPathPromise);
      setMaxDolphins(await maxDolphinsPromise);
      setGenerateOverlay(await generateOverlayPromise);
      setTwitchSettings(await twitchSettingsPromise);
      setGotSettings(true);
    };
    inner();
  }, []);

  const [watchDir, setWatchDir] = useState('');
  const [watching, setWatching] = useState(false);
  const [numDolphins, setNumDolphins] = useState(0);
  const [dolphinsOpening, setDolphinsOpening] = useState(false);
  const [queuedSetDirName, setQueuedSetDirName] = useState('');
  const [renderSets, setRenderSets] = useState<RenderSet[]>([]);
  useEffect(() => {
    window.electron.onDolphins(
      (event: IpcRendererEvent, newNumDolphins: number) => {
        setNumDolphins(newNumDolphins);
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
