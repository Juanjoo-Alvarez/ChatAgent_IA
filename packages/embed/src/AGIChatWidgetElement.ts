import {
  MockTransportAdapter,
  type ChatWidgetProps
} from "@agichat/react";
import { WebSocketTransportAdapter } from "@agichat/transport-websocket";

import { AGICHAT_WIDGET_TAG } from "./constants";
import { mountChatWidget, updateChatWidget, type UnmountChatWidget } from "./mountChatWidget";

export type AGIChatTransport = ChatWidgetProps["transport"];
export type AGIChatWidgetTheme = NonNullable<ChatWidgetProps["theme"]>;

const hostStyles = `
  :host {
    display: block;
    width: 100%;
    max-width: 420px;
  }

  [data-agichat-root] {
    width: 100%;
  }

  :host([layout="full"]) { max-width: none; height: 100%; }
  :host([layout="full"]) [data-agichat-root] { height: 100%; }
`;

/** Web Component que encapsula el widget y lo expone a sitios sin React. */
export class AGIChatWidgetElement extends HTMLElement {
  public static get observedAttributes(): string[] {
    // El navegador invoca attributeChangedCallback solo para esta lista.
    return ["title", "session-id", "placeholder", "welcome-title", "empty-state-message", "layout", "websocket-url", "tmdb-credits"];
  }

  private readonly mountTarget: HTMLDivElement;
  private unmountWidget: UnmountChatWidget | undefined;
  private injectedTransport: AGIChatTransport | undefined;
  private ownedTransport: MockTransportAdapter | WebSocketTransportAdapter | undefined;
  private themeOverride: AGIChatWidgetTheme | undefined;
  private welcomeSuggestions: NonNullable<ChatWidgetProps["suggestions"]> = [];

  public constructor() {
    super();

    // Shadow DOM aísla los estilos del SDK de los estilos de la página host.
    const shadowRoot = this.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    this.mountTarget = document.createElement("div");

    style.textContent = hostStyles;
    this.mountTarget.dataset.agichatRoot = "";
    this.mountTarget.setAttribute("part", "container");
    shadowRoot.append(style, this.mountTarget);
  }

  public get transport(): AGIChatTransport {
    // El transporte inyectado pertenece al consumidor; el predeterminado, al elemento.
    return this.injectedTransport ?? this.getOwnedTransport();
  }

  public set transport(value: AGIChatTransport | undefined) {
    if (this.injectedTransport === value) {
      return;
    }

    this.disposeOwnedTransport();
    this.injectedTransport = value;

    if (this.isConnected) {
      this.renderWidget();
    }
  }

  public get theme(): AGIChatWidgetTheme | undefined {
    return this.themeOverride;
  }

  public set theme(value: AGIChatWidgetTheme | undefined) {
    if (this.themeOverride === value) {
      return;
    }

    this.themeOverride = value;

    if (this.isConnected) {
      this.renderWidget();
    }
  }

  public connectedCallback(): void {
    // connectedCallback es el punto de montaje estándar de Web Components.
    this.renderWidget();
  }

  public get suggestions(): NonNullable<ChatWidgetProps["suggestions"]> {
    return this.welcomeSuggestions;
  }

  public set suggestions(value: NonNullable<ChatWidgetProps["suggestions"]>) {
    this.welcomeSuggestions = value;
    if (this.isConnected) { this.renderWidget(); }
  }

  public disconnectedCallback(): void {
    // Solo se elimina el transporte creado por el componente; uno inyectado
    // sigue perteneciendo al consumidor y puede reutilizarse en otro widget.
    this.teardownWidget();
    this.disposeOwnedTransport();
  }

  public attributeChangedCallback(
    name: string,
    previousValue: string | null,
    nextValue: string | null
  ): void {
    if (previousValue === nextValue) {
      return;
    }

    if (name === "websocket-url" || name === "session-id") { this.disposeOwnedTransport(); }
    if (this.isConnected) { this.renderWidget(); }
  }

  private getOwnedTransport(): MockTransportAdapter | WebSocketTransportAdapter {
    const endpoint = this.getAttribute("websocket-url");
    this.ownedTransport ??= endpoint === null
      ? new MockTransportAdapter()
      : new WebSocketTransportAdapter({ url: endpoint });
    return this.ownedTransport;
  }

  private renderWidget(): void {
    const title = this.getAttribute("title");
    const sessionId = this.getAttribute("session-id");
    const placeholder = this.getAttribute("placeholder");
    const emptyStateMessage = this.getAttribute("empty-state-message");
    const welcomeTitle = this.getAttribute("welcome-title");

    const props: ChatWidgetProps = {
      transport: this.transport,
      ...(this.hasAttribute("tmdb-credits") ? { showTmdbCredits: true } : {}),
      suggestions: this.welcomeSuggestions,
      layout: this.getAttribute("layout") === "full" ? "full" : "widget",
      ...(title !== null ? { title } : {}),
      ...(sessionId !== null && sessionId.trim().length > 0
        ? { sessionId }
        : {}),
      ...(placeholder !== null ? { placeholder } : {}),
      ...(emptyStateMessage !== null ? { emptyStateMessage } : {}),
      ...(welcomeTitle !== null ? { welcomeTitle } : {}),
      ...(this.themeOverride !== undefined ? { theme: this.themeOverride } : {})
    };
    if (!updateChatWidget(this.mountTarget, props)) {
      this.unmountWidget = mountChatWidget(this.mountTarget, props);
    }
  }

  private teardownWidget(): void {
    this.unmountWidget?.();
    this.unmountWidget = undefined;
  }

  private disposeOwnedTransport(): void {
    this.ownedTransport?.dispose();
    this.ownedTransport = undefined;
  }
}

export const registerAGIChatWidget = (
  registry: CustomElementRegistry = globalThis.customElements
): CustomElementConstructor => {
  const registeredElement = registry.get(AGICHAT_WIDGET_TAG);

  if (registeredElement !== undefined) {
    // Registrar dos veces el mismo tag lanza en el navegador. Devolver la
    // definición existente hace segura la carga repetida del bundle.
    return registeredElement;
  }

  registry.define(AGICHAT_WIDGET_TAG, AGIChatWidgetElement);
  return AGIChatWidgetElement;
};
