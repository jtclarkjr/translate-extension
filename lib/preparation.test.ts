import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { handlePreparationPort } from './preparation'
import { PREPARATION_PORT, type PreparationEvent } from './messages'
import { defaultSettings, getSettings, type ExtensionSettings } from './settings'
import { generateRealtime } from './realtime-session'
import { translateText } from './ai'

vi.mock('./ai', () => ({ translateText: vi.fn() }))
vi.mock('./realtime-session', () => ({ generateRealtime: vi.fn() }))
vi.mock('./settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./settings')>()),
  getSettings: vi.fn()
}))

function event<T extends unknown[]>() {
  const listeners = new Set<(...args: T) => unknown>()
  return {
    addListener: (listener: (...args: T) => unknown) => listeners.add(listener),
    removeListener: (listener: (...args: T) => unknown) => listeners.delete(listener),
    emit: (...args: T) => {
      for (const listener of listeners) listener(...args)
    },
    listeners
  }
}

type Job = Parameters<typeof generateRealtime>[0] & { finish: () => void }
let settings: ExtensionSettings
let jobs: Job[]
let ports: { onDisconnect: ReturnType<typeof event<[]>> }[]
let storageChanged: ReturnType<typeof event<[unknown, string]>>

function makePort() {
  const port = {
    name: PREPARATION_PORT,
    onMessage: event<[unknown]>(),
    onDisconnect: event<[]>(),
    postMessage: vi.fn<(message: PreparationEvent) => void>()
  }
  ports.push(port)
  handlePreparationPort(port as unknown as Browser.runtime.Port)
  return port
}

beforeEach(() => {
  vi.clearAllMocks()
  settings = structuredClone(defaultSettings)
  settings.providers.openai.apiKey = 'openai-key'
  settings.providers.gateway.apiKey = 'gateway-key'
  jobs = []
  ports = []
  storageChanged = event<[unknown, string]>()
  vi.stubGlobal('browser', { storage: { onChanged: storageChanged } })
  vi.mocked(getSettings).mockImplementation(async () => structuredClone(settings))
  vi.mocked(generateRealtime).mockImplementation(
    (params) =>
      new Promise<void>((resolve, reject) => {
        jobs.push({ ...params, finish: resolve })
        params.signal.addEventListener('abort', () =>
          reject(new DOMException('Cancelled', 'AbortError'))
        )
      })
  )
  vi.mocked(translateText).mockResolvedValue({ translatedText: 'Hello' })
})

afterEach(() => {
  for (const port of ports) port.onDisconnect.emit()
  vi.unstubAllGlobals()
})

async function start() {
  const port = makePort()
  port.onMessage.emit({ type: 'prepare', text: 'こんにちは' })
  await vi.waitFor(() => expect(jobs).toHaveLength(1))
  return port
}

describe('background preparation', () => {
  it('prepares translation audio before any Play action and forwards chunks', async () => {
    const port = await start()
    expect(jobs[0].purpose).toBe('translation')
    jobs[0].onTranscript('Hello')
    jobs[0].onAudio('AAA=')
    jobs[0].finish()
    await vi.waitFor(() =>
      expect(port.postMessage).toHaveBeenCalledWith({ type: 'complete', kind: 'translation' })
    )
    expect(port.postMessage).toHaveBeenCalledWith({ type: 'transcript', delta: 'Hello' })
    expect(port.postMessage).toHaveBeenCalledWith({
      type: 'audio',
      kind: 'translation',
      chunk: 'AAA='
    })
    expect(jobs).toHaveLength(1)
  })

  it('prepares original pronunciation once, only on demand for translation mode', async () => {
    const port = await start()
    port.onMessage.emit({ type: 'prepare-original' })
    port.onMessage.emit({ type: 'prepare-original' })
    expect(jobs).toHaveLength(2)
    expect(jobs[1].purpose).toBe('original')
  })

  it('prepares the original ahead of time for the both action', async () => {
    settings.playbackMode = 'both'
    const port = makePort()
    port.onMessage.emit({ type: 'prepare', text: 'こんにちは' })
    await vi.waitFor(() => expect(jobs).toHaveLength(2))
    expect(jobs.map((job) => job.purpose)).toEqual(['translation', 'original'])
  })

  it('restarts with the active provider and ignores cancelled chunks', async () => {
    const port = await start()
    const old = jobs[0]
    settings.provider = 'gateway'
    storageChanged.emit({}, 'local')
    await vi.waitFor(() => expect(jobs).toHaveLength(2))
    expect(old.signal.aborted).toBe(true)
    expect(jobs[1].provider).toBe('gateway')
    expect(jobs[1].config.apiKey).toBe('gateway-key')
    port.postMessage.mockClear()
    old.onTranscript('stale')
    old.onAudio('AAA=')
    expect(port.postMessage).not.toHaveBeenCalled()
  })

  it('does not restart when an inactive profile changes', async () => {
    await start()
    settings.providers.gateway.textModel = 'another/model'
    storageChanged.emit({}, 'local')
    await vi.waitFor(() => expect(getSettings).toHaveBeenCalledTimes(2))
    expect(jobs).toHaveLength(1)
  })

  it('cancels generation and removes the settings listener on disconnect', async () => {
    const port = await start()
    port.onDisconnect.emit()
    expect(jobs[0].signal.aborted).toBe(true)
    expect(storageChanged.listeners.size).toBe(0)
    port.postMessage.mockClear()
    jobs[0].onAudio('AAA=')
    expect(port.postMessage).not.toHaveBeenCalled()
  })

  it('uses the selected text model without generating audio when voice is disabled', async () => {
    settings.ttsEnabled = false
    settings.provider = 'gateway'
    const port = makePort()
    port.onMessage.emit({ type: 'prepare', text: 'こんにちは' })
    await vi.waitFor(() =>
      expect(port.postMessage).toHaveBeenCalledWith({
        type: 'translation',
        result: { translatedText: 'Hello' }
      })
    )
    expect(generateRealtime).not.toHaveBeenCalled()
    expect(translateText).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'gateway',
        config: settings.providers.gateway,
        signal: expect.any(AbortSignal)
      })
    )
  })

  it('reports a missing active key without using the other provider', async () => {
    settings.providers.openai.apiKey = ''
    const port = makePort()
    port.onMessage.emit({ type: 'prepare', text: 'こんにちは' })
    await vi.waitFor(() =>
      expect(port.postMessage).toHaveBeenCalledWith({
        type: 'error',
        kind: 'translation',
        error: expect.stringContaining('OpenAI API key')
      })
    )
    expect(generateRealtime).not.toHaveBeenCalled()
    expect(translateText).not.toHaveBeenCalled()
  })
})
