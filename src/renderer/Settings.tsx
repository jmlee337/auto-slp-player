import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputBase,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import { useMemo, useState } from 'react';
import {
  SdCard,
  Settings as SettingsIcon,
  Terminal,
} from '@mui/icons-material';

export default function Settings({
  dolphinPath,
  setDolphinPath,
  isoPath,
  setIsoPath,
  appVersion,
  latestAppVersion,
  gotSettings,
}: {
  dolphinPath: string;
  setDolphinPath: (dolphinPath: string) => void;
  isoPath: string;
  setIsoPath: (isoPath: string) => void;
  appVersion: string;
  latestAppVersion: string;
  gotSettings: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [hasAutoOpened, setHasAutoOpened] = useState(false);

  const needUpdate = useMemo(() => {
    if (!appVersion || !latestAppVersion) {
      return false;
    }

    const versionArr = appVersion.split('.');
    const latestVersionArr = latestAppVersion.split('.');
    if (versionArr.length !== 3 || latestVersionArr.length !== 3) {
      return false;
    }

    if (versionArr[0] < latestVersionArr[0]) {
      return true;
    }
    if (versionArr[1] < latestVersionArr[1]) {
      return true;
    }
    if (versionArr[2] < latestVersionArr[2]) {
      return true;
    }
    return false;
  }, [appVersion, latestAppVersion]);
  if (
    gotSettings &&
    !hasAutoOpened &&
    (!dolphinPath || !isoPath || needUpdate)
  ) {
    setOpen(true);
    setHasAutoOpened(true);
  }

  return (
    <>
      <Button
        endIcon={<SettingsIcon />}
        onClick={() => {
          setOpen(true);
        }}
        variant="contained"
      >
        Settings
      </Button>
      <Dialog
        open={open}
        onClose={() => {
          setOpen(false);
        }}
        fullWidth
        maxWidth="md"
      >
        <Stack
          alignItems="center"
          direction="row"
          justifyContent="space-between"
          marginRight="24px"
        >
          <DialogTitle>Settings</DialogTitle>
          <Typography variant="caption">
            Auto SLP Player version {appVersion}
          </Typography>
        </Stack>
        <DialogContent sx={{ pt: 0 }}>
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
          {needUpdate && (
            <Alert severity="warning">
              Update available!{' '}
              <a
                href="https://github.com/jmlee337/auto-slp-player/releases/latest"
                target="_blank"
                rel="noreferrer"
              >
                Version {latestAppVersion}
              </a>
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              window.electron.openTempDir();
            }}
            variant="contained"
          >
            Open Temp Folder
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
