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
reduce trabajo redundante; no garantiza baja latencia en CPU ni amplía el catálogo
de adaptaciones verificadas, que actualmente cubre Dune (2021).

Las pruebas automatizadas verifican reducción de contexto, conservación de datos,
errores, cierre de MCP y límites de herramientas. La calidad del modelo debe
comprobarse además con peticiones reales y revisión humana.
