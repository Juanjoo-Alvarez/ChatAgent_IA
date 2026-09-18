import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  ChatEngine,
  type ITransportAdapter,
  type Message,
  Session
} from "@agichat/core";

export interface UseChatOptions {
  readonly transport: ITransportAdapter;
  readonly session?: Session;
  readonly sessionId?: string;
  readonly now?: () => Date;
  readonly createId?: () => string;
}

export interface UseChatResult {
  readonly messages: readonly Message[];
  readonly isAgentTyping: boolean;
  readonly isSending: boolean;
  readonly error: Error | null;
  readonly sendMessage: (text: string) => Promise<void>;
}

interface ChatSnapshot {
  readonly messages: readonly Message[];
  readonly isAgentTyping: boolean;
}

const EMPTY_SNAPSHOT: ChatSnapshot = { messages: [], isAgentTyping: false };

const toError = (value: unknown): Error =>
  value instanceof Error ? value : new Error(String(value));

const defaultCreateId = (): string => {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

/**
 * Puente entre la UI de React y `ChatEngine` de packages/core. No reimplementa
 * lógica de dominio: solo crea/gestiona el ciclo de vida del engine para el
 * `transport` recibido y expone su estado como estado de React.
 */
export const useChat = (options: UseChatOptions): UseChatResult => {
  const { transport, session, sessionId, now, createId } = options;

  const resolvedSession = useMemo(
    () => session ?? new Session({ id: sessionId ?? "default-session" }),
    [session, sessionId]
  );

  const engineRef = useRef<ChatEngine | null>(null);
  const [snapshot, setSnapshot] = useState<ChatSnapshot>(EMPTY_SNAPSHOT);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // `now`/`createId` pueden llegar como funciones inline y cambiar de
  // referencia en cada render; se leen desde un ref para no reiniciar el
  // engine (y perder mensajes) cada vez que el consumidor re-renderiza.
  const nowRef = useRef(now);
  nowRef.current = now;
  const createIdRef = useRef(createId);
  createIdRef.current = createId;

  useEffect(() => {
    const engine = new ChatEngine(resolvedSession, transport, {
      now: () => nowRef.current?.() ?? new Date(),
      createId: () => createIdRef.current?.() ?? defaultCreateId()
    });
    engineRef.current = engine;

    const unsubscribe = engine.onStateChange((state) => {
      setSnapshot({
        messages: state.messages,
        isAgentTyping: state.isAgentTyping
      });
    });

    return () => {
      unsubscribe();
      engine.dispose();
      engineRef.current = null;
    };
  }, [transport, resolvedSession]);

  const sendMessage = useCallback(async (text: string): Promise<void> => {
    const engine = engineRef.current;

    if (engine === null) {
      return;
    }

    setIsSending(true);
    setError(null);

    try {
      await engine.sendUserMessage(text);
    } catch (caughtError: unknown) {
      setError(toError(caughtError));
    } finally {
      setIsSending(false);
    }
  }, []);

  return {
    messages: snapshot.messages,
    isAgentTyping: snapshot.isAgentTyping,
    isSending,
    error,
    sendMessage
  };
};
