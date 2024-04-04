import { MemoryRouter as Router, Routes, Route } from 'react-router-dom';
import { useEffect, useState } from 'react';
import './App.css';
import {
  Button,
  IconButton,
  InputBase,
  List,
  ListItem,
  ListItemText,
  Stack,
  Tooltip,
} from '@mui/material';
import {
  PlayCircle,
  SdCard,
  StopCircle,
  Terminal,
  Visibility,
} from '@mui/icons-material';
import { IpcRendererEvent } from 'electron';
import { AvailableSet } from '../common/types';

function Hello() {
  const [dolphinPath, setDolphinPath] = useState('');
  const [isoPath, setIsoPath] = useState('');
  useEffect(() => {
    const inner = async () => {
      const dolphinPathPromise = window.electron.getDolphinPath();
      const isoPathPromise = window.electron.getIsoPath();
      setDolphinPath(await dolphinPathPromise);
      setIsoPath(await isoPathPromise);
    };
    inner();
  }, []);

  const [watchDir, setWatchDir] = useState('');
  const [watching, setWatching] = useState(false);
  const [availableSets, setAvailableSets] = useState<AvailableSet[]>([]);
  useEffect(() => {
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
      <Stack direction="row" justifyContent="flex-end">
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
            <ListItem key={availableSet.fullPath}>
              <ListItemText>{availableSet.dirName}</ListItemText>
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
