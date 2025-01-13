import {
  Alert,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControl,
  FormControlLabel,
  IconButton,
  InputBase,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { useMemo, useState } from 'react';
import {
  CheckCircle,
  CloudDownload,
  Report,
  SdCard,
  Settings as SettingsIcon,
  Terminal,
} from '@mui/icons-material';
import { SplitOption } from '../common/types';
import Twitch from './Twitch';

export default function Settings({
  dolphinPath,
  setDolphinPath,
  isoPath,
  setIsoPath,
  maxDolphins,
  setMaxDolphins,
  generateTimestamps,
  setGenerateTimestamps,
  addDelay,
  setAddDelay,
  splitOption,
  setSplitOption,
  twitchUserName,
  dolphinVersion,
  setDolphinVersion,
  dolphinVersionError,
  setDolphinVersionError,
  obsProtocol,
  setObsProtocol,
  obsAddress,
  setObsAddress,
  obsPort,
  setObsPort,
  obsPassword,
  setObsPassword,
  appVersion,
  latestAppVersion,
  gotSettings,
}: {
  dolphinPath: string;
  setDolphinPath: (dolphinPath: string) => void;
  isoPath: string;
  setIsoPath: (isoPath: string) => void;
  maxDolphins: number;
  setMaxDolphins: (maxDolphins: number) => void;
  generateTimestamps: boolean;
  setGenerateTimestamps: (generateTimestamps: boolean) => void;
  addDelay: boolean;
  setAddDelay: (addDelay: boolean) => void;
  splitOption: SplitOption;
  setSplitOption: (splitOption: SplitOption) => void;
  twitchUserName: string;
  dolphinVersion: string;
  setDolphinVersion: (dolphinVersion: string) => void;
  dolphinVersionError: string;
  setDolphinVersionError: (dolphinVersionError: string) => void;
  obsProtocol: string;
  setObsProtocol: (protocol: string) => void;
  obsAddress: string;
  setObsAddress: (address: string) => void;
  obsPort: string;
  setObsPort: (port: string) => void;
  obsPassword: string;
  setObsPassword: (password: string) => void;
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

    const versionStrArr = appVersion.split('.');
    const latestVersionStrArr = latestAppVersion.split('.');
    if (versionStrArr.length !== 3 || latestVersionStrArr.length !== 3) {
      return false;
    }

    const mapPred = (versionPartStr: string) =>
      Number.parseInt(versionPartStr, 10);
    const versionNumArr = versionStrArr.map(mapPred);
    const latestVersionNumArr = latestVersionStrArr.map(mapPred);
    const somePred = (versionPart: number) => Number.isNaN(versionPart);
    if (versionNumArr.some(somePred) || latestVersionNumArr.some(somePred)) {
      return false;
    }

    if (versionNumArr[0] < latestVersionNumArr[0]) {
      return true;
    }
    if (versionNumArr[1] < latestVersionNumArr[1]) {
      return true;
    }
    if (versionNumArr[2] < latestVersionNumArr[2]) {
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
        onClose={async () => {
          await Promise.all([
            window.electron.setObsSettings({
              protocol: obsProtocol,
              address: obsAddress,
              port: obsPort,
              password: obsPassword,
            }),
          ]);
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
            {dolphinPath && dolphinVersion && (
              <Tooltip arrow title={`Dolphin version: ${dolphinVersion}`}>
                <CheckCircle style={{ padding: '9px' }} />
              </Tooltip>
            )}
            {dolphinPath && dolphinVersionError && (
              <Tooltip arrow title={dolphinVersionError}>
                <Report style={{ padding: '9px' }} />
              </Tooltip>
            )}
            <Tooltip arrow title="Set dolphin path">
              <IconButton
                onClick={async () => {
                  setDolphinPath(await window.electron.chooseDolphinPath());
                  const { version, error } =
                    await window.electron.getDolphinVersion();
                  setDolphinVersion(version);
                  setDolphinVersionError(error);
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
          <Box>
            <FormControlLabel
              control={
                <Checkbox
                  checked={generateTimestamps}
                  onChange={async (event) => {
                    const newGenerateTimestamps = event.target.checked;
                    await window.electron.setGenerateTimestamps(
                      newGenerateTimestamps,
                    );
                    setGenerateTimestamps(newGenerateTimestamps);
                  }}
                />
              }
              label="Generate Timestamps"
            />
          </Box>
          <Box>
            <FormControlLabel
              control={
                <Checkbox
                  checked={addDelay}
                  onChange={async (event) => {
                    const newAddDelay = event.target.checked;
                    await window.electron.setAddDelay(newAddDelay);
                    setAddDelay(newAddDelay);
                  }}
                />
              }
              label={
                <>
                  Add Delay
                  {addDelay && (
                    <>
                      {' '}
                      (Recommend{' '}
                      <a
                        href={`https://github.com/jmlee337/auto-slp-player/blob/${appVersion}/src/docs/waiting.md`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        hiding
                      </a>{' '}
                      &quot;Waiting For Game&quot;)
                    </>
                  )}
                </>
              }
            />
          </Box>
          <Stack direction="row" spacing="8px">
            <FormControl variant="filled">
              <InputLabel id="max-dolphins-select-label">
                Max Dolphins
              </InputLabel>
              <Select
                value={maxDolphins}
                onChange={async (event) => {
                  const newMaxDolphins = event.target.value;
                  if (Number.isInteger(newMaxDolphins)) {
                    await window.electron.setMaxDolphins(
                      newMaxDolphins as number,
                    );
                    setMaxDolphins(newMaxDolphins as number);
                  }
                }}
                labelId="max-dolphins-select-label"
                size="small"
                style={{ width: '120px' }}
                variant="filled"
              >
                <MenuItem value={1}>1</MenuItem>
                <MenuItem value={2}>2</MenuItem>
                <MenuItem value={3}>3</MenuItem>
                <MenuItem value={4}>4</MenuItem>
              </Select>
            </FormControl>
            <FormControl variant="filled">
              <InputLabel id="split-option-select-label">
                Queue Split
              </InputLabel>
              <Select
                value={splitOption}
                onChange={async (event) => {
                  const newSplitOption = event.target.value as SplitOption;
                  await window.electron.setSplitOption(newSplitOption);
                  setSplitOption(newSplitOption);
                }}
                labelId="split-option-select-label"
                size="small"
                style={{ width: '120px' }}
                variant="filled"
              >
                <MenuItem value={SplitOption.NONE}>No split</MenuItem>
                <MenuItem value={SplitOption.EVENT}>By event</MenuItem>
                <MenuItem value={SplitOption.PHASE}>By phase</MenuItem>
              </Select>
            </FormControl>
          </Stack>
          <Stack marginTop="8px">
            <DialogContentText>
              OBS Scene/Source setup info{' '}
              <a
                href={`https://github.com/jmlee337/auto-slp-player/blob/${appVersion}/src/docs/obs.md`}
                target="_blank"
                rel="noreferrer"
              >
                here
              </a>
            </DialogContentText>
            <Stack direction="row" spacing="8px">
              <Select
                label="OBS Protocol"
                name="protocol"
                onChange={(event) => {
                  setObsProtocol(event.target.value);
                }}
                size="small"
                value={obsProtocol}
              >
                <MenuItem value="ws">ws://</MenuItem>
                <MenuItem value="wss">wss://</MenuItem>
              </Select>
              <TextField
                inputProps={{ maxLength: 15 }}
                label="OBS Address"
                name="address"
                onChange={(event) => {
                  setObsAddress(event.target.value);
                }}
                size="small"
                value={obsAddress}
                variant="filled"
              />
              <TextField
                inputProps={{ min: 1024, max: 65535 }}
                label="OBS Port"
                name="port"
                onChange={(event) => {
                  setObsPort(event.target.value);
                }}
                size="small"
                type="number"
                value={obsPort}
                variant="filled"
              />
              <TextField
                label="OBS Password"
                name="password"
                onChange={(event) => {
                  setObsPassword(event.target.value);
                }}
                size="small"
                type="password"
                value={obsPassword}
                variant="filled"
              />
            </Stack>
          </Stack>
          <Twitch userName={twitchUserName} />
          <Stack alignItems="end" marginRight="8px" spacing="8px">
            <Button
              onClick={() => {
                window.electron.openOverlayDir();
              }}
              variant="contained"
            >
              Open Overlay Folder
            </Button>
            <Button
              onClick={() => {
                window.electron.openTempDir();
              }}
              variant="contained"
            >
              Open Temp Folder
            </Button>
          </Stack>
          {needUpdate && (
            <Alert
              severity="warning"
              style={{ marginTop: '8px' }}
              action={
                <Button
                  endIcon={<CloudDownload />}
                  variant="contained"
                  onClick={() => {
                    window.electron.update();
                  }}
                >
                  Quit and download
                </Button>
              }
            >
              Update available! Version {latestAppVersion}
            </Alert>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
