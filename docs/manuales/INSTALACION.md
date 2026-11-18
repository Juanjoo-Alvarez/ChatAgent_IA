# Manual de instalación

Este manual prepara un equipo para ejecutar AGIChat. Después de instalar, sigue
el [manual de arranque](./ARRANQUE.md).

## Requisitos

| Herramienta | Versión | Para qué se usa | Obligatoria |
| --- | --- | --- | --- |
| Git | Cualquiera reciente | Clonar el repositorio | Sí |
| Node.js | 22 (la que usa CI) o una más reciente compatible | Ejecutar y compilar todo el monorepo | Sí |
| Corepack | Incluido con Node.js | Activar la versión exacta de pnpm | Recomendado |
| pnpm | 11.19.0 (campo `packageManager`) | Gestor del monorepo | Sí |
| Docker Desktop | Con Docker Compose | Redis, perfiles de Compose y `pnpm test:compose` | Para el modo real |
| Ollama | Versión actual para tu sistema | Ejecutar el modelo local | Para el modo real |
| Modelo `qwen3:4b-instruct-2507-q4_K_M` | Unos 2.5 GB de descarga | LLM del agente | Para el modo real |

El modo sin credenciales solo necesita Node.js y pnpm.

Equipo en el que se verificó esta guía el 17 de noviembre de 2026: Windows 11
Home 10.0.26200, AMD Ryzen 7 260 (8 núcleos y 16 hilos), 15.3 GB de RAM y GPU
NVIDIA GeForce RTX 5050 Laptop. Versiones: Node.js 24.19.0, pnpm 11.19.0,
Docker 29.8.2 y Ollama 0.40.16.

## 1. Clonar el repositorio

```powershell
git clone https://github.com/Juanjoo-Alvarez/ChatAgent_IA.git
cd ChatAgent_IA
```

## 2. Activar pnpm

```powershell
corepack enable
pnpm --version
```

Debe imprimir `11.19.0`. Si `corepack enable` falla por permisos o `pnpm` sigue
sin reconocerse, usa la versión exacta mediante npm sin instalarla de forma
global:

```powershell
npx --yes pnpm@11.19.0 --version
```

En ese caso, sustituye `pnpm` por `npx --yes pnpm@11.19.0` en todos los
comandos. npm agrega el ejecutable al PATH de los procesos hijos, así que los
scripts que llaman de nuevo a `pnpm` también funcionan. Si PowerShell bloquea
`npx.ps1` por la política de ejecución, escribe `npx.cmd`.

## 3. Instalar dependencias

```powershell
pnpm install --frozen-lockfile
```

`--frozen-lockfile` impide modificar `pnpm-lock.yaml`.

## 4. Instalar Docker Desktop

Descarga Docker Desktop desde el sitio oficial e inícialo. Comprueba que el
motor responde:

```powershell
docker info --format '{{.ServerVersion}}'
```

Si aparece un error que menciona `dockerDesktopLinuxEngine`, Docker Desktop no
está en ejecución.

## 5. Instalar Ollama y descargar el modelo

1. Descarga el instalador para tu sistema desde `https://ollama.com/download`.
2. Abre una **terminal nueva** para que reconozca el comando `ollama`. En
   Windows, el ejecutable queda en `%LOCALAPPDATA%\Programs\Ollama\ollama.exe`.
3. Abre la aplicación de Ollama. Queda en la bandeja del sistema y sirve en el
   puerto 11434.
4. Descarga y prueba el modelo:

```powershell
ollama pull qwen3:4b-instruct-2507-q4_K_M
ollama list
ollama run qwen3:4b-instruct-2507-q4_K_M "Responde únicamente: listo."
```

Usa la etiqueta exacta. `qwen3:4b` apunta a la variante *Thinking*, que es más
lenta y puede agotar el tiempo del turno.

## 6. Verificar la instalación

Ejecuta la validación completa en este orden. El build va antes del typecheck
porque los paquetes publican sus declaraciones desde `dist`.

```powershell
pnpm lint
pnpm build
pnpm typecheck
pnpm test:coverage
```

Para incluir las pruebas de integración con Redis real:

```powershell
docker compose up -d --wait redis
$env:REDIS_URL = 'redis://localhost:6379'
pnpm test:coverage
```

```bash
docker compose up -d --wait redis
REDIS_URL=redis://localhost:6379 pnpm test:coverage
```

Comprobaciones adicionales que no necesitan credenciales:

```powershell
pnpm eval:agent
pnpm test:widget
pnpm test:compose
```

Los resultados esperados están en [VERIFICACION.md](../calidad/VERIFICACION.md).
