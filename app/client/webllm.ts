import {
  EngineInterface,
  CreateWebWorkerEngine,
  InitProgressReport,
  prebuiltAppConfig,
} from "@mlc-ai/web-llm";

import { ChatOptions, LLMApi, LLMConfig } from "./api";
import { ChatCompletionMessageParam } from "@mlc-ai/web-llm";
import { useAppConfig } from "../store";

export class WebLLMApi implements LLMApi {
  private currentModel?: string;
  private engine?: EngineInterface;

  clear() {
    this.engine = undefined;
  }

  async initModel(
    config: LLMConfig,
    onUpdate?: (message: string, chunk: string) => void,
  ) {
    this.currentModel = config.model;
    this.engine = await CreateWebWorkerEngine(
      new Worker(new URL("./webllm-sw.ts", import.meta.url), {
        type: "module",
      }),
      config.model,
      {
        chatOpts: {
          temperature: config.temperature,
          top_p: config.top_p,
          presence_penalty: config.presence_penalty,
          frequency_penalty: config.frequency_penalty,
        },
        appConfig: {
          ...prebuiltAppConfig,
          useIndexedDBCache: config.cache === "index_db",
        },
        initProgressCallback: (report: InitProgressReport) => {
          onUpdate?.(report.text, report.text);
        },
      },
    );
  }

  async chat(options: ChatOptions): Promise<void> {
    if (options.config.model !== this.currentModel) {
      await this.initModel(options.config, options.onUpdate);
    }

    let reply: string | null = "";
    if (options.config.stream) {
      const asyncChunkGenerator = await this.engine!.chatCompletion({
        stream: options.config.stream,
        messages: options.messages as ChatCompletionMessageParam[],
      });

      for await (const chunk of asyncChunkGenerator) {
        if (chunk.choices[0].delta.content) {
          reply += chunk.choices[0].delta.content;
          options.onUpdate?.(reply, chunk.choices[0].delta.content);
        }
      }
    } else {
      const completion = await this.engine!.chatCompletion({
        stream: options.config.stream,
        messages: options.messages as ChatCompletionMessageParam[],
      });
      reply = completion.choices[0].message.content;
    }

    if (reply) {
      options.onFinish(reply);
    } else {
      options.onError?.(new Error("Empty response generated by LLM"));
    }
  }

  async usage() {
    return {
      used: 0,
      total: 0,
    };
  }

  async models() {
    return prebuiltAppConfig.model_list.map((record) => ({
      name: record.model_id,
      available: true,
      provider: {
        id: "huggingface",
        providerName: "huggingface",
        providerType: "huggingface",
      },
    }));
  }
}

export const webllm: LLMApi = new WebLLMApi();
