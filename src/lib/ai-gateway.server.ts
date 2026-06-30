import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai";

export const GEMINI_TEXT_MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";

export function getGeminiApiKey() {
  const apiKey = process.env.GEMINI_API_KEY ?? process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("AI is not configured. Missing GEMINI_API_KEY.");
  return apiKey;
}

export function createGeminiProvider(apiKey = getGeminiApiKey()) {
  return createOpenAICompatible({
    name: "gemini",
    apiKey,
    baseURL: GEMINI_BASE_URL,
  });
}
