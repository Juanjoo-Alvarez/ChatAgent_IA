import type { ReactElement } from "react";

// Ícono decorativo que identifica visualmente al agente.
export const AgentIcon = (): ReactElement => (
  <svg
    aria-hidden="true"
    focusable="false"
    viewBox="0 0 64 64"
    width="100%"
    height="100%"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="17" cy="19" r="9" fill="currentColor" stroke="none" />
    <circle cx="47" cy="19" r="9" fill="currentColor" stroke="none" />
    <path d="M12 31c0-12 8-19 20-19s20 7 20 19v8c0 12-8 19-20 19S12 51 12 39Z" fill="currentColor" stroke="none" />
    <ellipse cx="32" cy="42" rx="11" ry="9" fill="var(--agichat-avatar-ground, #e6efea)" stroke="none" />
    <circle cx="24" cy="30" r="2.3" fill="var(--agichat-avatar-ground, #e6efea)" stroke="none" />
    <circle cx="40" cy="30" r="2.3" fill="var(--agichat-avatar-ground, #e6efea)" stroke="none" />
    <path d="M28 39h8l-4 5Z" fill="currentColor" stroke="none" />
    <path d="M32 43v4" />
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
    <path d="M5 12h14m-6-6 6 6-6 6" />
  </svg>
);
