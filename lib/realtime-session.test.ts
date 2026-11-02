import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { generateRealtime } from './realtime-session'
import type { RealtimeWorkerRequest } from './realtime.worker'

const { generateDirect } = vi.hoisted(() => ({ generateDirect: vi.fn() }))
vi.mock('./realtime', () => ({ generateRealtime: generateDirect }))

class FakeWorker extends EventTarget {
  static instances: FakeWorker[] = []
  request?: RealtimeWorkerRequest
  terminated = false

  constructor(
    readonly url: URL,
    readonly options: WorkerOptions
  ) {
    super()
    FakeWorker.instances.push(this)
  }

  postMessage(request: RealtimeWorkerRequest) {
    this.request = request
  }

  terminate() {
    this.terminated = true
  }

  emit(data: unknown) {
    this.dispatchEvent(new MessageEvent('message', { data }))
  }
}

describe('realtime session runtime', () => {
  beforeEach(() => {
    generateDirect.mockReset().mockResolvedValue(undefined)
    FakeWorker.instances = []
    vi.stubGlobal('Worker', FakeWorker)
    vi.stubGlobal('window', {})
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function params() {
    return {
      provider: 'gateway' as const,
      config: {
        apiKey: 'private-key',
        textModel: 'openai/gpt-6-luna',
        realtimeModel: 'openai/gpt-realtime-2'
      },
      text: 'おはよう',
      targetLanguage: 'English',
      voice: 'coral',
      purpose: 'translation' as const,
      signal: new AbortController().signal,
      onTranscript: vi.fn<(delta: string) => void>(),
      onAudio: vi.fn<(pcmBase64: string) => void>()
    }
  }

  it('keeps OpenAI and MV3 Gateway sessions in the existing runtime', async () => {
    const openai = { ...params(), provider: 'openai' as const }
    await generateRealtime(openai)
    expect(generateDirect).toHaveBeenLastCalledWith(openai)

    vi.stubGlobal('window', undefined)
    const gateway = params()
    await generateRealtime(gateway)
    expect(generateDirect).toHaveBeenLastCalledWith(gateway)
    expect(FakeWorker.instances).toHaveLength(0)
  })

  it('runs MV2 Gateway generation in a module worker and forwards transcript and audio', async () => {
    const request = params()
    const pending = generateRealtime(request)
    const worker = FakeWorker.instances[0]!
    expect(worker.url.pathname).toMatch(/\/realtime\.worker\.ts$/)
    expect(worker.options).toEqual({ type: 'module' })
    expect(worker.request).toEqual({
      provider: request.provider,
      config: request.config,
      text: request.text,
      targetLanguage: request.targetLanguage,
      voice: request.voice,
      purpose: request.purpose
    })
    expect(generateDirect).not.toHaveBeenCalled()

    worker.emit({ type: 'transcript', delta: 'Good morning' })
    worker.emit({ type: 'audio', delta: 'AQIDBA==' })
    expect(request.onTranscript).toHaveBeenCalledWith('Good morning')
    expect(request.onAudio).toHaveBeenCalledWith('AQIDBA==')
    expect(worker.terminated).toBe(false)
    worker.emit({ type: 'done' })
    await expect(pending).resolves.toBeUndefined()
    expect(worker.terminated).toBe(true)
    worker.emit({ type: 'audio', delta: 'late' })
    expect(request.onAudio).toHaveBeenCalledTimes(1)
  })

  it('terminates on abort and rejects already cancelled requests without starting a worker', async () => {
    const controller = new AbortController()
    const pending = generateRealtime({ ...params(), signal: controller.signal })
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    controller.abort()
    await rejected
    expect(FakeWorker.instances[0]!.terminated).toBe(true)

    await expect(
      generateRealtime({ ...params(), signal: controller.signal })
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(FakeWorker.instances).toHaveLength(1)
  })

  it('terminates on generation failure, worker errors, and callback errors', async () => {
    const pending = generateRealtime(params())
    const rejected = expect(pending).rejects.toThrow('Model unavailable')
    FakeWorker.instances[0]!.emit({ type: 'error', message: 'Model unavailable' })
    await rejected
    expect(FakeWorker.instances[0]!.terminated).toBe(true)

    const failedWorker = generateRealtime(params())
    const workerRejected = expect(failedWorker).rejects.toThrow('Realtime worker failed')
    FakeWorker.instances[1]!.dispatchEvent(new Event('error'))
    await workerRejected
    expect(FakeWorker.instances[1]!.terminated).toBe(true)

    const request = params()
    request.onAudio.mockImplementation(() => {
      throw new Error('Invalid PCM')
    })
    const failedCallback = generateRealtime(request)
    const callbackRejected = expect(failedCallback).rejects.toThrow('Invalid PCM')
    FakeWorker.instances[2]!.emit({ type: 'audio', delta: 'invalid' })
    await callbackRejected
    expect(FakeWorker.instances[2]!.terminated).toBe(true)
  })
})
