import { MemoryRouter as Router, Routes, Route } from 'react-router-dom';
import { useEffect, useState } from 'react';
import './App.css';
import { IconButton, InputBase, Stack, Tooltip } from '@mui/material';
import { FolderOpen } from '@mui/icons-material';

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
            <FolderOpen />
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
            <FolderOpen />
          </IconButton>
        </Tooltip>
      </Stack>
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
