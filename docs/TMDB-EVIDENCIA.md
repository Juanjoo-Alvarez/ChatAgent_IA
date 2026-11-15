# Evidencia de uso real de TMDB y configuración de la cuenta

Las pruebas automatizadas usan un TMDB simulado
([evaluation-scenarios.md](./evaluation-scenarios.md)). Este documento cubre lo
que esas pruebas no pueden demostrar: consultas reales a la API y las
condiciones de la cuenta con la que se hacen.

## 1. Consultas reales

El script se conecta por MCP al servidor en ejecución, que es quien consulta
TMDB. No lee el token ni lo escribe en el reporte.

```bash
# Terminal 1: servidor con credenciales reales en apps/mcp-server/.env
docker compose up -d --wait redis
pnpm dev:mcp

# Terminal 2
RUN_LIVE_TMDB=1 pnpm evidence:tmdb:live
```

En PowerShell: `$env:RUN_LIVE_TMDB = "1"; pnpm evidence:tmdb:live`.

Casos: búsqueda exacta (`Inception`, 2010), título ambiguo (`La casa`),
detalles con IMDb (ID 27205), candidatos por género y año, y una búsqueda sin
resultados. Cada caso consume cuota de TMDB.

El reporte se guarda en `evals/results/tmdb-live-<fecha>.json` (no se versiona).
Incluye fecha, herramientas expuestas, argumentos, duración, código de error si
lo hubo y un resumen de cada respuesta (IDs, títulos, IMDb, póster). Para la
entrega, adjuntar el JSON al PR junto con una captura de los logs `tool_call`
del servidor. Los logs no contienen el token.

## 2. Cuenta y condiciones de uso

Las condiciones las define TMDB y pueden cambiar. Cada dato de esta tabla lo
confirma una persona del equipo en la cuenta o en la documentación oficial
vigente. No se debe llenar con estimaciones.

| Dato | Dónde se confirma | Valor confirmado | Fecha / responsable |
| --- | --- | --- | --- |
| Tipo de uso declarado al solicitar la clave (personal/educativo, no comercial) | themoviedb.org → Settings → API | _pendiente_ | |
| Descripción de la aplicación registrada (proyecto académico) | themoviedb.org → Settings → API | _pendiente_ | |
| El proyecto no genera ingresos (sin anuncios, suscripciones ni venta) | Decisión del equipo | _pendiente_ | |
| Límite de solicitudes vigente | [Rate limiting](https://developer.themoviedb.org/docs/rate-limiting) | _pendiente_ | |
| Requisitos de atribución | [FAQ](https://developer.themoviedb.org/docs/faq) | Implementados (ver [WIDGET-REFERENCIAS.md](./WIDGET-REFERENCIAS.md#atribución-de-tmdb)) | |
| Uso con apps de IA/LLM/chatbots permitido para este proyecto | [Términos de la API](https://www.themoviedb.org/api-terms-of-use) y docente | _pendiente_ | |

La última fila es un riesgo abierto: los términos de la API restringen ciertos
usos con aplicaciones de IA. Debe confirmarse con el docente antes de la entrega.

## 3. Valor de `QUOTA_TMDB`

`QUOTA_TMDB` es el límite que el servidor se impone a sí mismo y que comparten
todas las réplicas mediante Redis. Debe ser **igual o menor** que el límite
vigente de TMDB registrado en la tabla anterior. Si la consigna del curso fija un
presupuesto menor, prevalece el menor. Anotar aquí el valor usado en la
ejecución de evidencia y su justificación:

- Valor: _pendiente_
- Origen: _pendiente_ (límite de TMDB, consigna o presupuesto del equipo)
