import { ChatCompletionRequestMessageRoleEnum } from "openai";
import GameBot from "./gamebot";
import {
  GameDataI,
  LOTR,
  HarryPotter,
  ElderScrolls,
  StarWars,
  Dune,
  DragonBall,
  Naruto,
  BladeRunner,
} from "./data";
import { HubChannel } from "./reticulum";
import { SkyboxStyleT, Skyboxes } from "./skybox";

const WELCOME_MSG = `Hi, I'm you adventure game provider! Click the start button below to start a new game.`;

const GAME_DATA: { [key: string]: GameDataI } = {
  lotr: LOTR,
  hp: HarryPotter,
  es: ElderScrolls,
  sw: StarWars,
  dn: Dune,
  db: DragonBall,
  nt: Naruto,
  br: BladeRunner,
};

export type ConfigT = {
  channel: HubChannel;
  sessionId: string;
  hubId: string;
};

export enum GameState {
  CONNECTED,
  DISCONNECTED,
  STARTED,
  ENDED,
}

export enum CommandE {
  Text = "text",
  Options = "options",
  Error = "error",
  Start = "start",
}

enum WeatherE {
  Clear = "Clear",
  Rain = "Rain",
  Wind = "Wind",
  Snow = "Snow",
}

enum TypeE {
  Fantasy = "fantasy",
  Action = "action",
  Terror = "terror",
}

export type GameOptionsI = { [key: string]: string };

export interface OptionsResponseI {
  scene: string;
  prompt: string;
  backdrop: string;
  player: string;
  options: GameOptionsI;
  weather: WeatherE;
  time: number;
  state: "started" | "ended";
  type: TypeE;
}

export interface MessageResponseI {
  msg: string;
}

export type ResponseT = {
  type: CommandE;
  content: OptionsResponseI | string;
};

const skyboxes = new Skyboxes();
skyboxes.update();

export class Game {
  channel: HubChannel | null = null;
  sessionId: string;
  hubId: string;
  bot: GameBot;
  lastMsg: ResponseT;
  state: GameState = GameState.DISCONNECTED;
  type: GameDataI = GAME_DATA[LOTR.name];
  players: Set<string> = new Set<string>();
  skyboxes: Map<string, string>;
  turn: number;

  constructor(config: ConfigT) {
    const { channel, sessionId, hubId } = config;
    this.sessionId = sessionId;
    this.channel = channel;
    this.hubId = hubId;
    this.bot = new GameBot();
    this.skyboxes = new Map();
    this.lastMsg = {
      type: CommandE.Start,
      content: WELCOME_MSG,
    };
    this.turn = 0;
  }

  nextTurn() {
    if (this.turn >= this.players.size - 1) {
      this.turn = 0;
    } else {
      this.turn++;
    }
    return this.turn;
  }

  async connect() {
    this.channel!.sendCommand("GameBot", {
      command: "game",
      args: ["connect"],
    });
    this.state = GameState.CONNECTED;
    this.processResponse(this.lastMsg);
  }

  async disconnect() {
    this.channel!.sendCommand("GameBot", {
      command: "game",
      args: ["connect"],
    });
    this.state = GameState.DISCONNECTED;
    this.processResponse(this.lastMsg);
    this.channel?.close();
  }

  async text(text: string) {
    this.channel!.sendCommand("GameBot", {
      command: "game",
      args: ["text", text],
    });
  }

  async start(type: string, sessionIds: string[]) {
    if (this.state === GameState.STARTED) {
      console.log(`The game is already started`);
      return;
    }

    this.text("Creating a new game...");

    sessionIds.forEach((id) => {
      if (id !== this.sessionId) {
        this.players.add(id);
      }
    });
    this.type = GAME_DATA[type];
    this.state = GameState.STARTED;

    console.log(`Start with players: ${sessionIds.join(", ")}`);

    try {
      let res = await this.bot.send(this.sessionId, [
        {
          role: ChatCompletionRequestMessageRoleEnum.System,
          content: this.type.system,
        },
        {
          role: ChatCompletionRequestMessageRoleEnum.User,
          content: this.type.rules,
        },
        {
          role: ChatCompletionRequestMessageRoleEnum.User,
          content: `Start. Players: ${sessionIds.join(", ")}`,
        },
      ]);
      const content: OptionsResponseI = JSON.parse(res) as OptionsResponseI;
      content.player = Array.from(this.players)[0];
      this.lastMsg = {
        type: CommandE.Options,
        content,
      };
    } catch (e) {
      this.lastMsg = {
        type: CommandE.Error,
        content: (e as any).response?.data?.error?.message || e,
      };
    }
    this.processResponse(this.lastMsg);
  }

  async end() {
    if (this.state !== GameState.STARTED) {
      console.log(`The game is not started yet`);
      return;
    }

    this.state = GameState.ENDED;
    this.skyboxes.clear();
    this.bot.clear();
    this.players.clear();
    this.lastMsg = {
      type: CommandE.Start,
      content: WELCOME_MSG,
    };
    this.turn = 0;

    this.processResponse(this.lastMsg);
  }

