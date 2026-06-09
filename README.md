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
