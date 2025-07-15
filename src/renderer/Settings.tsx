import {
  Alert,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  IconButton,
  InputBase,
  InputLabel,
  Link,
  MenuItem,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle,
  CloudDownload,
  Report,
  SdCard,
  Settings as SettingsIcon,
  Terminal,
} from '@mui/icons-material';
import { ObsGamecaptureResult, SplitOption } from '../common/types';
import Twitch from './Twitch';

export default function Settings({
  dolphinPath,
  setDolphinPath,
  isoPath,
  setIsoPath,
  maxDolphins,
  setMaxDolphins,
  twitchUserName,
  dolphinVersion,
  setDolphinVersion,
  dolphinVersionError,
  setDolphinVersionError,
  shouldSetupAndAutoSwitchObs,
  setShouldSetupAndAutoSwitchObs,
  gotSettings,
  showAppErrorDialog,
}: {
  dolphinPath: string;
  setDolphinPath: (dolphinPath: string) => void;
  isoPath: string;
  setIsoPath: (isoPath: string) => void;
  maxDolphins: number;
  setMaxDolphins: (maxDolphins: number) => void;
  twitchUserName: string;
  dolphinVersion: string;
  setDolphinVersion: (dolphinVersion: string) => void;
  dolphinVersionError: string;
  setDolphinVersionError: (dolphinVersionError: string) => void;
  shouldSetupAndAutoSwitchObs: boolean;
  setShouldSetupAndAutoSwitchObs: (setupObs: boolean) => void;
  gotSettings: boolean;
  showAppErrorDialog: (message: string) => void;
}) {
  const [appVersion, setAppVersion] = useState('');
  const [generateTimestamps, setGenerateTimestamps] = useState(false);
  const [addDelay, setAddDelay] = useState(false);
  const [splitOption, setSplitOption] = useState(SplitOption.NONE);
  const [splitByWave, setSplitByWave] = useState(false);
  const [checkOvertime, setCheckOvertime] = useState(false);
  const [obsGamecaptureResult, setObsGamecaptureResult] = useState(
    ObsGamecaptureResult.NOT_APPLICABLE,
  );
  const [obsProtocol, setObsProtocol] = useState('');
  const [obsAddress, setObsAddress] = useState('');
  const [obsPort, setObsPort] = useState('');
  const [obsPassword, setObsPassword] = useState('');
  const [latestAppVersion, setLatestAppVersion] = useState('');
  const [gotSettingsLocal, setGotSettingsLocal] = useState(false);

  useEffect(() => {
    (async () => {
      const appVersionPromise = window.electron.getVersion();
      const generateTimestampsPromise = window.electron.getGenerateTimestamps();
      const addDelayPromise = window.electron.getAddDelay();
      const splitOptionPromise = window.electron.getSplitOption();
      const splitByWavePromise = window.electron.getSplitByWave();
      const checkOvertimePromise = window.electron.getCheckOvertime();
      const obsGamecaptureResultPromise = window.electron.checkObsGamecapture();

      const obsSettingsPromise = window.electron.getObsSettings();

      // req network
      const latestAppVersionPromise = window.electron.getLatestVersion();

      setAppVersion(await appVersionPromise);
      setGenerateTimestamps(await generateTimestampsPromise);
      setAddDelay(await addDelayPromise);
      setSplitOption(await splitOptionPromise);
      setSplitByWave(await splitByWavePromise);
      setCheckOvertime(await checkOvertimePromise);
      setObsGamecaptureResult(await obsGamecaptureResultPromise);

      setObsProtocol((await obsSettingsPromise).protocol);
      setObsAddress((await obsSettingsPromise).address);
      setObsPort((await obsSettingsPromise).port);
      setObsPassword((await obsSettingsPromise).password);

      // req network
      try {
        setLatestAppVersion(await latestAppVersionPromise);
      } catch {
        showAppErrorDialog(
          'Unable to check for updates. Are you connected to the internet?',
        );
      }

      setGotSettingsLocal(true);
    })();
  }, [showAppErrorDialog]);

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
    gotSettingsLocal &&
    !hasAutoOpened &&
    (obsGamecaptureResult === ObsGamecaptureResult.FAIL ||
      !dolphinPath ||
      !isoPath ||
      needUpdate)
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
          {obsGamecaptureResult !== ObsGamecaptureResult.NOT_APPLICABLE && (
            <>
              {obsGamecaptureResult === ObsGamecaptureResult.PASS && (
                <Stack direction="row">
                  <InputBase
                    disabled
                    size="small"
                    value="obs-gamecapture found!"
                    style={{ flexGrow: 1 }}
                  />
                  <CheckCircle style={{ padding: '9px' }} />
                  <div style={{ width: '40px' }} />
                </Stack>
              )}
              {obsGamecaptureResult === ObsGamecaptureResult.FAIL && (
                <Alert severity="error">
                  obs-vkcapture is required, install from{' '}
                  <Link
                    href="https://github.com/jmlee337/obs-vkcapture"
                    target="_blank"
                    rel="noreferrer"
                  >
                    here
                  </Link>
                  .
                </Alert>
              )}
            </>
          )}
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
                      <Link
                        href={`https://github.com/jmlee337/auto-slp-player/blob/${appVersion}/src/docs/waiting.md`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        hiding
                      </Link>{' '}
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
            <FormControlLabel
              control={
                <Checkbox
                  checked={splitByWave}
                  onChange={async (event) => {
                    const newSplitByWave = event.target.checked;
                    await window.electron.setSplitByWave(newSplitByWave);
                    setSplitByWave(newSplitByWave);
                  }}
                />
              }
              label={SplitOption.NONE ? 'Split by wave' : 'Also split by wave'}
            />
            <FormControlLabel
              disabled={!splitByWave}
              control={
                <Checkbox
                  checked={checkOvertime}
                  onChange={async (event) => {
                    const newCheckOvertime = event.target.checked;
                    await window.electron.setCheckOvertime(newCheckOvertime);
                    setCheckOvertime(newCheckOvertime);
                  }}
                />
              }
              label={
                <>
                  RR overtime protection (
                  <Link
                    href={`https://github.com/jmlee337/auto-slp-player/blob/${appVersion}/src/docs/overtime.md`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    see info
                  </Link>
                  )
                </>
              }
            />
          </Stack>
          <Stack marginTop="8px">
            <Box>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={shouldSetupAndAutoSwitchObs}
                    onChange={async (event) => {
                      const newShouldSetupAndAutoSwitchObs =
                        event.target.checked;
                      await window.electron.setShouldSetupAndAutoSwitchObs(
                        newShouldSetupAndAutoSwitchObs,
                      );
                      setShouldSetupAndAutoSwitchObs(
                        newShouldSetupAndAutoSwitchObs,
                      );
                    }}
                  />
                }
                label={
                  <>
                    Auto OBS Setup/Scene Switching (
                    <Link
                      href={`https://github.com/jmlee337/auto-slp-player/blob/${appVersion}/src/docs/obs.md`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      see info
                    </Link>
                    )
                  </>
                }
              />
            </Box>
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
