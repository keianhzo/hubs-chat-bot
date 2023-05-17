import { BlockadeLabsSdk } from "@blockadelabs/sdk";
import Pusher, { Channel } from "pusher-js";
import "dotenv/config";

const sdk = new BlockadeLabsSdk({
  api_key: process.env.BLOCKADE_API_KEY!,
});

export type SkyboxStyleT = {
  id: number;
  name: string;
  "max-char": string;
  image: string | null;
  sort_order: number;
};

type SkyboxResponseT = {
  status: string;
  id: number;
  skybox_style_id: number;
  skybox_style_name: string;
  queue_position: number;
  file_url: string;
  thumb_url: string;
  title: string;
  user_id: number;
  username: string;
  obfuscated_id: string;
  pusher_channel: string;
  pusher_event: string;
  created_at: (string | Date) & (string | Date | undefined);
  updated_at: (string | Date) & (string | Date | undefined);
  error_message?: any;
};

export class Skyboxes {
  styles: SkyboxStyleT[];
  pusher: Pusher;
  channel: Channel | null;
  pusherChannel: string | null;

  constructor() {
    this.styles = [];
    this.pusher = new Pusher(process.env.PUSHER_APP_KEY!, { cluster: "mt1" });
    this.channel = null;
    this.pusherChannel = null;
    this.pusher.connection.bind("error", (err: any) => {
      // if (err.error.data?.code === 4004) {
      //   console.log("Over limit!");
      // }
    });
  }

  async update() {
    this.styles = await sdk.getSkyboxStyles();
    console.log(JSON.stringify(this.styles));
  }

  async cancelAll() {
    await sdk.cancelAllPendingImagines();
  }

  async generate(prompt: string, style: SkyboxStyleT): Promise<string> {
    return new Promise(async (resolve, reject) => {
      if (this.pusher.connection.state !== "connected") {
        console.error("Not connected yet");
        reject("Not connected yet");
      }

      if (this.channel && this.pusherChannel) {
        this.pusher.unsubscribe(this.pusherChannel);
        this.channel.unbind_all();
      }
      await sdk.cancelAllPendingImagines();

      const generation: SkyboxResponseT = await sdk.generateSkybox({
        prompt,
        skybox_style_id: style.id,
      });

      const { pusher_channel, pusher_event } = generation;
      this.pusherChannel = pusher_channel;
      const channel = this.pusher.subscribe(pusher_channel);

      channel.bind("error", (err: any) => {
        channel.unbind(pusher_event);
        this.pusher.unsubscribe(pusher_channel);
        reject(err);
      });
      channel.bind(pusher_event, (data: any) => {
        const { status, file_url } = data;
        if (status === "complete") {
          channel.unbind_all();
          this.pusher.unsubscribe(pusher_channel);
          resolve(file_url);
        } else if (status === "failed") {
          channel.unbind_all();
          this.pusher.unsubscribe(pusher_channel);
          reject("generateSkybox: failed");
        }
      });
    });
  }
}
