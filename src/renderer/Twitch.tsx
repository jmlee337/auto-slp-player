import { useEffect, useState } from 'react';
import {
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControlLabel,
  Link,
  Stack,
  TextField,
  Tooltip,
} from '@mui/material';
import { Check, Close, ContentCopy } from '@mui/icons-material';
import { TwitchClient, TwitchStatus } from '../common/types';

function SetupDialog({
  open,
  setOpen,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
}) {
  const [botClient, setBotClient] = useState<TwitchClient>({
    clientId: '',
    clientSecret: '',
  });
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [callbackServerStatus, setCallbackServerStatus] = useState(
    TwitchStatus.STOPPED,
  );
  const [port, setPort] = useState(0);

  useEffect(() => {
    (async () => {
      const botClientPromise = window.electron.getTwitchClient();
      const callbackServerStatusPromise =
        window.electron.getTwitchCallbackServerStatus();

      const initialBotClient = await botClientPromise;
      setBotClient(initialBotClient);
      setClientId(initialBotClient.clientId);
      setClientSecret(initialBotClient.clientSecret);
      const initialCallbackServerStatus = await callbackServerStatusPromise;
      setCallbackServerStatus(initialCallbackServerStatus.status);
      setPort(initialCallbackServerStatus.port);
    })();
  }, []);
  useEffect(() => {
    window.electron.onTwitchCallbackServerStatus(
      (event, newCallbackServerStatus, newPort) => {
        setCallbackServerStatus(newCallbackServerStatus);
        setPort(newPort);
        if (newCallbackServerStatus === TwitchStatus.STOPPED) {
          setOpen(false);
        }
      },
    );
  });

  const [abortOpen, setAbortOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const callbackUrl = `http://localhost:${port}`;

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (
          clientId !== botClient.clientId ||
          clientSecret !== botClient.clientSecret
        ) {
          setAbortOpen(true);
        } else {
          window.electron.stopTwitchCallbackServer();
        }
      }}
    >
      <DialogTitle>Twitch Setup</DialogTitle>
      <DialogContent>
        <Stack spacing="8px">
          <DialogContentText>
            Create an application from the{' '}
            <Link
              href="https://dev.twitch.tv/console/apps"
              target="_blank"
              rel="noreferrer"
            >
              Twitch Developer Console
            </Link>
            , using the following OAuth Redirect URL:
          </DialogContentText>
          <Stack alignItems="center" direction="row" spacing="8px">
            <DialogContentText>{callbackUrl}</DialogContentText>
            <Button
              disabled={port === 0}
              endIcon={
                port === 0 ? <CircularProgress size="24px" /> : <ContentCopy />
              }
              onClick={() => {
                navigator.clipboard.writeText(callbackUrl);
                setCopied(true);
                setTimeout(() => {
                  setCopied(false);
                }, 5000);
              }}
              variant="contained"
            >
              {copied ? 'Copied!' : 'Copy'}
            </Button>
          </Stack>
          <DialogContentText>
            See example screenshots{' '}
            <Link
              href="https://github.com/jmlee337/auto-slp-player/blob/main/src/docs/twitch.md"
              target="_blank"
              rel="noreferrer"
            >
              here
            </Link>
            .
          </DialogContentText>
          <TextField
            label="Client ID"
            onChange={(event) => {
              setClientId(event.target.value);
            }}
            size="small"
            value={clientId}
            variant="filled"
          />
          <TextField
            label="Client Secret"
            onChange={(event) => {
              setClientSecret(event.target.value);
            }}
            size="small"
            type="password"
            value={clientSecret}
            variant="filled"
          />
          <Button
            disabled={
              !clientId ||
              !clientSecret ||
              callbackServerStatus !== TwitchStatus.STARTED
            }
            endIcon={
              callbackServerStatus === TwitchStatus.STARTING ? (
                <CircularProgress size="24px" />
              ) : undefined
            }
            onClick={async () => {
              await window.electron.setTwitchClient({
                clientId,
                clientSecret,
              });
              setBotClient({
                clientId,
                clientSecret,
              });
            }}
            variant="contained"
          >
            {callbackServerStatus === TwitchStatus.STOPPED && 'Error!'}
            {callbackServerStatus === TwitchStatus.STARTING && 'Loading'}
            {callbackServerStatus === TwitchStatus.STARTED && 'Save & Go!'}
          </Button>
          <Dialog open={abortOpen}>
            <DialogTitle>Abort Twitch Setup?</DialogTitle>
            <DialogActions>
              <Button
                onClick={() => {
                  setAbortOpen(false);
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  setAbortOpen(false);
                  window.electron.stopTwitchCallbackServer();
                }}
              >
                Abort
              </Button>
            </DialogActions>
          </Dialog>
        </Stack>
      </DialogContent>
    </Dialog>
  );
}

export default function Twitch({ userName }: { userName: string }) {
  const [botEnabled, setBotEnabled] = useState(false);
  const [botStatus, setBotStatus] = useState(TwitchStatus.STOPPED);
  const [botStatusMessage, setBotStatusMessage] = useState('');

  useEffect(() => {
    (async () => {
      const botEnabledPromise = window.electron.getTwitchBotEnabled();
      const botStatusPromise = window.electron.getTwitchBotStatus();

      setBotEnabled(await botEnabledPromise);
      const initialBotStatus = await botStatusPromise;
      setBotStatus(await initialBotStatus.status);
      setBotStatusMessage(await initialBotStatus.message);
    })();
  }, []);
  useEffect(() => {
    window.electron.onTwitchBotStatus(
      (event, newBotStatus, newBotStatusMessage) => {
        setBotStatus(newBotStatus);
        setBotStatusMessage(newBotStatusMessage);
      },
    );
  }, []);
  const [open, setOpen] = useState(false);

  return (
    <Stack marginTop="8px">
      <Stack alignItems="center" direction="row" spacing="8px">
        <Button
          onClick={() => {
            setOpen(true);
            window.electron.startTwitchCallbackServer();
          }}
          variant="contained"
        >
          {!userName ? 'SET UP' : 'CHANGE'}
        </Button>
        <DialogContentText>
          Twitch Channel: {userName || 'NONE'}
          <br />
          (Will not queue sets that were added to another start.gg stream queue)
        </DialogContentText>
      </Stack>
      <Stack
        alignItems="center"
        direction="row"
        marginLeft="-11px"
        spacing="8px"
      >
        <FormControlLabel
          disabled={!userName}
          label="Bot (!auto, !bracket, !pronouns)"
          control={
            <Checkbox
              checked={botEnabled}
              onChange={async (event) => {
                const newBotEnabled = event.target.checked;
                await window.electron.setTwitchBotEnabled(newBotEnabled);
                setBotEnabled(newBotEnabled);
              }}
            />
          }
        />
        {botStatus === TwitchStatus.STOPPED &&
          (botStatusMessage ? (
            <Tooltip title={botStatusMessage}>
              <Close color="error" />
            </Tooltip>
          ) : (
            <Close color="error" />
          ))}
        {botStatus === TwitchStatus.STARTING && (
          <CircularProgress size="24px" />
        )}
        {botStatus === TwitchStatus.STARTED && <Check color="success" />}
      </Stack>
      <SetupDialog open={open} setOpen={setOpen} />
    </Stack>
  );
}
