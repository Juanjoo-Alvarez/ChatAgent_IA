import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  ChatEngine,
  type ITransportAdapter,
  type Message,
  type ConnectionStatus,
  Session
} from "@agichat/core";
import { ReferenceNavigator } from "../browser/ReferenceNavigator";

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
  readonly connectionStatus: ConnectionStatus;
  readonly capabilityNotice: string | null;
  readonly mode: string | null;
  readonly sendMessage: (text: string) => Promise<void>;
}

interface ChatSnapshot {
  readonly messages: readonly Message[];
  readonly isAgentTyping: boolean;
  readonly connectionStatus: ConnectionStatus;
  readonly capabilityNotice: string | null;
  readonly mode: string | null;
  readonly transportError: Error | null;
}

const EMPTY_SNAPSHOT: ChatSnapshot = { messages: [], isAgentTyping: false, connectionStatus: "idle", capabilityNotice: null, mode: null, transportError: null };

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
    // La sesión solo cambia si cambia el objeto recibido o su identificador.
    () => session ?? new Session({ id: sessionId ?? "default-session" }),
    [session, sessionId]
  );

  const engineRef = useRef<ChatEngine | null>(null);
  const navigatorRef = useRef<ReferenceNavigator | null>(null);
  const sendingRef = useRef(false);
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
    // Cada combinación sesión/transporte posee exactamente un motor.
    const engine = new ChatEngine(resolvedSession, transport, {
      now: () => nowRef.current?.() ?? new Date(),
      createId: () => createIdRef.current?.() ?? defaultCreateId()
    });
    engineRef.current = engine;
    const navigator = new ReferenceNavigator();
    navigatorRef.current = navigator;
    sendingRef.current = false;
    setIsSending(false);
    setError(null);
    const unsubscribeActions = engine.onAction((event) => {
      try { navigator.accept(event); }
      catch (cause: unknown) { setError(toError(cause)); }
    });

    const unsubscribe = engine.onStateChange((state) => {
      setSnapshot({
        messages: state.messages,
        isAgentTyping: state.isAgentTyping,
        connectionStatus: state.connectionStatus,
        capabilityNotice: state.capabilityNotice,
        mode: state.mode,
        transportError: state.transportError
      });
    });

    return () => {
      // React ejecuta esta limpieza al desmontar o reemplazar dependencias.
      unsubscribe();
      unsubscribeActions();
      navigator.finish();
      navigatorRef.current = null;
      engine.dispose();
      engineRef.current = null;
    };
  }, [transport, resolvedSession]);

  const sendMessage = useCallback(async (text: string): Promise<void> => {
    const engine = engineRef.current;

    if (engine === null || sendingRef.current) {
      return;
    }

    setIsSending(true);
    sendingRef.current = true;
    setError(null);

    const navigator = navigatorRef.current;
    try {
      navigator?.begin(text, engine.getMessages().flatMap((message) => message.role === "agent" ? message.references : []));
      await engine.sendUserMessage(text);
    } catch (caughtError: unknown) {
      if (engineRef.current === engine) { setError(toError(caughtError)); }
    } finally {
      navigator?.finish();
      if (engineRef.current === engine) {
        sendingRef.current = false;
        setIsSending(false);
      }
    }
  }, []);

  return {
    messages: snapshot.messages,
    isAgentTyping: snapshot.isAgentTyping,
    isSending,
    error: error ?? snapshot.transportError,
    connectionStatus: snapshot.connectionStatus,
    capabilityNotice: snapshot.capabilityNotice,
    mode: snapshot.mode,
    sendMessage
  };
};
