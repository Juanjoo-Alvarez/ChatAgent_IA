import { TMDB_LOGO } from "./tmdbLogo";

/** El aviso oficial se conserva en inglés como exige TMDB. */
export function TmdbCredits() {
  return <aside aria-label="Créditos de TMDB" style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", fontSize: 12, lineHeight: 1.4 }}>
    <a href="https://www.themoviedb.org" target="_blank" rel="noopener noreferrer" style={{ flex: "0 0 auto" }}>
      <img src={TMDB_LOGO} alt="The Movie Database (TMDB)" width={70} style={{ display: "block", height: "auto" }} />
    </a>
    <p style={{ margin: 0 }}>This product uses the TMDB API but is not endorsed or certified by TMDB.</p>
  </aside>;
}
