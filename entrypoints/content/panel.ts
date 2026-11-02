import type { AskResponse, AudioKind, TranslationResult } from '@/lib/messages'
import { stopAudio } from './audio'
import { prepareSelection } from './preparation'
import { FONT_STACK, MAX_SELECTION_CHARS, ROOT_ID } from './constants'
import { clampPanelPosition, getInitialPanelPosition } from './layout'
import {
  setActionButtonStyles,
  setElementStyles,
  setInputStyles,
  setInsetBlockStyles,
  setLabelStyles
} from './styleHelpers'
import { styles } from './styles'
import type { DragState, PanelState, SelectionState } from './types'

let root: HTMLDivElement | undefined
let shadow: ShadowRoot | undefined
let panelState: PanelState | undefined
let dragState: DragState | undefined
let panelRequestId = 0
let ignoreOutsideClicksUntil = 0
let preparedSelection: ReturnType<typeof prepareSelection> | undefined
let playbackId = 0
let questionRequestId = 0

function ensureRoot() {
  if (root && shadow) {
    return shadow
  }

  root = document.createElement('div')
  root.id = ROOT_ID
  root.style.position = 'fixed'
  root.style.left = '0'
  root.style.top = '0'
  root.style.width = '0'
  root.style.height = '0'
  root.style.zIndex = '2147483647'
  root.style.pointerEvents = 'none'
  shadow = root.attachShadow({ mode: 'open' })
  const style = document.createElement('style')
  style.textContent = styles
  shadow.append(style)
  document.documentElement.append(root)

  return shadow
}

export function removeFloatingButtons() {
  shadow?.querySelector('.nt-floating-button')?.remove()
  document.querySelectorAll<HTMLDivElement>(`#${ROOT_ID}`).forEach((host) => {
    host.shadowRoot?.querySelector('.nt-floating-button')?.remove()
  })
}

export function openPanelFromText(text: string, rect: DOMRect) {
  openPanel({
    text: text.replace(/\s+/g, ' ').trim().slice(0, MAX_SELECTION_CHARS),
    rect
  })
}

function openPanel(selection: SelectionState) {
  destroyPanelAudio()
  removeFloatingButtons()
  const requestId = ++panelRequestId
  panelState = {
    selection,
    position: getInitialPanelPosition(selection.rect),
    loading: true,
    question: ''
  }
  ignoreOutsideClicksUntil = Date.now() + 500
  renderPanel()

  try {
    preparedSelection = prepareSelection(selection.text, {
      onReset() {
        if (requestId !== panelRequestId || !panelState) return
        playbackId += 1
        questionRequestId += 1
        stopAudio()
        panelState.translation = undefined
        panelState.answer = undefined
        panelState.error = undefined
        panelState.speaking = undefined
        panelState.audioPreparing = false
        panelState.loading = true
        renderPanel()
      },
      onTranslation(translation) {
        if (requestId !== panelRequestId || !panelState) return
        const firstText = !panelState.translation
        panelState.translation = translation
        panelState.loading = false
        if (firstText) {
          renderPanel()
        } else {
          const output = shadow?.querySelector('.nt-result-text')
          if (output) output.textContent = translation.translatedText
        }
      },
      onAudio(kind) {
        if (requestId !== panelRequestId || !panelState) return
        if (panelState.playingKind === kind && panelState.audioPreparing) {
          panelState.audioPreparing = false
          renderPanel()
        }
      },
      onComplete(kind) {
        if (requestId !== panelRequestId || !panelState || kind !== 'translation') return
        panelState.loading = false
        renderPanel()
      },
      onError(error) {
        if (requestId !== panelRequestId || !panelState) return
        panelState.error = error
        panelState.loading = false
        renderPanel()
      }
    })
  } catch (error) {
    if (panelState) {
      panelState.loading = false
      panelState.error = error instanceof Error ? error.message : 'Unable to request translation.'
      renderPanel()
    }
  }
}

