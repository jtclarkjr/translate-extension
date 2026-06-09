import type { ContentRequest } from "@/lib/messages";
import { MAX_SELECTION_CHARS } from "./content/constants";
import { getFallbackRect, getSelectionState } from "./content/layout";
import {
  handleDocumentPointerDown,
  handleDocumentPointerMove,
  openPanelFromText,
  removeFloatingButtons,
  stopDragging,
} from "./content/panel";

export default defineContentScript({
  matches: ["<all_urls>"],
  main() {
    removeFloatingButtons();
    document.addEventListener("pointerdown", handleDocumentPointerDown, true);
    document.addEventListener("pointermove", handleDocumentPointerMove, true);
    document.addEventListener("pointerup", stopDragging, true);
    document.addEventListener("pointercancel", stopDragging, true);
    browser.runtime.onMessage.addListener((message: ContentRequest) => {
      if (message.type === "open-selection-panel") {
        openPanelFromMessage(message.text);
      }
    });
  },
});

function openPanelFromMessage(text: string) {
  const currentSelection = getSelectionState(MAX_SELECTION_CHARS);
  void openPanelFromText(text, currentSelection?.rect || getFallbackRect());
}
