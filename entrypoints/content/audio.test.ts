import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

class FakeSource {
  buffer?: { duration: number }
  onended: (() => void) | null = null
  connect = vi.fn()
  disconnect = vi.fn()
  start = vi.fn()
  stop = vi.fn()

  end() {
    this.onended?.()
  }
}

class FakeAudioContext {
  static instances: FakeAudioContext[] = []
  static resumeError: Error | undefined
  state = 'suspended'
  currentTime = 1
  destination = {}
  sources: FakeSource[] = []
  buffers: Float32Array[] = []
  resume = vi.fn(() =>
    FakeAudioContext.resumeError ? Promise.reject(FakeAudioContext.resumeError) : Promise.resolve()
  )

  constructor() {
    FakeAudioContext.instances.push(this)
  }

  createBuffer(_channels: number, length: number, sampleRate: number) {
    return {
      duration: length / sampleRate,
      copyToChannel: (samples: Float32Array) => this.buffers.push(samples.slice())
    }
  }

  createBufferSource() {
    const source = new FakeSource()
    this.sources.push(source)
    return source
  }
}

async function loadPlayer() {
  vi.resetModules()
  return import('./audio')
}

function pcm(...samples: number[]) {
  const bytes = new Uint8Array(samples.length * 2)
  const view = new DataView(bytes.buffer)
  samples.forEach((sample, index) => view.setInt16(index * 2, sample, true))
  return btoa(String.fromCharCode(...bytes))
}

describe('prepared PCM audio', () => {
  beforeEach(() => {
    FakeAudioContext.instances = []
    FakeAudioContext.resumeError = undefined
    vi.stubGlobal('AudioContext', FakeAudioContext)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('buffers silently and joins samples split across chunks', async () => {
    const { createAudioBuffer } = await loadPlayer()
    const audio = createAudioBuffer()
    audio.append(btoa(String.fromCharCode(0)))
    audio.append(btoa(String.fromCharCode(128, 255, 127)))
    audio.complete()

    expect(audio.hasAudio).toBe(true)
    expect(audio.done).toBe(true)
    expect(FakeAudioContext.instances).toHaveLength(0)

    const playing = audio.play()
    const context = FakeAudioContext.instances[0]
    expect(context.resume).toHaveBeenCalledOnce()
    await Promise.resolve()

    expect(Array.from(context.buffers[0])).toEqual([-1, 32767 / 32768])
    context.sources[0].end()
    await playing
  })

  it('plays buffered audio before completion and queues later chunks in order', async () => {
    const { createAudioBuffer } = await loadPlayer()
    const audio = createAudioBuffer()
    audio.append(pcm(100, 200))
    const playing = audio.play()
    let finished = false
    void playing.then(() => {
      finished = true
    })
    await Promise.resolve()

    const context = FakeAudioContext.instances[0]
    expect(context.sources).toHaveLength(1)
    expect(audio.done).toBe(false)
    audio.append(pcm(300))
    expect(context.sources).toHaveLength(2)
    expect(context.sources[0].start).toHaveBeenCalledWith(1.01)
    expect(context.sources[1].start.mock.calls[0][0]).toBeCloseTo(1.01 + 2 / 24000)

    context.sources[0].end()
    context.sources[1].end()
    await Promise.resolve()
    expect(finished).toBe(false)

    audio.complete()
    await playing
    expect(finished).toBe(true)
  })

  it('replays completed audio without generating or decoding it again', async () => {
    const { createAudioBuffer } = await loadPlayer()
    const audio = createAudioBuffer()
    audio.append(pcm(100))
    audio.complete()
    const first = audio.play()
    await Promise.resolve()
    const context = FakeAudioContext.instances[0]
    context.sources[0].end()
    await first

    const replay = audio.play()
    await Promise.resolve()
    expect(FakeAudioContext.instances).toHaveLength(1)
    expect(context.sources).toHaveLength(2)
    expect(Array.from(context.buffers[1])).toEqual(Array.from(context.buffers[0]))
    context.sources[1].end()
    await replay
  })

  it('stops immediately, ignores a pending resume, and retains the buffer', async () => {
    const { createAudioBuffer, stopAudio } = await loadPlayer()
    const audio = createAudioBuffer()
    audio.append(pcm(100))
    const first = audio.play()
    stopAudio()
    await first
    const context = FakeAudioContext.instances[0]
    expect(context.sources).toHaveLength(0)

    const replay = audio.play()
    await Promise.resolve()
    expect(context.sources).toHaveLength(1)
    stopAudio()
    await replay
    expect(context.sources[0].stop).toHaveBeenCalledOnce()
    expect(audio.hasAudio).toBe(true)
    audio.dispose()
    expect(audio.hasAudio).toBe(false)
    await expect(audio.play()).rejects.toThrow('discarded')
  })

  it('rejects playback on stream failure and malformed PCM', async () => {
    const { createAudioBuffer } = await loadPlayer()
    const waiting = createAudioBuffer()
    const playback = waiting.play()
    waiting.fail(new Error('Disconnected'))
    await expect(playback).rejects.toThrow('Disconnected')

    const malformed = createAudioBuffer()
    expect(() => malformed.append('!')).toThrow('Invalid audio data')
    await expect(malformed.play()).rejects.toThrow('Invalid audio data')

    const incomplete = createAudioBuffer()
    incomplete.append(btoa(String.fromCharCode(1)))
    incomplete.complete()
    await expect(incomplete.play()).rejects.toThrow('Incomplete audio sample')

    const empty = createAudioBuffer()
    empty.complete()
    await expect(empty.play()).rejects.toThrow('No audio was generated')
  })

  it('reports scheduling failures even when the unstarted source cannot stop', async () => {
    const { createAudioBuffer } = await loadPlayer()
    const audio = createAudioBuffer()
    audio.append(pcm(100))
    const playing = audio.play()
    const context = FakeAudioContext.instances[0]
    context.createBufferSource = () => {
      const source = new FakeSource()
      source.start.mockImplementation(() => {
        throw new Error('Device error')
      })
      source.stop.mockImplementation(() => {
        throw new Error('Not started')
      })
      return source
    }
    await expect(playing).rejects.toThrow('Device error')
  })

  it('reports autoplay/resume failures and permits a later retry', async () => {
    const { createAudioBuffer } = await loadPlayer()
    const audio = createAudioBuffer()
    audio.append(pcm(100))
    audio.complete()
    FakeAudioContext.resumeError = new Error('Playback blocked')
    await expect(audio.play()).rejects.toThrow('Playback blocked')

    FakeAudioContext.resumeError = undefined
    const retried = audio.play()
    await Promise.resolve()
    FakeAudioContext.instances[0].sources[0].end()
    await retried
  })
})