function closePanel() {
  panelRequestId += 1
  destroyPanelAudio()
  panelState = undefined
  shadow?.querySelector('.nt-panel')?.remove()
}

export function handleDocumentPointerDown(event: PointerEvent) {
  if (!panelState || !shadow) {
    return false
  }

  if (Date.now() < ignoreOutsideClicksUntil) {
    return false
  }

  const target = event.composedPath()[0]
  const isInsidePanel =
    target instanceof Node && Boolean(shadow.querySelector('.nt-panel')?.contains(target))

  if (!isInsidePanel) {
    closePanel()
    return true
  }

  return false
}

export function handleDocumentPointerMove(event: PointerEvent) {
  if (!dragState || !panelState) {
    return
  }

  panelState.position = clampPanelPosition({
    left: dragState.initialLeft + event.clientX - dragState.startX,
    top: dragState.initialTop + event.clientY - dragState.startY
  })

  const panel = shadow?.querySelector<HTMLElement>('.nt-panel')
  if (panel) {
    panel.style.left = `${panelState.position.left}px`
    panel.style.top = `${panelState.position.top}px`
  }
}

export function stopDragging() {
  dragState = undefined
}

function renderPanel() {
  if (!panelState) {
    return
  }

  const shadowRoot = ensureRoot()
  shadowRoot.querySelector('.nt-panel')?.remove()
  const panel = document.createElement('section')
  panel.className = 'nt-panel'
  setElementStyles(panel, {
    position: 'fixed',
    zIndex: '2147483647',
    boxSizing: 'border-box',
    pointerEvents: 'auto',
    width: 'min(360px, calc(100vw - 16px))',
    border: '1px solid #cbd5e1',
    borderRadius: '8px',
    background: '#f8fafc',
    color: '#172033',
    boxShadow: '0 18px 44px rgba(15, 23, 42, 0.2)',
    fontFamily: FONT_STACK,
    lineHeight: '1.5',
    overflow: 'hidden'
  })
  panel.style.left = `${panelState.position?.left ?? getInitialPanelPosition(panelState.selection.rect).left}px`
  panel.style.top = `${panelState.position?.top ?? getInitialPanelPosition(panelState.selection.rect).top}px`

  panel.append(renderHeader())

  if (panelState.loading) panel.append(renderStatus('Preparing translation...'))
  if (panelState.error) panel.append(renderError(panelState.error))
  if (panelState.translation) panel.append(renderTranslation(panelState.translation))
  if (preparedSelection) panel.append(renderActions(panelState.translation))
  if (panelState.translation) {
    panel.append(renderQuestionForm())
    if (panelState.answer) panel.append(renderAnswer(panelState.answer))
  }

  shadowRoot.append(panel)
}

function renderHeader() {
  const header = document.createElement('header')
  header.className = 'nt-header'
  setElementStyles(header, {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '16px',
    padding: '18px 18px 14px',
    borderBottom: '1px solid #e2e8f0',
    background: '#f8fafc',
    cursor: 'grab',
    userSelect: 'none',
    touchAction: 'none'
  })
  header.addEventListener('pointerdown', startDragging)
  const title = document.createElement('div')
  title.className = 'nt-title'
  title.textContent = 'Natural Translator'
  setElementStyles(title, {
    flex: '1',
    color: '#172033',
    fontSize: '22px',
    fontWeight: '800',
    lineHeight: '1.15'
  })
  const badge = document.createElement('span')
  badge.className = 'nt-badge'
  badge.textContent = panelState?.translation ? 'Ready' : 'Working'
  setElementStyles(badge, {
    borderRadius: '999px',
    background: '#dcfce7',
    color: '#166534',
    fontSize: '12px',
    fontWeight: '800',
    padding: '5px 9px',
    whiteSpace: 'nowrap'
  })
  const close = document.createElement('button')
  close.className = 'nt-icon-button'
  close.type = 'button'
  close.title = 'Close'
  close.textContent = 'x'
  setElementStyles(close, {
    width: '30px',
    height: '30px',
    border: '1px solid #cbd5e1',
    borderRadius: '6px',
    background: '#ffffff',
    color: '#475569',
    cursor: 'pointer',
    font: 'inherit',
    lineHeight: '1'
  })
  close.addEventListener('click', closePanel)
  header.append(title, badge, close)
  return header
}

