import { generateRealtime } from './realtime'

export type RealtimeWorkerRequest = Omit<
  Parameters<typeof generateRealtime>[0],
  'signal' | 'onTranscript' | 'onAudio'
>
export type RealtimeWorkerEvent =
  | { type: 'transcript' | 'audio'; delta: string }
  | { type: 'done' }
  | { type: 'error'; message: string }

let started = false

function post(event: RealtimeWorkerEvent) {
  self.postMessage(event)
}

self.onmessage = (event: MessageEvent<RealtimeWorkerRequest>) => {
  if (started) return
  started = true
  void generateRealtime({
    ...event.data,
    signal: new AbortController().signal,
    onTranscript: (delta) => post({ type: 'transcript', delta }),
    onAudio: (delta) => post({ type: 'audio', delta })
  }).then(
    () => post({ type: 'done' }),
    (error: unknown) =>
      post({
        type: 'error',
        message: error instanceof Error ? error.message : 'Realtime worker failed.'
      })
  )
}
