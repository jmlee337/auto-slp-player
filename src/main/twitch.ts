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
import { TwitchClient, TwitchStatus } from '../common/types';

export default class Twitch {
  private client: TwitchClient;

  private accessToken: AccessToken | null;

  private botEnabled: boolean;

  private stealth: boolean;

  private setAccessToken: (newAccessToken: AccessToken) => void;

  private onUserName: (botUserName: string) => void;

  private onBotStatus: (botStatus: TwitchStatus, message: string) => void;

  private onCallbackServerStatus: (
    callbackServerStatus: TwitchStatus,
    port: number,
  ) => void;

  private bot: Bot | null;

  private server: Server | null;

  private brackets: { spoilers: boolean; urls: string[] };

  constructor(
    client: TwitchClient,
    accessToken: AccessToken | null,
    botEnabled: boolean,
    stealth: boolean,
    setAccessToken: (newAccessToken: AccessToken) => void,
    onUserName: (botUserName: string) => void,
    onBotStatus: (botStatus: TwitchStatus, message: string) => void,
    onCallbackServerStatus: (
      callbackServerStatus: TwitchStatus,
      port: number,
    ) => void,
  ) {
    this.client = client;
    this.accessToken = accessToken;
    this.botEnabled = botEnabled;
    this.stealth = stealth;
    this.setAccessToken = setAccessToken;
    this.onUserName = onUserName;
    this.onBotStatus = onBotStatus;
    this.onCallbackServerStatus = onCallbackServerStatus;

    this.bot = null;
    this.server = null;
    this.brackets = { spoilers: false, urls: [] };
  }

  async initialize() {
    try {
      await this.start();
    } catch (e: unknown) {
      if (e instanceof Error) {
        this.onBotStatus(TwitchStatus.STOPPED, e.message);
      }
    }
  }

  private async stop() {
    if (!this.bot) {
      return Promise.resolve();
    }

    this.bot.removeListener();
    return new Promise<void>((resolve) => {
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

  private async start() {
    if (
      !this.client.clientId ||
      !this.client.clientSecret ||
      !this.accessToken
    ) {
      return;
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

    if (!this.botEnabled) {
      return;
    }

    if (!tokenInfo.userId) {
      throw new Error('could not get bot user id');
    }

    await this.stop();
    this.onBotStatus(TwitchStatus.STARTING, '');

    const authProvider = new RefreshingAuthProvider(this.client);
    authProvider.onRefresh((userId, accessToken) => {
      this.accessToken = accessToken;
      this.setAccessToken(this.accessToken);
    });
    await authProvider.addUser(tokenInfo.userId, this.accessToken, ['chat']);

    this.bot = new Bot({
      authProvider,
      channel: userName,
      commands: [
        createBotCommand('auto', (params, { say }) => {
          say(
            this.stealth
              ? 'This is an auto stream using recorded sets from bracket'
              : 'This is an auto stream using Slippi replays from bracket. Powered by Replay Manager for Slippi and Auto SLP Player: https://github.com/jmlee337',
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

  stopCallbackServer() {
    if (!this.server) {
      return;
    }

    GracefulShutdown(this.server, {
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
        this.start();
        this.stopCallbackServer();
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
        `https://id.twitch.tv/oauth2/authorize?client_id=${this.client.clientId}&redirect_uri=http://localhost:${port}&response_type=code&scope=chat:read+chat:edit`,
      );
    }
  }

  setBotEnabled(botEnabled: boolean) {
    const oldBotEnabled = this.botEnabled;
    this.botEnabled = botEnabled;
    if (oldBotEnabled && !botEnabled) {
      this.stop();
    } else if (!oldBotEnabled && botEnabled) {
      this.start();
    }
  }

  setBrackets(brackets: { spoilers: boolean; urls: string[] }) {
    this.brackets = brackets;
  }

  setStealth(stealth: boolean) {
    this.stealth = stealth;
  }
}
