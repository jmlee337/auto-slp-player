import {
  Alert,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from '@mui/material';
import { useMemo, useState } from 'react';
import { Settings as SettingsIcon } from '@mui/icons-material';

export default function Settings({
  appVersion,
  latestAppVersion,
  gotSettings,
}: {
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
  if (gotSettings && !hasAutoOpened && needUpdate) {
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
      </Dialog>
    </>
  );
}
