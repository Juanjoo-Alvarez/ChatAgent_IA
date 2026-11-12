import { useState } from "react";
import type { MessageCard } from "@agichat/core";
import { movieCardSchema } from "@agichat/protocol";

export function RecommendationCard({ card }: { readonly card: MessageCard }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const image = card.image;
  const safe = image !== null && movieCardSchema.shape.poster.safeParse(image.url).success;
  return <figure style={{ margin: "12px 0 0", minWidth: 0 }}>
    {image !== null && safe && failedUrl !== image.url
      ? <img src={image.url} alt={image.alt} loading="lazy" decoding="async" referrerPolicy="no-referrer"
          onError={() => setFailedUrl(image.url)} width={180} height={270}
          style={{ display: "block", width: "100%", maxWidth: 180, height: "auto", aspectRatio: "2 / 3", objectFit: "contain" }} />
      : <p style={{ margin: "8px 0", fontSize: "0.9em" }}>Póster no disponible</p>}
    <figcaption style={{ marginTop: 6, overflowWrap: "anywhere" }}>
      <strong>{card.title}</strong>{card.subtitle !== null && <span> · {card.subtitle}</span>}
    </figcaption>
  </figure>;
}
