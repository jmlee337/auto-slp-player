import {
  Check,
  CheckBox,
  CheckBoxOutlineBlank,
  Download,
  Folder,
  Refresh,
  Visibility,
  VisibilityOff,
} from '@mui/icons-material';
import {
  Autocomplete,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  IconButton,
  InputBase,
  InputLabel,
  ListItemButton,
  MenuItem,
  Rating,
  Select,
  SelectChangeEvent,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { useCallback, useEffect, useMemo, useState } from 'react';
import styled from '@emotion/styled';
import { blue } from '@mui/material/colors';
import { ApiPhaseGroup, ApiSet, TwitchPrediction } from '../common/types';
import { getEntrantName } from '../common/commonUtil';

const StyledRating = styled(Rating)({
  '& .MuiRating-iconFilled': {
    color: blue[700],
  },
  '& .MuiRating-iconHover': {
    color: blue[700],
  },
});

function FetchPools({
  tournamentSlugs,
  setTournamentSlugs,
  setPhaseGroups,
  showAppErrorDialog,
}: {
  tournamentSlugs: string[];
  setTournamentSlugs: (tournamentSlugs: string[]) => void;
  setPhaseGroups: (phaseGroups: ApiPhaseGroup[]) => void;
  showAppErrorDialog: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [slug, setSlug] = useState('');
  const [loadingPhaseGroups, setLoadingPhaseGroups] = useState(false);

  return (
    <>
      <FormControlLabel
        label="Fetch Pools"
        labelPlacement="start"
        control={
          <IconButton
            onClick={async () => {
              if (tournamentSlugs.length === 1) {
                try {
                  setLoadingPhaseGroups(true);
                  await window.electron.loadPhaseGroups(tournamentSlugs[0]);
                  const phaseGroupsRet = await window.electron.getPhaseGroups();
                  setPhaseGroups(phaseGroupsRet.phaseGroups);
                  setTournamentSlugs(phaseGroupsRet.tournamentSlugs);
                } catch (e: any) {
                  showAppErrorDialog(
                    e instanceof Error ? e.message : e.toString(),
                  );
                } finally {
                  setLoadingPhaseGroups(false);
                }
              } else {
                setOpen(true);
              }
            }}
          >
            <Download />
          </IconButton>
        }
      />
      <Dialog
        open={open}
        onClose={() => {
          setOpen(false);
        }}
      >
        <DialogTitle style={{ paddingBottom: '8px' }}>
          Fetch Pools from Tournament
        </DialogTitle>
        <DialogContent>
          <form
            style={{
              display: 'flex',
              flexDirection: 'row',
              paddingTop: '8px',
            }}
            onSubmit={async (event) => {
              event.preventDefault();
              event.stopPropagation();
              try {
                setLoadingPhaseGroups(true);
                await window.electron.loadPhaseGroups(slug);
                const phaseGroupsRet = await window.electron.getPhaseGroups();
                setPhaseGroups(phaseGroupsRet.phaseGroups);
                setTournamentSlugs(phaseGroupsRet.tournamentSlugs);
                setOpen(false);
              } catch (e: any) {
                showAppErrorDialog(
                  e instanceof Error ? e.message : e.toString(),
                );
              } finally {
                setLoadingPhaseGroups(false);
              }
            }}
          >
            <Autocomplete
              freeSolo
              options={tournamentSlugs}
              value={slug}
              onChange={(event, value) => {
                setSlug(value ?? '');
              }}
              renderInput={(params) => (
                <TextField
                  // eslint-disable-next-line react/jsx-props-no-spreading
                  {...params}
                  placeholder="midlane-melee-200"
                  label="Tournament Slug"
                  size="small"
                  style={{ minWidth: '200px' }}
                />
              )}
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
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function Mirror({
  canPlay,
  numDolphins,
  twitchPredictionsEnabled,
  showAppErrorDialog,
}: {
  canPlay: boolean;
  numDolphins: number;
  twitchPredictionsEnabled: boolean;
  showAppErrorDialog: (message: string) => void;
}) {
  const cannotStartMirroring = useMemo(
    () => !canPlay || numDolphins === 0,
    [canPlay, numDolphins],
  );

  const [isMirroring, setIsMirroring] = useState(false);
  const [mirrorDir, setMirrorDir] = useState('');
  const [mirrorSet, setMirrorSet] = useState<ApiSet | null>(null);
  const [showScore, setShowScore] = useState(false);
  const [autoPredictions, setAutoPredictions] = useState(false);
  const [score, setScore] = useState<[number, number]>([0, 0]);
  const [prediction, setPrediction] = useState<TwitchPrediction | null>(null);

  useEffect(() => {
    const inner = async () => {
      const isMirroringPromise = window.electron.getIsMirroring();
      const mirrorDirPromise = window.electron.getMirrorDir();
      const showScorePromise = window.electron.getMirrorShowScore();
      const autoPredictionsPromise = window.electron.getAutoTwitchPredictions();
      const mirrorSetPromise = window.electron.getMirrorSet();
      const scorePromise = window.electron.getMirrorScore();
      const predictionPromise = window.electron.getTwitchPrediction();
      setIsMirroring(await isMirroringPromise);
      setMirrorDir(await mirrorDirPromise);
      setMirrorSet(await mirrorSetPromise);
      setShowScore(await showScorePromise);
      setAutoPredictions(await autoPredictionsPromise);
      setScore(await scorePromise);
      setPrediction(await predictionPromise);
    };
    inner();
  }, []);

  useEffect(() => {
    window.electron.onMirroring((event, newIsMirroring) => {
      setIsMirroring(newIsMirroring);
    });
    window.electron.onTwitchPrediction((event, newTwitchPrediction) => {
      setPrediction(newTwitchPrediction);
    });
  }, []);

  const [gettingPendingSets, setGettingPendingSets] = useState(false);
  const [apiSets, setApiSets] = useState<ApiSet[]>([]);
  const getPendingSets = useCallback(
    async (newPhaseGroupIdStr: string) => {
      setGettingPendingSets(true);
      try {
        setApiSets(
          await window.electron.getPendingSets(
            parseInt(newPhaseGroupIdStr, 10),
          ),
        );
      } catch (e: any) {
        showAppErrorDialog(e instanceof Error ? e.message : e.toString());
      } finally {
        setGettingPendingSets(false);
      }
    },
    [showAppErrorDialog],
  );

  const setsToShow = useMemo(
    () =>
      mirrorSet
        ? apiSets.filter((apiSet) => apiSet.id !== mirrorSet.id)
        : apiSets,
    [apiSets, mirrorSet],
  );

  const [open, setOpen] = useState(false);
  const [mirrorChanging, setMirrorChanging] = useState(false);
  const [phaseGroups, setPhaseGroups] = useState<ApiPhaseGroup[]>([]);
  const [tournamentSlugs, setTournamentSlugs] = useState<string[]>([]);
  const [phaseGroupIdStr, setPhaseGroupIdStr] = useState('');
  const [settingMirrorSet, setSettingMirrorSet] = useState(false);
  const [creatingTwitchPrediction, setCreatingTwitchPrediction] =
    useState(false);
  const [lockingTwitchPrediction, setLockingTwitchPrediction] = useState(false);
  const [resolvingTwitchPrediction, setResolvingTwitchPrediction] =
    useState(false);

  return (
    <>
      <Button
        disabled={cannotStartMirroring && !isMirroring}
        endIcon={isMirroring ? <Check /> : undefined}
        onClick={async () => {
          const phaseGroupsRet = await window.electron.getPhaseGroups();
          setPhaseGroups(phaseGroupsRet.phaseGroups);
          setTournamentSlugs(phaseGroupsRet.tournamentSlugs);
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
          <Stack width="100%" alignItems="end">
            <Stack direction="row" marginRight="-10px" width="100%">
              <InputBase
                disabled
                size="small"
                slotProps={{
                  input: { style: { padding: 0, textAlign: 'right' } },
                }}
                style={{ flexGrow: 1, marginRight: '-1px' }}
                value={mirrorDir}
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
              <>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={showScore}
                      style={{ padding: '8px' }}
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
                {twitchPredictionsEnabled && (
                  <FormControlLabel
                    label="Auto Predictions"
                    labelPlacement="start"
                    control={
                      <Checkbox
                        checked={autoPredictions}
                        style={{ padding: '8px' }}
                        onChange={(event) => {
                          setAutoPredictions(event.target.checked);
                        }}
                      />
                    }
                  />
                )}
                <Stack direction="row" alignItems="center" gap="27px">
                  <FetchPools
                    tournamentSlugs={tournamentSlugs}
                    setTournamentSlugs={setTournamentSlugs}
                    setPhaseGroups={setPhaseGroups}
                    showAppErrorDialog={showAppErrorDialog}
                  />
                  {phaseGroups.length > 0 && (
                    <Stack direction="row" marginRight="-10px" paddingTop="4px">
                      <FormControl>
                        <InputLabel size="small" id="mirror-select-input-label">
                          Pool
                        </InputLabel>
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
                </Stack>
              </>
            )}
          </Stack>
          {isMirroring && setsToShow.length > 0 && (
            <Stack
              direction="row"
              flexWrap="wrap"
              justifyContent="end"
              gap="8px"
            >
              {setsToShow.map((set) => (
                <ListItemButton
                  key={set.id}
                  disabled={
                    settingMirrorSet ||
                    (twitchPredictionsEnabled &&
                      !autoPredictions &&
                      mirrorSet !== null &&
                      prediction !== null) ||
                    (twitchPredictionsEnabled &&
                      autoPredictions &&
                      mirrorSet !== null &&
                      prediction !== null &&
                      !showScore) ||
                    (twitchPredictionsEnabled &&
                      autoPredictions &&
                      mirrorSet !== null &&
                      prediction !== null &&
                      showScore &&
                      score[0] === score[1])
                  }
                  style={{ flexGrow: 0, padding: '8px' }}
                  onClick={async () => {
                    try {
                      setSettingMirrorSet(true);
                      if (
                        twitchPredictionsEnabled &&
                        autoPredictions &&
                        mirrorSet &&
                        prediction &&
                        showScore &&
                        score[0] !== score[1]
                      ) {
                        try {
                          setResolvingTwitchPrediction(true);
                          await window.electron.resolveTwitchPredictionWithWinner(
                            getEntrantName(
                              score[0] > score[1]
                                ? mirrorSet.entrant1Names
                                : mirrorSet.entrant2Names,
                            ),
                          );
                        } finally {
                          setResolvingTwitchPrediction(false);
                        }
                      }
                      await Promise.all([
                        window.electron.setMirrorSet(set.id),
                        window.electron.setMirrorScore([0, 0]),
                      ]);
                      setMirrorSet(set);
                      setScore([0, 0]);
                      if (twitchPredictionsEnabled && autoPredictions) {
                        try {
                          setCreatingTwitchPrediction(true);
                          await window.electron.createTwitchPrediction(set);
                        } finally {
                          setCreatingTwitchPrediction(false);
                        }
                      }
                    } catch (e: any) {
                      showAppErrorDialog(
                        e instanceof Error ? e.message : e.toString(),
                      );
                    } finally {
                      setSettingMirrorSet(false);
                    }
                  }}
                >
                  <Stack>
                    <Typography variant="caption">
                      {set.fullRoundText}
                    </Typography>
                    <Typography variant="body2">
                      {getEntrantName(set.entrant1Names)}
                    </Typography>
                    <Typography variant="body2">
                      {getEntrantName(set.entrant2Names)}
                    </Typography>
                  </Stack>
                </ListItemButton>
              ))}
            </Stack>
          )}
          {isMirroring && mirrorSet && (
            <Stack padding="8px 0">
              <Typography variant="caption">
                {mirrorSet.fullRoundText}
              </Typography>
              {showScore ? (
                <FormControlLabel
                  label={getEntrantName(mirrorSet.entrant1Names)}
                  labelPlacement="start"
                  slotProps={{
                    typography: {
                      style: { marginRight: '4px' },
                      variant: 'body2',
                    },
                  }}
                  style={{ marginRight: '-2px', marginLeft: 0 }}
                  control={
                    <StyledRating
                      max={3}
                      icon={<CheckBox fontSize="inherit" />}
                      emptyIcon={<CheckBoxOutlineBlank fontSize="inherit" />}
                      value={score[0]}
                      onChange={async (event, newP1Score) => {
                        const newScore: [number, number] = [
                          newP1Score ?? 0,
                          score[1],
                        ];
                        await window.electron.setMirrorScore(newScore);
                        setScore(newScore);
                      }}
                    />
                  }
                />
              ) : (
                <Typography variant="body2">
                  {getEntrantName(mirrorSet.entrant1Names)}
                </Typography>
              )}
              {showScore ? (
                <FormControlLabel
                  label={getEntrantName(mirrorSet.entrant2Names)}
                  labelPlacement="start"
                  slotProps={{
                    typography: {
                      style: { marginRight: '4px' },
                      variant: 'body2',
                    },
                  }}
                  style={{ marginRight: '-2px', marginLeft: 0 }}
                  sx={{ typography: 'caption' }}
                  control={
                    <StyledRating
                      max={3}
                      icon={<CheckBox fontSize="inherit" />}
                      emptyIcon={<CheckBoxOutlineBlank fontSize="inherit" />}
                      value={score[1]}
                      onChange={async (event, newP2Score) => {
                        const newScore: [number, number] = [
                          score[0],
                          newP2Score ?? 0,
                        ];
                        await window.electron.setMirrorScore(newScore);
                        setScore(newScore);
                      }}
                    />
                  }
                />
              ) : (
                <Typography variant="body2">
                  {getEntrantName(mirrorSet.entrant2Names)}
                </Typography>
              )}
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          {isMirroring &&
            mirrorSet &&
            (twitchPredictionsEnabled && prediction ? (
              <>
                <Button
                  disabled={lockingTwitchPrediction || prediction.locked}
                  onClick={async () => {
                    try {
                      setLockingTwitchPrediction(true);
                      await window.electron.lockTwitchPrediction();
                    } catch (e: any) {
                      showAppErrorDialog(
                        e instanceof Error ? e.message : e.toString(),
                      );
                    } finally {
                      setLockingTwitchPrediction(false);
                    }
                  }}
                  variant="contained"
                >
                  Lock Prediction
                </Button>
                <Button
                  disabled={
                    resolvingTwitchPrediction ||
                    (showScore && score[0] === score[1])
                  }
                  onClick={async () => {
                    try {
                      setResolvingTwitchPrediction(true);
                      if (showScore) {
                        await window.electron.resolveTwitchPredictionWithWinner(
                          getEntrantName(
                            score[0] > score[1]
                              ? mirrorSet.entrant1Names
                              : mirrorSet.entrant2Names,
                          ),
                        );
                      } else {
                        await window.electron.resolveTwitchPrediction();
                      }
                    } catch (e: any) {
                      showAppErrorDialog(
                        e instanceof Error ? e.message : e.toString(),
                      );
                    } finally {
                      setResolvingTwitchPrediction(false);
                    }
                  }}
                  variant="contained"
                >
                  Resolve Prediction
                </Button>
              </>
            ) : (
              <>
                {twitchPredictionsEnabled && (
                  <Button
                    disabled={creatingTwitchPrediction}
                    onClick={async () => {
                      try {
                        setCreatingTwitchPrediction(true);
                        await window.electron.createTwitchPrediction(mirrorSet);
                      } catch (e: any) {
                        showAppErrorDialog(
                          e instanceof Error ? e.message : e.toString(),
                        );
                      } finally {
                        setCreatingTwitchPrediction(false);
                      }
                    }}
                    variant="contained"
                  >
                    Start Prediction
                  </Button>
                )}
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
                  Clear Mirror Set
                </Button>
              </>
            ))}
          {isMirroring ? (
            <Button
              color="error"
              disabled={twitchPredictionsEnabled && prediction !== null}
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
