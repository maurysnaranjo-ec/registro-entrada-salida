# Control de Ingreso y Salida · U.E. "Cap. Edmundo Chiriboga"

App web instalable (PWA) para registrar el ingreso y la salida de visitantes y las salidas y retornos de funcionarios.
Funciona en **celulares Android (Chrome)** y en **computadoras** (Chrome, Edge). Los datos se guardan en una **Hoja de cálculo de Google** mediante **Google Apps Script**.

## Contenido

| Archivo | Para qué sirve |
|---|---|
| `index.html` | La aplicación |
| `config.js` | **Aquí se pega la URL de su Apps Script** |
| `manifest.webmanifest`, `sw.js`, `icons/` | Hacen que se pueda instalar como app |
| `apps-script/codigo_ingresos.gs` | El servidor (se pega en Apps Script, no se sube a GitHub Pages) |

## Paso 1 · Crear el servidor (Google Apps Script)

1. Cree una **Hoja de cálculo de Google** nueva.
2. Menú **Extensiones > Apps Script**. Borre el código y pegue todo `apps-script/codigo_ingresos.gs`.
3. Al inicio del código, **cambie las claves** de `USUARIOS` (`admin` e `inspeccion`).
4. **Implementar > Nueva implementación > Aplicación web**. Ejecutar como: **Yo**. Quién tiene acceso: **Cualquier usuario**. Autorice los permisos.
5. Copie la **URL de la aplicación web** (termina en `/exec`).

> Si más adelante cambia el código: **Implementar > Administrar implementaciones > Editar > Nueva versión** (así se conserva la misma URL).

## Paso 2 · Conectar la app

Abra `config.js` y pegue la URL entre las comillas:

```js
window.APP_CONFIG = {
  WEBAPP_URL: 'https://script.google.com/macros/s/XXXXXXXX/exec'
};
```

## Paso 3 · Subir a GitHub y publicar

1. En [github.com](https://github.com) cree un repositorio nuevo (por ejemplo `control-ingreso-salida`).
2. Suba el contenido de esta carpeta (**sin** la carpeta `apps-script` si lo desea; no es necesaria en la web). Incluya el archivo oculto `.nojekyll`.
3. En el repositorio: **Settings > Pages > Build and deployment > Source: Deploy from a branch > Branch: `main` / carpeta `/ (root)`** y guarde.
4. En 1 o 2 minutos la app estará en `https://SU-USUARIO.github.io/control-ingreso-salida/`.

> El repositorio puede ser **privado** si su cuenta lo permite con Pages; la app no contiene datos (los datos están en su hoja de Google).
> Importante: **no escriba contraseñas dentro de los archivos**. Los usuarios y claves viven solo en el Apps Script.

## Paso 4 · Instalar

- **Android (Chrome):** abra la dirección de la app > menú ⋮ > **Instalar aplicación** (o **Agregar a pantalla principal**). También aparece el botón **📲 Instalar** dentro de la app.
- **Computadora (Chrome / Edge):** abra la dirección y haga clic en el icono de instalar de la barra de direcciones, o en el botón **📲 Instalar** de la app.

## Primer uso

1. Ingrese con `admin` (o el usuario que definió).
2. **⚙️ Ajustes:** revise el **año lectivo** y cree los **operadores** (nombre, cédula, usuario y contraseña).
3. **👥 Personal:** importe los funcionarios desde Excel o CSV (Nombre, Cédula, Cargo).
4. **⛔ No autorizados:** registre a las personas que no pueden ingresar.

## Actualizar la app después

Cuando cambie archivos en GitHub, suba el número de `VERSION` en `sw.js` (por ejemplo `ingresos-v2`) para que los dispositivos descarguen la versión nueva.
