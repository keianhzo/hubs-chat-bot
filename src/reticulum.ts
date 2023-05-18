import EventEmitter from "events";
import { Channel, Presence, Socket, Push } from "phoenix";
import { WebSocket } from "ws";

export type HubsChannelParamsT = {
  channel: HubChannel;
  hubId: string;
  timestamp: number;
};

export type ConnectParams = HubsChannelParamsT & {
  session_id: string;
};
export type DisconnectParams = HubsChannelParamsT;
export type JoinParams = HubsChannelParamsT & {
  session_id: string;
  presence: any;
  displayName: string;
};
export type MovedParams = HubsChannelParamsT & {
  session_id: string;
  presence: any;
  previousPresence: any;
  displayName: string;
};
export type LeaveParams = HubsChannelParamsT & {
  session_id: string;
  presence: any;
  displayName: string;
};

export type HubsCommand = {
  command: string;
  args: Array<string>;
};
export type MessageParams = HubsChannelParamsT & {
  session_id: string;
  body: HubsCommand;
};

export type HubChannelData = {
  channel: HubChannel;
  session_id: string;
  timestamp: number;
};

// Converts a Phoenix message push object into a promise that resolves when the push
// is acknowledged by Reticulum or rejects when it times out or Reticulum produces an error.
function promisifyPush(push: Push) {
  return new Promise((resolve, reject) => {
    return push
      .receive("ok", resolve)
      .receive("timeout", reject)
      .receive("error", reject);
  });
}

// State related to a single Hubs Phoenix channel subscription.
export class HubChannel extends EventEmitter {
  channel: Channel;
  presence: Presence;

  constructor(channel: Channel) {
    super();
    this.channel = channel;
    this.presence = new Presence(channel);
  }

  async connect(): Promise<HubChannelData> {
    this.presence.onJoin((session_id, curr, p) => {
      const mostRecent = p.metas[p.metas.length - 1];

      if (curr != null && curr.metas != null && curr.metas.length > 0) {
        // this user was already in the lobby or room, notify if their name changed or they moved between the lobby and room
        const previous = curr.metas[curr.metas.length - 1];
        if (
          previous.profile &&
          mostRecent.profile &&
          previous.profile.displayName !== mostRecent.profile.displayName
        ) {
          const hubId = this.channel.topic.split(":")[1];
          this.emit("renameuser", {
            channel: this,
            hubId,
            timestamp: Date.now(),
            session_id,
            presence: mostRecent.presence,
            displayName: mostRecent.profile.displayName,
          } as JoinParams);
        }
        if (
          previous.presence === "lobby" &&
          mostRecent.presence &&
          previous.presence !== mostRecent.presence
        ) {
          const hubId = this.channel.topic.split(":")[1];
          this.emit("moved", {
            channel: this,
            hubId,
            timestamp: Date.now(),
            session_id,
            presence: mostRecent.presence,
            previousPresence: previous.presence,
            displayName: mostRecent.profile.displayName,
          } as MovedParams);
        }
        return;
      }

      // this user was not previously present, notify for a join
      const hubId = this.channel.topic.split(":")[1];
      this.emit("join", {
        channel: this,
        hubId,
        timestamp: Date.now(),
        session_id,
        presence: mostRecent.presence,
        displayName: mostRecent.profile.displayName,
      } as JoinParams);
    });

    this.presence.onLeave((session_id, curr, p) => {
      const mostRecent = p.metas[p.metas.length - 1];

      if (curr != null && curr.metas != null && curr.metas.length > 0) {
        return; // this user is still in the lobby or room, don't notify yet
      }

      const hubId = this.channel.topic.split(":")[1];
      this.emit("leave", {
        channel: this,
        hubId,
        timestamp: Date.now(),
        session_id,
        presence: mostRecent.presence,
        displayName: mostRecent.profile.displayName,
      } as LeaveParams);
    });

    this.presence.onSync(() => {
      this.emit("sync", Date.now());
    });

    this.channel.on("hub_refresh", ({ session_id, stale_fields, hubs }) => {
      // Not used
    });

    this.channel.on("pin", (data) => {
      // Not used
    });

    this.channel.onClose(() => {
      const hubId = this.channel.topic.split(":")[1];
      this.emit("disconnect", {
        channel: this,
        hubId,
        timestamp: Date.now(),
      } as DisconnectParams);
    });

    this.channel.on("message", ({ session_id, type, body, from, discord }) => {
      const hubId = this.channel.topic.split(":")[1];
      this.emit("message", {
        channel: this,
        hubId,
        session_id,
        timestamp: Date.now(),
        body,
      } as MessageParams);
    });

    const data: HubChannelData = await new Promise((resolve, reject) => {
      this.channel
        .join()
        .receive("error", () => {
          const hubId = this.channel.topic.split(":")[1];
          this.emit("disconnect", {
            channel: this,
            hubId,
            timestamp: Date.now(),
          } as DisconnectParams);
          reject();
        })
        .receive("timeout", () => {
          const hubId = this.channel.topic.split(":")[1];
          this.emit("disconnect", {
            channel: this,
            hubId,
            timestamp: Date.now(),
          } as DisconnectParams);
          reject();
        })
        .receive("ok", (data: HubChannelData) => {
          // this "ok" handler will be called on reconnects as well
          const hubId = this.channel.topic.split(":")[1];
          this.emit("connect", {
            channel: this,
            hubId,
            session_id: data.session_id,
            timestamp: Date.now(),
          } as ConnectParams);
          resolve(data);
        });
    });

    return data;
  }

