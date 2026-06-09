import type { TranslationResult } from "@/lib/messages";

export type SelectionState = {
  text: string;
  rect: DOMRect;
};

export type PanelPosition = {
  left: number;
  top: number;
};

export type PanelState = {
  selection: SelectionState;
  position?: PanelPosition;
  translation?: TranslationResult;
  answer?: string;
  loading: boolean;
  error?: string;
  question: string;
  speaking?: "original" | "translation" | "both";
};

export type DragState = {
  startX: number;
  startY: number;
  initialLeft: number;
  initialTop: number;
};
