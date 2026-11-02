import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import type { PreparationEvent } from '../../lib/messages'
import { prepareSelection as createPreparation } from './preparation'

type FakeBuffer = {
  append: ReturnType<typeof vi.fn>
  complete: ReturnType<typeof vi.fn>
  fail: ReturnType<typeof vi.fn>
  play: ReturnType<typeof vi.fn>
  dispose: ReturnType<typeof vi.fn>
  hasAudio: boolean
  done: boolean
  failure?: Error
}

const { audioBuffers } = vi.hoisted(() => ({ audioBuffers: [] as FakeBuffer[] }))

vi.mock('./audio', () => ({
  createAudioBuffer: () => {
    const buffer: FakeBuffer = {
      hasAudio: false,
      done: false,
      append: vi.fn(() => {
        buffer.hasAudio = true
      }),
      complete: vi.fn(() => {
        buffer.done = true
      }),
      fail: vi.fn((error: Error) => {
        buffer.done = true
        buffer.failure = error
      }),
      play: vi.fn(() => (buffer.failure ? Promise.reject(buffer.failure) : Promise.resolve())),
      dispose: vi.fn(() => {
        buffer.done = true
        buffer.hasAudio = false
      })
    }
    audioBuffers.push(buffer)
    return buffer
  }
}))

class FakePort {
  messages: Array<(event: PreparationEvent) => void> = []
  disconnects: Array<() => void> = []
  onMessage = {
    addListener: (listener: (event: PreparationEvent) => void) => this.messages.push(listener)
  }
  onDisconnect = { addListener: (listener: () => void) => this.disconnects.push(listener) }
  postMessage = vi.fn()
  disconnect = vi.fn(() => this.disconnects.forEach((listener) => listener()))

  emit(event: PreparationEvent) {
    this.messages.forEach((listener) => listener(event))
  }
}

function callbacks() {
  return {
    onReset: vi.fn(),
    onTranslation: vi.fn(),
    onAudio: vi.fn(),
    onComplete: vi.fn(),
    onError: vi.fn()
  }
}

const preparations: ReturnType<typeof createPreparation>[] = []

function prepareSelection(text: string, events: ReturnType<typeof callbacks>) {
  const prepared = createPreparation(text, events)
  preparations.push(prepared)
  return prepared
}

