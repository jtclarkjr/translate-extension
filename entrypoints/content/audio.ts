let currentAudio: HTMLAudioElement | undefined
let resolveCurrentPlayback: (() => void) | undefined

export function stopAudio() {
  if (!currentAudio) {
    return
  }

  currentAudio.pause()
  currentAudio.currentTime = 0
  currentAudio = undefined
  resolveCurrentPlayback?.()
  resolveCurrentPlayback = undefined
}

export async function playDataUrl(dataUrl: string) {
  stopAudio()

  const audio = new Audio(dataUrl)
  currentAudio = audio

  await new Promise<void>((resolve, reject) => {
    let settled = false

    function cleanup() {
      audio.removeEventListener('ended', finish)
      audio.removeEventListener('error', fail)
      if (currentAudio === audio) {
        currentAudio = undefined
      }
      if (resolveCurrentPlayback === finish) {
        resolveCurrentPlayback = undefined
      }
    }

    function finish() {
      if (settled) {
        return
      }
      settled = true
      cleanup()
      resolve()
    }

    function fail() {
      if (settled) {
        return
      }
      settled = true
      cleanup()
      reject(new Error('Unable to play audio.'))
    }

    resolveCurrentPlayback = finish
    audio.addEventListener('ended', finish)
    audio.addEventListener('error', fail)
    void audio.play().catch(fail)
  })
}
