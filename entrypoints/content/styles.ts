export const styles = `
  :host {
    all: initial;
    color-scheme: light;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-synthesis: none;
    line-height: 1.5;
    text-rendering: optimizeLegibility;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  button,
  input {
    font: inherit;
  }

  .nt-panel {
    position: fixed;
    z-index: 2147483647;
    box-sizing: border-box;
    pointer-events: auto;
    width: min(360px, calc(100vw - 16px));
    border: 1px solid #cbd5e1;
    border-radius: 8px;
    background: #f8fafc;
    color: #172033;
    box-shadow: 0 18px 44px rgba(15, 23, 42, 0.2);
    overflow: hidden;
  }

  .nt-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    padding: 18px 18px 14px;
    border-bottom: 1px solid #e2e8f0;
    background: #f8fafc;
    cursor: grab;
    user-select: none;
    touch-action: none;
  }

  .nt-title {
    flex: 1;
    color: #172033;
    font-size: 22px;
    line-height: 1.15;
    font-weight: 800;
  }

  .nt-badge {
    border-radius: 999px;
    background: #dcfce7;
    color: #166534;
    font-size: 12px;
    font-weight: 800;
    padding: 5px 9px;
    white-space: nowrap;
  }

  .nt-icon-button {
    width: 30px;
    height: 30px;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    background: #ffffff;
    color: #475569;
    cursor: pointer;
    line-height: 1;
  }

  .nt-icon-button:hover {
    border-color: #94a3b8;
    background: #f8fafc;
  }

  .nt-result,
  .nt-status,
  .nt-error,
  .nt-answer,
  .nt-question,
  .nt-actions {
    margin: 14px 18px;
  }

  .nt-section-label,
  .nt-question-label {
    display: block;
    color: #334155;
    font-size: 13px;
    font-weight: 700;
    margin: 0 0 6px;
  }

  .nt-result-text {
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    background: #ffffff;
    color: #172033;
    margin: 0;
    font-size: 15px;
    line-height: 1.55;
    padding: 10px 11px;
    white-space: pre-wrap;
  }

  .nt-meta {
    margin: 8px 0 0;
    color: #64748b;
    font-size: 12px;
    line-height: 1.45;
  }

  .nt-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .nt-actions button,
  .nt-question button {
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    background: #ffffff;
    color: #172033;
    cursor: pointer;
    font-size: 12px;
    font-weight: 700;
    min-height: 34px;
    padding: 7px 11px;
  }

  .nt-actions button:hover,
  .nt-question button:hover {
    border-color: #2563eb;
    background: #eff6ff;
  }

  .nt-question {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 8px;
  }

  .nt-question-label {
    grid-column: 1 / -1;
  }

  .nt-question input {
    min-width: 0;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    color: #172033;
    background: #ffffff;
    font-size: 13px;
    min-height: 38px;
    padding: 0 10px;
  }

  .nt-question input:focus {
    border-color: #2563eb;
    outline: 2px solid rgba(37, 99, 235, 0.22);
  }

  .nt-status,
  .nt-answer {
    font-size: 13px;
    line-height: 1.45;
  }

  .nt-status {
    color: #64748b;
  }

  .nt-error {
    border: 1px solid #fecaca;
    border-radius: 6px;
    background: #fef2f2;
    color: #b42318;
    font-size: 13px;
    line-height: 1.45;
    padding: 10px 11px;
  }

  .nt-answer {
    border-top: 1px solid #e2e8f0;
    color: #172033;
    padding-top: 12px;
    white-space: pre-wrap;
  }

  .nt-speaking {
    align-self: center;
    color: #64748b;
    font-size: 12px;
  }
`;
