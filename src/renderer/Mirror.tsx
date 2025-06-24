import { Check, Folder, Visibility, VisibilityOff } from '@mui/icons-material';
import {
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  IconButton,
  InputBase,
  Stack,
  Tooltip,
} from '@mui/material';
import { useEffect, useState } from 'react';

export default function Mirror({ canPlay }: { canPlay: boolean }) {
  const [open, setOpen] = useState(false);
  const [isMirroring, setIsMirroring] = useState(false);
  const [mirrorDir, setMirrorDir] = useState('');
  const [mirrorChanging, setMirrorChanging] = useState(false);

  useEffect(() => {
    const inner = async () => {
      const isMirroringPromise = window.electron.getIsMirroring();
      const mirrorDirPromise = window.electron.getMirrorDir();
      setIsMirroring(await isMirroringPromise);
      setMirrorDir(await mirrorDirPromise);
    };
    inner();
  }, []);

  return (
    <>
      <Button
        endIcon={isMirroring ? <Check /> : undefined}
        onClick={() => {
          setOpen(true);
        }}
        variant="contained"
      >
        {isMirroring ? 'Mirror' : 'Mirror...'}
      </Button>
      <Dialog
        open={open}
        onClose={() => {
          setOpen(false);
        }}
        fullWidth
      >
        <DialogContent>
          <Stack direction="row">
            <InputBase
              disabled
              size="small"
              value={mirrorDir}
              style={{ flexGrow: 1 }}
            />
            <Tooltip arrow title="Set mirror folder...">
              <IconButton
                onClick={async () => {
                  setMirrorDir(await window.electron.chooseMirrorDir());
                }}
              >
                <Folder />
              </IconButton>
            </Tooltip>
          </Stack>
        </DialogContent>
        <DialogActions>
          {isMirroring ? (
            <Button
              color="error"
              endIcon={
                mirrorChanging ? <CircularProgress /> : <VisibilityOff />
              }
              onClick={async () => {
                try {
                  setMirrorChanging(true);
                  await window.electron.stopMirroring();
                  setIsMirroring(false);
                } catch {
                  // just catch
                } finally {
                  setMirrorChanging(false);
                }
              }}
              variant="contained"
            >
              Stop Mirroring
            </Button>
          ) : (
            <Button
              disabled={!canPlay}
              endIcon={mirrorChanging ? <CircularProgress /> : <Visibility />}
              onClick={async () => {
                try {
                  setMirrorChanging(true);
                  setIsMirroring(await window.electron.startMirroring());
                } catch {
                  // just catch
                } finally {
                  setMirrorChanging(false);
                }
              }}
              variant="contained"
            >
              Start Mirroring
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </>
  );
}
