import type { CSSProperties } from "react";
import type { AGIChatTheme } from "../../theme";

export const widgetStyle = (theme: AGIChatTheme, full: boolean): CSSProperties => ({
  "--agichat-ground": theme.widgetBackground,
  "--agichat-surface": theme.userBubbleBackground,
  "--agichat-border": theme.widgetBorder,
  "--agichat-control": theme.inputBorder,
  "--agichat-ink": theme.agentBubbleText,
  "--agichat-muted": theme.mutedText,
  "--agichat-accent": theme.accent,
  "--agichat-focus": theme.focusRing,
  "--agichat-avatar-ground": theme.agentAvatarBackground,
  "--agichat-radius": `${theme.widgetRadius}px`,
  display: "flex",
  flexDirection: "column",
  boxSizing: "border-box",
  width: full ? "100%" : "min(100%, 420px)",
  maxWidth: full ? "none" : 420,
  height: full ? "100%" : "min(680px, 100dvh)",
  minHeight: full ? 0 : "min(420px, 100dvh)",
  maxHeight: "100dvh",
  border: `1px solid ${theme.widgetBorder}`,
  borderRadius: theme.widgetRadius,
  overflow: "hidden",
  backgroundColor: theme.widgetBackground,
  fontFamily: theme.fontFamily,
  boxShadow: theme.widgetShadow,
  color: theme.agentBubbleText,
  fontSize: theme.fontSize
} as CSSProperties);

