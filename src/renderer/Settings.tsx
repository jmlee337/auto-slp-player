import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControlLabel,
  IconButton,
  InputBase,
  MenuItem,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { useMemo, useState } from 'react';
import {
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

  return twitchSettings.accessToken && twitchSettings.refreshToken ? (
    <Form
      onSubmit={async (event) => {
        const target = event.target as typeof event.target & {
          channel: { value: string };
        };
        const channel = target.channel.value;
        event.preventDefault();
        event.stopPropagation();
        if (channel) {
          twitchSettings.channelName = channel;
          setTwitchSettings(
            await window.electron.setTwitchSettings(twitchSettings),
          );
        }
      }}
    >
      <TextField
        defaultValue={twitchSettings.channelName}
        label="Channel"
        name="channel"
        variant="standard"
      />
      <Button type="submit" variant="contained">
        Set
      </Button>
    </Form>
  ) : (
    <>
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
        <TextField label="code" name="code" variant="standard" />
        <Button
          disabled={getting}
          endIcon={getting && <CircularProgress size={24} />}
          type="submit"
          variant="contained"
        >
          Go!
        </Button>
      </Form>
    </>
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
  twitchSettings,
  setTwitchSettings,
  obsConnectionEnabled,
  setObsConnectionEnabled,
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
  twitchSettings: TwitchSettings;
  setTwitchSettings: (twitchSettings: TwitchSettings) => void;
  obsConnectionEnabled: boolean;
  setObsConnectionEnabled: (enabled: boolean) => void;
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
          await window.electron.setObsSettings({
            protocol: obsProtocol,
            address: obsAddress,
            port: obsPort,
            password: obsPassword,
          });
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
          <Box>
            <FormControlLabel
              control={
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
                  size="small"
                >
                  <MenuItem value={1}>1</MenuItem>
                  <MenuItem value={2}>2</MenuItem>
                  <MenuItem value={3}>3</MenuItem>
                  <MenuItem value={4}>4</MenuItem>
                </Select>
              }
              label="Max Dolphins"
            />
          </Box>
          <Stack>
            <Stack
              alignItems="center"
              direction="row"
              marginLeft="-11px"
              spacing="8px"
            >
              <FormControlLabel
                control={
                  <Checkbox
                    checked={obsConnectionEnabled}
                    onChange={async (event) => {
                      const newEnabled = event.target.checked;
                      await window.electron.setObsConnectionEnabled(newEnabled);
                      setObsConnectionEnabled(newEnabled);
                    }}
                  />
                }
                label="OBS Connection Enabled"
              />
              <DialogContentText>
                (Scene/Source setup info{' '}
                <a
                  href="https://github.com/jmlee337/auto-slp-player/blob/main/src/docs/obs.md"
                  target="_blank"
                  rel="noreferrer"
                >
                  here
                </a>
                )
              </DialogContentText>
            </Stack>
            {obsConnectionEnabled && (
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
                  value={obsAddress}
                  variant="standard"
                />
                <TextField
                  inputProps={{ min: 1024, max: 65535 }}
                  label="OBS Port"
                  name="port"
                  onChange={(event) => {
                    setObsPort(event.target.value);
                  }}
                  type="number"
                  value={obsPort}
                  variant="standard"
                />
                <TextField
                  label="OBS Password"
                  name="password"
                  onChange={(event) => {
                    setObsPassword(event.target.value);
                  }}
                  type="password"
                  value={obsPassword}
                  variant="standard"
                />
              </Stack>
            )}
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
          <Stack>
            <FormControlLabel
              control={
                <Checkbox
                  checked={twitchSettings.enabled}
                  onChange={async (event) => {
                    twitchSettings.enabled = event.target.checked;
                    setTwitchSettings(
                      await window.electron.setTwitchSettings(twitchSettings),
                    );
                  }}
                />
              }
              label="Twitch Integration"
            />
            {twitchSettings.enabled && (
              <>
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
                <Stack direction="row" spacing="8px">
                  <TextField
                    defaultValue={twitchSettings.clientId}
                    label="Client ID"
                    variant="standard"
                    onChange={async (event) => {
                      twitchSettings.clientId = event.target.value;
                      setTwitchSettings(
                        await window.electron.setTwitchSettings(twitchSettings),
                      );
                    }}
                  />
                  <TextField
                    defaultValue={twitchSettings.clientSecret}
                    label="Client Secret"
                    type="password"
                    variant="standard"
                    onChange={async (event) => {
                      twitchSettings.clientSecret = event.target.value;
                      setTwitchSettings(
                        await window.electron.setTwitchSettings(twitchSettings),
                      );
                    }}
                  />
                </Stack>
                {twitchSettings.clientId && twitchSettings.clientSecret && (
                  <IfClientIdAndScecretSet
                    twitchSettings={twitchSettings}
                    setTwitchSettings={setTwitchSettings}
                    twitchTokenError={twitchTokenError}
                    setTwitchTokenError={setTwitchTokenError}
                  />
                )}
              </>
            )}
          </Stack>
          {needUpdate && (
            <Alert severity="warning" style={{ marginTop: 8 }}>
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
        </DialogActions>
      </Dialog>
    </>
  );
}
