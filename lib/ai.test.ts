import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { askAboutText, translateText } from './ai'
import type { AIProvider, ProviderSettings } from './settings'

const { generateTextMock } = vi.hoisted(() => ({ generateTextMock: vi.fn() }))
vi.mock('ai', async (importOriginal) => ({
  ...(await importOriginal<typeof import('ai')>()),
  generateText: generateTextMock
}))

const config: ProviderSettings = {
  apiKey: 'test-key',
  textModel: 'custom-text-model',
  realtimeModel: 'custom-realtime-model'
}

describe('AI text service', () => {
  beforeEach(() => {
    generateTextMock.mockReset()
  })

  it.each([
    ['openai', 'openai.responses'],
    ['gateway', 'gateway']
  ] as const)('routes configured text models through %s', async (provider, providerName) => {
    generateTextMock.mockResolvedValue({
      text: ' ```json\n{"translatedText":"Good morning","detectedLanguage":" Japanese ","notes":"Greeting"}\n``` '
    })

    await expect(
      translateText({
        provider,
        config,
        text: ' おはよう  ',
        targetLanguage: 'English',
        sourceHint: 'Japanese'
      })
    ).resolves.toEqual({
      translatedText: 'Good morning',
      detectedLanguage: 'Japanese',
      notes: 'Greeting'
    })
    expect(generateTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: expect.objectContaining({
          modelId: config.textModel,
          provider: providerName
        }),
        prompt: 'Source language hint: Japanese\nTarget language: English\n\nText:\nおはよう',
        maxRetries: 0
      })
    )
  })

  it('keeps plain text responses and routes follow-up questions through the same configuration', async () => {
    generateTextMock.mockResolvedValueOnce({ text: ' Good morning ' })
    generateTextMock.mockResolvedValueOnce({ text: ' It is read as ohayou. ' })

    await expect(
      translateText({ provider: 'gateway', config, text: 'おはよう', targetLanguage: 'English' })
    ).resolves.toEqual({ translatedText: 'Good morning' })
    await expect(
      askAboutText({
        provider: 'gateway',
        config,
        text: 'おはよう',
        question: ' How do I say this? ',
        targetLanguage: 'English'
      })
    ).resolves.toBe('It is read as ohayou.')
    expect(generateTextMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        model: expect.objectContaining({ provider: 'gateway', modelId: config.textModel }),
        prompt:
          'Answer language: English\nSelected text:\nおはよう\n\nQuestion:\nHow do I say this?'
      })
    )
  })

  it.each(['openai', 'gateway'] as AIProvider[])(
    'requires the selected %s credential',
    async (provider) => {
      await expect(
        translateText({
          provider,
          config: { ...config, apiKey: ' ' },
          text: 'Hello',
          targetLanguage: 'Japanese'
        })
      ).rejects.toThrow('API key')
      expect(generateTextMock).not.toHaveBeenCalled()
    }
  )

  it('rejects empty input and empty provider output', async () => {
    await expect(
      translateText({ provider: 'openai', config, text: ' ', targetLanguage: 'English' })
    ).rejects.toThrow('Select text first')
    expect(generateTextMock).not.toHaveBeenCalled()

    generateTextMock.mockResolvedValue({ text: ' ' })
    await expect(
      askAboutText({ provider: 'openai', config, text: 'Hello', question: 'Meaning?' })
    ).rejects.toThrow('empty response')
  })

  it('passes cancellation through to the SDK request', async () => {
    const controller = new AbortController()
    generateTextMock.mockRejectedValue(new DOMException('Cancelled', 'AbortError'))
    await expect(
      translateText({
        provider: 'openai',
        config,
        text: 'Hello',
        targetLanguage: 'Japanese',
        signal: controller.signal
      })
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(generateTextMock).toHaveBeenCalledWith(
      expect.objectContaining({ abortSignal: controller.signal })
    )
  })

  it('preserves input limits and provider errors', async () => {
    generateTextMock.mockRejectedValue(new Error('Rate limit exceeded'))
    await expect(
      askAboutText({
        provider: 'openai',
        config,
        text: 'a'.repeat(7100),
        question: 'b'.repeat(1100)
      })
    ).rejects.toThrow('Rate limit exceeded')
    expect(generateTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: `Selected text:\n${'a'.repeat(7000)}\n\nQuestion:\n${'b'.repeat(1000)}`
      })
    )
  })
})
