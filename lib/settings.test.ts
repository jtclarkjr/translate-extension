import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { defaultSettings, getSettings, saveSettings } from './settings'

function mockStorage(initial: Record<string, unknown> = {}) {
  const stored = { ...initial }
  vi.stubGlobal('browser', {
    storage: {
      local: {
        get: vi.fn(async () => ({ ...stored })),
        set: vi.fn(async (next: Record<string, unknown>) => Object.assign(stored, next))
      }
    }
  })
}

afterEach(() => vi.unstubAllGlobals())

describe('provider settings', () => {
  it('loads defaults with independent provider profiles', async () => {
    mockStorage()
    const settings = await getSettings()

    expect(settings).toEqual(defaultSettings)
    settings.providers.openai.apiKey = 'changed'
    expect(defaultSettings.providers.openai.apiKey).toBe('')
  })

  it('carries over the legacy key and existing playback preferences', async () => {
    mockStorage({
      openaiApiKey: 'legacy-key',
      targetLanguage: ' Japanese ',
      voice: 'custom-voice',
      playbackMode: 'both',
      ttsEnabled: false
    })

    await expect(getSettings()).resolves.toMatchObject({
      provider: 'openai',
      providers: {
        openai: { apiKey: 'legacy-key', textModel: 'gpt-6-luna' },
        gateway: { apiKey: '' }
      },
      targetLanguage: 'Japanese',
      voice: 'custom-voice',
      playbackMode: 'both',
      ttsEnabled: false
    })
  })

  it('keeps both profiles when switching providers', async () => {
    mockStorage()
    const settings = await getSettings()
    const providers = {
      openai: { ...settings.providers.openai, apiKey: 'openai-key', textModel: 'future-text' },
      gateway: {
        apiKey: 'gateway-key',
        textModel: 'other/text-model',
        realtimeModel: 'other/realtime-model'
      }
    }
    await saveSettings({ providers, provider: 'gateway' })
    expect((await getSettings()).providers).toEqual(providers)
    await saveSettings({ provider: 'openai' })
    expect((await getSettings()).providers).toEqual(providers)
  })

  it('does not restore the legacy key after it was deliberately cleared', async () => {
    mockStorage({
      openaiApiKey: 'legacy-key',
      providers: { openai: { apiKey: '', textModel: '', realtimeModel: '' } }
    })

    expect((await getSettings()).providers.openai).toEqual({
      apiKey: '',
      textModel: '',
      realtimeModel: ''
    })
  })

  it('replaces malformed stored values without accepting unknown settings', async () => {
    mockStorage({
      provider: 'unknown',
      providers: { openai: { apiKey: 42, textModel: null }, gateway: ['invalid'] },
      targetLanguage: 12,
      voice: null,
      ttsEnabled: 'yes',
      playbackMode: 'unknown',
      untrustedExtra: 'ignored'
    })

    await expect(getSettings()).resolves.toEqual(defaultSettings)
  })
})
