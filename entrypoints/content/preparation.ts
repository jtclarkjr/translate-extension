import {
  PREPARATION_PORT,
  type AudioKind,
  type PreparationEvent,
  type TranslationResult
} from '../../lib/messages'
import type { PlaybackMode } from '@/lib/settings'
import { createAudioBuffer } from './audio'

type Callbacks = {
  onReset: () => void
  onTranslation: (translation: TranslationResult) => void
  onAudio: (kind: AudioKind) => void
  onComplete: (kind: AudioKind) => void
  onError: (error: string) => void
}

export function prepareSelection(text: string, callbacks: Callbacks) {
  const port = browser.runtime.connect({ name: PREPARATION_PORT })
  let buffers = { translation: createAudioBuffer(), original: createAudioBuffer() }
  let translatedText = ''
  let originalRequested = false
  let disposed = false
  let heartbeat: ReturnType<typeof setInterval> | undefined
  let voiceEnabled = false
  let playbackMode: PlaybackMode = 'translation'

  function disposeBuffers() {
    buffers.translation.dispose()
    buffers.original.dispose()
  }

  port.onMessage.addListener((event: PreparationEvent) => {
    if (disposed) return
    if (event.type === 'reset') {
      disposeBuffers()
      buffers = { translation: createAudioBuffer(), original: createAudioBuffer() }
      translatedText = ''
      originalRequested = event.voiceEnabled && event.playbackMode !== 'translation'
      voiceEnabled = event.voiceEnabled
      playbackMode = event.playbackMode
      callbacks.onReset()
    } else if (event.type === 'transcript') {
      translatedText += event.delta
      callbacks.onTranslation({ translatedText })
    } else if (event.type === 'translation') {
      callbacks.onTranslation(event.result)
    } else if (event.type === 'audio') {
      try {
        buffers[event.kind].append(event.chunk)
        callbacks.onAudio(event.kind)
      } catch (error) {
        const failure = error instanceof Error ? error : new Error('Invalid audio stream.')
        buffers[event.kind].fail(failure)
        callbacks.onError(failure.message)
      }
    } else if (event.type === 'complete') {
      buffers[event.kind].complete()
      callbacks.onComplete(event.kind)
    } else if (event.type === 'error') {
      buffers[event.kind].fail(new Error(event.error))
      callbacks.onError(event.error)
    }
  })

  port.onDisconnect.addListener(() => {
    clearInterval(heartbeat)
    if (disposed) return
    // A closed background connection cannot deliver the remaining samples.
    if (!buffers.translation.done || (originalRequested && !buffers.original.done)) {
      const error = new Error('Translation connection closed. Open the panel again to retry.')
      if (!buffers.translation.done) buffers.translation.fail(error)
      if (!buffers.original.done) buffers.original.fail(error)
      callbacks.onError(error.message)
    }
  })

  port.postMessage({ type: 'prepare', text })
  // Chrome can suspend an idle background worker even while its port is open.
  heartbeat = setInterval(() => {
    try {
      port.postMessage({ type: 'keep-alive' })
    } catch {
      clearInterval(heartbeat)
    }
  }, 20000)

  return {
    get voiceEnabled() {
      return voiceEnabled
    },
    get playbackMode() {
      return playbackMode
    },
    hasAudio(kind: AudioKind) {
      return buffers[kind].hasAudio
    },
    play(kind: AudioKind) {
      if (!voiceEnabled)
        return Promise.reject(new Error('Voice is disabled in extension settings.'))
      if (kind === 'original' && !originalRequested) {
        originalRequested = true
        port.postMessage({ type: 'prepare-original' })
      }
      return buffers[kind].play()
    },
    dispose() {
      disposed = true
      clearInterval(heartbeat)
      disposeBuffers()
      port.disconnect()
    }
  }
}
