import type { ExtensionRequest } from '@/lib/messages'
import { askAboutText, fail, ok, translateText } from '@/lib/ai'
import { handlePreparationPort } from '@/lib/preparation'
import { getSettings } from '@/lib/settings'

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message: ExtensionRequest) => handleMessage(message))
  browser.runtime.onConnect.addListener(handlePreparationPort)
  void setupContextMenu()
  browser.contextMenus.onClicked.addListener((info, tab) => {
    void handleContextMenuClick(info, tab)
  })
})

const translateMenuId = 'natural-translator-translate-selection'

async function setupContextMenu() {
  await browser.contextMenus.removeAll()
  browser.contextMenus.create({
    id: translateMenuId,
    title: 'Translate selected text',
    contexts: ['selection']
  })
}

async function handleContextMenuClick(
  info: Browser.contextMenus.OnClickData,
  tab?: Browser.tabs.Tab
) {
  if (info.menuItemId !== translateMenuId || !tab?.id || !info.selectionText) {
    return
  }

  const message = {
    type: 'open-selection-panel',
    text: info.selectionText
  }

  try {
    await browser.tabs.sendMessage(tab.id, message)
    return
  } catch {
    // The tab may have been opened before the extension was loaded.
  }

  try {
    await browser.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['/content-scripts/content.js']
    })
    await browser.tabs.sendMessage(tab.id, message)
  } catch (error) {
    console.warn('Natural Translator could not open on this page.', error)
  }
}

async function handleMessage(message: ExtensionRequest) {
  try {
    const settings = await getSettings()

    if (message.type === 'translate') {
      const result = await translateText({
        provider: settings.provider,
        config: settings.providers[settings.provider],
        text: message.text,
        targetLanguage: message.targetLanguage || settings.targetLanguage,
        sourceHint: message.sourceHint
      })

      return ok(result)
    }

    if (message.type === 'ask') {
      const answer = await askAboutText({
        provider: settings.provider,
        config: settings.providers[settings.provider],
        text: message.text,
        question: message.question,
        targetLanguage: message.targetLanguage || settings.targetLanguage
      })

      return ok({ answer })
    }

    return fail('Unknown extension request.')
  } catch (error) {
    return fail(error)
  }
}
