import { useEffect, useState } from 'react'
import {
  defaultSettings,
  getSettings,
  saveSettings,
  type AIProvider,
  type ExtensionSettings,
  type PlaybackMode,
  type ProviderSettings,
  voiceNames
} from '@/lib/settings'

function App() {
  const [settings, setSettings] = useState<ExtensionSettings>(defaultSettings)
  const [loaded, setLoaded] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const profile = settings.providers[settings.provider]
  const providerName = settings.provider === 'openai' ? 'OpenAI' : 'Vercel AI Gateway'

  useEffect(() => {
    void getSettings()
      .then((stored) => {
        setSettings(stored)
        setLoaded(true)
      })
      .catch(() => setError('Unable to load settings. Reopen the popup to try again.'))
  }, [])

  async function updateSettings(next: Partial<ExtensionSettings>) {
    const updated = { ...settings, ...next }
    setSettings(updated)
    try {
      await saveSettings(next)
      setError('')
      setSaved(true)
      window.setTimeout(() => setSaved(false), 1400)
    } catch {
      setSaved(false)
      setError('Unable to save settings. Try again.')
    }
  }

  function editProfile(next: Partial<ProviderSettings>) {
    setSaved(false)
    setSettings((current) => ({
      ...current,
      providers: {
        ...current.providers,
        [current.provider]: { ...current.providers[current.provider], ...next }
      }
    }))
  }

  return (
    <main className="popup-shell">
      <header className="popup-header">
        <div>
          <h1>Natural Translator</h1>
        </div>
        <span className={profile.apiKey.trim() ? 'status-ready' : 'status-missing'}>
          {profile.apiKey.trim() ? 'Ready' : 'Needs key'}
        </span>
      </header>

      <fieldset className="settings-section" disabled={!loaded} aria-label="Extension settings">
        <label>
          <span>Provider</span>
          <select
            value={settings.provider}
            onChange={(event) =>
              void updateSettings({
                provider: event.target.value as AIProvider,
                providers: settings.providers
              })
            }
          >
            <option value="openai">OpenAI</option>
            <option value="gateway">Vercel AI Gateway</option>
          </select>
        </label>

        <label key={`${settings.provider}-key`}>
          <span>{providerName} API key</span>
          <input
            value={profile.apiKey}
            type="password"
            autoComplete="off"
            placeholder={settings.provider === 'openai' ? 'sk-...' : 'Gateway API key'}
            onChange={(event) => editProfile({ apiKey: event.target.value })}
            onBlur={() => void updateSettings({ providers: settings.providers })}
          />
        </label>

        <label key={`${settings.provider}-text-model`}>
          <span>Text model</span>
          <input
            value={profile.textModel}
            type="text"
            autoCapitalize="none"
            spellCheck={false}
            placeholder={defaultSettings.providers[settings.provider].textModel}
            onChange={(event) => editProfile({ textModel: event.target.value })}
            onBlur={() => void updateSettings({ providers: settings.providers })}
          />
        </label>

        <label key={`${settings.provider}-realtime-model`}>
          <span>Realtime voice model</span>
          <input
            value={profile.realtimeModel}
            type="text"
            autoCapitalize="none"
            spellCheck={false}
            placeholder={defaultSettings.providers[settings.provider].realtimeModel}
            onChange={(event) => editProfile({ realtimeModel: event.target.value })}
            onBlur={() => void updateSettings({ providers: settings.providers })}
          />
        </label>

        <label>
          <span>Target language</span>
          <input
            value={settings.targetLanguage}
            type="text"
            placeholder="English"
            onChange={(event) => {
              setSaved(false)
              setSettings({ ...settings, targetLanguage: event.target.value })
            }}
            onBlur={() => void updateSettings({ targetLanguage: settings.targetLanguage })}
          />
        </label>

        <label>
          <span>Voice</span>
          <input
            value={settings.voice}
            type="text"
            list="voice-options"
            onChange={(event) => setSettings({ ...settings, voice: event.target.value })}
            onBlur={() => void updateSettings({ voice: settings.voice })}
          />
          <datalist id="voice-options">
            {voiceNames.map((voice) => (
              <option key={voice} value={voice}>
                {voice}
              </option>
            ))}
          </datalist>
        </label>

        <label>
          <span>Default voice action</span>
          <select
            value={settings.playbackMode}
            onChange={(event) =>
              void updateSettings({ playbackMode: event.target.value as PlaybackMode })
            }
          >
            <option value="translation">Translation</option>
            <option value="original">Original pronunciation</option>
            <option value="both">Original then translation</option>
          </select>
        </label>

        <label className="toggle-row">
          <input
            checked={settings.ttsEnabled}
            type="checkbox"
            onChange={(event) => void updateSettings({ ttsEnabled: event.target.checked })}
          />
          <span>Enable generated voice playback</span>
        </label>
        <p className="settings-hint">
          Audio is prepared when translation opens, even if you do not press Play.
        </p>
      </fieldset>

      {error ? <p role="alert">{error}</p> : null}

      <footer>
        <p>Generated voice may sound natural but is AI-produced.</p>
        {saved ? <strong>Saved</strong> : null}
      </footer>
    </main>
  )
}

export default App
