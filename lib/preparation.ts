import { translateText } from './ai'
import { generateRealtime } from './realtime-session'
import { getSettings, type ExtensionSettings } from './settings'
import { PREPARATION_PORT, type AudioKind, type PreparationEvent } from './messages'

export function handlePreparationPort(port: Browser.runtime.Port) {
  if (port.name !== PREPARATION_PORT) return

  let closed = false
  let text = ''
  let generation = 0
  let controller = new AbortController()
  let currentSettings: ExtensionSettings | undefined
  let settingsKey = ''
  let originalRequested = false
  let originalStarted = false

  function post(event: PreparationEvent) {
    if (closed) return
    try {
      port.postMessage(event)
    } catch {
      close()
    }
  }

  function close() {
    closed = true
    generation += 1
    controller.abort()
    browser.storage.onChanged.removeListener(onSettingsChanged)
  }

  async function generate(kind: AudioKind, settings: ExtensionSettings, id: number) {
    const signal = controller.signal
    try {
      await generateRealtime({
        provider: settings.provider,
        config: settings.providers[settings.provider],
        text,
        targetLanguage: settings.targetLanguage,
        voice: settings.voice,
        purpose: kind,
        signal,
        onTranscript: (delta) => {
          if (id === generation && !signal.aborted && kind === 'translation') {
            post({ type: 'transcript', delta })
          }
        },
        onAudio: (chunk) => {
          if (id === generation && !signal.aborted) post({ type: 'audio', kind, chunk })
        }
      })
      if (id === generation && !signal.aborted) post({ type: 'complete', kind })
    } catch (error) {
      if (id === generation && !signal.aborted) {
        post({ type: 'error', kind, error: errorMessage(error) })
      }
    }
  }

  function prepareOriginal() {
    originalRequested = true
    if (currentSettings?.ttsEnabled && !originalStarted) {
      originalStarted = true
      void generate('original', currentSettings, generation)
    }
  }

  async function prepare(settings?: ExtensionSettings) {
    const id = ++generation
    controller.abort()
    controller = new AbortController()
    currentSettings = undefined
    originalStarted = false
    try {
      const next = settings || (await getSettings())
      if (closed || id !== generation) return
      currentSettings = next
      settingsKey = generationSettingsKey(next)
      post({ type: 'reset', voiceEnabled: next.ttsEnabled, playbackMode: next.playbackMode })

      const config = next.providers[next.provider]
      if (!config.apiKey.trim()) {
        throw new Error(
          `Add your ${next.provider === 'openai' ? 'OpenAI' : 'Vercel AI Gateway'} API key in the extension popup first.`
        )
      }
      if (next.ttsEnabled) {
        void generate('translation', next, id)
        if (originalRequested || next.playbackMode !== 'translation') prepareOriginal()
      } else {
        const result = await translateText({
          provider: next.provider,
          config,
          text,
          targetLanguage: next.targetLanguage,
          signal: controller.signal
        })
        if (id !== generation || closed) return
        post({ type: 'translation', result })
        post({ type: 'complete', kind: 'translation' })
      }
    } catch (error) {
      if (!closed && id === generation && !controller.signal.aborted) {
        post({ type: 'error', kind: 'translation', error: errorMessage(error) })
      }
    }
  }

  port.onMessage.addListener((message: unknown) => {
    if (!message || typeof message !== 'object' || !('type' in message)) return
    if (message.type === 'prepare' && 'text' in message && typeof message.text === 'string') {
      text = message.text
      originalRequested = false
      void prepare()
    } else if (message.type === 'prepare-original' && text) {
      prepareOriginal()
    }
  })

  async function onSettingsChanged(_changes: unknown, areaName: string) {
    if (areaName !== 'local' || !text || closed) return
    const settings = await getSettings()
    if (!closed && generationSettingsKey(settings) !== settingsKey) {
      originalRequested = false
      void prepare(settings)
    }
  }

  browser.storage.onChanged.addListener(onSettingsChanged)
  port.onDisconnect.addListener(close)
}

function generationSettingsKey(settings: ExtensionSettings) {
  return JSON.stringify([
    settings.provider,
    settings.providers[settings.provider],
    settings.targetLanguage,
    settings.voice,
    settings.ttsEnabled,
    settings.playbackMode
  ])
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unable to prepare translation audio.'
}
