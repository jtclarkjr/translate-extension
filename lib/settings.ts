export type PlaybackMode = "translation" | "original" | "both";

export const voiceNames = [
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "fable",
  "onyx",
  "nova",
  "sage",
  "shimmer",
  "verse",
  "marin",
  "cedar",
] as const;

export type VoiceName = (typeof voiceNames)[number];

export type ExtensionSettings = {
  openaiApiKey: string;
  targetLanguage: string;
  voice: VoiceName;
  ttsEnabled: boolean;
  playbackMode: PlaybackMode;
};

export const defaultSettings: ExtensionSettings = {
  openaiApiKey: "",
  targetLanguage: "English",
  voice: "coral",
  ttsEnabled: true,
  playbackMode: "translation",
};

export async function getSettings(): Promise<ExtensionSettings> {
  const stored = await browser.storage.local.get(defaultSettings);

  return {
    ...defaultSettings,
    ...stored,
    voice: isVoiceName(stored.voice) ? stored.voice : defaultSettings.voice,
    playbackMode: isPlaybackMode(stored.playbackMode)
      ? stored.playbackMode
      : defaultSettings.playbackMode,
    ttsEnabled:
      typeof stored.ttsEnabled === "boolean" ? stored.ttsEnabled : defaultSettings.ttsEnabled,
    openaiApiKey: typeof stored.openaiApiKey === "string" ? stored.openaiApiKey : "",
    targetLanguage:
      typeof stored.targetLanguage === "string" && stored.targetLanguage.trim()
        ? stored.targetLanguage.trim()
        : defaultSettings.targetLanguage,
  };
}

export async function saveSettings(settings: Partial<ExtensionSettings>) {
  await browser.storage.local.set(settings);
}

function isVoiceName(value: unknown): value is VoiceName {
  return typeof value === "string" && voiceNames.includes(value as VoiceName);
}

function isPlaybackMode(value: unknown): value is PlaybackMode {
  return value === "translation" || value === "original" || value === "both";
}
