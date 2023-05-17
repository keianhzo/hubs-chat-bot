import {
  ChatCompletionRequestMessage,
  ChatCompletionRequestMessageRoleEnum,
  Configuration,
  CreateChatCompletionRequest,
  OpenAIApi,
} from "openai";
import "dotenv/config";

const configuration: Configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
  organization: process.env.ORGANIZATION,
});

export type CompletionRequestT = Omit<
  CreateChatCompletionRequest,
  "messages" | "user"
>;

export interface GameBotMessageI {
  role: ChatCompletionRequestMessageRoleEnum;
  content: string;
}

const MAX_MODEL_TOKENS = 4097;

const GameBotConfigurationDefaults: CompletionRequestT = {
  model: "gpt-3.5-turbo",
  temperature: 0.6,
  max_tokens: 500,
  top_p: 1,
  frequency_penalty: 0,
  presence_penalty: 0.6,
};

export class GameBot {
  openai: OpenAIApi;
  config: CompletionRequestT;
  messages: Array<ChatCompletionRequestMessage>;

  constructor(config?: CompletionRequestT) {
    this.openai = new OpenAIApi(configuration);
    this.config = { ...GameBotConfigurationDefaults, ...config };
    this.messages = new Array<ChatCompletionRequestMessage>();
  }

  async send(
    session_id: string,
    message: GameBotMessageI | GameBotMessageI[]
  ): Promise<string> {
    if (Array.isArray(message)) {
      this.messages.push(...message);
    } else {
      this.messages.push(message);
    }
    const response = await this.openai.createChatCompletion({
      messages: this.messages,
      ...this.config,
      user: session_id,
    });
    const { usage } = response.data;
    if (usage!.total_tokens! + usage!.completion_tokens! * 2 > 4096) {
      this.messages = [...this.messages.slice(0, 3), ...this.messages.slice(2)];
    }
    console.log(response.data.choices[0].message!);
    this.messages.push(response.data.choices[0].message!);
    return response.data.choices[0].message?.content!;
  }

  async onShot(
    session_id: string,
    message: GameBotMessageI | GameBotMessageI[]
  ): Promise<string> {
    const messages = [];
    if (Array.isArray(message)) {
      messages.push(...message);
    } else {
      messages.push(message);
    }
    const response = await this.openai.createChatCompletion({
      messages,
      ...this.config,
      user: session_id,
    });
    console.log(response.data.choices[0].message!);
    return response.data.choices[0].message?.content!;
  }

  clear() {
    this.messages = [];
  }
}

export default GameBot;