function renderTranslation(translation: TranslationResult) {
  const wrapper = document.createElement('div')
  wrapper.className = 'nt-result'
  setInsetBlockStyles(wrapper)
  const label = document.createElement('div')
  label.className = 'nt-section-label'
  label.textContent = 'Translation'
  setLabelStyles(label)
  const translated = document.createElement('p')
  translated.className = 'nt-result-text'
  translated.textContent = translation.translatedText
  setElementStyles(translated, {
    border: '1px solid #cbd5e1',
    borderRadius: '6px',
    background: '#ffffff',
    color: '#172033',
    margin: '0',
    fontSize: '15px',
    lineHeight: '1.55',
    padding: '10px 11px',
    whiteSpace: 'pre-wrap'
  })
  wrapper.append(label, translated)

  const metaText = [translation.detectedLanguage, translation.notes].filter(Boolean).join(' - ')
  if (metaText) {
    const meta = document.createElement('p')
    meta.className = 'nt-meta'
    meta.textContent = metaText
    setElementStyles(meta, {
      margin: '8px 0 0',
      color: '#64748b',
      fontSize: '12px',
      lineHeight: '1.45'
    })
    wrapper.append(meta)
  }

  return wrapper
}

function renderActions(translation?: TranslationResult) {
  const group = document.createElement('div')
  group.className = 'nt-actions'
  setElementStyles(group, {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
    margin: '14px 18px'
  })
  if (preparedSelection?.voiceEnabled) {
    group.append(
      actionButton('Play original', () => playAudio('original')),
      actionButton('Play translation', () => playAudio('translation')),
      actionButton('Play default', playDefaultAudio),
      actionButton('Stop sound', stopPanelSound)
    )
  }
  if (translation) {
    group.append(
      actionButton('Copy', () =>
        navigator.clipboard.writeText(panelState?.translation?.translatedText || '')
      )
    )
  }

  if (panelState?.speaking) {
    const status = document.createElement('span')
    status.className = 'nt-speaking'
    status.textContent = panelState.audioPreparing ? 'Preparing audio...' : 'Playing audio...'
    status.setAttribute('role', 'status')
    setElementStyles(status, {
      alignSelf: 'center',
      color: '#64748b',
      fontSize: '12px'
    })
    group.append(status)
  }

  return group
}

function renderQuestionForm() {
  const form = document.createElement('form')
  form.className = 'nt-question'
  setElementStyles(form, {
    display: 'grid',
    gridTemplateColumns: '1fr auto',
    gap: '8px',
    margin: '14px 18px'
  })
  const label = document.createElement('label')
  label.className = 'nt-question-label'
  label.textContent = 'Follow-up question'
  setLabelStyles(label)
  label.style.gridColumn = '1 / -1'
  const input = document.createElement('input')
  input.type = 'text'
  input.placeholder = 'Ask about the selected text'
  input.value = panelState?.question || ''
  setInputStyles(input)
  input.addEventListener('input', () => {
    if (panelState) {
      panelState.question = input.value
    }
  })
  const submit = document.createElement('button')
  submit.type = 'submit'
  submit.textContent = 'Ask'
  setActionButtonStyles(submit)
  form.addEventListener('submit', (event) => {
    event.preventDefault()
    void askQuestion(input.value)
  })
  form.append(label, input, submit)
  return form
}

