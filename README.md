# Natural Translator Extension

Chromium-first browser extension for selected-text translation, pronunciation, and follow-up
questions through Vercel AI SDK, using OpenAI directly or Vercel AI Gateway.

## Development

This project uses Vite+, Bun, WXT, React, and TypeScript.

```sh
vp install
vp exec wxt prepare
vp run dev
vp run build
```

Choose **OpenAI** or **Vercel AI Gateway** in the popup. Only the selected provider's key and
models are shown. Each provider retains its own credentials and model choices when switched.
Use an OpenAI key for direct access, or a Gateway key for Vercel; the keys are not interchangeable.
Credentials stay in extension-local storage and trusted background operations, and are not sent
to page content scripts or bundled as a shared secret.

The text model is used for follow-up questions and translation with voice disabled. Voice-enabled
translation uses the realtime model to prepare a matching transcript and spoken audio together.
The initial text models are `gpt-6-luna` / `openai/gpt-6-luna`; realtime defaults are
`gpt-realtime-2.1-mini` / `openai/gpt-realtime-2`. Edit compatible model IDs in the popup to upgrade
without rebuilding. GPT-Live and audio-input translation models require different session protocols.

Opening the translation panel prepares audio silently, so audio generation is billed even if you
never press Play. Play uses audio already buffered and continues receiving chunks while playing.
Stop halts playback; replay uses the same audio. Closing the panel cancels generation and discards
its buffer. Provider, model, language, and voice changes re-prepare an open panel. Original
pronunciation is prepared ahead of time when included in the default voice action, otherwise on
demand. No microphone access is used.

Model availability depends on your provider account. New models can be selected as long as they
support the chosen text or realtime API. Gateway realtime calls use a dedicated extension worker
on Firefox/Safari background pages, keeping the same SDK implementation as Chromium.

Load the built Chromium extension from `.output/chrome-mv3`.

## Per-browser builds

| Script             | Output                 | Notes                                          |
| ------------------ | ---------------------- | ---------------------------------------------- |
| `build:chrome`     | `.output/chrome-mv3`   | Also for Brave, Opera, Vivaldi, Arc            |
| `build:edge`       | `.output/edge-mv3`     |                                                |
| `build:firefox`    | `.output/firefox-mv2`  |                                                |
| `build:safari`     | `.output/safari-mv2`   | Web extension resources for the Xcode project  |
| `build:safari:app` | `safari/build/...`     | Builds the macOS wrapper app (requires Xcode)  |
| `zip:chrome` etc.  | `.output/*.zip`        | Store submission zips (`zip:edge`, `zip:firefox`) |

Run any of these with `vp run <script>`. Safari builds target MV2 (WXT's default for Safari); flip
to MV3 later with `wxt build -b safari --mv3` if needed.

## Safari (macOS)

Safari extensions ship inside a native app. The Xcode project in `safari/` was generated once with
`xcrun safari-web-extension-converter` and references the gitignored `.output/safari-mv2` build
output, so **run `vp run build:safari` before opening the project in Xcode** on a fresh clone.

To build and test locally:

1. `vp run build:safari:app` — rebuilds the web extension, then the app via `xcodebuild`.
2. `open "safari/build/Build/Products/Debug/Natural Translator.app"` — launch once to register the
   extension with Safari.
3. Safari → Settings → Developer → enable **Allow unsigned extensions** (resets each time Safari
   quits — re-enable per session).
4. Safari → Settings → Extensions → enable **Natural Translator**.
5. Grant site access when prompted ("Always Allow on Every Website" for testing) and approve access
   to the active provider (`api.openai.com` or `ai-gateway.vercel.sh`).

The app builds with ad-hoc signing ("Sign to Run Locally") and needs no Apple Developer team for
local use. Distributing the app to others requires Developer ID signing and notarization.
