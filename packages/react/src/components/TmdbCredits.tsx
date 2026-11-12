import { TMDB_LOGO } from "./tmdbLogo";

/** El aviso oficial se conserva en inglés como exige TMDB. */
export function TmdbCredits() {
  return <aside aria-label="Créditos de TMDB" style={{ padding: "8px 16px", fontSize: 12, lineHeight: 1.4 }}>
    <a href="https://www.themoviedb.org" target="_blank" rel="noopener noreferrer">
      <img src={TMDB_LOGO} alt="The Movie Database (TMDB)" width={90} style={{ display: "block", height: "auto", marginBottom: 6 }} />
    </a>
    <p style={{ margin: 0 }}>This product uses the TMDB API but is not endorsed or certified by TMDB.</p>
  </aside>;
}
