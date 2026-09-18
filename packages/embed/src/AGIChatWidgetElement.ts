import {
  MockTransportAdapter,
  type ChatWidgetProps
} from "@agichat/react";

import { AGICHAT_WIDGET_TAG } from "./constants";
import { mountChatWidget, type UnmountChatWidget } from "./mountChatWidget";

export type AGIChatTransport = ChatWidgetProps["transport"];

const hostStyles = `
  :host {
    display: block;
    width: 100%;
    max-width: 420px;
  }

  [data-agichat-root] {
    width: 100%;
  }
`;

export class AGIChatWidgetElement extends HTMLElement {
  public static get observedAttributes(): string[] {
    return ["title", "session-id", "placeholder", "empty-state-message"];
  }

  private readonly mountTarget: HTMLDivElement;
  private unmountWidget: UnmountChatWidget | undefined;
  private injectedTransport: AGIChatTransport | undefined;
  private ownedTransport: MockTransportAdapter | undefined;

  public constructor() {
    super();

    const shadowRoot = this.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    this.mountTarget = document.createElement("div");

    style.textContent = hostStyles;
    this.mountTarget.dataset.agichatRoot = "";
    this.mountTarget.setAttribute("part", "container");
    shadowRoot.append(style, this.mountTarget);
  }

  public get transport(): AGIChatTransport {
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

  public connectedCallback(): void {
    this.renderWidget();
  }

  public disconnectedCallback(): void {
    this.teardownWidget();
    this.disposeOwnedTransport();
  }

  public attributeChangedCallback(
    _name: string,
    previousValue: string | null,
    nextValue: string | null
  ): void {
    if (previousValue === nextValue || !this.isConnected) {
      return;
    }

    this.renderWidget();
  }

  private getOwnedTransport(): MockTransportAdapter {
    this.ownedTransport ??= new MockTransportAdapter();
    return this.ownedTransport;
  }

  private renderWidget(): void {
    this.teardownWidget();

    const title = this.getAttribute("title");
    const sessionId = this.getAttribute("session-id");
    const placeholder = this.getAttribute("placeholder");
    const emptyStateMessage = this.getAttribute("empty-state-message");

    this.unmountWidget = mountChatWidget(this.mountTarget, {
      transport: this.transport,
      ...(title !== null ? { title } : {}),
      ...(sessionId !== null && sessionId.trim().length > 0
        ? { sessionId }
        : {}),
      ...(placeholder !== null ? { placeholder } : {}),
      ...(emptyStateMessage !== null ? { emptyStateMessage } : {})
    });
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
    return registeredElement;
  }

  registry.define(AGICHAT_WIDGET_TAG, AGIChatWidgetElement);
  return AGIChatWidgetElement;
};
