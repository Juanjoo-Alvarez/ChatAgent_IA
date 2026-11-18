# Documentación de AGIChat

Índice de toda la documentación del proyecto. El punto de entrada general es el
[README del repositorio](../README.md).

## Arquitectura

| Documento | Descripción | Para quién |
| --- | --- | --- |
| [ALTO-NIVEL.md](./arquitectura/ALTO-NIVEL.md) | Diagrama de contexto y de despliegue local, componentes y decisiones de arquitectura | Evaluador, desarrollador nuevo |
| [AGENTE.md](./arquitectura/AGENTE.md) | Clasificación del agente, ciclo interno, secuencias, defensas en capas, límites y códigos de error | Evaluador, desarrollador nuevo, agente de código |
| [ESCALABILIDAD.md](./arquitectura/ESCALABILIDAD.md) | Qué se replica, dónde vive el estado, cuellos de botella y mediciones reales | Evaluador, operador |
| [PROTOCOLO.md](./arquitectura/PROTOCOLO.md) | Protocolo WebSocket v1, límites, reconexión y apertura de referencias | Desarrollador nuevo, agente de código |
| [CACHE-Y-CUOTAS.md](./arquitectura/CACHE-Y-CUOTAS.md) | Política de cuotas, caché, reintentos y almacenamiento compartido | Desarrollador nuevo, operador |

## Manuales

| Documento | Descripción | Para quién |
| --- | --- | --- |
| [INSTALACION.md](./manuales/INSTALACION.md) | Requisitos, clonado, pnpm, Docker, Ollama y verificación | Desarrollador nuevo, operador |
| [CONFIGURACION.md](./manuales/CONFIGURACION.md) | Todas las variables de entorno, sin secretos, y diferencias con los `.env.example` | Operador, desarrollador nuevo |
| [ARRANQUE.md](./manuales/ARRANQUE.md) | Modo sin credenciales, modo real, Compose, dos réplicas y resolución de problemas | Evaluador, operador |
| [PROVEEDORES.md](./manuales/PROVEEDORES.md) | Cuentas de TMDB y Google Books sin tarjeta, cuotas, atribución y evidencia | Operador, evaluador |
| [DESPLIEGUE.md](./manuales/DESPLIEGUE.md) | Qué está automatizado, demo en Vercel y requisitos para un despliegue público | Operador |
| [SERVIDOR-MCP.md](./manuales/SERVIDOR-MCP.md) | Contrato de las 6 herramientas y consumo desde otros clientes | Desarrollador nuevo, agente de código |
| [WIDGET-SDK.md](./manuales/WIDGET-SDK.md) | Integración del widget con React, Web Component e IIFE, tema y transportes | Desarrollador nuevo |

## Evaluaciones

| Documento | Descripción | Para quién |
| --- | --- | --- |
| [EVALS.md](./evals/EVALS.md) | Metodología, configuración, resultados y análisis de las evals LLM01 y LLM07 | Evaluador |
| [ESCENARIOS-TMDB.md](./evals/ESCENARIOS-TMDB.md) | Escenarios de integración del MCP con un TMDB simulado | Desarrollador nuevo |
| [resultados/](./evals/resultados/) | Copias versionadas de los informes JSON reales | Evaluador |

## Calidad

| Documento | Descripción | Para quién |
| --- | --- | --- |
| [VERIFICACION.md](./calidad/VERIFICACION.md) | Estado de CI, pruebas, cobertura por paquete y evidencias | Evaluador |
| [CI-CD-Y-SVN.md](./calidad/CI-CD-Y-SVN.md) | Integración, entrega y despliegue continuos, y SVN frente a Git | Evaluador, desarrollador nuevo |
| [RELEASING.md](./calidad/RELEASING.md) | Proceso de versiones con release-please | Desarrollador nuevo |

## Entrega

| Documento | Descripción | Para quién |
| --- | --- | --- |
| [MATRIZ-REQUISITOS.md](./entrega/MATRIZ-REQUISITOS.md) | Cada requisito con su implementación, prueba, evidencia y estado | Evaluador |
| [GUION-DEMO.md](./entrega/GUION-DEMO.md) | Guion de 5 minutos con mensajes exactos y capturas | Evaluador, equipo |
| [LIMITACIONES.md](./entrega/LIMITACIONES.md) | Inconsistencias conocidas, lo que no se midió y trabajo futuro | Evaluador, desarrollador nuevo |

## Otros

| Recurso | Descripción |
| --- | --- |
| [assets/capturas/](./assets/capturas/) | Capturas del producto funcionando |
| [assets/tmdb-logo.svg](./assets/tmdb-logo.svg) | Logo oficial de TMDB, extraído sin modificar de `tmdbLogo.ts` |
| [historico/PROYECTO-2-PLAN.md](./historico/PROYECTO-2-PLAN.md) | Plan inicial del 27 de octubre; no refleja la arquitectura final |
