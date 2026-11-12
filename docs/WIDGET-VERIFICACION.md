# Verificación de la integración del widget

Este informe distingue validación automatizada y evidencia pendiente; no supone
que todo el producto esté listo para producción o que las evals reales ya se ejecutaron.

## Resultado local del 12 de noviembre de 2026

- Lint, build y typecheck globales: aprobados.
- Cobertura global: todos los paquetes superan sus umbrales existentes del 80%.
- Integración del widget: 8 casos aprobados, repartidos en tres archivos.
- API: 51 pruebas aprobadas; cobertura de líneas 100% y ramas 94.17%.
- Evals deterministas del agente: 31 casos aprobados.
- Redis: 6 pruebas opcionales omitidas en API y external-api por no configurar
  un servicio de Redis para esta ejecución. No se registran como aprobadas.

La configuración TypeScript de las pruebas admite DOM y resolución Bundler para
los tipos del SDK de navegador, como el runner Vitest. La compilación de producción
del backend conserva NodeNext y sus opciones estrictas.

## Ejecución reproducible

```powershell
pnpm install --frozen-lockfile
pnpm lint
pnpm build
pnpm typecheck
pnpm test:coverage
pnpm test:widget
pnpm eval:agent
```

`test:widget` construye sus dependencias y ejecuta `apps/api/tests/widget`.
Los servidores se crean en loopback con puertos libres y se cierran tras cada
caso. Se utiliza el bundle ESM público de Embed, con React incluido, y WebSockets
reales. Los clientes de prueba emulan la cabecera Origin del navegador.
El DOM es jsdom; las ventanas son dobles controlados y no se descargan imágenes.
Las señales nativas de Node se usan para conectar su fetch y el backend dentro
del entorno jsdom. No requiere claves, Ollama ni servicios externos.

## Matriz de pruebas

| Requisito | Evidencia automatizada |
| --- | --- |
| Sesión y autenticación | Pruebas del transporte y conexión HTTP/WebSocket de `journey.test.ts`. |
| Recomendación y póster | El recorrido recibe datos estructurados, conserva el texto alternativo y renderiza la URL validada. |
| Comparación con contexto | El segundo turno llega al agente con el historial de la película. La comparación de esta prueba es un fixture. |
| Apertura de IMDb y Google Books | El comando del chat reserva una ventana simulada y la acción validada navega a la URL canónica. |
| Aislamiento | Dos widgets reciben credenciales distintas y el agente recibe historial vacío para el segundo cliente. |
| Recuperación | Se corta el socket después de confirmar un turno en el servidor; se reutiliza la sesión y se recupera una única respuesta sin repetir el agente. |
| Fallos | El error interno del proveedor se convierte en error público y el widget no muestra el secreto ficticio. |
| Navegación no solicitada | Una acción propuesta por un agente comprometido se rechaza en la API y no abre ventanas. |
| LLM01:2025 | El ataque directo atraviesa el widget y la API y recibe el rechazo del MovieAgent real, sin llamar a modelo ni MCP. |
| LLM07:2025 | Una solicitud de instrucciones internas recibe el rechazo; no aparece el marcador interno de evaluación. |
| Metadatos hostiles | Prosa con instrucciones, URL y HTML de un agente controlado se renderiza sin ejecutar scripts ni abrir ventanas. |
| Póster ausente o roto, popup bloqueado y limpieza | Pruebas de React, ReferenceNavigator y ciclo de vida del Embed. |
| Créditos TMDB | Logo incorporado y aviso oficial en React; atributo `tmdb-credits` de la demo desde el inicio. |

Los dos casos OWASP de integración prueban límites deterministas del agente
real con modelo y MCP sustituidos. El caso de metadatos hostiles fuerza el
contenido para comprobar el límite del cliente. Ninguno equivale a una eval
de resistencia de Ollama o de sus respuestas ante ataques inéditos.
Los casos existentes de `pnpm eval:agent` complementan estas pruebas; la ejecución
con Ollama/MCP reales se describe en [BACKEND-AGENTE.md](./BACKEND-AGENTE.md).

## Pendiente de evidencia manual y del equipo

- Navegador real: pestañas sin clic en enlace, ventanas bloqueadas, teclado,
  pantalla estrecha, zoom y revisión visual. El host de navegador de esta sesión
  no está disponible; los tests de DOM y las ventanas simuladas no sustituyen esta evidencia.
- Ollama, TMDB y Google Books: conversación con datos reales, póster, asociación
  de adaptación, comparación fundamentada y apertura de las referencias obtenidas.
- Evals del modelo real para LLM01 y LLM07: registrar versión del modelo, casos,
  revisión humana y resultados reales; no presentar los fixtures como resultados del LLM.
- Redis y dos réplicas: ejecutar las comprobaciones de infraestructura del backend
  en el entorno del equipo. Las pruebas que comparten memoria no demuestran Redis real.
- Entrega conjunta: diagramas finales y justificación de escalabilidad de Isma,
  atribución académica y configuración de los proveedores, despliegue, aprobación
  del PR y `Quality gate` verde. No se han creado commits ni PRs automáticamente.

Para arrancar, consultar [WIDGET-INTEGRACION.md](./WIDGET-INTEGRACION.md).
Para el guion manual de referencias, consultar [WIDGET-REFERENCIAS.md](./WIDGET-REFERENCIAS.md).

## Regresión de fetch

El transporte enlaza el fetch nativo a `globalThis`. Esto conserva el receptor
que exige el navegador y evita `Illegal invocation` al solicitar `/sessions`.
La prueba de autenticación reproduce esa exigencia de receptor. El backend
local también se comprobó por HTTP durante el diagnóstico (health 200 y sesión
201 para los orígenes de desarrollo); eso por sí solo no comprueba el navegador.
