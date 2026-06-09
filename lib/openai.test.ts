import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { askAboutText, speakText, translateText } from './openai'

describe('openai service', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('uses gpt-4o-mini for translation responses', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = requestBody(init)

      expect(body.model).toBe('gpt-4o-mini')

      return new Response(
        JSON.stringify({
          output_text: JSON.stringify({
            translatedText: 'Good morning',
            detectedLanguage: 'Japanese',
            notes: 'Natural greeting'
          })
        }),
        { headers: { 'content-type': 'application/json' } }
      )
    })

    vi.stubGlobal('fetch', fetchMock)

    await expect(
      translateText({
        apiKey: 'test-key',
        text: 'おはよう',
        targetLanguage: 'English'
      })
    ).resolves.toEqual({
      translatedText: 'Good morning',
      detectedLanguage: 'Japanese',
      notes: 'Natural greeting'
    })
  })

  it('uses gpt-4o-mini for follow-up questions', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = requestBody(init)

      expect(body.model).toBe('gpt-4o-mini')

      return new Response(JSON.stringify({ output_text: 'It is read as ohayou.' }), {
        headers: { 'content-type': 'application/json' }
      })
    })

    vi.stubGlobal('fetch', fetchMock)

    await expect(
      askAboutText({
        apiKey: 'test-key',
        text: 'おはよう',
        question: 'How do I say this?',
        targetLanguage: 'English'
      })
    ).resolves.toBe('It is read as ohayou.')
  })

  it('uses gpt-4o-mini-tts for speech', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = requestBody(init)

      expect(body.model).toBe('gpt-4o-mini-tts')
      expect(body.voice).toBe('coral')

      return new Response(new Uint8Array([1, 2, 3]), {
        headers: { 'content-type': 'audio/mpeg' }
      })
    })

    vi.stubGlobal('fetch', fetchMock)

    const audio = await speakText({
      apiKey: 'test-key',
      text: 'おはよう',
      voice: 'coral',
      purpose: 'original',
      languageHint: 'Japanese'
    })

    expect(audio.mimeType).toBe('audio/mpeg')
    expect(audio.dataUrl).toMatch(/^data:audio\/mpeg;base64,/)
  })
})

function requestBody(init?: RequestInit) {
  if (typeof init?.body !== 'string') {
    throw new Error('Expected JSON request body')
  }

  return JSON.parse(init.body) as {
    model: string
    voice?: string
  }
}
