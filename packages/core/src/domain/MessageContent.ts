/** Contenido estructurado del chat, independiente de proveedores y de la UI. */
export interface MessageCard {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string | null;
  readonly image: { readonly url: string; readonly alt: string } | null;
}

export interface MessageReference {
  readonly provider: string;
  readonly id: string;
}

export interface ReferenceAction {
  readonly type: "open-reference";
  readonly reference: MessageReference;
}
