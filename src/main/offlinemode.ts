import { BrowserWindow } from 'electron';
import WebSocket from 'ws';
import { ApiPhaseGroup, ApiSet } from '../common/types';

type OfflineModeParticipant = {
  id: number;
  gamerTag: string;
  prefix: string;
  pronouns: string;
};

type OfflineModeSet = {
  id: number;
  setId: number | string;
  ordinal: number;
  fullRoundText: string;
  shortRoundText: string;
  identifier: string;
  round: number;
  state: number;
  entrant1Id: number | null;
  entrant1Name: string | null;
  entrant1Participants: OfflineModeParticipant[];
  entrant1PrereqStr: string | null;
  entrant1Score: number | null;
  entrant2Id: number | null;
  entrant2Name: string | null;
  entrant2Participants: OfflineModeParticipant[];
  entrant2PrereqStr: string | null;
  entrant2Score: number | null;
  winnerId: number | null;
  updatedAt: number;
  completedAt: number | null;
};

type OfflineModePool = {
  id: number;
  name: string;
  bracketType: number;
  waveId: number | null;
  winnersTargetPhaseId: number | null;
  sets: OfflineModeSet[];
};

type OfflineModePhase = {
  id: number;
  name: string;
  pools: OfflineModePool[];
  phaseOrder: number;
};

type OfflineModeEvent = {
  id: number;
  name: string;
  slug: string;
  isOnline: boolean;
  videogameId: number;
  phases: OfflineModePhase[];
};

type OfflineModeTournament = {
  id: number;
  name: string;
  slug: string;
  location: string;
  events: OfflineModeEvent[];
};

let address = '';
let error = '';
let mainWindow: BrowserWindow | undefined;
let tournamentSlug = '';
const phaseGroups: ApiPhaseGroup[] = [];
const phaseGroupIdToPendingSets = new Map<number, ApiSet[]>();
export function initOfflineMode(initMainWindow: BrowserWindow) {
  mainWindow = initMainWindow;
  address = '';
  error = '';
  tournamentSlug = '';
  phaseGroups.length = 0;
  phaseGroupIdToPendingSets.clear();
}
function setStatus(newAddress: string, newError?: string) {
  address = newAddress;
  if (newError !== undefined) {
    error = newError;
  }
  mainWindow?.webContents.send('offlineModeStatus', address, error);
}

let websocket: WebSocket | null = null;
function cleanup() {
  websocket?.removeAllListeners();
  websocket = null;
  tournamentSlug = '';
  phaseGroups.length = 0;
  phaseGroupIdToPendingSets.clear();
}

export function disconnectFromOfflineMode() {
  if (websocket) {
    websocket.close();
  }
}

export function connectToOfflineMode(port: number) {
  if (websocket) {
    return;
  }

  const tryAddress = `ws://127.0.01:${port}`;
  websocket = new WebSocket(tryAddress, 'bracket-protocol')
    .on('open', () => {
      setStatus(tryAddress, '');
    })
    .on('error', (err) => {
      cleanup();
      setStatus('', err.message);
    })
    .on('close', () => {
      cleanup();
      setStatus('');
    })
    .on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        if (message.op === 'tournament-update-event') {
          if (message.tournament) {
            const newTournament = message.tournament as OfflineModeTournament;
            tournamentSlug = newTournament.slug;
            phaseGroups.length = 0;
            phaseGroupIdToPendingSets.clear();
            const validEvents = newTournament.events.filter(
              (event) => event.videogameId === 1 && !event.isOnline,
            );
            validEvents.forEach((event) => {
              event.phases.forEach((phase) => {
                phase.pools.forEach((pool) => {
                  const apiPhaseGroup: ApiPhaseGroup = {
                    tournamentName: newTournament.name,
                    tournamentLocation: newTournament.location,
                    eventSlug: event.slug,
                    eventName: event.name,
                    eventHasSiblings: validEvents.length > 1,
                    phaseId: phase.id,
                    phaseName: phase.name,
                    phaseHasSiblings: event.phases.length > 1,
                    phaseGroupId: pool.id,
                    phaseGroupName: pool.name,
                    phaseGroupBracketType: pool.bracketType,
                    phaseGroupHasSiblings: phase.pools.length > 1,
                  };
                  let hasSets = false;
                  pool.sets
                    .filter(
                      (set) =>
                        set.state !== 3 &&
                        set.entrant1Id !== null &&
                        set.entrant2Id !== null,
                    )
                    .forEach((set) => {
                      hasSets = true;
                      let pendingSets = phaseGroupIdToPendingSets.get(pool.id);
                      if (!pendingSets) {
                        pendingSets = [];
                        phaseGroupIdToPendingSets.set(pool.id, pendingSets);
                      }
                      pendingSets.push({
                        id: set.id,
                        entrant1Names: set.entrant1Participants.map(
                          (participant) => participant.gamerTag,
                        ),
                        entrant1Prefixes: set.entrant1Participants.map(
                          (participant) => participant.prefix,
                        ),
                        entrant1Pronouns: set.entrant1Participants.map(
                          (participant) => participant.pronouns,
                        ),
                        entrant2Names: set.entrant2Participants.map(
                          (participant) => participant.gamerTag,
                        ),
                        entrant2Prefixes: set.entrant2Participants.map(
                          (participant) => participant.prefix,
                        ),
                        entrant2Pronouns: set.entrant2Participants.map(
                          (participant) => participant.pronouns,
                        ),
                        fullRoundText: set.fullRoundText,
                        ...apiPhaseGroup,
                      });
                    });
                  if (hasSets) {
                    phaseGroups.push(apiPhaseGroup);
                  }
                });
              });
            });
          } else {
            tournamentSlug = '';
          }
        }
      } catch {
        // just catch
      }
    });
}

export function getPhaseGroups(): {
  phaseGroups: ApiPhaseGroup[];
  tournamentSlugs: string[];
} {
  return {
    phaseGroups,
    tournamentSlugs: [tournamentSlug],
  };
}

export function getPendingSets(phaseGroupId: number) {
  const pendingSets = phaseGroupIdToPendingSets.get(phaseGroupId);
  if (!pendingSets) {
    throw new Error(`no known phaseGroup for id ${phaseGroupId}`);
  }

  return pendingSets;
}
