import type { VoiceName } from './settings'

export type TranslationResult = {
  translatedText: string
  detectedLanguage?: string
  notes?: string
}

export type ExtensionRequest =
  | {
      type: 'translate'
      text: string
      targetLanguage?: string
      sourceHint?: string
    }
  | {
      type: 'ask'
      text: string
      question: string
      targetLanguage?: string
    }
  | {
      type: 'speak'
      text: string
      languageHint?: string
      voice?: VoiceName
      purpose: 'original' | 'translation'
    }

export type ContentRequest = {
  type: 'open-selection-panel'
  text: string
}

export type ExtensionResponse<T> =
  | {
      ok: true
      data: T
    }
  | {
      ok: false
      error: string
    }

export type TranslateResponse = ExtensionResponse<TranslationResult>

export type AskResponse = ExtensionResponse<{
  answer: string
}>

export type SpeakResponse = ExtensionResponse<{
  dataUrl: string
  mimeType: string
}>