function renderAnswer(answer: string) {
  const wrapper = document.createElement('div')
  wrapper.className = 'nt-answer'
  wrapper.textContent = answer
  setElementStyles(wrapper, {
    borderTop: '1px solid #e2e8f0',
    color: '#172033',
    fontSize: '13px',
    lineHeight: '1.45',
    margin: '14px 18px',
    paddingTop: '12px',
    whiteSpace: 'pre-wrap'
  })
  return wrapper
}

function renderStatus(message: string) {
  const status = document.createElement('p')
  status.className = 'nt-status'
  status.textContent = message
  setElementStyles(status, {
    color: '#64748b',
    fontSize: '13px',
    lineHeight: '1.45',
    margin: '14px 18px'
  })
  return status
}

function renderError(message: string) {
  const error = document.createElement('p')
  error.className = 'nt-error'
  error.textContent = message
  setElementStyles(error, {
    border: '1px solid #fecaca',
    borderRadius: '6px',
    background: '#fef2f2',
    color: '#b42318',
    fontSize: '13px',
    lineHeight: '1.45',
    margin: '14px 18px',
    padding: '10px 11px'
  })
  return error
}

function actionButton(label: string, onClick: () => void | Promise<void>) {
  const button = document.createElement('button')
  button.type = 'button'
  button.textContent = label
  setActionButtonStyles(button)
  button.addEventListener('click', () => void onClick())
  return button
}

async function askQuestion(question: string) {
  const trimmedQuestion = question.trim()

  if (!panelState || !trimmedQuestion) {
    return
  }

  const requestId = panelRequestId
  const questionId = ++questionRequestId
  panelState.answer = undefined
  panelState.error = undefined
  renderPanel()

  try {
    const response = (await browser.runtime.sendMessage({
      type: 'ask',
      text: panelState.selection.text,
      question: trimmedQuestion
    })) as AskResponse

    if (requestId !== panelRequestId || questionId !== questionRequestId || !panelState) return
    if (response.ok) panelState.answer = response.data.answer
    else panelState.error = response.error
  } catch (error) {
    if (requestId !== panelRequestId || questionId !== questionRequestId || !panelState) return
    panelState.error =
      error instanceof Error ? error.message : 'Unable to ask a follow-up question.'
  }

  renderPanel()
}

function playDefaultAudio() {
  return playAudio(preparedSelection?.playbackMode || 'translation')
}

function stopPanelSound() {
  playbackId += 1
  stopAudio()
  if (panelState) {
    panelState.speaking = undefined
    panelState.audioPreparing = false
    renderPanel()
  }
}

async function playAudio(kind: 'original' | 'translation' | 'both') {
  if (!panelState || !preparedSelection) return
  stopAudio()
  const id = ++playbackId
  const prepared = preparedSelection
  panelState.speaking = kind
  panelState.error = undefined

  try {
    const sequence: AudioKind[] = kind === 'both' ? ['original', 'translation'] : [kind]
    for (const part of sequence) {
      if (id !== playbackId || !panelState) return
      panelState.playingKind = part
      panelState.audioPreparing = !prepared.hasAudio(part)
      renderPanel()
      await prepared.play(part)
    }
  } catch (error) {
    if (id === playbackId && panelState) {
      panelState.error = error instanceof Error ? error.message : 'Unable to play audio.'
    }
  } finally {
    if (id === playbackId && panelState) {
      panelState.speaking = undefined
      panelState.playingKind = undefined
      panelState.audioPreparing = false
      renderPanel()
    }
  }
}

function startDragging(event: PointerEvent) {
  if (!panelState || event.target instanceof HTMLButtonElement) {
    return
  }

  const position = panelState.position || getInitialPanelPosition(panelState.selection.rect)
  dragState = {
    startX: event.clientX,
    startY: event.clientY,
    initialLeft: position.left,
    initialTop: position.top
  }
  event.preventDefault()
}

function destroyPanelAudio() {
  playbackId += 1
  stopAudio()
  preparedSelection?.dispose()
  preparedSelection = undefined
}
