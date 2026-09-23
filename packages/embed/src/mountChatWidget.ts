import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";

import { ChatWidget, type ChatWidgetProps } from "@agichat/react";

export type ChatWidgetTarget = Element | DocumentFragment | string;
export type UnmountChatWidget = () => boolean;

type ResolvedTarget = Element | DocumentFragment;

// WeakMap evita retener nodos desmontados y también impide montar dos raíces
// de React sobre el mismo elemento.
const mountedRoots = new WeakMap<ResolvedTarget, Root>();

const resolveTarget = (target: ChatWidgetTarget): ResolvedTarget => {
  // Elementos ya resueltos pueden usarse directamente.
  if (typeof target !== "string") {
    return target;
  }

  if (typeof document === "undefined") {
    throw new Error("AGIChat requires a browser document to resolve a selector");
  }

  const element = document.querySelector(target);

  // Fallar temprano produce un error más claro que createRoot(null).
  if (element === null) {
    throw new Error(`AGIChat mount target was not found: ${target}`);
  }

  return element;
};

const unmountResolvedTarget = (target: ResolvedTarget): boolean => {
  const root = mountedRoots.get(target);

  if (root === undefined) {
    return false;
  }

  root.unmount();
  mountedRoots.delete(target);
  return true;
};

export const mountChatWidget = (
  target: ChatWidgetTarget,
  props: ChatWidgetProps
): UnmountChatWidget => {
  const resolvedTarget = resolveTarget(target);

  if (mountedRoots.has(resolvedTarget)) {
    throw new Error("AGIChat is already mounted in the provided target");
  }

  const root = createRoot(resolvedTarget);
  mountedRoots.set(resolvedTarget, root);
  root.render(createElement(ChatWidget, props));

  // La misma función resuelve el ciclo de vida sin obligar al consumidor a
  // conservar detalles internos de React.
  return () => unmountResolvedTarget(resolvedTarget);
};

export const unmountChatWidget = (target: ChatWidgetTarget): boolean =>
  unmountResolvedTarget(resolveTarget(target));
