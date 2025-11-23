import {
  Check,
  Download,
  Folder,
  Refresh,
  Visibility,
  VisibilityOff,
} from '@mui/icons-material';
import {
  Alert,
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
  TextField,
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
  const [slug, setSlug] = useState('');
  const [loadingPhaseGroups, setLoadingPhaseGroups] = useState(false);
  const [phaseGroups, setPhaseGroups] = useState<ApiPhaseGroup[]>([]);
  const [phaseGroupIdStr, setPhaseGroupIdStr] = useState('');
  const [gettingPendingSets, setGettingPendingSets] = useState(false);
  const [apiSets, setApiSets] = useState<ApiSet[]>([]);
  const [mirrorSet, setMirrorSet] = useState<ApiSet | null>(null);

  const [error, setError] = useState('');
  const [errorOpen, setErrorOpen] = useState(false);

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
    } catch (e: any) {
      const message = e instanceof Error ? e.message : e.toString();
      setError(message);
      setErrorOpen(true);
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
          <Stack direction="row" marginRight="-9px" spacing="2px" width="100%">
            <InputBase
              disabled
              size="small"
              value={mirrorDir}
              style={{ flexGrow: 1 }}
            />
            <Tooltip arrow placement="right" title="Set mirror folder...">
              <IconButton
                onClick={async () => {
                  setMirrorDir(await window.electron.chooseMirrorDir());
                }}
              >
                <Folder />
              </IconButton>
            </Tooltip>
          </Stack>
          {isMirroring && (
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                event.stopPropagation();
                try {
                  setLoadingPhaseGroups(true);
                  await window.electron.loadPhaseGroups(slug);
                  setPhaseGroups(await window.electron.getPhaseGroups());
                  setSlug('');
                } catch (e: any) {
                  const message = e instanceof Error ? e.message : e.toString();
                  setError(message);
                  setErrorOpen(true);
                } finally {
                  setLoadingPhaseGroups(false);
                }
              }}
              style={{
                display: 'flex',
                flexDirection: 'row',
                gap: '2px',
                marginRight: '-9px',
              }}
            >
              <TextField
                label="Tournament Slug"
                size="small"
                value={slug}
                onChange={(event) => {
                  setSlug(event.target.value);
                }}
              />
              <Tooltip arrow placement="right" title="Load Tournament...">
                <span>
                  <IconButton type="submit" disabled={loadingPhaseGroups}>
                    {loadingPhaseGroups ? (
                      <CircularProgress size="24px" />
                    ) : (
                      <Download />
                    )}
                  </IconButton>
                </span>
              </Tooltip>
            </form>
          )}
          {isMirroring && phaseGroups.length > 0 && (
            <Stack direction="row" marginRight="-9px" spacing="2px">
              <FormControl>
                <InputLabel id="mirror-select-input-label">Pool</InputLabel>
                <Select
                  label="Pool"
                  labelId="mirror-select-input-label"
                  style={{ minWidth: '222.5px' }}
                  size="small"
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
              <Tooltip arrow placement="right" title="Refresh">
                <span>
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
                </span>
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
          {isMirroring && mirrorSet && (
            <Button
              color="warning"
              onClick={async () => {
                await Promise.all([
                  window.electron.setMirrorSet(null),
                  window.electron.setMirrorScore([0, 0]),
                ]);
                setMirrorSet(null);
                setScore([0, 0]);
              }}
              variant="contained"
            >
              Clear Scoreboard
            </Button>
          )}
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
      <Dialog
        open={errorOpen}
        onClose={() => {
          setErrorOpen(false);
        }}
      >
        <DialogContent>
          <Alert severity="error">{error}</Alert>
        </DialogContent>
      </Dialog>
    </>
  );
}