  async close() {
    return promisifyPush(this.channel.leave());
  }

  // Returns the most recent display name of the given session ID in presence.
  getName(sessionId: string) {
    const presence = this.presence as any;
    const userInfo = presence.state[sessionId];
    if (userInfo) {
      const mostRecent = userInfo.metas[userInfo.metas.length - 1];
      return mostRecent.profile.displayName;
    }
    return null;
  }

  // Returns presence info for all users in the room, except ourselves.
  getUsers(session_id: string) {
    const result = new Map<string, any>();
    const presence = this.presence as any;
    for (const id in presence.state) {
      const state = presence.state[id];
      if (session_id !== id) {
        result.set(id, state);
      }
    }
    return result;
  }

  getUsersInRoom(session_id: string) {
    const result = new Map<string, any>();
    const presence = this.presence as any;
    for (const id in presence.state) {
      const state = presence.state[id];
      if (session_id !== id && state.metas.length > 0) {
        const mostRecent = state.metas[state.metas.length - 1];
        if (mostRecent != null && mostRecent.presence === "room") {
          result.set(id, state);
        }
      }
    }
    return result;
  }

  // Returns the number of users in the room, except ourselves.
  getUserCount() {
    const presence = this.presence as any;
    const result = Object.keys(presence).length;
    return result - 1;
  }

  // Sends a chat message that Hubs users will see in the chat box.
  sendMessage = (from: string, body: any) => {
    this.channel.push("message", { from, body, type: "chat" });
  };

  sendCommand = (from: string, body: any) => {
    if (!body) return;
    this.channel.push("message", { from, body, type: "command" });
  };
}

export class ReticulumClient {
  socket: Socket;
  hostname: string;

  constructor(hostname: string) {
    this.hostname = hostname;
    this.socket = new Socket(`wss://${hostname}/socket`, {
      transport: WebSocket,
    });
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.socket.onOpen(resolve);
      this.socket.onError(reject);
      this.socket.connect();
    });
  }

  // Returns a channel object for the given Hub room's Phoenix channel.
  channelForHub(hubId: string, profile: any) {
    const payload = {
      profile: profile,
      context: { mobile: false, hmd: false },
    };
    return new HubChannel(this.socket.channel(`hub:${hubId}`, payload));
  }
}
