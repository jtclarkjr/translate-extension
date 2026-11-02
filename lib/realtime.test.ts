import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { generateRealtime } from './realtime'
import type { AIProvider } from './settings'

class FakeWebSocket extends EventTarget {
  static instances: FakeWebSocket[] = []
  sent: Record<string, unknown>[] = []
  closed = false

  constructor(
    readonly url: string,
    readonly protocols?: string[]
  ) {
    super()
    FakeWebSocket.instances.push(this)
  }

  send(data: string) {
    this.sent.push(JSON.parse(data))
  }

  close() {
    this.closed = true
  }

  emit(data: unknown) {
    this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(data) }))
  }
}

describe('realtime generation', () => {
  let fetchMock: ReturnType<typeof vi.fn>
  let controller: AbortController
  let onTranscript = vi.fn<(delta: string) => void>()
  let onAudio = vi.fn<(pcmBase64: string) => void>()

  beforeEach(() => {
    vi.useFakeTimers()
    FakeWebSocket.instances = []
    vi.stubGlobal('WebSocket', FakeWebSocket)
    fetchMock = vi.fn(async () =>
      Response.json({ value: 'ephemeral-key', token: 'vcst_ephemeral', expires_at: 123 })
    )
    vi.stubGlobal('fetch', fetchMock)
    controller = new AbortController()
    onTranscript = vi.fn()
    onAudio = vi.fn()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  function request(
    provider: AIProvider = 'openai',
    purpose: 'translation' | 'original' = 'translation'
  ) {
    return generateRealtime({
      provider,
      config: {
        apiKey: 'private-api-key',
        textModel: 'unused-text-model',
        realtimeModel: provider === 'openai' ? 'gpt-realtime-2.1-mini' : 'openai/gpt-realtime-2'
      },
      text: 'おはよう',
      targetLanguage: 'English',
      voice: 'coral',
      purpose,
      signal: controller.signal,
      onTranscript,
      onAudio
    })
  }

  async function getSocket() {
    await vi.waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1))
    return FakeWebSocket.instances[0]!
  }

  async function startDirect() {
    const socket = await getSocket()
    socket.emit({ type: 'session.created' })
    socket.emit({ type: 'session.updated' })
    return socket
  }

  it('waits for session readiness and streams transcript and PCM from one direct OpenAI response', async () => {
    const pending = request()
    const socket = await getSocket()
    expect(socket.url).toContain('model=gpt-realtime-2.1-mini')
    expect(socket.protocols).toContain('openai-insecure-api-key.ephemeral-key')
    expect(JSON.stringify(socket.protocols)).not.toContain('private-api-key')
    expect(socket.sent).toEqual([])

    socket.emit({ type: 'session.created' })
    expect(socket.sent).toEqual([
      expect.objectContaining({
        type: 'session.update',
        session: expect.objectContaining({
          output_modalities: ['audio'],
          audio: {
            input: { turn_detection: null },
            output: { format: { type: 'audio/pcm', rate: 24000 }, voice: 'coral' }
          }
        })
      })
    ])
    socket.emit({ type: 'session.updated' })
    socket.emit({ type: 'session.updated' })
    expect(socket.sent.map((event) => event.type)).toEqual([
      'session.update',
      'conversation.item.create',
      'response.create'
    ])
    expect(socket.sent[1]).toMatchObject({
      item: { content: [{ type: 'input_text', text: 'おはよう' }] }
    })
    socket.emit({ type: 'response.output_audio_transcript.delta', delta: 'Good ' })
    socket.emit({ type: 'response.output_audio.delta', delta: 'AQIDBA==' })
    socket.emit({ type: 'response.output_audio_transcript.delta', delta: 'morning' })
    socket.emit({ type: 'response.done', response: { status: 'completed' } })
    await expect(pending).resolves.toBeUndefined()
    expect(onTranscript.mock.calls).toEqual([['Good '], ['morning']])
    expect(onAudio).toHaveBeenCalledWith('AQIDBA==')
    expect(socket.closed).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('uses Gateway token authentication and normalized events for literal original playback', async () => {
    const pending = request('gateway', 'original')
    const socket = await getSocket()
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/v1/realtime/client-secrets')
    expect(socket.url).toContain('ai-gateway.vercel.sh')
    expect(JSON.stringify(socket.protocols)).toContain('vcst_ephemeral')
    expect(JSON.stringify(socket.protocols)).not.toContain('private-api-key')
    socket.emit({ type: 'session-created' })
    expect(socket.sent[0]).toMatchObject({
      type: 'session-update',
      config: { instructions: expect.stringContaining('exactly as written') }
    })
    socket.emit({ type: 'session-updated' })
    expect(socket.sent[1]).toMatchObject({
      type: 'conversation-item-create',
      item: { type: 'text-message', role: 'user', text: 'おはよう' }
    })
    socket.emit({ type: 'audio-delta', delta: 'AQIDBA==' })
    socket.emit({ type: 'audio-transcript-done', transcript: 'おはよう' })
    socket.emit({ type: 'response-done', status: 'completed' })
    await expect(pending).resolves.toBeUndefined()
    expect(onTranscript).toHaveBeenCalledWith('おはよう')
    expect(socket.closed).toBe(true)
  })

  it('cancels and aborts token setup without opening a socket', async () => {
    fetchMock.mockImplementation(() => new Promise(() => {}))
    const pending = request()
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    controller.abort()
    await rejected
    expect(fetchMock.mock.calls[0]?.[1].signal.aborted).toBe(true)
    expect(FakeWebSocket.instances).toHaveLength(0)
  })

  it('closes an active socket on cancellation and ignores later audio', async () => {
    const pending = request()
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    const socket = await startDirect()
    controller.abort()
    socket.emit({ type: 'response.output_audio.delta', delta: 'AQIDBA==' })
    await rejected
    expect(socket.closed).toBe(true)
    expect(onAudio).not.toHaveBeenCalled()
  })

  it.each(['failed', 'incomplete', 'cancelled'])('rejects a %s response', async (status) => {
    const pending = request()
    const rejected = expect(pending).rejects.toThrow(status)
    const socket = await startDirect()
    socket.emit({ type: 'response.done', response: { status } })
    await rejected
    expect(socket.closed).toBe(true)
  })

  it('rejects empty completed responses', async () => {
    const pending = request()
    const rejected = expect(pending).rejects.toThrow('empty transcript or audio')
    const socket = await startDirect()
    socket.emit({ type: 'response.done', response: { status: 'completed' } })
    await rejected
  })

  it('reports provider errors and premature socket closure', async () => {
    const pending = request()
    const rejected = expect(pending).rejects.toThrow('Unknown voice')
    const socket = await startDirect()
    socket.emit({ type: 'error', error: { message: 'Unknown voice' } })
    await rejected

    const second = request()
    const secondRejected = expect(second).rejects.toThrow('closed before')
    await vi.waitFor(() => expect(FakeWebSocket.instances).toHaveLength(2))
    FakeWebSocket.instances[1]!.dispatchEvent(new Event('close'))
    await secondRejected
  })

  it('bounds token setup and stalled response waits', async () => {
    fetchMock.mockImplementationOnce(() => new Promise(() => {}))
    const pending = request()
    const rejected = expect(pending).rejects.toThrow('connection timed out')
    await vi.advanceTimersByTimeAsync(15000)
    await rejected

    const second = request()
    const secondRejected = expect(second).rejects.toThrow('response stalled')
    await startDirect()
    await vi.advanceTimersByTimeAsync(30000)
    await secondRejected
  })
})
