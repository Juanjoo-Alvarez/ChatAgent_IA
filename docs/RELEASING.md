# Publicación de versiones

AGIChat utiliza Release Please para mantener las versiones, generar el
`CHANGELOG.md` y crear GitHub Releases. No se deben crear tags ni releases
manualmente.

## Configuración inicial de GitHub

1. En `Settings > Actions > General > Workflow permissions`, habilita permisos
   de lectura y escritura y permite que GitHub Actions cree pull requests.
2. Crea un token de acceso de alcance limitado al repositorio, con permisos de
   lectura y escritura para Contents, Issues y Pull requests.
3. Guarda el token como un Actions secret llamado `RELEASE_PLEASE_TOKEN`.

El workflow puede usar `GITHUB_TOKEN` como respaldo, pero los pull requests
creados con ese token no disparan otros workflows. Se recomienda configurar
`RELEASE_PLEASE_TOKEN` para que el Quality gate se ejecute automáticamente en
el Release PR.

## Flujo de publicación

1. Integra cambios a `main` mediante pull requests y Conventional Commits.
2. El workflow `Release` crea o actualiza un Release PR con la próxima versión
   y las notas de cambio.
3. Revisa el Release PR y confirma que el Quality gate esté en verde.
4. Fusiona el Release PR después de recibir al menos una aprobación.
5. El workflow crea el tag y el GitHub Release, construye el SDK y adjunta los
   bundles ESM e IIFE, las declaraciones TypeScript y `SHA256SUMS.txt`.

Los prefijos `fix:` y `feat:` producen incrementos patch y minor,
respectivamente. Un `!` después del tipo o un pie `BREAKING CHANGE:` indica un
cambio incompatible. Mientras el SDK permanezca antes de `1.0.0`, los cambios
incompatibles incrementan la versión minor.

## Validación local de artefactos

Ejecuta:

```bash
pnpm release:prepare
```

Los archivos se generan en `release-artifacts/`. Este directorio es temporal y
no debe incluirse en commits.
