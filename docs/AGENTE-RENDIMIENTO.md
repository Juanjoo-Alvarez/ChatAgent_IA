# Rendimiento del agente local

El servidor puede estar en línea aunque el modelo tarde en responder. El turno
incluye descubrimiento MCP, una o más inferencias y consultas a proveedores.
El adaptador actual espera la respuesta completa de Ollama, sin streaming.

## Diagnóstico local

En el equipo de prueba, Qwen de 4B se ejecuta en CPU porque la ejecución CUDA
falla con `the provided PTX was compiled with an unsupported toolchain`.
La variante local `agichat-qwen3-cpu` conserva el modelo y fija `num_gpu=0`.
Este nombre es una configuración local, no un modelo que se descarga del catálogo.

La comparación MCP de Dune respondió en menos de un segundo con caché disponible.
Una inferencia breve sin herramientas tardó 21,5 segundos, incluidos 7,6 segundos
de carga del modelo. Estos valores no son un benchmark de producción.
No ejecutar cobertura o builds mientras se mide el modelo: compiten por CPU y RAM.

Con los cambios y sin ejecutar tests en paralelo, la petición explícita de comparar
TMDB `438631` con Google Books `q_5WzQEACAAJ` terminó en **94,5 segundos**:
47,3 s para elegir la herramienta y 47,0 s para redactar. La respuesta tuvo tres
frases y una referencia de Google Books. Esta ejecución comprueba funcionamiento,
pero la latencia continúa siendo alta; no existe una medición anterior equivalente
que permita afirmar un porcentaje de aceleración.

## Cambios

- Respuestas normalmente de tres a cinco frases y límite de generación de 384
  tokens por llamada, manteniendo el contexto de 8192.
- El contexto del LLM omite URLs de presentación, pósteres e identificadores
  bibliográficos redundantes. Conserva fuentes, afirmaciones, límites y procedencia.
  Las tarjetas y referencias del widget se extraen antes de esa reducción.
- Una comparación identificada y exitosa pasa a redacción final sin ofrecer
  nuevamente todas las herramientas. Los errores y coincidencias inciertas
  permiten continuar investigando. Solicitar comparaciones independientes en turnos separados.
- Las instrucciones distinguen fallo de consulta, ausencia de resultados y
  ausencia de evidencia; identificar una adaptación no acredita fidelidad.

Reiniciar la API con `pnpm dev:api` para cargar los cambios compilados. La mejora
reduce trabajo redundante y no garantiza baja latencia en CPU. El catálogo de
adaptaciones verificadas cubre Dune (2021) y The Hunger Games (2012).

Las pruebas automatizadas verifican reducción de contexto, conservación de datos,
errores, cierre de MCP y límites de herramientas. La calidad del modelo debe
comprobarse además con peticiones reales y revisión humana.

## Comparación de modelos Groq

Prueba manual del 18/11/2026 con las mismas dos peticiones, MCP con TMDB y
Google Books habilitados, y el plan gratuito de Groq (8000 tokens por minuto
para los tres modelos). Una sola ejecución por caso: no es un benchmark.

| Modelo | «Recomiéndame una película de ciencia ficción» | «Compara la película Dune de 2021 con el libro de Frank Herbert» |
|---|---|---|
| Ollama `qwen3:4b-instruct-2507-q4_K_M` (local, GPU parcial) | 57 s | 158 s, completa |
| `openai/gpt-oss-20b` | 2,8 s | Falla: inventó el ID `11322`, repitió `search_movies("Dune 2021")` y agotó los 5 pasos (`limit_exceeded`) |
| `openai/gpt-oss-120b` | 32 s | 21–30 s, completa con IDs correctos (`438631`, `JhJ7cgAACAAJ`) |
| `qwen/qwen3.8-27b` | 4 s | 58 s, completa |

La mayor parte del tiempo en Groq corresponde a esperas por la cuota de tokens
por minuto, no a la inferencia: cada paso reenvía instrucciones, las seis
herramientas y los resultados acumulados. Ejecutar turnos consecutivos puede
devolver `rate_limited`.

Por eso el valor predeterminado pasa a `openai/gpt-oss-120b`. Observaciones de
calidad que requieren revisión humana:

- `gpt-oss-20b` afirmó fidelidad de una adaptación sin llamar a
  `compare_movie_book`.
- `gpt-oss-120b` añadió detalles no respaldados por las herramientas (por
  ejemplo, «religión del agua» o «espectacularidad visual»).
- `qwen3.8-27b` fue el más prudente con la evidencia, pero consumió más contexto
  y esperó más por la cuota en la comparación.
