import { createOpenAI } from '@ai-sdk/openai'
import { createGateway, generateText } from 'ai'
import type { ExtensionResponse, TranslationResult } from './messages'
import type { AIProvider, ProviderSettings } from './settings'

type TextRequest = {
  provider: AIProvider
  config: ProviderSettings
  text: string
  signal?: AbortSignal
}

export async function translateText(
  params: TextRequest & { targetLanguage: string; sourceHint?: string }
): Promise<TranslationResult> {
  const text = normalizeText(params.text)
  const sourceLine = params.sourceHint ? `Source language hint: ${params.sourceHint}\n` : ''
  const output = await createTextResponse({
    ...params,
    instructions:
      'You are a precise, natural translator. Translate meaning, tone, and idioms. Return only a compact JSON object with keys translatedText, detectedLanguage, and notes. Use notes only for brief pronunciation, ambiguity, or cultural context that helps the reader.',
    input: `${sourceLine}Target language: ${params.targetLanguage}\n\nText:\n${text}`
  })
  const parsed = parseJsonObject(output)

  if (parsed && typeof parsed.translatedText === 'string' && parsed.translatedText.trim()) {
    return {
      translatedText: parsed.translatedText.trim(),
      detectedLanguage: stringOrUndefined(parsed.detectedLanguage),
      notes: stringOrUndefined(parsed.notes)
    }
  }

  return { translatedText: output }
}

export async function askAboutText(
  params: TextRequest & { question: string; targetLanguage?: string }
): Promise<string> {
  const text = normalizeText(params.text)
  const question = normalizeText(params.question, 1000)
  const targetLine = params.targetLanguage ? `Answer language: ${params.targetLanguage}\n` : ''

  return createTextResponse({
    ...params,
    instructions:
      'You answer follow-up questions about selected text for a translation extension. Be concise, accurate, and practical. Explain language points when helpful.',
    input: `${targetLine}Selected text:\n${text}\n\nQuestion:\n${question}`
  })
}

export function createAIProvider(
  provider: AIProvider,
  config: ProviderSettings,
  fetchRequest?: typeof fetch
) {
  const apiKey = config.apiKey.trim()
  if (!apiKey) {
    throw new Error(
      `Add your ${provider === 'openai' ? 'OpenAI' : 'Vercel AI Gateway'} API key in the extension popup first.`
    )
  }

  return provider === 'openai'
    ? createOpenAI({ apiKey, fetch: fetchRequest })
    : createGateway({ apiKey, fetch: fetchRequest })
}

export function normalizeText(text: string, maxChars = 7000) {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (!normalized) {
    throw new Error('Select text first.')
  }

  return normalized.slice(0, maxChars)
}

export function ok<T>(data: T): ExtensionResponse<T> {
  return { ok: true, data }
}

export function fail<T = never>(error: unknown): ExtensionResponse<T> {
  return {
    ok: false,
    error: error instanceof Error ? error.message : 'Unexpected extension error'
  }
}

async function createTextResponse(params: {
  provider: AIProvider
  config: ProviderSettings
  instructions: string
  input: string
  signal?: AbortSignal
}) {
  const modelId = params.config.textModel.trim()
  if (!modelId) {
    throw new Error('Choose a text model in the extension popup first.')
  }

  const provider = createAIProvider(params.provider, params.config)
  const result = await generateText({
    model: provider.languageModel(modelId),
    instructions: params.instructions,
    prompt: params.input,
    abortSignal: params.signal,
    maxRetries: 0
  })
  const text = result.text.trim()
  if (!text) {
    throw new Error('The AI provider returned an empty response.')
  }

  return text
}

function parseJsonObject(text: string): Record<string, unknown> | undefined {
  const json = text.match(/\{[\s\S]*\}/)?.[0] || text

  try {
    const parsed = JSON.parse(json)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
}

function stringOrUndefined(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
