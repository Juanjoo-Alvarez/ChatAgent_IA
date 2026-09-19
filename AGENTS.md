# Guía para herramientas agénticas

## Propósito y arquitectura

AGIChat es un SDK de chat embebible organizado como monorepo de pnpm. Utiliza una arquitectura de puertos y adaptadores: el dominio no depende de la interfaz y la interfaz recibe el transporte mediante `ITransportAdapter`.

- `packages/core`: entidades, contratos y motor del chat. No debe depender de React, del navegador ni de transportes concretos.
- `packages/react`: componentes, hook `useChat`, renderizado de mensajes y tema visual.
- `packages/embed`: API imperativa y Web Component `<agi-chat-widget>`. Genera bundles ESM e IIFE.
- `packages/transport-*`: adaptadores concretos del puerto definido en Core.
- `apps/demo`: ejemplos de integración y aplicación de demostración.
- `.github/workflows`: integración continua y distribución.

Antes de agregar código, identifica qué paquete es dueño de la responsabilidad. No dupliques lógica de dominio en React, Embed o un adaptador.

## Instalación y validación

Usa la versión de pnpm declarada en `packageManager`:

```bash
corepack enable
pnpm install --frozen-lockfile
```

Ejecuta la validación completa en este orden:

```bash
pnpm lint
pnpm build
pnpm typecheck
pnpm test:coverage
```

El build debe ejecutarse antes del typecheck global porque los paquetes publican sus declaraciones desde `dist`.

Para validar un solo paquete, usa filtros:

```bash
pnpm --filter @agichat/embed test
pnpm --filter @agichat/react typecheck
```

## Convenciones de código

- Escribe TypeScript estricto y conserva las opciones estrictas existentes.
- Usa `import type` cuando un símbolo solo se utilice como tipo.
- Expón la API pública de cada paquete desde `src/index.ts`.
- Prefiere dependencias inyectadas y contratos pequeños antes que acoplar capas.
- Libera listeners, temporizadores y raíces de React durante el desmontaje.
- Conserva atributos ARIA, navegación por teclado y HTML semántico.
- No uses `dangerouslySetInnerHTML` para mensajes; procesa Markdown con un renderer seguro.
- Ten especial cuidado con las tildes, signos de apertura y caracteres UTF-8 en strings en español. Evita caracteres corruptos por una codificación incorrecta.

## Pruebas y cobertura

- Todo comportamiento nuevo debe incluir pruebas.
- Mantén al menos 80% de cobertura en líneas, ramas, funciones y statements por paquete.
- Las pruebas no deben depender de red ni de servicios externos.
- Incluye casos de éxito, error, limpieza y límites relevantes.
- Para Web Components, prueba conexión, desconexión, atributos, Shadow DOM y múltiples instancias.
- No reduzcas umbrales ni excluyas archivos únicamente para hacer pasar CI.

## Dependencias y archivos generados

- No edites ni confirmes `dist`, `coverage`, `node_modules` o `*.tsbuildinfo`.
- Modifica dependencias mediante pnpm y confirma `pnpm-lock.yaml` cuando corresponda.
- No agregues dependencias si una utilidad existente resuelve el problema claramente.
- Nunca incluyas tokens, secretos, credenciales o endpoints privados.

## GitHub Flow

- Crea cada rama desde `main` actualizado.
- Usa nombres como `feature/<paquete>-<tarea>`, `fix/<paquete>-<problema>` o `docs/<tema>`.
- Mantén commits pequeños, coherentes y con mensajes en inglés.
- No hagas push directo a `main`.
- Todo cambio entra mediante PR con al menos una aprobación.
- No solicites merge si `Quality gate` no está en verde.
- No mezcles refactors ajenos con la tarea actual.

## Forma de trabajo para agentes

1. Lee este archivo, el `package.json` raíz y la configuración del paquete afectado.
2. Revisa el estado de Git y conserva cambios existentes del desarrollador.
3. Haz el cambio mínimo que complete la tarea sin romper límites arquitectónicos.
4. Agrega o actualiza pruebas en el mismo bloque funcional.
5. Ejecuta lint, build, typecheck y cobertura según el riesgo del cambio.
6. Revisa el diff antes de entregar y reporta validaciones pendientes.
7. No crees commits, pushes, tags, releases ni PRs salvo solicitud explícita.

## Criterios de finalización

Un cambio está listo cuando respeta la arquitectura, incluye pruebas relevantes, conserva la cobertura mínima, pasa todas las validaciones, no contiene archivos generados ni secretos y mantiene correctamente los textos en español y la accesibilidad.