  async join(sessionId: string) {
    this.channel!.sendCommand("GameBot", {
      command: "game",
      args: ["connect"],
    });

    if (this.state !== GameState.STARTED) {
      this.lastMsg = {
        type: CommandE.Start,
        content: WELCOME_MSG,
      };
      this.processResponse(this.lastMsg);
      return;
    }

    if (sessionId !== this.sessionId) {
      this.players.add(sessionId);
    }

    console.log(`Current players: ${[...this.players].join(", ")}`);

    const playerName = this.channel!.getName(sessionId);
    this.text(`${playerName} has joined the game.`);

    if (!this.bot.busy) {
      setTimeout(() => this.processResponse(this.lastMsg), 4000);
    }
  }

  async leave(sessionId: string) {
    if (this.state !== GameState.STARTED) {
      return;
    }

    if (sessionId !== this.sessionId) {
      this.players.delete(sessionId);
    }

    const index = Array.from(this.players).indexOf(sessionId);
    let nextTurn = this.turn;
    if (index === nextTurn) {
      nextTurn = this.nextTurn();
    }

    if (this.players.size === 0) {
      this.end();
    } else {
      console.log(`Current players: ${[...this.players].join(", ")}`);

      const playerName = this.channel!.getName(sessionId);
      this.text(`${playerName} has left the game.`);

      if (!this.bot.busy) {
        const content = this.lastMsg.content as OptionsResponseI;
        content.player = Array.from(this.players)[nextTurn];
        setTimeout(() => this.processResponse(this.lastMsg), 4000);
      }
    }
  }

  async option(sessionId: string, option: string) {
    if (this.state !== GameState.STARTED) {
      console.log(`The game is not started yet`);
      return;
    }

    const options = this.lastMsg.content as OptionsResponseI;
    const text = options.options[option];
    this.text(`${this.channel!.getName(sessionId)}: ${text}`);

    try {
      let res = await this.bot.send(this.sessionId, {
        role: ChatCompletionRequestMessageRoleEnum.User,
        content: `"${sessionId}": "${option}"`,
      });
      try {
        const content: OptionsResponseI = JSON.parse(res) as OptionsResponseI;
        content.player = Array.from(this.players)[this.nextTurn()];
        this.lastMsg = {
          type: CommandE.Options,
          content,
        };
      } catch (e) {
        this.lastMsg = {
          type: CommandE.Text,
          content: res,
        };
      }
    } catch (e) {
      this.lastMsg = {
        type: CommandE.Error,
        content: (e as any).response?.data?.error?.message || e,
      };
    }
    this.processResponse(this.lastMsg);
  }

  async msg(sessionId: string, msg: string) {
    if (this.state !== GameState.STARTED) {
      console.log(`The game is not started yet`);
      return;
    }

    this.text(`${this.channel!.getName(sessionId)}: ${msg}`);

    try {
      let res = await this.bot.send(this.sessionId, {
        role: ChatCompletionRequestMessageRoleEnum.User,
        content: `${sessionId}: ${msg}`,
      });
      try {
        const content: OptionsResponseI = JSON.parse(res) as OptionsResponseI;
        content.player = Array.from(this.players)[this.nextTurn()];
        this.lastMsg = {
          type: CommandE.Options,
          content,
        };
      } catch (e) {
        this.lastMsg = {
          type: CommandE.Text,
          content: res,
        };
      }
    } catch (e) {
      this.lastMsg = {
        type: CommandE.Error,
        content: (e as any).response?.data?.error?.message || e,
      };
    }
    this.processResponse(this.lastMsg);
  }

  processResponse(res: ResponseT) {
    if (res.type === CommandE.Options) {
      const options = res.content as OptionsResponseI;
      let ids = [...this.players];
      ids.forEach((id) => {
        if (id !== this.sessionId) {
          options.prompt.replace(id, this.channel!.getName(id));
          options.backdrop.replace(id, this.channel!.getName(id));
          options.options.A?.replace(id, this.channel!.getName(id));
          options.options.B?.replace(id, this.channel!.getName(id));
          options.options.C?.replace(id, this.channel!.getName(id));
          options.options.D?.replace(id, this.channel!.getName(id));
        }
      });

      this.channel!.sendCommand("GameBot", {
        command: "game",
        args: [res.type, res.content],
      });

      if (!this.skyboxes.has(options.scene)) {
        console.log("Generating skybox...");
        const style = skyboxes.styles.find(
          (value: SkyboxStyleT) => value.id === this.type.style
        );
        skyboxes
          .generate(
            `${this.type.name}. ${options.scene}. ${options.backdrop}`,
            style!
          )
          .then((fileUrl) => {
            if (this.state === GameState.STARTED) {
              console.log(fileUrl);
              this.skyboxes.set(options.scene, fileUrl);
              this.channel!.sendCommand("GameBot", {
                command: "game",
                args: ["skybox", fileUrl],
              });
            }
          })
          .catch((err) => {
            console.error(err);
          });
      } else {
        this.channel!.sendCommand("GameBot", {
          command: "game",
          args: ["skybox", this.skyboxes.get(options.scene)],
        });
        this.channel!.sendCommand("GameBot", {
          command: "game",
          args: [res.type, res.content],
        });
      }
    } else {
      this.channel!.sendCommand("GameBot", {
        command: "game",
        args: [res.type, res.content],
      });
    }
  }
}
