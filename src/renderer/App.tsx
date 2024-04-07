import { MemoryRouter as Router, Routes, Route } from 'react-router-dom';
import { useEffect, useState } from 'react';
import './App.css';
import {
  Box,
  Button,
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
  SdCard,
  StopCircle,
  SubdirectoryArrowRight,
  Terminal,
  Visibility,
} from '@mui/icons-material';
import { IpcRendererEvent } from 'electron';
import { AvailableSet } from '../common/types';
import Settings from './Settings';

function Hello() {
  const [appVersion, setAppVersion] = useState('');
  const [latestAppVersion, setLatestAppVersion] = useState('');
  const [dolphinPath, setDolphinPath] = useState('');
  const [isoPath, setIsoPath] = useState('');
  const [gotSettings, setGotSettings] = useState(false);
  useEffect(() => {
    const inner = async () => {
      const appVersionPromise = window.electron.getVersion();
      const latestAppVersionPromise = window.electron.getLatestVersion();
      const dolphinPathPromise = window.electron.getDolphinPath();
      const isoPathPromise = window.electron.getIsoPath();
      setAppVersion(await appVersionPromise);
      setLatestAppVersion(await latestAppVersionPromise);
      setDolphinPath(await dolphinPathPromise);
      setIsoPath(await isoPathPromise);
      setGotSettings(true);
    };
    inner();
  }, []);

  const [watchDir, setWatchDir] = useState('');
  const [watching, setWatching] = useState(false);
  const [playingSetDirName, setPlayingSetDirName] = useState('');
  const [queuedSetDirName, setQueuedSetDirName] = useState('');
  const [availableSets, setAvailableSets] = useState<AvailableSet[]>([]);
  useEffect(() => {
    window.electron.onPlaying((event: IpcRendererEvent, dirName: string) => {
      setPlayingSetDirName(dirName);
      setQueuedSetDirName('');
    });
    window.electron.onUnzip(
      (event: IpcRendererEvent, newAvailableSets: AvailableSet[]) => {
        setAvailableSets(newAvailableSets);
      },
    );
  }, []);

  return (
    <>
      <Stack direction="row">
        <InputBase
          disabled
          size="small"
          value={dolphinPath || 'Set dolphin path...'}
          style={{ flexGrow: 1 }}
        />
        <Tooltip arrow title="Set dolphin path">
          <IconButton
            onClick={async () => {
              setDolphinPath(await window.electron.chooseDolphinPath());
            }}
          >
            <Terminal />
          </IconButton>
        </Tooltip>
      </Stack>
      <Stack direction="row">
        <InputBase
          disabled
          size="small"
          value={isoPath || 'Set ISO path...'}
          style={{ flexGrow: 1 }}
        />
        <Tooltip arrow title="Set ISO path">
          <IconButton
            onClick={async () => {
              setIsoPath(await window.electron.chooseIsoPath());
            }}
          >
            <SdCard />
          </IconButton>
        </Tooltip>
      </Stack>
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
      {availableSets && (
        <List>
          {availableSets.map((availableSet) => (
            <ListItem disablePadding key={availableSet.dirName}>
              <Box padding="8px" height="24px" width="24px">
                {availableSet.dirName === playingSetDirName && (
                  <Tooltip arrow title="Playing...">
                    <CircularProgress size="24px" />
                  </Tooltip>
                )}
                {availableSet.dirName === queuedSetDirName && (
                  <Tooltip arrow title="Next...">
                    <PlaylistAddCheck />
                  </Tooltip>
                )}
              </Box>
              <ListItemText>{availableSet.dirName}</ListItemText>
              <Tooltip arrow title="Play next">
                <IconButton
                  onClick={async () => {
                    window.electron.queue(availableSet);
                    setQueuedSetDirName(availableSet.dirName);
                  }}
                >
                  <SubdirectoryArrowRight />
                </IconButton>
              </Tooltip>
              <Tooltip arrow title="Play now">
                <IconButton
                  onClick={() => {
                    window.electron.play(availableSet);
                  }}
                >
                  <PlayArrow />
                </IconButton>
              </Tooltip>
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
