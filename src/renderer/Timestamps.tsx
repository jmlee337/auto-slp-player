import { ContentCopy, Timer } from '@mui/icons-material';
import {
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
        </DialogActions>
      </Dialog>
    </>
  );
}
