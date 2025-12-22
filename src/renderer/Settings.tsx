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
  twitchPredictionsEnabled,
  setTwitchPredictionsEnabled,
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
  twitchPredictionsEnabled: boolean;
  setTwitchPredictionsEnabled: (twitchPredictionsEnabled: boolean) => void;
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
  const [musicOff, setMusicOff] = useState(false);
  const [stealth, setStealth] = useState(false);
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
      const musicOffPromise = window.electron.getMusicOff();
      const stealthPromise = window.electron.getStealth();
      const splitOptionPromise = window.electron.getSplitOption();
      const splitByWavePromise = window.electron.getSplitByWave();
      const checkOvertimePromise = window.electron.getCheckOvertime();
      const obsGamecaptureResultPromise = window.electron.checkObsGamecapture();

      const obsSettingsPromise = window.electron.getObsSettings();

      // req network
      const latestAppVersionPromise = window.electron.getLatestVersion();

      setAppVersion(await appVersionPromise);
      setMusicOff(await musicOffPromise);
      setStealth(await stealthPromise);
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
      } catch (e: any) {
        const originalMessage = e instanceof Error ? e.message : e.toString();
        showAppErrorDialog(`Unable to check for updates: ${originalMessage}`);
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
      !dolphinVersion ||
      needUpdate)
  ) {
    setOpen(true);
    setHasAutoOpened(true);
  }

  useEffect(() => {
    if (dolphinVersionError && open) {
      showAppErrorDialog(dolphinVersionError);
    }
  }, [dolphinVersionError, open, showAppErrorDialog]);

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
          <Stack direction="row" alignItems="center">
            <InputBase
              disabled
              size="small"
              slotProps={{ input: { style: { padding: 0 } } }}
              style={{ flexGrow: 1 }}
              value={dolphinPath || 'Set dolphin path...'}
            />
            {dolphinPath && dolphinVersion && (
              <Tooltip arrow title={`Dolphin version: ${dolphinVersion}`}>
                <CheckCircle style={{ padding: '8px' }} />
              </Tooltip>
            )}
            {dolphinPath && dolphinVersionError && (
              <Tooltip arrow title={dolphinVersionError}>
                <Report style={{ padding: '8px' }} />
              </Tooltip>
            )}
            <Tooltip arrow title="Set dolphin path">
              <IconButton
                onClick={async () => {
                  try {
                    setDolphinPath(await window.electron.chooseDolphinPath());
                    const dolphinVersionRet =
                      await window.electron.getDolphinVersion();
                    setDolphinVersion(dolphinVersionRet.dolphinVersion);
                    setDolphinVersionError(
                      dolphinVersionRet.dolphinVersionError,
                    );
                  } catch (e: any) {
                    showAppErrorDialog(e instanceof Error ? e.message : e);
                  }
                }}
              >
                <Terminal />
              </IconButton>
            </Tooltip>
          </Stack>
          <Stack direction="row" alignItems="center">
            <InputBase
              disabled
              size="small"
              slotProps={{ input: { style: { padding: 0 } } }}
              style={{ flexGrow: 1 }}
              value={isoPath || 'Set ISO path...'}
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
              label="Music Off"
              control={
                <Checkbox
                  checked={musicOff}
                  onChange={async (event) => {
                    const newMusicOff = event.target.checked;
                    await window.electron.setMusicOff(newMusicOff);
                    setMusicOff(newMusicOff);
                  }}
                />
              }
            />
          </Box>
          <Box>
            <FormControlLabel
              label="Stealth (players names will be hidden, bot will not mention Slippi)"
              control={
                <Checkbox
                  checked={stealth}
                  onChange={async (event) => {
                    const newStealth = event.target.checked;
                    await window.electron.setStealth(newStealth);
                    setStealth(newStealth);
                  }}
                />
              }
            />
          </Box>
          <Stack direction="row" spacing="8px">
            <FormControl variant="filled">
              <InputLabel size="small" id="max-dolphins-select-label">
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
              <InputLabel size="small" id="split-option-select-label">
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
          <Twitch
            userName={twitchUserName}
            predictionsEnabled={twitchPredictionsEnabled}
            setPredictionsEnabled={setTwitchPredictionsEnabled}
          />
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
