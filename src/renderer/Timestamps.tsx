import { ContentCopy, DeleteForever, Timer } from '@mui/icons-material';
import {
  Alert,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  TextField,
  Tooltip,
} from '@mui/material';
import { useState } from 'react';

export default function Timestamps() {
  const [open, setOpen] = useState(false);
  const [getting, setGetting] = useState(false);
  const [timestamps, setTimestamps] = useState('');
  const [copied, setCopied] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [clearError, setClearError] = useState('');

  return (
    <>
      <Tooltip title="Timestamps">
        <IconButton
          onClick={() => {
            setGetting(true);
            setOpen(true);
            // eslint-disable-next-line promise/catch-or-return
            window.electron
              .getTimestamps()
              // eslint-disable-next-line promise/always-return
              .then((newTimestamps) => {
                setTimestamps(newTimestamps);
              })
              .finally(() => {
                setGetting(false);
              });
          }}
        >
          <Timer />
        </IconButton>
      </Tooltip>
      <Dialog
        fullWidth
        open={open}
        onClose={() => {
          setOpen(false);
        }}
      >
        <DialogTitle>Timestamps</DialogTitle>
        <DialogContent style={{ height: '400px' }}>
          {getting ? (
            <Stack alignItems="center" height="100%" width="100%">
              <CircularProgress size="24px" />
            </Stack>
          ) : (
            <TextField
              disabled
              fullWidth
              multiline
              InputProps={{ disableUnderline: true }}
              value={timestamps}
              variant="standard"
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button
            disabled={!timestamps}
            endIcon={<ContentCopy />}
            onClick={() => {
              navigator.clipboard.writeText(timestamps);
              setCopied(true);
              setTimeout(() => {
                setCopied(false);
              }, 5000);
            }}
            variant="contained"
          >
            {copied ? 'Copied!' : 'Copy'}
          </Button>
          <Tooltip title="Clear timestamps">
            <IconButton
              disabled={!timestamps}
              onClick={() => {
                setClearError('');
                setClearOpen(true);
              }}
            >
              <DeleteForever />
            </IconButton>
          </Tooltip>
        </DialogActions>
      </Dialog>
      <Dialog
        open={clearOpen}
        onClose={() => {
          setClearOpen(false);
        }}
      >
        <DialogTitle>Clear Timestamps?</DialogTitle>
        {clearError && (
          <DialogContent>
            <Alert title={clearError} severity="error" />
          </DialogContent>
        )}
        <DialogActions>
          <Button
            onClick={() => {
              setClearOpen(false);
            }}
            variant="contained"
          >
            Cancel
          </Button>
          <Button
            onClick={async () => {
              try {
                await window.electron.clearTimestamps();
                setClearOpen(false);
                setOpen(false);
              } catch (e: any) {
                setClearError(e instanceof Error ? e.message : e);
              }
            }}
            variant="contained"
            color="error"
          >
            Clear
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
