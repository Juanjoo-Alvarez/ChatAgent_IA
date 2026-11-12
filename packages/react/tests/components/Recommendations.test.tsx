import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Message } from "@agichat/core";
import { RecommendationCard } from "../../src/components/RecommendationCard";
import { TmdbCredits } from "../../src/components/TmdbCredits";
import { MessageBubble } from "../../src/components/MessageBubble/MessageBubble";

const card = { id: "1", title: "Película con tildes", subtitle: "2020", image: { url: "https://image.tmdb.org/t/p/w500/poster.jpg", alt: "Póster de Película con tildes" } };
describe("Movie recommendations", () => {
  it("renders an accessible responsive poster and handles load failure", () => {
    render(<RecommendationCard card={card} />);
    const image = screen.getByAltText(card.image.alt);
    expect(image).toHaveAttribute("referrerpolicy", "no-referrer");
    expect(screen.getByText(card.title)).toBeVisible();
    fireEvent.error(image);
    expect(screen.getByText("Póster no disponible")).toBeVisible();
    expect(screen.queryByRole("img")).toBeNull();
  });
  it.each([null, { url: "javascript:alert(1)", alt: "Unsafe" }])("handles missing or disallowed images", (image) => {
    render(<RecommendationCard card={{ ...card, image, subtitle: null }} />);
    expect(screen.getByText("Póster no disponible")).toBeVisible();
    expect(screen.queryByRole("img")).toBeNull();
  });
  it("retries an image when the source changes", () => {
    const { rerender } = render(<RecommendationCard card={card} />);
    fireEvent.error(screen.getByRole("img"));
    rerender(<RecommendationCard card={{ ...card, image: { ...card.image, url: "https://image.tmdb.org/t/p/w500/other.jpg" } }} />);
    expect(screen.getByRole("img")).toHaveAttribute("src", expect.stringContaining("other.jpg"));
  });
  it("renders cards only on agent messages", () => {
    const props = { id: "m1", content: "Recomendación", status: "sent" as const, timestamp: new Date(), cards: [card] };
    const { rerender } = render(<MessageBubble message={new Message({ ...props, role: "user" })} />);
    expect(screen.queryByRole("img")).toBeNull();
    rerender(<MessageBubble message={new Message({ ...props, role: "agent" })} />);
    expect(screen.getByAltText(card.image.alt)).toBeVisible();
  });
  it("includes the official notice and an incorporated logo in credits", () => {
    render(<TmdbCredits />);
    expect(screen.getByLabelText("Créditos de TMDB")).toHaveTextContent("This product uses the TMDB API but is not endorsed or certified by TMDB.");
    expect(screen.getByRole("link")).toHaveAttribute("href", "https://www.themoviedb.org");
    expect(screen.getByAltText("The Movie Database (TMDB)")).toHaveAttribute("src", expect.stringContaining("data:image/svg+xml;base64,"));
  });
});
