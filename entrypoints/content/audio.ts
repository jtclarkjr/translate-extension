const SAMPLE_RATE = 24000
let audioContext: AudioContext | undefined
let stopCurrentPlayback: (() => void) | undefined

export function stopAudio() {
  stopCurrentPlayback?.()
}

export function createAudioBuffer() {
  const chunks: Float32Array<ArrayBuffer>[] = []
  let pendingByte: number | undefined
  let completed = false
  let disposed = false
  let failure: Error | undefined
  let playback: { pump: () => void; finish: (error?: Error) => void } | undefined

  function fail(error: Error) {
    failure = error
    completed = true
    playback?.finish(error)
  }

  function append(base64Pcm16: string) {
    if (completed) {
      throw new Error('Audio stream has already ended.')
    }
    let binary: string
    try {
      binary = atob(base64Pcm16)
    } catch {
      const error = new Error('Invalid audio data.')
      fail(error)
      throw error
    }
    const offset = pendingByte === undefined ? 0 : 1
    const bytes = new Uint8Array(binary.length + offset)
    if (pendingByte !== undefined) {
      bytes[0] = pendingByte
    }
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i + offset] = binary.charCodeAt(i)
    }
    const samples = new Float32Array(Math.floor(bytes.length / 2))
    const view = new DataView(bytes.buffer)
    for (let i = 0; i < samples.length; i += 1) {
      samples[i] = view.getInt16(i * 2, true) / 32768
    }
    pendingByte = bytes.length % 2 ? bytes[bytes.length - 1] : undefined
    if (samples.length) {
      chunks.push(samples)
      playback?.pump()
    }
  }

  function complete() {
    if (completed) {
      return
    }
    if (pendingByte !== undefined) {
      fail(new Error('Incomplete audio sample.'))
      return
    }
    if (!chunks.length) {
      fail(new Error('No audio was generated.'))
      return
    }
    completed = true
    playback?.pump()
  }

  function play(): Promise<void> {
    stopAudio()
    if (disposed || failure) {
      return Promise.reject(failure || new Error('Audio was discarded.'))
    }
    return new Promise<void>((resolve, reject) => {
      let context: AudioContext
      let resumed: Promise<void>
      try {
        if (!audioContext || audioContext.state === 'closed') {
          audioContext = new AudioContext()
        }
        context = audioContext
        // Resume in the click handler before asynchronous work loses user activation.
        resumed = context.resume()
      } catch (error) {
        reject(error instanceof Error ? error : new Error('Unable to play audio.'))
        return
      }

      const sources = new Set<AudioBufferSourceNode>()
      let nextChunk = 0
      let nextStart = context.currentTime + 0.01
      let ready = false
      let settled = false

      function finish(error?: Error) {
        if (settled) {
          return
        }
        settled = true
        playback = undefined
        if (stopCurrentPlayback === stop) {
          stopCurrentPlayback = undefined
        }
        for (const source of sources) {
          source.onended = null
          try {
            source.stop()
          } catch {
            // A source whose start failed cannot be stopped.
          }
          source.disconnect()
        }
        sources.clear()
        if (error) {
          reject(error)
        } else {
          resolve()
        }
      }

      function stop() {
        finish()
      }

      function pump() {
        if (settled || !ready) {
          return
        }
        try {
          while (nextChunk < chunks.length) {
            const samples = chunks[nextChunk++]
            const buffer = context.createBuffer(1, samples.length, SAMPLE_RATE)
            buffer.copyToChannel(samples, 0)
            const source = context.createBufferSource()
            source.buffer = buffer
            source.connect(context.destination)
            sources.add(source)
            source.onended = () => {
              sources.delete(source)
              source.disconnect()
              pump()
            }
            nextStart = Math.max(context.currentTime, nextStart)
            source.start(nextStart)
            nextStart += buffer.duration
          }
          if (completed && sources.size === 0) {
            finish()
          }
        } catch (error) {
          finish(error instanceof Error ? error : new Error('Unable to play audio.'))
        }
      }

      playback = { pump, finish }
      stopCurrentPlayback = stop
      void resumed
        .then(() => {
          ready = true
          pump()
        })
        .catch((error: unknown) => {
          finish(error instanceof Error ? error : new Error('Unable to play audio.'))
        })
    })
  }

  return {
    append,
    complete,
    fail,
    play,
    dispose() {
      playback?.finish()
      disposed = true
      completed = true
      pendingByte = undefined
      chunks.length = 0
    },
    get hasAudio() {
      return chunks.length > 0
    },
    get done() {
      return completed
    }
  }
}
