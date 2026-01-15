/* eslint-disable max-classes-per-file */
import {
  AccessToken,
  accessTokenIsExpired,
  exchangeCode,
  getTokenInfo,
  RefreshingAuthProvider,
  refreshUserToken,
} from '@twurple/auth';
import { Bot, createBotCommand } from '@twurple/easy-bot';
import { AddressInfo, Server } from 'net';
import express from 'express';
import GracefulShutdown from 'http-graceful-shutdown';
import { shell } from 'electron';
import { ApiClient, HelixPrediction } from '@twurple/api';
import { EventSubSubscription } from '@twurple/eventsub-base';
import { EventSubWsListener } from '@twurple/eventsub-ws';
import {
  ApiSet,
  TwitchClient,
  TwitchPrediction,
  TwitchStatus,
} from '../common/types';
import { getEntrantName } from '../common/commonUtil';
import { wrappedFetch } from './util';

type CurrentPrediction = {
  set: ApiSet;
  prediction: HelixPrediction;
};

type CommonAuth = {
  authProvider: RefreshingAuthProvider;
  userId: string;
  userName: string;
};

class Predictor {
  private api: ApiClient;

  private userId: string;

  private onPrediction: (prediction: TwitchPrediction | null) => void;

  private currentPrediction: CurrentPrediction | null;

  private eventSub: EventSubWsListener;

  private channelPredictionLockSubscription: EventSubSubscription;

  private channelPredictionEndSubscription: EventSubSubscription;

  constructor(
    authProvider: RefreshingAuthProvider,
    userId: string,
    onPrediction: (prediction: TwitchPrediction | null) => void,
  ) {
    this.api = new ApiClient({ authProvider });
    this.userId = userId;
    this.onPrediction = onPrediction;
    this.currentPrediction = null;

    this.eventSub = new EventSubWsListener({ apiClient: this.api });
    this.channelPredictionLockSubscription =
      this.eventSub.onChannelPredictionLock(this.userId, (event) => {
        if (
          this.currentPrediction &&
          this.currentPrediction.prediction.id === event.id
        ) {
          this.onPrediction({
            title: this.currentPrediction.prediction.title,
            locked: true,
          });
        }
      });
    this.channelPredictionEndSubscription =
      this.eventSub.onChannelPredictionEnd(this.userId, (event) => {
        if (
          this.currentPrediction &&
          this.currentPrediction.prediction.id === event.id
        ) {
          this.currentPrediction = null;
          this.onPrediction(null);
        }
      });
    this.eventSub.start();
  }

  destroy() {
    this.eventSub.stop();
    this.channelPredictionEndSubscription.stop();
    this.channelPredictionLockSubscription.stop();
  }

  async resolvePrediction() {
    if (!this.currentPrediction) {
      return;
    }

    const json = await wrappedFetch(
      `https://api.start.gg/set/${this.currentPrediction.set.id}?expand[]=entrants`,
    );
    const { entrants } = json.entities;
    if (!Array.isArray(entrants) || entrants.length === 0) {
      return;
    }

    const entrantIdToName = new Map<number, string>();
    entrants.forEach((entrant: any) => {
      const { id } = entrant;
      if (!Number.isInteger(id)) {
        return;
      }

      const entrantNames = Array.from(
        Object.values(entrant.mutations.participants),
      ).map((participant: any) => participant.gamerTag);
      if (entrantNames.length > 0) {
        entrantIdToName.set(id, getEntrantName(entrantNames));
      }
    });

    const set = json.entities.sets;
    if (Number.isInteger(set.winnerId)) {
      const winnerName = entrantIdToName.get(set.winnerId);
      if (winnerName) {
        const winnerOutcome = this.currentPrediction.prediction.outcomes.find(
          (outcome) => outcome.title === winnerName,
        );
        if (winnerOutcome) {
          await this.api.predictions.resolvePrediction(
            this.userId,
            this.currentPrediction.prediction.id,
            winnerOutcome.id,
          );
          this.currentPrediction = null;
          this.onPrediction(null);
        }
      }
    }
  }

