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

Load the built Chromium extension from `.output/chrome-mv3`.

## Usage

- **Setup:** Choose **OpenAI** or **Vercel AI Gateway** in the popup and enter the matching API key.
  Each provider saves its own key and model settings.
- **Models:** Text models handle follow-up questions and translation with voice off; realtime models
  provide matching translated text and speech. Edit model IDs in the popup using models available to
  your account that support the chosen API.
- **Audio & billing:** With voice enabled, opening the panel generates billable audio before you press
  Play. Replay reuses that audio. Closing cancels generation and clears buffered audio. Changing the
  provider, model, language, or voice prepares audio again for an open panel.
- **Privacy:** Keys stay in extension-local storage and trusted background code, never page content
  scripts. No microphone access is used.

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
