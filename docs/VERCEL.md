# Desplegar la demo en Vercel

La demo consume `@agichat/embed` mediante su API pública. Ese paquete y sus
dependencias publican sus entradas desde `dist`, por lo que deben compilarse
antes de ejecutar Vite en la demo. Ejecutar solamente `vite build` en
`apps/demo` en una instalación nueva produce el error de resolución de
`@agichat/embed`.

## Configuración del proyecto

En Settings de Vercel, configura:

- **Root Directory:** `apps/demo`.
- Activa **Include source files outside of the Root Directory in the Build Step**
  para incluir `packages/*` y la configuración del workspace.
- **Framework Preset:** Vite.
- **Install Command:** deja la detección automática del gestor del repositorio.
  La versión está declarada en `packageManager` del `package.json` raíz.
- **Node.js Version:** 22.x, como en CI (o una versión compatible más reciente).

El archivo `apps/demo/vercel.json` establece el comando de compilación y el
directorio de salida, con prioridad sobre esos ajustes del panel:

```text
Build Command: pnpm --filter @agichat/demo... run build
Output Directory: dist
```

Los tres puntos del filtro incluyen las dependencias transitivas de la demo.
pnpm las construye en orden antes de compilar la aplicación. No se debe marcar
`@agichat/embed` como externo en Vite: el navegador necesita su código en el
bundle final.

## Validación local

Desde la raíz del repositorio:

```bash
pnpm install --frozen-lockfile
pnpm --dir apps/demo exec pnpm --filter @agichat/demo... run build
pnpm --filter @agichat/demo preview
```

La compilación debe generar `apps/demo/dist/index.html` y sus assets. Los
directorios `dist` se generan durante el build y no se agregan a Git.

Una vez integrado el cambio en la rama que despliegas, crea un nuevo deployment
de esa rama. Reintentar un deployment de un commit anterior no incorpora este
archivo. Si persiste el error, comprueba que Root Directory sea `apps/demo` y
que los logs muestren el comando con el filtro `@agichat/demo...`.

Referencia: [Configuración de builds de Vercel](https://vercel.com/docs/builds/configure-a-build).
