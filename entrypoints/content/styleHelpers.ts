export function setElementStyles(
  element: HTMLElement,
  stylesToApply: Partial<CSSStyleDeclaration>,
) {
  Object.assign(element.style, stylesToApply);
}

export function setInsetBlockStyles(element: HTMLElement) {
  setElementStyles(element, {
    margin: "14px 18px",
  });
}

export function setLabelStyles(element: HTMLElement) {
  setElementStyles(element, {
    display: "block",
    color: "#334155",
    fontSize: "13px",
    fontWeight: "700",
    margin: "0 0 6px",
  });
}

export function setActionButtonStyles(button: HTMLButtonElement) {
  setElementStyles(button, {
    border: "1px solid #cbd5e1",
    borderRadius: "6px",
    background: "#ffffff",
    color: "#172033",
    cursor: "pointer",
    font: "inherit",
    fontSize: "12px",
    fontWeight: "700",
    minHeight: "34px",
    padding: "7px 11px",
  });
}

export function setInputStyles(input: HTMLInputElement) {
  setElementStyles(input, {
    minWidth: "0",
    border: "1px solid #cbd5e1",
    borderRadius: "6px",
    color: "#172033",
    background: "#ffffff",
    font: "inherit",
    fontSize: "13px",
    minHeight: "38px",
    padding: "0 10px",
  });
  input.addEventListener("focus", () => {
    input.style.borderColor = "#2563eb";
    input.style.outline = "2px solid rgba(37, 99, 235, 0.22)";
  });
  input.addEventListener("blur", () => {
    input.style.borderColor = "#cbd5e1";
    input.style.outline = "none";
  });
}
