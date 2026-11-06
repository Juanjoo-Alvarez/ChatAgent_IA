// Tratamiento de texto externo. Los metadatos de TMDB se conservan como datos:
// aquí solo se quitan caracteres invisibles que pueden ocultar texto al lector
// humano y se detectan patrones que parecen instrucciones para un agente.

// - Controles C0 (excepto tabulación y saltos de línea), DEL y controles C1.
// - Marcas de incrustación, override y aislamiento bidireccional.
// - Espacio de ancho cero, unión de palabras y BOM.
// - "Tag characters" (U+E0000-U+E007F), usados para esconder texto ASCII.
// Se conservan ZWJ/ZWNJ y LRM/RLM porque tienen usos legítimos en varios idiomas.
const INVISIBLE_CHARACTERS =
  // eslint-disable-next-line no-control-regex
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u200B\u2060\uFEFF\u202A-\u202E\u2066-\u2069]|\uDB40[\uDC00-\uDC7F]/g;

export function stripInvisibleCharacters(value: string): string {
  return value.replace(INVISIBLE_CHARACTERS, "");
}

const INSTRUCTION_PATTERNS: readonly RegExp[] = [
  /\b(ignora|ignorar|olvida|omite|ignore|forget|disregard)\b.{0,40}\b(instrucciones|indicaciones|reglas|instructions|rules|prompt)\b/,
  /\b(system prompt|prompt (de|del) sistema|mensaje (de|del) sistema|developer message)\b/,
  /\b(ahora eres|eres ahora|actua como|you are now|act as)\b/,
  /\b(llama|ejecuta|invoca|usa|call|invoke|execute|run|use)\b.{0,30}\b(herramienta|tool|funcion|function|comando|command)\b/,
  /\b(revela|muestra|imprime|reveal|print|show)\b.{0,30}\b(prompt|instrucciones|instructions|secreto|secret|token|api key|clave)\b/,
  /<\/?\s*(system|assistant|user|instructions?|tool)\s*>/
];

function normalizeForDetection(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/**
 * Heurística para señalar texto que parece dirigido a un agente. No altera el
 * contenido ni lo bloquea: solo permite al consumidor tratarlo con más cuidado.
 * Puede tener falsos positivos (por ejemplo, la sinopsis de un thriller).
 */
export function looksLikeInstructions(value: string): boolean {
  const normalized = normalizeForDetection(value);
  return INSTRUCTION_PATTERNS.some((pattern) => pattern.test(normalized));
}
