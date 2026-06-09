import { useEffect, useState } from "react";
import {
  defaultSettings,
  getSettings,
  saveSettings,
  type ExtensionSettings,
  type PlaybackMode,
  type VoiceName,
  voiceNames,
} from "@/lib/settings";

function App() {
  const [settings, setSettings] = useState<ExtensionSettings>(defaultSettings);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void getSettings().then(setSettings);
  }, []);

  async function updateSettings(next: Partial<ExtensionSettings>) {
    const updated = { ...settings, ...next };
    setSettings(updated);
    await saveSettings(next);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1400);
  }

  return (
    <main className="popup-shell">
      <header className="popup-header">
        <div>
          <h1>Natural Translator</h1>
        </div>
        <span className={settings.openaiApiKey ? "status-ready" : "status-missing"}>
          {settings.openaiApiKey ? "Ready" : "Needs key"}
        </span>
      </header>

      <section className="settings-section">
        <label>
          <span>OpenAI API key</span>
          <input
            value={settings.openaiApiKey}
            type="password"
            autoComplete="off"
            placeholder="sk-..."
            onChange={(event) => void updateSettings({ openaiApiKey: event.target.value })}
          />
        </label>

        <label>
          <span>Target language</span>
          <input
            value={settings.targetLanguage}
            type="text"
            placeholder="English"
            onChange={(event) => void updateSettings({ targetLanguage: event.target.value })}
          />
        </label>

        <label>
          <span>Voice</span>
          <select
            value={settings.voice}
            onChange={(event) => void updateSettings({ voice: event.target.value as VoiceName })}
          >
            {voiceNames.map((voice) => (
              <option key={voice} value={voice}>
                {voice}
              </option>
            ))}
          </select>
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
      </section>

      <footer>
        <p>Generated voice may sound natural but is AI-produced.</p>
        {saved ? <strong>Saved</strong> : null}
      </footer>
    </main>
  );
}

export default App;