  async resolvePredictionWithWinner(winnerName: string) {
    if (!this.currentPrediction) {
      return;
    }

    const winnerOutcome = this.currentPrediction.prediction.outcomes.find(
      (outcome) => outcome.title === winnerName,
    );
    if (winnerOutcome) {
      await this.api.predictions.resolvePrediction(
        this.userId,
        this.currentPrediction.prediction.id,
        winnerOutcome.id,
      );
      this.currentPrediction = null;
      this.onPrediction(null);
    }
  }

  async createPrediction(set: ApiSet) {
    if (this.currentPrediction) {
      throw new Error('asdf');
    }

    const entrant1Name = getEntrantName(set.entrant1Names);
    const entrant2Name = getEntrantName(set.entrant2Names);
    const prediction = await this.api.predictions.createPrediction(
      this.userId,
      {
        autoLockAfter: 300,
        outcomes: [entrant1Name, entrant2Name],
        title: `${entrant1Name} vs ${entrant2Name}`,
      },
    );
    this.currentPrediction = {
      set,
      prediction,
    };
    this.onPrediction({
      title: prediction.title,
      locked: prediction.status === 'LOCKED',
    });
  }

  async lockPrediction() {
    if (!this.currentPrediction) {
      return;
    }

    const prediction = await this.api.predictions.lockPrediction(
      this.userId,
      this.currentPrediction.prediction.id,
    );
    this.currentPrediction.prediction = prediction;
    this.onPrediction({
      title: prediction.title,
      locked: prediction.status === 'LOCKED',
    });
  }
}

export default class Twitch {
  private client: TwitchClient;

  private accessToken: AccessToken | null;

  private botEnabled: boolean;

  private predictionsEnabled: boolean;

  private stealth: boolean;

  private setAccessToken: (newAccessToken: AccessToken) => void;

  private onUserName: (botUserName: string) => void;

  private onBotStatus: (botStatus: TwitchStatus, message: string) => void;

  private onCallbackServerStatus: (
    callbackServerStatus: TwitchStatus,
    port: number,
  ) => void;

  private onPrediction: (prediction: TwitchPrediction | null) => void;

  private bot: Bot | null;

  private predictor: Predictor | null;

  private server: Server | null;

  private brackets: { spoilers: boolean; urls: string[] };

  constructor(
    client: TwitchClient,
    accessToken: AccessToken | null,
    botEnabled: boolean,
    predictionsEnabled: boolean,
    stealth: boolean,
    setAccessToken: (newAccessToken: AccessToken) => void,
    onUserName: (botUserName: string) => void,
    onBotStatus: (botStatus: TwitchStatus, message: string) => void,
    onCallbackServerStatus: (
      callbackServerStatus: TwitchStatus,
      port: number,
    ) => void,
    onPrediction: (prediction: TwitchPrediction | null) => void,
  ) {
    this.client = client;
    this.accessToken = accessToken;
    this.botEnabled = botEnabled;
    this.predictionsEnabled = predictionsEnabled;
    this.stealth = stealth;
    this.setAccessToken = setAccessToken;
    this.onUserName = onUserName;
    this.onBotStatus = onBotStatus;
    this.onCallbackServerStatus = onCallbackServerStatus;
    this.onPrediction = onPrediction;

    this.bot = null;
    this.predictor = null;
    this.server = null;
    this.brackets = { spoilers: false, urls: [] };
  }

  async initialize() {
    try {
      const commonAuth = await this.getCommonAuth();
      if (commonAuth) {
        await this.startBot(commonAuth);
        this.startPredictor(commonAuth);
      }
    } catch (e: unknown) {
      if (e instanceof Error) {
        this.onBotStatus(TwitchStatus.STOPPED, e.message);
      }
    }
  }

