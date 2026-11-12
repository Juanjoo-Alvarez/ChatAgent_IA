# Referencias y créditos del widget

El widget reserva una pestaña durante el envío explícito del usuario, antes de
esperar al backend. Solo lo hace para `Abre IMDb`, `Abre Google Books` o `Open IMDb`
(también admite `Por favor, abre…` y un identificador después del proveedor).
La referencia debe haber aparecido en un mensaje anterior del agente en esa
misma instancia. Si hay varias, indicar el identificador para elegir una.

La reserva comienza en `about:blank` y se desvincula de `window.opener`.
Una acción estructurada `open-reference` debe coincidir con la referencia
solicitada. La URL final se construye con `referenceUrl` del protocolo; no se
ejecutan URLs ni instrucciones extraídas del Markdown. Las acciones repetidas
se descartan. Error, fin de turno sin acción o desmontaje cierran la reserva.
El transporte valida por separado el identificador de la petición recibida.

## Comprobación manual en navegador

La demo utiliza el transporte WebSocket; ver [WIDGET-INTEGRACION.md](./WIDGET-INTEGRACION.md).
El recorrido requiere referencias reales en la conversación. El modo fixture actual del backend no aporta referencias
reales ni pósteres; los tests usan datos controlados para esos casos.

1. Pedir una recomendación y comprobar título, año, póster y créditos visibles.
2. Probar un póster ausente o con carga fallida: debe aparecer `Póster no disponible`.
3. Pedir la comparación con el libro y después `Abre Google Books`.
4. Escribir `Abre IMDb` para una película con referencia identificada. La pestaña
   debe abrirse durante el envío y navegar después de la respuesta, sin pulsar un enlace.
5. Si el navegador bloquea la reserva, permitir ventanas emergentes para el
   origen de la demo y repetir el comando. No se cambian permisos automáticamente.
6. Comprobar que una referencia desconocida, una petición ambigua y una URL en el
   texto no abran pestañas. Simular un error y desmontar: no deben quedar reservas.
7. Repetir con dos widgets, teclado (Enter), pantalla estrecha y zoom al 200%.

Los tests automatizados cubren la reserva, validación, bloqueo simulado, errores,
deduplicación y limpieza. La revisión visual y el comportamiento de ventanas en
un navegador real están pendientes: el host de navegador no estuvo disponible
durante la implementación. No se ha demostrado aún compatibilidad entre navegadores.

## Atribución de TMDB

El componente de créditos incorpora el SVG oficial sin modificar, conservando
sus proporciones, junto al aviso exigido. El recurso se distribuye como una URL
de datos para funcionar también en el bundle IIFE y dentro del Shadow DOM.

- [Requisitos oficiales](https://developer.themoviedb.org/docs/faq).
- [Logo original](https://www.themoviedb.org/assets/v4/logos/v2/blue_short-8e7b30f73a4020692ccca9c88bafe5dcb6f8a62a4c6bc55cd9ba82bb2cd95f6c.svg).

El SDK muestra créditos cuando hay tarjetas de recomendación o cuando se activa
`showTmdbCredits` (atributo `tmdb-credits` del Web Component). La demo los activa
desde el inicio, también para respuestas que solo contengan texto.
