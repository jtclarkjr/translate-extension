export type PlaybackMode = 'translation' | 'original' | 'both'
export type AIProvider = 'openai' | 'gateway'

export type ProviderSettings = {
  apiKey: string
  textModel: string
  realtimeModel: string
}

export const voiceNames = [
  'alloy',
  'ash',
  'ballad',
  'coral',
  'echo',
  'sage',
  'shimmer',
  'verse',
  'marin',
  'cedar'
] as const

export type VoiceName = string

export type ExtensionSettings = {
  provider: AIProvider
  providers: Record<AIProvider, ProviderSettings>
  targetLanguage: string
  voice: VoiceName
  ttsEnabled: boolean
  playbackMode: PlaybackMode
}

export const defaultSettings: ExtensionSettings = {
  provider: 'openai',
  providers: {
    openai: {
      apiKey: '',
      textModel: 'gpt-6-luna',
      realtimeModel: 'gpt-realtime-2.1-mini'
    },
    gateway: {
      apiKey: '',
      textModel: 'openai/gpt-6-luna',
      realtimeModel: 'openai/gpt-realtime-2'
    }
  },
  targetLanguage: 'English',
  voice: 'coral',
  ttsEnabled: true,
  playbackMode: 'translation'
}

export async function getSettings(): Promise<ExtensionSettings> {
  const stored = await browser.storage.local.get([...Object.keys(defaultSettings), 'openaiApiKey'])
  const providers = isRecord(stored.providers) ? stored.providers : {}

  return {
    ...defaultSettings,
    provider: stored.provider === 'gateway' ? 'gateway' : 'openai',
    providers: {
      openai: readProviderSettings(providers.openai, {
        ...defaultSettings.providers.openai,
        apiKey: typeof stored.openaiApiKey === 'string' ? stored.openaiApiKey : ''
      }),
      gateway: readProviderSettings(providers.gateway, defaultSettings.providers.gateway)
    },
    voice:
      typeof stored.voice === 'string' && stored.voice.trim()
        ? stored.voice.trim()
        : defaultSettings.voice,
    playbackMode: isPlaybackMode(stored.playbackMode)
      ? stored.playbackMode
      : defaultSettings.playbackMode,
    ttsEnabled:
      typeof stored.ttsEnabled === 'boolean' ? stored.ttsEnabled : defaultSettings.ttsEnabled,
    targetLanguage:
      typeof stored.targetLanguage === 'string' && stored.targetLanguage.trim()
        ? stored.targetLanguage.trim()
        : defaultSettings.targetLanguage
  }
}

export async function saveSettings(settings: Partial<ExtensionSettings>) {
  await browser.storage.local.set(settings)
}

function readProviderSettings(value: unknown, defaults: ProviderSettings): ProviderSettings {
  const stored = isRecord(value) ? value : {}

  return {
    apiKey: typeof stored.apiKey === 'string' ? stored.apiKey : defaults.apiKey,
    textModel: typeof stored.textModel === 'string' ? stored.textModel : defaults.textModel,
    realtimeModel:
      typeof stored.realtimeModel === 'string' ? stored.realtimeModel : defaults.realtimeModel
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isPlaybackMode(value: unknown): value is PlaybackMode {
  return value === 'translation' || value === 'original' || value === 'both'
}
