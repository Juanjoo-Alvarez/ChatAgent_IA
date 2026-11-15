/** Textos de ejemplo de la demo; el SDK recibe sugerencias por su API pública. */
export const moviePrompts = [
  {
    label: "Una película para hoy",
    description: "Encuentra tu próxima favorita.",
    prompt: "Recomiéndame una película. Me gustaría que primero me preguntaras por mis gustos."
  },
  {
    label: "Del libro a la pantalla",
    description: "Descubre qué cambió en la adaptación.",
    prompt: "Recomiéndame una película basada en un libro y compara la adaptación."
  },
  {
    label: "Un viaje de ciencia ficción",
    description: "Historias fuera de lo cotidiano.",
    prompt: "Recomiéndame una película de ciencia ficción."
  },
  {
    label: "Una película con libro",
    description: "Para quienes siempre quieren más historia.",
    prompt: "Recomiéndame una película basada en un libro que también valga la pena leer."
  }
] as const;
