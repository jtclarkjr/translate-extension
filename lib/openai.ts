import type { ExtensionResponse, TranslationResult } from "./messages";
import type { VoiceName } from "./settings";

const TEXT_MODEL = "gpt-4o-mini";
const TTS_MODEL = "gpt-4o-mini-tts";
const RESPONSES_URL = "https://api.openai.com/v1/responses";
const SPEECH_URL = "https://api.openai.com/v1/audio/speech";
const MAX_TEXT_CHARS = 7000;
const MAX_SPEECH_CHARS = 4096;

type OpenAIResponse = {
  output_text?: string;
  output?: Array<{
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
  error?: {
    message?: string;
  };
};

export async function translateText(params: {
  apiKey: string;
  text: string;
  targetLanguage: string;
  sourceHint?: string;
}): Promise<TranslationResult> {
  const text = normalizeText(params.text, MAX_TEXT_CHARS);
  const sourceLine = params.sourceHint ? `Source language hint: ${params.sourceHint}\n` : "";
  const output = await createTextResponse({
    apiKey: params.apiKey,
    instructions:
      "You are a precise, natural translator. Translate meaning, tone, and idioms. Return only a compact JSON object with keys translatedText, detectedLanguage, and notes. Use notes only for brief pronunciation, ambiguity, or cultural context that helps the reader.",
    input: `${sourceLine}Target language: ${params.targetLanguage}\n\nText:\n${text}`,
  });
  const parsed = parseJsonObject(output);

  if (parsed && typeof parsed.translatedText === "string") {
    return {
      translatedText: parsed.translatedText.trim(),
      detectedLanguage: stringOrUndefined(parsed.detectedLanguage),
      notes: stringOrUndefined(parsed.notes),
    };
  }

  return {
    translatedText: output.trim(),
  };
}

export async function askAboutText(params: {
  apiKey: string;
  text: string;
  question: string;
  targetLanguage?: string;
}): Promise<string> {
  const text = normalizeText(params.text, MAX_TEXT_CHARS);
  const question = normalizeText(params.question, 1000);
  const targetLine = params.targetLanguage ? `Answer language: ${params.targetLanguage}\n` : "";

  return createTextResponse({
    apiKey: params.apiKey,
    instructions:
      "You answer follow-up questions about selected text for a translation extension. Be concise, accurate, and practical. Explain language points when helpful.",
    input: `${targetLine}Selected text:\n${text}\n\nQuestion:\n${question}`,
  });
}

export async function speakText(params: {
  apiKey: string;
  text: string;
  voice: VoiceName;
  languageHint?: string;
  purpose: "original" | "translation";
}): Promise<{ dataUrl: string; mimeType: string }> {
  const input = normalizeText(params.text, MAX_SPEECH_CHARS);
  const languageHint = params.languageHint ? ` Language hint: ${params.languageHint}.` : "";
  const purpose =
    params.purpose === "original"
      ? "Read the original source text naturally and clearly. This may be used to learn pronunciation."
      : "Read the translated text naturally and clearly.";

  const response = await fetch(SPEECH_URL, {
    method: "POST",
    headers: openAIHeaders(params.apiKey),
    body: JSON.stringify({
      model: TTS_MODEL,
      input,
      voice: params.voice,
      response_format: "mp3",
      instructions: `${purpose}${languageHint}`,
    }),
  });

  if (!response.ok) {
    throw new Error(await getOpenAIError(response));
  }

  const mimeType = response.headers.get("content-type") || "audio/mpeg";
  const dataUrl = `data:${mimeType};base64,${arrayBufferToBase64(await response.arrayBuffer())}`;

  return { dataUrl, mimeType };
}

export function ok<T>(data: T): ExtensionResponse<T> {
  return { ok: true, data };
}

export function fail<T = never>(error: unknown): ExtensionResponse<T> {
  return {
    ok: false,
    error: error instanceof Error ? error.message : "Unexpected extension error",
  };
}

async function createTextResponse(params: {
  apiKey: string;
  instructions: string;
  input: string;
}): Promise<string> {
  const response = await fetch(RESPONSES_URL, {
    method: "POST",
    headers: openAIHeaders(params.apiKey),
    body: JSON.stringify({
      model: TEXT_MODEL,
      instructions: params.instructions,
      input: params.input,
    }),
  });

  if (!response.ok) {
    throw new Error(await getOpenAIError(response));
  }

  const data = (await response.json()) as OpenAIResponse;
  const outputText = extractOutputText(data);

  if (!outputText) {
    throw new Error("OpenAI returned an empty response.");
  }

  return outputText;
}

function normalizeText(text: string, maxChars: number) {
  const normalized = text.replace(/\s+/g, " ").trim();

  if (!normalized) {
    throw new Error("Select text first.");
  }

  return normalized.length > maxChars ? normalized.slice(0, maxChars) : normalized;
}

function openAIHeaders(apiKey: string) {
  const trimmedKey = apiKey.trim();

  if (!trimmedKey) {
    throw new Error("Add your OpenAI API key in the extension popup first.");
  }

  return {
    Authorization: `Bearer ${trimmedKey}`,
    "Content-Type": "application/json",
  };
}

async function getOpenAIError(response: Response) {
  try {
    const data = (await response.json()) as OpenAIResponse;
    return data.error?.message || `OpenAI request failed with ${response.status}.`;
  } catch {
    return `OpenAI request failed with ${response.status}.`;
  }
}

function extractOutputText(data: OpenAIResponse) {
  if (typeof data.output_text === "string") {
    return data.output_text;
  }

  return (
    data.output
      ?.flatMap((item) => item.content || [])
      .map((content) => content.text)
      .filter((text): text is string => typeof text === "string")
      .join("\n")
      .trim() || ""
  );
}

function parseJsonObject(text: string): Record<string, unknown> | undefined {
  const trimmed = text.trim();
  const json = trimmed.match(/\{[\s\S]*\}/)?.[0] || trimmed;

  try {
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function stringOrUndefined(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";

  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }

  return btoa(binary);
}