  async destroy() {
    this.onUserName = () => {};
    this.onBotStatus = () => {};
    this.onCallbackServerStatus = () => {};
    this.onPrediction = () => {};

    const promises = [this.stopBot(), this.stopCallbackServer()];
    this.stopPredictor();
    await Promise.allSettled(promises);
  }

  private async stopBot() {
    if (this.bot) {
      this.bot.removeListener();
      await new Promise<void>((resolve) => {
        if (!this.bot) {
          resolve();
          return;
        }

        this.bot.onDisconnect(() => {
          this.bot = null;
          this.onBotStatus(TwitchStatus.STOPPED, '');
          resolve();
        });

        this.bot.chat.quit();
      });
    }
  }

  private stopPredictor() {
    if (this.predictor) {
      this.predictor.destroy();
      this.predictor = null;
    }
  }

  private async getCommonAuth(): Promise<CommonAuth | null> {
    if (
      !this.client.clientId ||
      !this.client.clientSecret ||
      !this.accessToken
    ) {
      return null;
    }

    if (accessTokenIsExpired(this.accessToken)) {
      if (!this.accessToken.refreshToken) {
        throw new Error('no refresh token');
      }
      this.accessToken = await refreshUserToken(
        this.client.clientId,
        this.client.clientSecret,
        this.accessToken.refreshToken,
      );
      this.setAccessToken(this.accessToken);
    }

    const tokenInfo = await getTokenInfo(
      this.accessToken.accessToken,
      this.client.clientId,
    );
    if (!tokenInfo.userName) {
      throw new Error('could not get bot user name');
    }
    const { userName } = tokenInfo;
    this.onUserName(userName);

    if (!tokenInfo.userId) {
      throw new Error('could not get bot user id');
    }

    const authProvider = new RefreshingAuthProvider(this.client);
    authProvider.onRefresh((userId, accessToken) => {
      this.accessToken = accessToken;
      this.setAccessToken(this.accessToken);
    });
    await authProvider.addUser(tokenInfo.userId, this.accessToken, ['chat']);
    return {
      authProvider,
      userId: tokenInfo.userId,
      userName: tokenInfo.userName,
    };
  }

  private async startBot(commonAuth: CommonAuth) {
    await this.stopBot();
    if (!this.botEnabled) {
      return;
    }

    this.onBotStatus(TwitchStatus.STARTING, '');
    const { authProvider, userName } = commonAuth;
    this.bot = new Bot({
      authProvider,
      channel: userName,
      commands: [
        createBotCommand('auto', (params, { say }) => {
          say(
            this.stealth
              ? 'This is an auto stream using recordings from bracket'
              : 'This is an auto stream using Slippi replays from bracket. Powered by hotswap: https://github.com/jmlee337/hotswap-info',
          );
        }),
        createBotCommand('bracket', (params, { say }) => {
          if (this.brackets.urls.length > 0) {
            const prefix = this.brackets.spoilers ? 'SPOILERS: ' : '';
            say(`${prefix}${this.brackets.urls.join(', ')}`);
          }
        }),
        createBotCommand('pronouns', (params, { say }) => {
          say(
            'Pronouns are pulled from start.gg. Update yours here: https://start.gg/admin/profile/profile-settings',
          );
        }),
      ],
    });
    this.bot.onConnect(() => {
      this.onBotStatus(TwitchStatus.STARTED, '');
    });
    this.bot.onDisconnect((manually, reason) => {
      this.onBotStatus(TwitchStatus.STOPPED, reason?.message || '');
      this.bot = null;
    });
  }

  private startPredictor(commonAuth: CommonAuth) {
    this.stopPredictor();
    if (!this.predictionsEnabled) {
      return;
    }

    const { authProvider, userId } = commonAuth;
    this.predictor = new Predictor(authProvider, userId, this.onPrediction);
  }

  private getPort() {
    if (!this.server) {
      return 0;
    }

    const { port } = this.server.address() as AddressInfo;
    if (!Number.isInteger(port) || port <= 0) {
      throw new Error('could not get server port');
    }
    return port;
  }