describe('prepared selection', () => {
  let port: FakePort
  let connect: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.useFakeTimers()
    audioBuffers.length = 0
    port = new FakePort()
    connect = vi.fn(() => port)
    vi.stubGlobal('browser', { runtime: { connect } })
  })

  afterEach(() => {
    preparations.splice(0).forEach((prepared) => prepared.dispose())
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  function reset(
    playbackMode: 'translation' | 'original' | 'both' = 'translation',
    voiceEnabled = true
  ) {
    port.emit({ type: 'reset', playbackMode, voiceEnabled })
    return audioBuffers.slice(-2)
  }

  it('starts preparation immediately without playing audio', () => {
    const events = callbacks()
    prepareSelection('こんにちは', events)

    expect(connect).toHaveBeenCalledWith({ name: 'translation-preparation' })
    expect(port.postMessage).toHaveBeenCalledExactlyOnceWith({
      type: 'prepare',
      text: 'こんにちは'
    })
    expect(audioBuffers.every((buffer) => buffer.play.mock.calls.length === 0)).toBe(true)

    const [translation] = reset()
    port.emit({ type: 'transcript', delta: 'Hello' })
    port.emit({ type: 'transcript', delta: ' there' })
    port.emit({ type: 'audio', kind: 'translation', chunk: 'pcm-chunk' })
    expect(events.onTranslation.mock.calls).toEqual([
      [{ translatedText: 'Hello' }],
      [{ translatedText: 'Hello there' }]
    ])
    expect(translation.append).toHaveBeenCalledWith('pcm-chunk')
    expect(events.onAudio).toHaveBeenCalledWith('translation')
    expect(translation.play).not.toHaveBeenCalled()
  })

  it('plays translated audio during generation and on replay without another request', async () => {
    const prepared = prepareSelection('こんにちは', callbacks())
    const [translation] = reset()
    port.emit({ type: 'audio', kind: 'translation', chunk: 'chunk-one' })

    await prepared.play('translation')
    expect(translation.done).toBe(false)
    port.emit({ type: 'audio', kind: 'translation', chunk: 'chunk-two' })
    port.emit({ type: 'complete', kind: 'translation' })
    await prepared.play('translation')

    expect(translation.play).toHaveBeenCalledTimes(2)
    expect(translation.append.mock.calls).toEqual([['chunk-one'], ['chunk-two']])
    expect(port.postMessage).toHaveBeenCalledTimes(1)
    expect(prepared.hasAudio('translation')).toBe(true)
  })

  it('requests original pronunciation once and skips the request when it was prefetched', async () => {
    const prepared = prepareSelection('こんにちは', callbacks())
    const [, original] = reset()
    await prepared.play('original')
    await prepared.play('original')

    expect(port.postMessage.mock.calls).toEqual([
      [{ type: 'prepare', text: 'こんにちは' }],
      [{ type: 'prepare-original' }]
    ])
    expect(original.play).toHaveBeenCalledTimes(2)

    reset('both')
    await prepared.play('original')
    expect(port.postMessage).toHaveBeenCalledTimes(2)
    expect(prepared.playbackMode).toBe('both')
  })

  it('disposes buffers on reset and ignores all callbacks after disposal', () => {
    const events = callbacks()
    const prepared = prepareSelection('こんにちは', events)
    const [oldTranslation, oldOriginal] = reset()
    port.emit({ type: 'transcript', delta: 'Old text' })
    reset()
    expect(oldTranslation.dispose).toHaveBeenCalledOnce()
    expect(oldOriginal.dispose).toHaveBeenCalledOnce()
    port.emit({ type: 'transcript', delta: 'New text' })
    expect(events.onTranslation).toHaveBeenLastCalledWith({ translatedText: 'New text' })

    const [translation, original] = audioBuffers.slice(-2)
    prepared.dispose()
    expect(port.disconnect).toHaveBeenCalledOnce()
    expect(translation.dispose).toHaveBeenCalledOnce()
    expect(original.dispose).toHaveBeenCalledOnce()
    const calls = events.onTranslation.mock.calls.length
    port.emit({ type: 'transcript', delta: 'Stale text' })
    port.emit({ type: 'audio', kind: 'translation', chunk: 'stale' })
    port.emit({ type: 'error', kind: 'translation', error: 'stale error' })
    expect(events.onTranslation).toHaveBeenCalledTimes(calls)
    expect(translation.append).not.toHaveBeenCalled()
    expect(events.onError).not.toHaveBeenCalled()
  })

  it('reports a disconnect for unfinished audio', async () => {
    const events = callbacks()
    const prepared = prepareSelection('こんにちは', events)
    const [translation] = reset()
    port.disconnect()

    expect(events.onError).toHaveBeenCalledWith(expect.stringContaining('connection closed'))
    expect(translation.fail).toHaveBeenCalledOnce()
    await expect(prepared.play('translation')).rejects.toThrow('connection closed')
  })

  it('keeps completed translation playable when an original stream disconnects', async () => {
    const events = callbacks()
    const prepared = prepareSelection('こんにちは', events)
    const [translation, original] = reset('both')
    port.emit({ type: 'audio', kind: 'translation', chunk: 'complete-audio' })
    port.emit({ type: 'complete', kind: 'translation' })
    port.disconnect()

    expect(original.fail).toHaveBeenCalledOnce()
    expect(translation.fail).not.toHaveBeenCalled()
    await expect(prepared.play('translation')).resolves.toBeUndefined()
  })

  it('rejects disabled voice without playing or requesting original audio', async () => {
    const events = callbacks()
    const prepared = prepareSelection('こんにちは', events)
    reset('both', false)
    const result = { translatedText: 'Hello', detectedLanguage: 'Japanese' }
    port.emit({ type: 'translation', result })

    expect(events.onTranslation).toHaveBeenCalledWith(result)
    port.emit({ type: 'complete', kind: 'translation' })
    port.disconnect()
    expect(events.onError).not.toHaveBeenCalled()
    expect(prepared.voiceEnabled).toBe(false)
    await expect(prepared.play('translation')).rejects.toThrow('Voice is disabled')
    await expect(prepared.play('original')).rejects.toThrow('Voice is disabled')
    expect(audioBuffers.every((buffer) => buffer.play.mock.calls.length === 0)).toBe(true)
    expect(port.postMessage).toHaveBeenCalledTimes(1)
  })

  it('keeps a completed preparation connected every 20 seconds until disposal', () => {
    const prepared = prepareSelection('こんにちは', callbacks())
    reset()
    port.emit({ type: 'audio', kind: 'translation', chunk: 'cached' })
    port.emit({ type: 'complete', kind: 'translation' })
    port.postMessage.mockClear()

    vi.advanceTimersByTime(19999)
    expect(port.postMessage).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    vi.advanceTimersByTime(20000)
    expect(port.postMessage.mock.calls).toEqual([
      [{ type: 'keep-alive' }],
      [{ type: 'keep-alive' }]
    ])
    expect(audioBuffers.every((buffer) => buffer.play.mock.calls.length === 0)).toBe(true)

    prepared.dispose()
    vi.advanceTimersByTime(60000)
    expect(port.postMessage).toHaveBeenCalledTimes(2)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('clears the heartbeat when the background disconnects', () => {
    const events = callbacks()
    prepareSelection('こんにちは', events)
    reset()
    vi.advanceTimersByTime(20000)
    expect(port.postMessage).toHaveBeenLastCalledWith({ type: 'keep-alive' })
    port.postMessage.mockClear()

    port.disconnect()
    vi.advanceTimersByTime(60000)
    expect(port.postMessage).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
    expect(events.onError).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining('connection closed')
    )
  })

  it('turns malformed audio chunks into a stream failure', () => {
    const events = callbacks()
    prepareSelection('こんにちは', events)
    const [translation] = reset()
    translation.append.mockImplementation(() => {
      throw new Error('Bad PCM')
    })

    expect(() => port.emit({ type: 'audio', kind: 'translation', chunk: 'bad' })).not.toThrow()
    expect(translation.fail).toHaveBeenCalledWith(expect.objectContaining({ message: 'Bad PCM' }))
    expect(events.onError).toHaveBeenCalledWith('Bad PCM')
    expect(events.onAudio).not.toHaveBeenCalled()
  })
})
