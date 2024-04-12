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
} from '@mui/icons-material';
import { IpcRendererEvent } from 'electron';
import { RenderSet, TwitchSettings } from '../common/types';
import Settings from './Settings';

function Hello() {
  const [appVersion, setAppVersion] = useState('');
  const [latestAppVersion, setLatestAppVersion] = useState('');
  const [dolphinPath, setDolphinPath] = useState('');
  const [isoPath, setIsoPath] = useState('');
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
      const twitchSettingsPromise = window.electron.getTwitchSettings();
      setAppVersion(await appVersionPromise);
      setLatestAppVersion(await latestAppVersionPromise);
      setDolphinPath(await dolphinPathPromise);
      setIsoPath(await isoPathPromise);
      setTwitchSettings(await twitchSettingsPromise);
      setGotSettings(true);
    };
    inner();
  }, []);

  const [watchDir, setWatchDir] = useState('');
  const [watching, setWatching] = useState(false);
  const [playingSetDirName, setPlayingSetDirName] = useState('');
  const [queuedSetDirName, setQueuedSetDirName] = useState('');
  const [renderSets, setRenderSets] = useState<RenderSet[]>([]);
  useEffect(() => {
    window.electron.onPlaying(
      (
        event: IpcRendererEvent,
        dirName: string,
        newRenderSets: RenderSet[],
      ) => {
        setPlayingSetDirName(dirName);
        setQueuedSetDirName('');
        setRenderSets(newRenderSets);
      },
    );
    window.electron.onUnzip(
      (event: IpcRendererEvent, newRenderSets: RenderSet[]) => {
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
          value={watchDir || 'Set watch directory...'}
          style={{ flexGrow: 1 }}
        />
        <Tooltip arrow title="Set watch directory">
          <IconButton
            onClick={async () => {
              setWatchDir(await window.electron.chooseWatchDir());
            }}
          >
            <Visibility />
          </IconButton>
        </Tooltip>
      </Stack>
      <Stack direction="row" justifyContent="flex-end" spacing="8px">
        <Settings
          dolphinPath={dolphinPath}
          setDolphinPath={setDolphinPath}
          isoPath={isoPath}
          setIsoPath={setIsoPath}
          twitchSettings={twitchSettings}
          setTwitchSettings={setTwitchSettings}
          appVersion={appVersion}
          latestAppVersion={latestAppVersion}
          gotSettings={gotSettings}
        />
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
          {watching ? 'Stop' : 'Start'}
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
                  setRenderSets(
                    await window.electron.markPlayed(
                      renderSet.dirName,
                      !renderSet.played,
                    ),
                  );
                }}
              />
              {renderSet.context ? (
                <Stack direction="row" flexGrow={1} spacing="8px">
                  <ListItemText primaryTypographyProps={{ noWrap: true }}>
                    {renderSet.context.namesLeft} vs{' '}
                    {renderSet.context.namesRight}
                  </ListItemText>
                  <ListItemText sx={{ flexGrow: 0, flexShrink: 0 }}>
                    {renderSet.context.fullRoundText} (BO
                    {renderSet.context.bestOf})
                  </ListItemText>
                  <ListItemText sx={{ flexGrow: 0, flexShrink: 0 }}>
                    {renderSet.context.eventName}, {renderSet.context.phaseName}
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
                {renderSet.dirName === playingSetDirName && (
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
