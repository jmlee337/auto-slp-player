import {
  Check,
  PlayCircle,
  PriorityHigh,
  Visibility,
  WebAsset,
} from '@mui/icons-material';
import {
  Alert,
  Button,
  CircularProgress,
  Dialog,
  DialogContent,
  IconButton,
  InputBase,
  Stack,
  TextField,
  Tooltip,
} from '@mui/material';
import { IpcRendererEvent } from 'electron';
import { useEffect, useState } from 'react';
import { OBSConnectionStatus, Remote } from '../common/types';

export default function Setup({
  watchFolderMsg,
  watchFolderDisabled,
  maxDolphins,
  numDolphins,
  shouldSetupAndAutoSwitchObs,
  remote,
}: {
  watchFolderMsg: string;
  watchFolderDisabled: boolean;
  maxDolphins: number;
  numDolphins: number;
  shouldSetupAndAutoSwitchObs: boolean;
  remote: Remote;
}) {
  const [open, setOpen] = useState(false);
  const [watchDir, setWatchDir] = useState('');
  const [dolphinsOpening, setDolphinsOpening] = useState(false);
  const [obsConnectionStatus, setObsConnectionStatus] = useState(
    OBSConnectionStatus.OBS_NOT_CONNECTED,
  );
  const [obsConnecting, setObsConnecting] = useState(false);
  const [obsError, setObsError] = useState('');
  const [obsErrorDialogOpen, setObsErrorDialogOpen] = useState(false);
  const [streamOutputStatus, setStreamOutputStatus] = useState(
    'OBS_WEBSOCKET_OUTPUT_STOPPED',
  );
  const [port, setPort] = useState(50000);
  const [offlineModeAddress, setOfflineModeAddress] = useState('');
  const [offlineModeError, setOfflineModeError] = useState('');

  useEffect(() => {
    const inner = async () => {
      const watchDirPromise = window.electron.getWatchDir();
      const obsConnectionStatusPromise =
        window.electron.getObsConnectionStatus();
      const streamOutputStatusPromise = window.electron.getStreamOutputStatus();
      setWatchDir(await watchDirPromise);
      setObsConnectionStatus(await obsConnectionStatusPromise);
      setStreamOutputStatus(await streamOutputStatusPromise);
    };
    inner();
  }, []);

  useEffect(() => {
    window.electron.onObsConnectionStatus(
      (
        event: IpcRendererEvent,
        newStatus: OBSConnectionStatus,
        message?: string,
      ) => {
        setObsConnectionStatus(newStatus);
        if (message) {
          setObsError(message);
          setObsErrorDialogOpen(true);
        } else if (newStatus === OBSConnectionStatus.OBS_NOT_CONNECTED) {
          setObsError('OBS disconnected.');
          setObsErrorDialogOpen(true);
        } else {
          setObsError('');
          setObsErrorDialogOpen(false);
        }
      },
    );
    window.electron.onOfflineModeStatus((event, address, error) => {
      setOfflineModeAddress(address);
      setOfflineModeError(error);
    });
    window.electron.onStreamOutputStatus((event, outputStatus) => {
      setStreamOutputStatus(outputStatus);
    });
  }, []);

  let obsButtonIcon;
  if (obsConnecting) {
    obsButtonIcon = <CircularProgress size="24px" />;
  } else if (obsConnectionStatus === OBSConnectionStatus.OBS_NOT_SETUP) {
    obsButtonIcon = <PriorityHigh />;
  } else if (obsConnectionStatus === OBSConnectionStatus.READY) {
    obsButtonIcon = <Check />;
  }

  const isSetup =
    watchDir &&
    numDolphins === maxDolphins &&
    obsConnectionStatus === OBSConnectionStatus.READY &&
    (streamOutputStatus === 'OBS_WEBSOCKET_OUTPUT_STARTED' ||
      streamOutputStatus === 'OBS_WEBSOCKET_OUTPUT_RECONNECTED' ||
      streamOutputStatus === 'OBS_WEBSOCKET_OUTPUT_RESUMED');

  return (
    <>
      <Button
        endIcon={isSetup ? <Check /> : undefined}
        onClick={() => {
          setOpen(true);
        }}
        variant="contained"
      >
        {isSetup ? 'Setup' : 'Setup...'}
      </Button>
      <Dialog
        open={open}
        onClose={() => {
          setOpen(false);
        }}
      >
        <DialogContent
          sx={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
        >
          <Button
            disabled={numDolphins === maxDolphins || dolphinsOpening}
            endIcon={
              dolphinsOpening ? <CircularProgress size="24px" /> : <WebAsset />
            }
            onClick={async () => {
              setDolphinsOpening(true);
              try {
                await window.electron.openDolphins();
              } finally {
                setDolphinsOpening(false);
              }
            }}
            variant="contained"
          >
            {numDolphins === maxDolphins ? 'Dolphins Open' : 'Open Dolphins'}{' '}
            {`(${numDolphins}/${maxDolphins})`}
          </Button>
          <Button
            disabled={
              (numDolphins < maxDolphins &&
                obsConnectionStatus === OBSConnectionStatus.OBS_NOT_CONNECTED &&
                shouldSetupAndAutoSwitchObs) ||
              obsConnecting ||
              obsConnectionStatus === OBSConnectionStatus.READY
            }
            endIcon={obsButtonIcon}
            onClick={async () => {
              if (
                obsConnectionStatus === OBSConnectionStatus.OBS_NOT_CONNECTED ||
                obsConnectionStatus === OBSConnectionStatus.OBS_NOT_SETUP
              ) {
                try {
                  setObsConnecting(true);
                  await window.electron.connectObs();
                } catch (e: any) {
                  const message = e instanceof Error ? e.message : e;
                  setObsError(message);
                  setObsErrorDialogOpen(true);
                } finally {
                  setObsConnecting(false);
                }
              }
            }}
            variant="contained"
          >
            {obsConnectionStatus === OBSConnectionStatus.OBS_NOT_CONNECTED
              ? 'Connect to OBS'
              : 'OBS Connected'}
          </Button>
          <Stack direction="row">
            <InputBase
              disabled
              size="small"
              value={watchDir || watchFolderMsg}
              style={{ flexGrow: 1, minWidth: '300px' }}
            />
            <Tooltip arrow title={watchFolderMsg}>
              <IconButton
                disabled={watchFolderDisabled}
                onClick={async () => {
                  setWatchDir(await window.electron.chooseWatchDir());
                }}
              >
                <Visibility />
              </IconButton>
            </Tooltip>
          </Stack>
          {remote === Remote.OFFLINE_MODE && (
            <>
              <Stack direction="row" alignItems="center" spacing="8px">
                <InputBase
                  disabled
                  size="small"
                  value="Offline Mode:"
                  style={{ flexGrow: 1 }}
                />
                <TextField
                  disabled={Boolean(offlineModeAddress)}
                  label="Port"
                  name="port"
                  onChange={(event) => {
                    setPort(Number.parseInt(event.target.value, 10));
                  }}
                  size="small"
                  slotProps={{ htmlInput: { min: 1024, max: 65536 } }}
                  type="number"
                  value={port}
                  variant="filled"
                />
                <Button
                  disabled={Boolean(offlineModeAddress)}
                  onClick={async () => {
                    await window.electron.connectToOfflineMode(port);
                  }}
                  variant="contained"
                >
                  {offlineModeAddress ? 'Connected!' : 'Connect'}
                </Button>
              </Stack>
              {offlineModeError && (
                <Alert severity="error">{offlineModeError}</Alert>
              )}
            </>
          )}
          <Button
            disabled={
              streamOutputStatus === 'OBS_WEBSOCKET_OUTPUT_STARTED' ||
              streamOutputStatus === 'OBS_WEBSOCKET_OUTPUT_RECONNECTED' ||
              streamOutputStatus === 'OBS_WEBSOCKET_OUTPUT_RESUMED' ||
              streamOutputStatus === 'OBS_WEBSOCKET_OUTPUT_STARTING' ||
              streamOutputStatus === 'OBS_WEBSOCKET_OUTPUT_RECONNECTING' ||
              obsConnectionStatus !== OBSConnectionStatus.READY
            }
            endIcon={
              streamOutputStatus === 'OBS_WEBSOCKET_OUTPUT_STARTED' ||
              streamOutputStatus === 'OBS_WEBSOCKET_OUTPUT_RECONNECTED' ||
              streamOutputStatus === 'OBS_WEBSOCKET_OUTPUT_RESUMED' ||
              streamOutputStatus === 'OBS_WEBSOCKET_OUTPUT_STARTING' ||
              streamOutputStatus === 'OBS_WEBSOCKET_OUTPUT_RECONNECTING' ? (
                <CircularProgress size="24px" />
              ) : (
                <PlayCircle />
              )
            }
            onClick={async () => {
              await window.electron.startStream();
            }}
            variant="contained"
          >
            {(streamOutputStatus === 'OBS_WEBSOCKET_OUTPUT_STARTED' ||
              streamOutputStatus === 'OBS_WEBSOCKET_OUTPUT_RECONNECTED' ||
              streamOutputStatus === 'OBS_WEBSOCKET_OUTPUT_RESUMED') &&
              'Streaming'}
            {streamOutputStatus === 'OBS_WEBSOCKET_OUTPUT_STARTING' &&
              'Starting...'}
            {streamOutputStatus === 'OBS_WEBSOCKET_OUTPUT_RECONNECTING' &&
              'Reconnecting...'}
            {!(
              streamOutputStatus === 'OBS_WEBSOCKET_OUTPUT_STARTED' ||
              streamOutputStatus === 'OBS_WEBSOCKET_OUTPUT_RECONNECTED' ||
              streamOutputStatus === 'OBS_WEBSOCKET_OUTPUT_RESUMED' ||
              streamOutputStatus === 'OBS_WEBSOCKET_OUTPUT_STARTING' ||
              streamOutputStatus === 'OBS_WEBSOCKET_OUTPUT_RECONNECTING'
            ) && 'Start Stream'}
          </Button>
        </DialogContent>
      </Dialog>
      <Dialog
        open={obsErrorDialogOpen}
        onClose={() => {
          setObsErrorDialogOpen(false);
        }}
      >
        <DialogContent>
          <Alert severity="error">{obsError}</Alert>
        </DialogContent>
      </Dialog>
    </>
  );
}
