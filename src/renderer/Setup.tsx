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
  Tooltip,
} from '@mui/material';
import { IpcRendererEvent } from 'electron';
import { useEffect, useState } from 'react';
import { OBSConnectionStatus } from '../common/types';

export default function Setup({
  watchFolderMsg,
  watchFolderDisabled,
  maxDolphins,
  numDolphins,
  dolphinVersion,
  setupObs,
}: {
  watchFolderMsg: string;
  watchFolderDisabled: boolean;
  maxDolphins: number;
  numDolphins: number;
  dolphinVersion: string;
  setupObs: boolean;
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
  const [streamingState, setStreamingState] = useState('');

  useEffect(() => {
    const inner = async () => {
      const watchDirPromise = window.electron.getWatchDir();
      const obsConnectionStatusPromise =
        window.electron.getObsConnectionStatus();
      const streamingStatePromise = window.electron.getStreamingState();
      setWatchDir(await watchDirPromise);
      setObsConnectionStatus(await obsConnectionStatusPromise);
      setStreamingState(await streamingStatePromise);
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
    window.electron.onStreaming((event: IpcRendererEvent, state: string) => {
      setStreamingState(state);
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

  let streamingMsg = 'Start Stream';
  if (streamingState === 'OBS_WEBSOCKET_OUTPUT_STARTING') {
    streamingMsg = 'Starting...';
  } else if (streamingState === 'OBS_WEBSOCKET_OUTPUT_STARTED') {
    streamingMsg = 'Streaming';
  }

  const isSetup =
    watchDir &&
    numDolphins === maxDolphins &&
    obsConnectionStatus === OBSConnectionStatus.READY &&
    streamingState === 'OBS_WEBSOCKET_OUTPUT_STARTED';

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
              !dolphinVersion ||
              (numDolphins < maxDolphins &&
                obsConnectionStatus === OBSConnectionStatus.OBS_NOT_CONNECTED &&
                setupObs) ||
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
          <Button
            disabled={
              streamingState === 'OBS_WEBSOCKET_OUTPUT_STARTING' ||
              streamingState === 'OBS_WEBSOCKET_OUTPUT_STARTED' ||
              obsConnectionStatus !== OBSConnectionStatus.READY
            }
            endIcon={
              streamingState === 'OBS_WEBSOCKET_OUTPUT_STARTING' ||
              streamingState === 'OBS_WEBSOCKET_OUTPUT_STARTED' ? (
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
            {streamingMsg}
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
