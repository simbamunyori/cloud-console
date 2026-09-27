import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/server/env";
import { secret } from "@/server/secrets";

/**
 * The language model behind the assistant, behind a small interface so
 * tests can script it. The model comes from ANTHROPIC_MODEL and the key
 * from secrets; without a key the assistant is off.
 */

export type ModelBlock = { type: "text"; text: string } | { type: "tool_use"; id: string; name: string; input: unknown };
export type ToolResultBlock = { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };
export interface ModelMessage {
  role: "user" | "assistant";
  content: string | (ModelBlock | ToolResultBlock)[];
}
export interface ToolSpec {
  name: string;
  description: string;
  input_schema: { type: "object"; properties: Record<string, unknown>; required?: string[] };
}
export interface ModelRequest {
  system: string;
  messages: ModelMessage[];
  tools: ToolSpec[];
}
export interface ModelReply {
  content: ModelBlock[];
  stopReason: string | null;
}
export interface AssistantModel {
  respond(request: ModelRequest): Promise<ModelReply>;
}

class AnthropicModel implements AssistantModel {
  private readonly client: Anthropic;
  constructor(
    apiKey: string,
    private readonly model: string,
  ) {
    this.client = new Anthropic({ apiKey, maxRetries: 2, timeout: 60_000 });
  }

  async respond(request: ModelRequest): Promise<ModelReply> {
    const reply = await this.client.messages.create({
      model: this.model,
      max_tokens: 1024,
      system: request.system,
      messages: request.messages as Anthropic.MessageParam[],
      tools: request.tools as Anthropic.Tool[],
    });
    const content: ModelBlock[] = [];
    for (const block of reply.content) {
      if (block.type === "text") content.push({ type: "text", text: block.text });
      else if (block.type === "tool_use") content.push({ type: "tool_use", id: block.id, name: block.name, input: block.input });
    }
    return { content, stopReason: reply.stop_reason };
  }
}

let override: AssistantModel | null | undefined;

/** The configured model, or null when no API key is set. */
export function assistantModel(): AssistantModel | null {
  if (override !== undefined) return override;
  const key = secret("ANTHROPIC_API_KEY");
  return key ? new AnthropicModel(key, env().ANTHROPIC_MODEL) : null;
}

/** For tests and local demos. */
export function useAssistantModel(model: AssistantModel | null | undefined) {
  override = model;
}
