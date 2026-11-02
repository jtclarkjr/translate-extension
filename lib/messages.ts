import type { PlaybackMode } from './settings'

export type TranslationResult = {
  translatedText: string
  detectedLanguage?: string
  notes?: string
}

export type ExtensionRequest =
  | { type: 'translate'; text: string; targetLanguage?: string; sourceHint?: string }
  | { type: 'ask'; text: string; question: string; targetLanguage?: string }

export type ContentRequest = { type: 'open-selection-panel'; text: string }

export type ExtensionResponse<T> = { ok: true; data: T } | { ok: false; error: string }

export type TranslateResponse = ExtensionResponse<TranslationResult>
export type AskResponse = ExtensionResponse<{ answer: string }>

export const PREPARATION_PORT = 'translation-preparation'
export type AudioKind = 'original' | 'translation'
export type PreparationRequest =
  | { type: 'prepare'; text: string }
  | { type: 'prepare-original' }
  | { type: 'keep-alive' }

export type PreparationEvent =
  | { type: 'reset'; voiceEnabled: boolean; playbackMode: PlaybackMode }
  | { type: 'translation'; result: TranslationResult }
  | { type: 'transcript'; delta: string }
  | { type: 'audio'; kind: AudioKind; chunk: string }
  | { type: 'complete'; kind: AudioKind }
  | { type: 'error'; kind: AudioKind; error: string }
