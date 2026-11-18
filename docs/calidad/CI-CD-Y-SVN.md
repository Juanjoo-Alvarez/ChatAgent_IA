# Integración, entrega, despliegue continuo y SVN

Esta guía explica los conceptos con palabras sencillas y muestra cómo se
relacionan con AGIChat.

## Una comparación sencilla

Imaginemos que AGIChat es un producto que se fabrica en un taller:

- **Integración continua (CI)** revisa automáticamente que cada pieza nueva
  encaje y que el producto siga funcionando.
- **Entrega continua (CD)** deja una versión terminada, empacada y lista para
  que una persona decida publicarla.
- **Despliegue continuo** publica automáticamente cada versión que supera las
  revisiones, sin esperar una autorización manual.

Los tres conceptos forman una secuencia, pero no significan lo mismo:

```text
Cambio de código -> revisión automática (CI) -> versión lista (entrega continua)
                                             -> publicación automática (despliegue continuo)
```

## Integración continua (CI)

### ¿Qué es?

Es una práctica en la que los cambios de varias personas se incorporan con
frecuencia al proyecto. Cada cambio pasa por comprobaciones automáticas para
detectar problemas lo antes posible.

### ¿Para qué sirve?

Sirve para descubrir rápidamente errores, incompatibilidades y problemas de
calidad. Así se evita acumular muchos cambios y descubrir al final que ya no
funcionan juntos.

### ¿Cómo se usa en AGIChat?

El archivo `.github/workflows/ci.yml` ejecuta el proceso llamado
`Quality gate` cuando se abre o actualiza un pull request dirigido a `main` y
cuando se agregan cambios a `main`. GitHub prepara una computadora temporal y:

1. descarga el proyecto;
2. instala sus dependencias;
3. revisa el estilo del código con `pnpm lint`;
4. construye los paquetes con `pnpm build`;
5. comprueba los tipos con `pnpm typecheck`;
6. ejecuta las pruebas y mide la cobertura con `pnpm test:coverage`.

En términos no técnicos, es como una inspección automática: si alguna revisión
falla, el equipo sabe que el cambio todavía no está listo para incorporarse.

## Entrega continua (Continuous Delivery)

### ¿Qué es?

Es la práctica de mantener el producto en un estado que permita publicarlo en
cualquier momento. Las tareas de construcción, prueba y preparación se
automatizan, pero una persona conserva la decisión final de publicar.

### ¿Para qué sirve?

Sirve para reducir el trabajo manual y el riesgo de preparar una versión. En
lugar de improvisar el proceso cada vez, se obtiene siempre un paquete probado
y repetible que está listo para entregarse cuando el equipo lo apruebe.

### ¿Cómo se usa en AGIChat?

AGIChat aplica este enfoque en `.github/workflows/release.yml` y
`docs/calidad/RELEASING.md`:

1. los cambios llegan a `main` mediante pull requests revisados;
2. Release Please crea o actualiza un pull request de versión;
3. una persona revisa y aprueba ese pull request;
4. al fusionarlo, GitHub Actions crea la versión y prepara los archivos que
   otras aplicaciones pueden consumir, como los bundles ESM e IIFE, los
   paquetes `.tgz` y sus sumas de verificación.

La intervención humana antes de fusionar el pull request de versión es la
característica importante: la automatización deja el SDK listo, pero el equipo
decide cuándo autorizar la publicación.

## Despliegue continuo (Continuous Deployment)

### ¿Qué es?

Es una práctica en la que todo cambio que supera las comprobaciones se publica
automáticamente en el entorno usado por los clientes, sin una aprobación
manual final.

### ¿Para qué sirve?

Sirve para entregar mejoras y correcciones con mucha rapidez y en cambios
pequeños. Exige pruebas confiables, monitoreo y una forma segura de revertir una
publicación si aparece un problema.

### ¿Se usa en AGIChat?

No como despliegue automático de la aplicación a producción. Actualmente el
proyecto exige revisión y aprobación antes de integrar cambios y antes de
completar una versión. Además, el workflow de release publica artefactos de una
versión, pero no instala automáticamente la demo o el widget en el sitio de un
cliente.

Para implementar despliegue continuo en el futuro se necesitaría, después de
las pruebas, una etapa que publicara automáticamente la demo o el SDK en un
servicio real, junto con monitoreo y un mecanismo de reversión.

## Diferencias principales

| Concepto | Resultado automático | ¿Hay decisión humana antes de publicar? | Situación en AGIChat |
| --- | --- | --- | --- |
| Integración continua | Código construido y comprobado | Sí, el pull request debe revisarse | Implementada mediante `ci.yml` |
| Entrega continua | Versión probada y lista para publicar | Sí | Implementada mediante el flujo de releases |
| Despliegue continuo | Cambio publicado directamente para los usuarios | No | No implementado para producción |

Aunque *entrega continua* y *despliegue continuo* suelen abreviarse como
**CD**, la diferencia está en el último paso: en la entrega una persona decide
cuándo publicar; en el despliegue la publicación también es automática.

## ¿Qué es SVN?

**SVN** es la abreviatura de **Apache Subversion**. Es un sistema de control de
versiones: una herramienta que guarda el historial de los archivos de un
proyecto, identifica quién hizo cada cambio y permite recuperar una versión
anterior.

Para alguien que no trabaja con software, se parece al historial de versiones
de un documento compartido. En vez de crear archivos llamados
`proyecto-final`, `proyecto-final-2` y `proyecto-final-ahora-si`, SVN conserva
las revisiones ordenadas en un repositorio central.

SVN sirve para:

- coordinar el trabajo de varias personas;
- consultar qué cambió y quién lo cambió;
- regresar a una revisión anterior cuando algo sale mal;
- mantener una copia central que representa el historial del proyecto.

### SVN frente a Git en este proyecto

AGIChat **no utiliza SVN; utiliza Git y GitHub**. Ambos guardan el historial y
ayudan a colaborar, pero funcionan de manera diferente:

| SVN | Git |
| --- | --- |
| Mantiene principalmente el historial en un servidor central. | Cada copia local del proyecto contiene el historial completo. |
| Normalmente requiere comunicarse con el servidor para muchas operaciones. | Permite crear commits y consultar el historial sin conexión. |
| Identifica versiones centrales con números de revisión. | Identifica cada cambio confirmado mediante un hash. |
| Suele organizar ramas como carpetas dentro del repositorio. | Las ramas son ligeras y forman parte habitual del flujo de trabajo. |

En AGIChat, Git registra los cambios locales y GitHub aloja la copia compartida.
El equipo crea una rama, propone el cambio mediante un pull request y espera
una aprobación antes de incorporarlo a `main`. Después, GitHub Actions ejecuta
CI y apoya la entrega continua. Por tanto, SVN sería una alternativa a Git para
guardar versiones; no es otra etapa de CI/CD ni una herramienta que el proyecto
necesite ejecutar junto con Git.