  async stopCallbackServer() {
    if (!this.server) {
      return;
    }

    await GracefulShutdown(this.server, {
      finally: () => {
        this.server = null;
        this.onCallbackServerStatus(TwitchStatus.STOPPED, 0);
      },
    })();
  }

  startCallbackServer() {
    if (this.server) {
      return;
    }

    this.onCallbackServerStatus(TwitchStatus.STARTING, 0);
    const app = express();
    this.server = app.listen(() => {
      if (!this.server) {
        throw new Error('unreachable');
      }

      this.onCallbackServerStatus(TwitchStatus.STARTED, this.getPort());
    });
    app.get('/', async (req, res) => {
      const { code } = req.query;
      if (typeof code !== 'string' || code.length === 0) {
        res
          .status(400)
          .send('Failure! Request URL does not contain code param.');
        return;
      }

      try {
        const newAccessToken = await exchangeCode(
          this.client.clientId,
          this.client.clientSecret,
          code,
          `http://localhost:${this.getPort()}`,
        );
        res
          .status(200)
          .send(
            'Success! You can close this tab and return to Auto SLP Player.',
          );
        this.accessToken = newAccessToken;
        this.setAccessToken(this.accessToken);
        const commonAuth = await this.getCommonAuth();
        if (commonAuth) {
          await this.startBot(commonAuth);
          this.startPredictor(commonAuth);
        }

        await this.stopCallbackServer();
      } catch (e: unknown) {
        res.status(503).send(e instanceof Error ? e.message : e);
      }
    });
  }

  setClient(client: TwitchClient) {
    if (!client.clientId || !client.clientSecret) {
      throw new Error('must set client ID and client secret.');
    }

    const shouldOpenExternal =
      client.clientId !== this.client.clientId ||
      client.clientSecret !== this.client.clientSecret ||
      !this.bot;
    this.client = client;
    if (shouldOpenExternal) {
      const port = this.getPort();
      if (!port) {
        throw new Error('must start callback server.');
      }
      shell.openExternal(
        `https://id.twitch.tv/oauth2/authorize?client_id=${this.client.clientId}&redirect_uri=http://localhost:${port}&response_type=code&scope=chat:read+chat:edit+channel:read:predictions+channel:manage:predictions`,
      );
    }
  }

  async setBotEnabled(botEnabled: boolean) {
    const changed = this.botEnabled === botEnabled;
    if (changed) {
      this.botEnabled = botEnabled;
      if (this.botEnabled) {
        const commonAuth = await this.getCommonAuth();
        if (commonAuth) {
          await this.startBot(commonAuth);
        }
      } else {
        await this.stopBot();
      }
    }
  }

  async setPredictionsEnabled(predictionsEnabled: boolean) {
    const changed = this.predictionsEnabled !== predictionsEnabled;
    if (changed) {
      this.predictionsEnabled = predictionsEnabled;
      if (this.predictionsEnabled) {
        const commonAuth = await this.getCommonAuth();
        if (commonAuth) {
          this.startPredictor(commonAuth);
        }
      } else {
        this.stopPredictor();
      }
    }
  }

  setBrackets(brackets: { spoilers: boolean; urls: string[] }) {
    this.brackets = brackets;
  }

  setStealth(stealth: boolean) {
    this.stealth = stealth;
  }

  async createPrediction(set: ApiSet) {
    if (!this.predictor) {
      throw new Error('Twitch predictions not enabled');
    }

    await this.predictor.createPrediction(set);
  }

  async lockPrediction() {
    if (!this.predictor) {
      throw new Error('Twitch predictions not enabled');
    }

    await this.predictor.lockPrediction();
  }

  async resolvePrediction() {
    if (!this.predictor) {
      throw new Error('Twitch predictions not enabled');
    }

    await this.predictor.resolvePrediction();
  }

  async resolvePredictionWithWinner(winnerName: string) {
    if (!this.predictor) {
      throw new Error('Twitch predictions not enabled');
    }

    await this.predictor.resolvePredictionWithWinner(winnerName);
  }
}
