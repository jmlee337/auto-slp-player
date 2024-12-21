import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
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
  ContentCopy,
  Report,
  SdCard,
  Settings as SettingsIcon,
  Terminal,
} from '@mui/icons-material';
import styled from '@emotion/styled';
import { TwitchSettings } from '../common/types';

const Form = styled.form`
  display: flex;
  align-items: center;
  flex-direction: row;
  gap: 8px;
`;

function IfClientIdAndScecretSet({
  twitchSettings,
  setTwitchSettings,
  twitchTokenError,
  setTwitchTokenError,
}: {
  twitchSettings: TwitchSettings;
  setTwitchSettings: (twitchSettings: TwitchSettings) => void;
  twitchTokenError: string;
  setTwitchTokenError: (twitchTokenError: string) => void;
}) {
  const [getting, setGetting] = useState(false);

  return (
    (!twitchSettings.accessToken || !twitchSettings.refreshToken) && (
      <Box marginTop="8px">
        <DialogContentText>
          <a
            href={`https://id.twitch.tv/oauth2/authorize?client_id=${twitchSettings.clientId}&redirect_uri=http://localhost&response_type=code&scope=chat:read+chat:edit`}
            target="_blank"
            rel="noreferrer"
          >
            Authorize here
          </a>
          , and paste the code parameter from the redirect URL below (
          <a href="https://imgur.com/1QFJwvJ" target="_blank" rel="noreferrer">
            example screenshot
          </a>
          ):
        </DialogContentText>
        {twitchTokenError && <Alert severity="error">{twitchTokenError}</Alert>}
        <Form
          onSubmit={async (event) => {
            const target = event.target as typeof event.target & {
              code: { value: string };
            };
            const code = target.code.value;
            event.preventDefault();
            event.stopPropagation();
            if (code && !getting) {
              try {
                setGetting(true);
                await window.electron.getTwitchTokens(code);
                setTwitchSettings(await window.electron.getTwitchSettings());
              } catch (e: any) {
                setTwitchTokenError('Twitch error, please try again');
              } finally {
                setGetting(false);
              }
            }
          }}
        >
          <TextField label="code" name="code" size="small" variant="filled" />
          <Button
            disabled={getting}
            endIcon={getting && <CircularProgress size={24} />}
            type="submit"
            variant="contained"
          >
            Go!
          </Button>
        </Form>
      </Box>
    )
  );
}

export default function Settings({
  dolphinPath,
  setDolphinPath,
  isoPath,
  setIsoPath,
  maxDolphins,
  setMaxDolphins,
  generateOverlay,
  setGenerateOverlay,
  generateTimestamps,
  setGenerateTimestamps,
  twitchChannel,
  setTwitchChannel,
  twitchSettings,
  setTwitchSettings,
  twitchBotConnected,
  twitchBotError,
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
  generateOverlay: boolean;
  setGenerateOverlay: (generateOverlay: boolean) => void;
  generateTimestamps: boolean;
  setGenerateTimestamps: (generateTimestamps: boolean) => void;
  twitchChannel: string;
  setTwitchChannel: (twitchChannel: string) => void;
  twitchSettings: TwitchSettings;
  setTwitchSettings: (twitchSettings: TwitchSettings) => void;
  twitchBotConnected: boolean;
  twitchBotError: string;
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
  const [twitchTokenError, setTwitchTokenError] = useState('');
  const [copied, setCopied] = useState(false);

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
            window.electron.setTwitchChannel(twitchChannel),
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
                  checked={generateOverlay}
                  onChange={async (event) => {
                    const newGenerateOverlay = event.target.checked;
                    await window.electron.setGenerateOverlay(
                      newGenerateOverlay,
                    );
                    setGenerateOverlay(newGenerateOverlay);
                  }}
                />
              }
              label="Generate Overlay"
            />
          </Box>
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
          <FormControl variant="filled">
            <InputLabel id="max-dolphins-select-label">Max Dolphins</InputLabel>
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
          <Stack marginTop="8px">
            <DialogContentText>
              Will automatically unqueue any sets that were marked on start.gg
              as streamed elsewhere
            </DialogContentText>
            <Stack direction="row" alignItems="center" spacing="8px">
              <TextField
                label="Twitch channel"
                onChange={(event) => {
                  setTwitchChannel(event.target.value);
                }}
                size="small"
                value={twitchChannel}
                variant="filled"
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={twitchSettings.enabled}
                    disabled={!twitchChannel}
                    onChange={async (event) => {
                      twitchSettings.enabled = event.target.checked;
                      setTwitchSettings(
                        await window.electron.setTwitchSettings(twitchSettings),
                      );
                    }}
                  />
                }
                label="Twitch Bot (!auto, !bracket, !pronouns)"
              />
            </Stack>
            {twitchSettings.enabled && twitchChannel && (
              <Box marginTop="8px">
                {(!twitchSettings.clientId || !twitchSettings.clientSecret) && (
                  <DialogContentText>
                    Create an application from the{' '}
                    <a
                      href="https://dev.twitch.tv/console/apps"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Twitch Developer Console
                    </a>
                    , using &apos;http://localhost&apos; for the OAuth Redirect
                    URL (
                    <a
                      href="https://imgur.com/vtkFo2R"
                      target="_blank"
                      rel="noreferrer"
                    >
                      example screenshot
                    </a>
                    ). Then paste the client ID and client secret below:
                  </DialogContentText>
                )}
                <Stack direction="row" alignItems="center" spacing="8px">
                  <TextField
                    defaultValue={twitchSettings.clientId}
                    label="Client ID"
                    size="small"
                    variant="filled"
                    onChange={async (event) => {
                      twitchSettings.clientId = event.target.value;
                      setTwitchSettings(
                        await window.electron.setTwitchSettings(twitchSettings),
                      );
                    }}
                  />
                  <TextField
                    defaultValue={twitchSettings.clientSecret}
                    label="Client Secret (Keep it private!)"
                    size="small"
                    type="password"
                    variant="filled"
                    onChange={async (event) => {
                      twitchSettings.clientSecret = event.target.value;
                      setTwitchSettings(
                        await window.electron.setTwitchSettings(twitchSettings),
                      );
                    }}
                  />
                  <Button
                    disabled={copied}
                    endIcon={copied ? undefined : <ContentCopy />}
                    onClick={async () => {
                      await window.electron.copyToClipboard(
                        twitchSettings.clientSecret,
                      );
                      setCopied(true);
                      setTimeout(() => setCopied(false), 5000);
                    }}
                    variant="contained"
                  >
                    {copied ? 'Copied!' : 'Copy'}
                  </Button>
                  {twitchBotConnected && (
                    <Tooltip arrow title="Connected!">
                      <CheckCircle style={{ padding: '9px' }} />
                    </Tooltip>
                  )}
                  {!twitchBotConnected && !twitchBotError && (
                    <CircularProgress size="24px" />
                  )}
                  {!twitchBotConnected && twitchBotError && (
                    <Tooltip arrow title={twitchBotError}>
                      <Report style={{ padding: '9px' }} />
                    </Tooltip>
                  )}
                </Stack>
                {twitchSettings.clientId && twitchSettings.clientSecret && (
                  <IfClientIdAndScecretSet
                    twitchSettings={twitchSettings}
                    setTwitchSettings={setTwitchSettings}
                    twitchTokenError={twitchTokenError}
                    setTwitchTokenError={setTwitchTokenError}
                  />
                )}
              </Box>
            )}
          </Stack>
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
