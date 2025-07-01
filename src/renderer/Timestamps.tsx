import { ContentCopy, Link as LinkIcon, Timer } from '@mui/icons-material';
import {
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  Link,
  Stack,
  TextField,
  Tooltip,
} from '@mui/material';
import { useEffect, useState } from 'react';

export default function Timestamps() {
  const [open, setOpen] = useState(false);
  const [getting, setGetting] = useState(false);
  const [timestamps, setTimestamps] = useState('');
  const [copied, setCopied] = useState(false);

  const [vodUrlsOpen, setVodUrlsOpen] = useState(false);
  const [sggApiKey, setSggApiKey] = useState('');
  const [keyCopied, setKeyCopied] = useState(false);
  const [baseYoutubeUrl, setBaseYoutubeUrl] = useState('');
  const [updating, setUpdating] = useState(false);

  const [error, setError] = useState('');
  const [errorOpen, setErrorOpen] = useState(false);

  useEffect(() => {
    (async () => {
      setSggApiKey(await window.electron.getSggApiKey());
    })();
  }, []);

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
          <Button
            disabled={!timestamps}
            endIcon={<LinkIcon />}
            onClick={() => setVodUrlsOpen(true)}
            variant="contained"
          >
            Set VOD URLs
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog open={vodUrlsOpen} onClose={() => setVodUrlsOpen(false)}>
        <DialogTitle>Set start.gg VOD URLs</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Get your start.gg API key by clicking “Create new token” in the
            <br />
            “Personal Access Tokens” tab of{' '}
            <Link
              href="https://start.gg/admin/profile/developer"
              target="_blank"
              rel="noreferrer"
            >
              this page
            </Link>
            . Keep it private!
          </DialogContentText>
          <Stack alignItems="center" direction="row" gap="8px">
            <TextField
              fullWidth
              label="start.gg API key (Keep it private!)"
              onChange={(event) => {
                setSggApiKey(event.target.value);
              }}
              size="small"
              type="password"
              value={sggApiKey}
              variant="standard"
            />
            <Button
              disabled={keyCopied}
              endIcon={keyCopied ? undefined : <ContentCopy />}
              onClick={async () => {
                await window.electron.copyToClipboard(sggApiKey);
                setKeyCopied(true);
                setTimeout(() => setKeyCopied(false), 5000);
              }}
              variant="contained"
            >
              {keyCopied ? 'Copied!' : 'Copy'}
            </Button>
          </Stack>
          <TextField
            autoFocus
            fullWidth
            label="Base YouTube URL"
            onChange={(event) => {
              setBaseYoutubeUrl(event.target.value);
            }}
            size="small"
            value={baseYoutubeUrl}
            variant="standard"
          />
        </DialogContent>
        <DialogActions>
          <Button
            disabled={!sggApiKey || !baseYoutubeUrl || updating}
            onClick={async () => {
              setUpdating(true);
              try {
                await window.electron.setSggApiKey(sggApiKey);
                await window.electron.setSggVodUrls(baseYoutubeUrl);
                setVodUrlsOpen(false);
              } catch (e: any) {
                setError(e.toString());
                setErrorOpen(true);
              } finally {
                setUpdating(false);
              }
            }}
            variant="contained"
          >
            {!sggApiKey && 'Set API Key...'}
            {sggApiKey && !baseYoutubeUrl && 'Set YT URL...'}
            {sggApiKey && baseYoutubeUrl && 'Go!'}
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={errorOpen}
        onClose={() => {
          setErrorOpen(false);
          setError('');
        }}
      >
        <DialogTitle>Set start.gg VOD URLs error!</DialogTitle>
        <DialogContent>
          <DialogContentText>{error}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setErrorOpen(false);
              setError('');
            }}
          >
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
