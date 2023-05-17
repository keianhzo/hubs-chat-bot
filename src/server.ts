import express from "express";
import {
  JoinParams,
  MessageParams,
  ReticulumClient,
  ConnectParams,
  LeaveParams,
  MovedParams,
} from "./reticulum";
import { Game } from "./game";

const app = express();

const games = new Map<string, Game>();

const start = async (params: MessageParams, ...args: string[]) => {
  const { channel, hubId } = params;
  if (args.length !== 1) {
    console.error(`This command requires 1 parameter`);
    return;
  }

  const game = games.get(hubId)!;

  const type = args[0];
  const players = channel.getUsers(game.sessionId);
  let ids = [...players.keys()];

  console.log(`start [${ids.join(",")}]`);
  game.start(type, ids);
};

const msg = async (params: MessageParams, ...args: string[]) => {
  const { hubId, session_id } = params;

  const msg = `${args.join(" ")}`;
  const game = games.get(hubId)!;

  console.log(`msg ${session_id} ${msg}`);
  game.msg(session_id, msg);
};

const option = async (params: MessageParams, ...args: string[]) => {
  const { hubId, session_id } = params;
  if (args.length !== 2) {
    console.error(`This command requires 1 parameter`);
    return;
  }

  const game = games.get(hubId)!;

  const option = args[0];

  console.log(`option ${session_id} ${option}`);
  game.option(session_id, option);
};

const end = async (params: MessageParams, ...args: string[]) => {
  const { hubId } = params;
  const game = games.get(hubId)!;

  console.log(`end`);
  game.end();
};

const onJoin = async (params: JoinParams) => {
  const { hubId, session_id, presence } = params;

  const game = games.get(hubId)!;

  if (session_id && session_id !== game.sessionId && presence === "room") {
    game.join(session_id);
  }
};

const onMoved = async (params: MovedParams) => {
  const { hubId, session_id, presence, previousPresence } = params;

  const game = games.get(hubId)!;
  if (
    session_id &&
    session_id !== game.sessionId &&
    presence === "room" &&
    previousPresence === "lobby"
  ) {
    game.join(session_id);
  }
};

const onLeave = async (params: LeaveParams) => {
  const { hubId, session_id } = params;

  const game = games.get(hubId)!;
  game.leave(session_id);
};

const onConnect = (params: ConnectParams) => {
  const { channel, session_id } = params;

  const hubId = channel.channel.topic.split(":")[1];

  const game = new Game({
    hubId,
    channel,
    sessionId: session_id,
  });
  games.set(hubId, game);

  game.connect();
};

const onDisconnect = (params: ConnectParams) => {
  const { hubId } = params;

  const game = games.get(hubId)!;
  game && games.delete(game.hubId);
};

const onMessage = async (params: MessageParams) => {
  const { hubId, session_id, body } = params;

  const game = games.get(hubId)!;
  if (game.sessionId === session_id) return;

  const { command, args } = body;
  if (command === "game" && args && args.length > 0) {
    const command = args.shift();
    switch (command) {
      case "start":
        start(params, ...args);
        break;
      case "option":
        option(params, ...args);
        break;
      case "end":
        end(params, ...args);
        break;
      case "msg":
        msg(params, ...args);
        break;
    }
  }
};

app.get("/connect", async (req, res) => {
  const host = (req.query.host as string) || "";
  const port = req.query.port as string;
  const hubId = req.query.hub_id as string;

  if (!host || !hubId) {
    return res.sendStatus(500);
  }

  if (games.has(hubId)) {
    res.sendStatus(500);
    console.error(`A connection for room ${hubId} already exists`);
  } else {
    const hostname = `${host}${port ? ":" + port : ""}`;
    const reticulum = new ReticulumClient(`${hostname}`);
    try {
      await reticulum.connect();
      const hubChannel = reticulum.channelForHub(hubId, {
        displayName: "GameBot",
      });
      hubChannel.on("connect", onConnect);
      hubChannel.on("disconnect", onDisconnect);
      hubChannel.on("join", onJoin);
      hubChannel.on("moved", onMoved);
      hubChannel.on("leave", onLeave);
      hubChannel.on("message", onMessage);
      try {
        await hubChannel.connect();
      } catch (e) {
        hubChannel.close();
      }
      res.sendStatus(200);
    } catch (e) {
      res.sendStatus(500);
      console.error(`An error occurred when connecting to room ${hubId}`, e);
    }
  }
});

app.get("/rooms", async (req, res) => {
  res.json(Array.from(games.keys()));
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
