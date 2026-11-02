import { generateRealtime as generateDirect } from './realtime'
import type { RealtimeWorkerEvent, RealtimeWorkerRequest } from './realtime.worker'

export function generateRealtime(params: Parameters<typeof generateDirect>[0]): Promise<void> {
  if (params.provider !== 'gateway' || typeof window === 'undefined') {
    return generateDirect(params)
  }

  return new Promise((resolve, reject) => {
    const { signal, onTranscript, onAudio, ...request } = params
    let worker: Worker | undefined
    let settled = false

    function finish(error?: unknown) {
      if (settled) return
      settled = true
      signal.removeEventListener('abort', abort)
      worker?.terminate()
      if (error) reject(error)
      else resolve()
    }

    function abort() {
      finish(new DOMException('Realtime request cancelled.', 'AbortError'))
    }

    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) {
      abort()
      return
    }

    try {
      // MV2 has a window; the SDK requires token minting in a worker or server context.
      worker = new Worker(new URL('./realtime.worker.ts', import.meta.url), { type: 'module' })
      worker.addEventListener('error', (event) => {
        event.preventDefault()
        finish(new Error(event.message || 'Realtime worker failed.'))
      })
      worker.addEventListener('messageerror', () => {
        finish(new Error('Unable to read the realtime worker response.'))
      })
      worker.addEventListener('message', (event: MessageEvent<RealtimeWorkerEvent>) => {
        if (settled) return
        try {
          const message = event.data
          if (message.type === 'transcript') onTranscript(message.delta)
          else if (message.type === 'audio') onAudio(message.delta)
          else if (message.type === 'done') finish()
          else if (message.type === 'error') finish(new Error(message.message))
        } catch (error) {
          finish(error)
        }
      })
      worker.postMessage(request satisfies RealtimeWorkerRequest)
    } catch (error) {
      finish(error)
    }
  })
}
