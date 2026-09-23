import type { ReactElement } from "react";

// Ícono decorativo que identifica visualmente al agente.
export const AgentIcon = (): ReactElement => (
  <svg
    aria-hidden="true"
    focusable="false"
    viewBox="0 0 24 24"
    width="20"
    height="20"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 3v3" />
    <circle cx="12" cy="2.5" r="1" fill="currentColor" stroke="none" />
    <rect x="4" y="6" width="16" height="13" rx="4" />
    <path d="M8 19v2M16 19v2M1.5 11v4M22.5 11v4" />
    <circle cx="9" cy="12" r="1" fill="currentColor" stroke="none" />
    <circle cx="15" cy="12" r="1" fill="currentColor" stroke="none" />
    <path d="M9 15.5h6" />
  </svg>
);

// Ícono decorativo del botón que envía el mensaje.
export const SendIcon = (): ReactElement => (
  <svg
    aria-hidden="true"
    focusable="false"
    viewBox="0 0 24 24"
    width="19"
    height="19"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="m22 2-7 20-4-9-9-4Z" />
    <path d="M22 2 11 13" />
  </svg>
);
