# Natural Translator Extension

Chromium-first browser extension for selected-text translation, pronunciation, and follow-up
questions with the OpenAI API.

## Development

This project uses Vite+, Bun, WXT, React, and TypeScript.

```sh
vp install
vp exec wxt prepare
vp run dev
vp run build
```

The extension stores the user's OpenAI API key in `chrome.storage.local`. The key is not committed
or bundled as a shared secret.

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
   to `api.openai.com`.

The app builds with ad-hoc signing ("Sign to Run Locally") and needs no Apple Developer team for
local use. Distributing the app to others requires Developer ID signing and notarization.