export const widgetCss = `
.agichat-widget *, .agichat-widget *::before, .agichat-widget *::after { box-sizing: border-box; }
.agichat-widget button, .agichat-widget textarea { font: inherit; }
.agichat-widget button:focus-visible, .agichat-widget a:focus-visible {
  outline: 3px solid var(--agichat-accent); outline-offset: 4px;
}
.agichat-widget button { -webkit-tap-highlight-color: transparent; }
.agichat-widget__header {
  display: flex; align-items: center; gap: 12px; padding: 20px;
  border-bottom: 1px solid var(--agichat-border); flex: 0 0 auto;
}
.agichat-widget__avatar {
  display: grid; place-items: center; width: 38px; height: 38px; padding: 5px;
  border-radius: 50%; flex: 0 0 auto;
}
.agichat-widget__heading { min-width: 0; flex: 1; }
.agichat-widget__title { display: block; font-size: 15px; font-weight: 600; line-height: 1.4; }
.agichat-widget__subtitle { display: flex; align-items: center; gap: 6px; font-size: 12px; line-height: 1.5; }
.agichat-widget__online-indicator { width: 6px; height: 6px; border-radius: 50%; flex: 0 0 auto; }
.agichat-widget__notice { margin: 0; padding: 10px 20px; font-size: 12px; color: var(--agichat-muted); }
.agichat-widget__messages {
  flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain;
  scrollbar-width: thin; scrollbar-color: var(--agichat-control) transparent;
}
.agichat-widget__thread {
  display: flex; flex-direction: column; gap: 24px;
  width: 100%; max-width: 800px; margin: 0 auto; padding: 24px 20px;
}
.agichat-widget__messages--empty { display: flex; flex-direction: column; }
.agichat-widget__credits { width: 100%; max-width: 800px; margin: 0 auto; padding: 0 20px 16px; }
.agichat-widget__messages:focus-visible { outline: 2px solid var(--agichat-accent); outline-offset: -3px; }
.agichat-welcome {
  width: 100%; max-width: 680px; margin: auto; padding: 28px 20px;
  text-align: center;
}
.agichat-welcome__avatar {
  display: grid; place-items: center; width: 76px; height: 76px; padding: 12px;
  margin: 0 auto 20px; border-radius: 50%;
}
.agichat-welcome__title { margin: 0; font-size: 26px; font-weight: 500; letter-spacing: -0.04em; line-height: 1.2; }
.agichat-welcome__description { max-width: 370px; margin: 12px auto 0; font-size: 14px; line-height: 1.65; color: var(--agichat-muted); }
.agichat-welcome__suggestions { display: grid; grid-template-columns: 1fr; gap: 10px; margin-top: 28px; }
.agichat-welcome__suggestion {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  width: 100%; padding: 14px 16px; border: 1px solid var(--agichat-border);
  border-radius: 14px; text-align: left; color: var(--agichat-ink);
  background: var(--agichat-ground); cursor: pointer; transition: border-color 150ms ease, background-color 150ms ease;
}
.agichat-welcome__suggestion:hover { background: var(--agichat-surface); border-color: var(--agichat-control); }
.agichat-welcome__suggestion:active { transform: translateY(1px); }
.agichat-welcome__suggestion strong { display: block; font-size: 14px; font-weight: 500; line-height: 1.45; }
.agichat-welcome__suggestion small { display: block; margin-top: 4px; font-size: 12px; line-height: 1.4; color: var(--agichat-muted); }
.agichat-welcome__suggestion svg { width: 18px; height: 18px; flex: 0 0 auto; color: var(--agichat-muted); }
.agichat-widget__composer { flex: 0 0 auto; width: 100%; max-width: 800px; margin: 0 auto; padding: 0 16px 16px; }
.agichat-widget__input-hint { margin: 10px 0 0; font-size: 11px; text-align: center; color: var(--agichat-muted); line-height: 1.5; }
.agichat-widget__typing { display: flex; align-items: center; gap: 8px; padding: 8px 20px 16px; margin: 0 auto; width: 100%; max-width: 800px; font-size: 12px; color: var(--agichat-muted); }
.agichat-widget__typing-dots { display: inline-flex; align-items: center; gap: 3px; }
.agichat-widget__typing-dot { width: 4px; height: 4px; border-radius: 50%; background: currentColor; animation: agichat-pulse 1.2s ease-in-out infinite; }
.agichat-widget__typing-dot:nth-child(2) { animation-delay: 150ms; }
.agichat-widget__typing-dot:nth-child(3) { animation-delay: 300ms; }
.agichat-widget__error { margin: 0 16px 12px; padding: 12px 16px; border-radius: 12px; font-size: 12px; line-height: 1.5; }
.agichat-input-bar__textarea::placeholder { color: var(--agichat-muted, #626d67); opacity: 1; }
.agichat-input-bar__send:hover:enabled { filter: brightness(.9); }
.agichat-input-bar__send:active:enabled { transform: scale(.95); }
.agichat-message__content { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.agichat-message__content pre { max-width: 100%; overflow-x: auto; }
.agichat-message__content h1, .agichat-message__content h2, .agichat-message__content h3,
.agichat-message__content h4, .agichat-message__content h5, .agichat-message__content h6 { font-size: 1.1em; margin: 4px 0; }
.agichat-widget--full .agichat-widget__header { padding: 20px 28px; }
.agichat-widget--full .agichat-welcome__avatar { width: 88px; height: 88px; padding: 14px; margin-bottom: 24px; }
.agichat-widget--full .agichat-welcome__title { font-size: 32px; }
.agichat-widget--full .agichat-welcome__description { font-size: 16px; }
.agichat-widget--full .agichat-welcome__suggestions { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-top: 32px; }
.agichat-widget--full .agichat-welcome__suggestion { min-height: 82px; padding: 16px 18px; }
.agichat-widget--full .agichat-widget__composer { padding-bottom: 20px; }
@keyframes agichat-pulse { 0%, 100% { opacity: .35; } 50% { opacity: 1; } }
@media (max-width: 560px) {
  .agichat-widget--full .agichat-widget__header { padding: 14px 18px; }
  .agichat-widget--full .agichat-welcome { padding: 24px 20px; }
  .agichat-widget--full .agichat-welcome__avatar { width: 68px; height: 68px; padding: 10px; margin-bottom: 18px; }
  .agichat-widget--full .agichat-welcome__title { font-size: 26px; }
  .agichat-widget--full .agichat-welcome__description { font-size: 14px; }
  .agichat-widget--full .agichat-welcome__suggestions { grid-template-columns: 1fr; gap: 8px; margin-top: 24px; }
  .agichat-widget--full .agichat-welcome__suggestion { min-height: 62px; padding: 12px 14px; }
  .agichat-widget--full .agichat-welcome__suggestion small { display: none; }
  .agichat-widget--full .agichat-widget__composer { padding: 0 14px max(14px, env(safe-area-inset-bottom)); }
  .agichat-widget__thread { padding: 24px 16px; }
  .agichat-widget__input-hint { font-size: 11px; }
}
@media (prefers-reduced-motion: reduce) {
  .agichat-widget *, .agichat-widget *::before, .agichat-widget *::after { animation: none !important; transition: none !important; }
}
`;
