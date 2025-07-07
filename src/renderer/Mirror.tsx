import {
  Check,
  Folder,
  Refresh,
  Visibility,
  VisibilityOff,
} from '@mui/icons-material';
import {
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  FormControl,
  FormControlLabel,
  IconButton,
  InputBase,
  InputLabel,
  ListItemButton,
  MenuItem,
  Select,
  SelectChangeEvent,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';
import { ApiPhaseGroup, ApiSet } from '../common/types';

export default function Mirror({
  canPlay,
  numDolphins,
}: {
  canPlay: boolean;
  numDolphins: number;
}) {
  const [open, setOpen] = useState(false);
  const [isMirroring, setIsMirroring] = useState(false);
  const [mirrorDir, setMirrorDir] = useState('');
  const [showScore, setShowScore] = useState(false);
  const [score, setScore] = useState<[number, number]>([0, 0]);
  const [mirrorChanging, setMirrorChanging] = useState(false);
  const [phaseGroups, setPhaseGroups] = useState<ApiPhaseGroup[]>([]);
  const [phaseGroupIdStr, setPhaseGroupIdStr] = useState('');
  const [gettingPendingSets, setGettingPendingSets] = useState(false);
  const [apiSets, setApiSets] = useState<ApiSet[]>([]);
  const [mirrorSet, setMirrorSet] = useState<ApiSet | null>(null);

  useEffect(() => {
    const inner = async () => {
      const isMirroringPromise = window.electron.getIsMirroring();
      const mirrorDirPromise = window.electron.getMirrorDir();
      const showScorePromise = window.electron.getMirrorShowScore();
      const scorePromise = window.electron.getMirrorScore();
      setIsMirroring(await isMirroringPromise);
      setMirrorDir(await mirrorDirPromise);
      setShowScore(await showScorePromise);
      setScore(await scorePromise);
    };
    inner();
  }, []);

  useEffect(() => {
    window.electron.onMirroring((event, newIsMirroring) => {
      setIsMirroring(newIsMirroring);
    });
  }, []);

  const getPendingSets = async (newPhaseGroupIdStr: string) => {
    setGettingPendingSets(true);
    try {
      setApiSets(
        await window.electron.getPendingSets(parseInt(newPhaseGroupIdStr, 10)),
      );
    } catch {
      // just catch
    } finally {
      setGettingPendingSets(false);
    }
  };

  const cannotStartMirroring = !canPlay || numDolphins === 0;

  return (
    <>
      <Button
        disabled={cannotStartMirroring && !isMirroring}
        endIcon={isMirroring ? <Check /> : undefined}
        onClick={async () => {
          setPhaseGroups(await window.electron.getPhaseGroups());
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
        <DialogContent
          sx={{
            display: 'flex',
            alignItems: 'end',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <Stack direction="row" width="100%">
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
          {isMirroring && phaseGroups.length > 0 && (
            <Stack direction="row" spacing="8px">
              <FormControl>
                <InputLabel id="mirror-select-input-label">Pool</InputLabel>
                <Select
                  label="Pool"
                  labelId="mirror-select-input-label"
                  style={{ minWidth: '200px' }}
                  value={phaseGroupIdStr}
                  onChange={async (event: SelectChangeEvent) => {
                    const newPhaseGroupIdStr = event.target.value;
                    setPhaseGroupIdStr(newPhaseGroupIdStr);
                    getPendingSets(newPhaseGroupIdStr);
                  }}
                >
                  {phaseGroups.map((phaseGroup) => (
                    <MenuItem
                      key={phaseGroup.phaseGroupId}
                      value={phaseGroup.phaseGroupId}
                    >
                      {`${phaseGroup.eventName}, ${phaseGroup.phaseName}, ${phaseGroup.phaseGroupName}`}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Tooltip title="Refresh">
                <IconButton
                  disabled={gettingPendingSets}
                  onClick={() => {
                    getPendingSets(phaseGroupIdStr);
                  }}
                >
                  {gettingPendingSets ? (
                    <CircularProgress size="24px" />
                  ) : (
                    <Refresh />
                  )}
                </IconButton>
              </Tooltip>
            </Stack>
          )}
          {isMirroring && apiSets.length > 0 && (
            <Stack
              direction="row"
              flexWrap="wrap"
              justifyContent="end"
              spacing="16px"
            >
              {apiSets.map((set) => (
                <ListItemButton
                  key={set.id}
                  style={{ flexGrow: 0 }}
                  onClick={async () => {
                    await Promise.all([
                      window.electron.setMirrorSet(set.id),
                      window.electron.setMirrorScore([0, 0]),
                    ]);
                    setMirrorSet(set);
                    setScore([0, 0]);
                  }}
                >
                  <Stack direction="column">
                    <Typography variant="caption">
                      {set.fullRoundText}
                    </Typography>
                    <Typography variant="body2">
                      {set.entrant1Names.join(' + ')}
                    </Typography>
                    <Typography variant="body2">
                      {set.entrant2Names.join(' + ')}
                    </Typography>
                  </Stack>
                </ListItemButton>
              ))}
            </Stack>
          )}
          {isMirroring && (
            <FormControlLabel
              control={
                <Checkbox
                  checked={showScore}
                  onChange={async (event) => {
                    const newShowScore = event.target.checked;
                    await window.electron.setMirrorShowScore(newShowScore);
                    setShowScore(newShowScore);
                    if (!newShowScore) {
                      setScore([0, 0]);
                    }
                  }}
                />
              }
              label="Show Score"
              labelPlacement="start"
            />
          )}
          {isMirroring && mirrorSet && (
            <>
              <Stack
                direction="row"
                spacing="8px"
                alignItems="center"
                justifyContent="end"
                marginBottom="-8px"
              >
                <Typography variant="body2">
                  {mirrorSet.entrant1Names.join(' + ')}
                </Typography>
                <Select
                  disabled={!showScore}
                  size="small"
                  value={score[0].toString(10)}
                  onChange={async (event: SelectChangeEvent) => {
                    const newScore: [number, number] = [
                      parseInt(event.target.value, 10),
                      score[1],
                    ];
                    await window.electron.setMirrorScore(newScore);
                    setScore(newScore);
                  }}
                >
                  <MenuItem value="0">0</MenuItem>
                  <MenuItem value="1">1</MenuItem>
                  <MenuItem value="2">2</MenuItem>
                  <MenuItem value="3">3</MenuItem>
                </Select>
              </Stack>
              <Stack
                direction="row"
                spacing="8px"
                alignItems="center"
                justifyContent="end"
              >
                <Typography variant="body2">
                  {mirrorSet.entrant2Names.join(' + ')}
                </Typography>
                <Select
                  disabled={!showScore}
                  size="small"
                  value={score[1].toString(10)}
                  onChange={async (event: SelectChangeEvent) => {
                    const newScore: [number, number] = [
                      score[0],
                      parseInt(event.target.value, 10),
                    ];
                    await window.electron.setMirrorScore(newScore);
                    setScore(newScore);
                  }}
                >
                  <MenuItem value="0">0</MenuItem>
                  <MenuItem value="1">1</MenuItem>
                  <MenuItem value="2">2</MenuItem>
                  <MenuItem value="3">3</MenuItem>
                </Select>
              </Stack>
            </>
          )}
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
                  setMirrorSet(null);
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
              disabled={cannotStartMirroring}
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
