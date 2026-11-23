import { AnthropicVertex } from "@anthropic-ai/vertex-sdk";
import { GCP_PROJECT_ID, GCP_REGION } from "./config.js";

// Claude on Google Vertex AI. Auth is GCP ADC (gcloud auth application-default
// login) or WIF / service account when deployed — no Anthropic API key. Model
// IDs on Vertex are bare (e.g. "claude-sonnet-5").
let client: AnthropicVertex | null = null;

export function vertex(): AnthropicVertex {
  if (!GCP_PROJECT_ID) {
    throw new Error(
      "GCP_PROJECT_ID is not set. Set it in .env and run `gcloud auth application-default login`, " +
        "or use ENGINE_SOURCE=mock to run without credentials."
    );
  }
  if (!client) {
    client = new AnthropicVertex({ projectId: GCP_PROJECT_ID, region: GCP_REGION });
  }
  return client;
}

export const REGION = GCP_REGION;
