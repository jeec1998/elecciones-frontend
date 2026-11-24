# Control Electoral - Chimborazo (Frontend)

Aplicación web y móvil (React 19 + TypeScript 6 + Vite 8 + Capacitor 6) para el registro, digitalización, verificación de actas electorales y monitoreo de resultados en tiempo real para la provincia de Chimborazo.

---

## Requisitos Previos

- **Node.js**: `22.12.0` o superior (fijado en `.node-version` por compatibilidad con Vite 8: `^20.19.0 || >=22.12.0`).
- **npm**: `10.x` o superior.

---

## Instalación y Desarrollo Local

1. Instalar dependencias:
   ```bash
   npm ci
   ```

2. Revisar las variables de entorno (puedes guiarte por `.env.example`):
   - `.env` (modo completo por defecto):
     ```dotenv
     VITE_APP_MODE=full
     VITE_API_URL=http://localhost:8000/api
     ```
   - `.env.digitador` (modo exclusivo para digitadores/delegados):
     ```dotenv
     VITE_APP_MODE=digitador
     VITE_API_URL=http://localhost:8000/api
     ```

3. Iniciar el servidor de desarrollo:
   ```bash
   # Modo completo (Admin, Coordinador, Digitador, Dashboard, TV)
   npm run dev

   # Modo digitador (Solo Login y Registro de Actas)
   npm run dev:digitador
   ```

> **Nota sobre Modo Demo Offline**: El interruptor *"Modo Demo Offline (Sin Servidor)"* está habilitado **únicamente** en entorno de desarrollo (`npm run dev`). En compilaciones de producción (`npm run build`), se desactiva automáticamente (`import.meta.env.DEV === false`).

---

## Modos de Compilación (`full` vs `digitador`)

El proyecto soporta dos modos de empaquetado controlado por `VITE_APP_MODE`:

| Script | Modo | Contenido del Bundle | Proyecto Cloudflare Destino |
|--------|------|----------------------|-----------------------------|
| `npm run build` | `full` | Aplicación completa (`Login`, `RegisterVotos`, `Verificacion`, `Dashboard`, `TvDashboard`, `Administracion`) | `elecciones-frontend` |
| `npm run build:digitador` | `digitador` | Aplicación ligera con *tree-shaking* (solo `Login` y `RegisterVotos`; excluye módulos administrativos y dashboards) | `elecciones-frontend-digitador` |

---

## Despliegue Automatizado en Cloudflare (GitHub Actions CI/CD)

El repositorio incluye configuración lista para desplegar en **Cloudflare** mediante:
- `wrangler.jsonc`: Configuración de Cloudflare Workers Static Assets con soporte nativo para enrutamiento SPA (`not_found_handling: "single-page-application"`).
- `public/_headers`: Cabeceras HTTP de seguridad (`X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy: camera=(self)`) y caché inmutable para `/assets/*`.
- `.github/workflows/deploy.yml`: Pipeline de integración y despliegue continuo en GitHub Actions.

### 1. Obtener Credenciales de Cloudflare

1. Inicia sesión en el [Dashboard de Cloudflare](https://dash.cloudflare.com/).
2. Copia tu **Account ID** (32 caracteres) desde la barra lateral derecha de la página principal o sección **Workers & Pages**.
3. Ve a **My Profile > API Tokens > Create Token**:
   - Usa la plantilla **Edit Cloudflare Workers** (o crea un token personalizado con permisos `Account > Workers Scripts > Edit` y `Account > Cloudflare Pages > Edit`).
   - Copia el token generado.

### 2. Configurar GitHub Secrets y Variables

En tu repositorio de GitHub, dirígete a **Settings > Secrets and variables > Actions**:

#### Secrets (`Repository secrets`)

| Nombre del Secret | Requerido | Descripción |
|-------------------|-----------|-------------|
| `CLOUDFLARE_API_TOKEN` | Sí (para desplegar) | Token de API de Cloudflare con permisos de edición en Workers/Pages. |
| `CLOUDFLARE_ACCOUNT_ID` | Sí (para desplegar) | ID de cuenta de Cloudflare. |
| `VITE_API_URL` | Recomendado | URL pública HTTPS del backend en producción (ej. `https://api.tudominio.com/api`). También puede definirse como Variable de Repositorio. |

#### Variables (`Repository variables` — Opcionales)

| Nombre de la Variable | Valor de Ejemplo | Descripción |
|-----------------------|------------------|-------------|
| `VITE_API_URL` | `https://api.tudominio.com/api` | Alternativa visible si prefieres gestionar la URL del backend como Variable en lugar de Secret. |
| `DEPLOY_DIGITADOR` | `true` | Si se define en `true`, cada push a `main` desplegará también la versión `elecciones-frontend-digitador`. |

> **Comportamiento seguro antes de configurar secretos**: Si haces push a GitHub antes de configurar `CLOUDFLARE_API_TOKEN` y `CLOUDFLARE_ACCOUNT_ID`, el workflow ejecutará `npm ci`, `npm run lint` y `npm run build` para validar el código y omitirá el paso de despliegue a Cloudflare mostrando un aviso informativo sin romper el pipeline.

### 3. Ejecución del Pipeline

- **Automático (`push` a `main`)**: Valida ESLint, compila con `VITE_API_URL` inyectado y despliega `elecciones-frontend` a Cloudflare.
- **Manual (`Actions > CI/CD — Build & Deploy to Cloudflare > Run workflow`)**: Permite elegir el modo de despliegue:
  - `full`: Despliega únicamente `elecciones-frontend`.
  - `digitador`: Despliega únicamente `elecciones-frontend-digitador`.
  - `both`: Compila y despliega ambas aplicaciones.

### 4. Despliegue Manual desde Terminal (Opcional)

También puedes desplegar localmente con Wrangler:

```bash
# Desplegar versión completa (elecciones-frontend)
VITE_API_URL=https://api.tudominio.com/api npm run cf:deploy

# Desplegar versión digitador (elecciones-frontend-digitador)
VITE_API_URL=https://api.tudominio.com/api npm run cf:deploy:digitador
```

---

## Conexión con el Backend y Configuración de CORS

Dado que Vite compila las variables `import.meta.env.VITE_*` de forma estática durante `npm run build`:

1. **Requisito HTTPS**: El dominio de Cloudflare sirve la aplicación bajo `https://`. Por seguridad del navegador (bloqueo de *Mixed Content*), `VITE_API_URL` **debe** utilizar `https://` en producción (ej. `https://api.tudominio.com/api`, sin barra diagonal final después de `/api`).
2. **Derivación de `API_ORIGIN` para Imágenes**: El cliente (`src/services/api.ts`) deriva automáticamente `API_ORIGIN` eliminando el sufijo `/api` de `VITE_API_URL` para cargar las fotografías de actas y candidatos (`${API_ORIGIN}${url}`).
3. **Configuración de CORS en el Backend (FastAPI)**:
   Una vez que Cloudflare asigne el dominio de tu frontend (por ejemplo `https://elecciones-frontend.<tu-subdominio>.workers.dev`, `https://elecciones-frontend.pages.dev` o tu dominio personalizado), agrégalo a la lista `allow_origins` del middleware CORS en el backend:

   ```python
   from fastapi.middleware.cors import CORSMiddleware

   app.add_middleware(
       CORSMiddleware,
       allow_origins=[
           "http://localhost:5173",
           "https://elecciones-frontend.<tu-subdominio>.workers.dev",
           "https://elecciones-frontend-digitador.<tu-subdominio>.workers.dev",
           # Agrega aquí tu dominio personalizado si utilizas uno
       ],
       allow_credentials=True,
       allow_methods=["*"],
       allow_headers=["*"],
   )
   ```

---

## Scripts Disponibles

| Comando | Descripción |
|---------|-------------|
| `npm run dev` | Inicia servidor local Vite en modo `full` |
| `npm run dev:digitador` | Inicia servidor local Vite en modo `digitador` |
| `npm run build` | Verifica tipos (`tsc -b`) y genera bundle de producción `full` en `dist/` |
| `npm run build:digitador` | Verifica tipos (`tsc -b`) y genera bundle de producción `digitador` en `dist/` |
| `npm run lint` | Ejecuta análisis estático con ESLint 10 |
| `npm run preview` | Sirve localmente la carpeta `dist/` compilada |
| `npm run cf:deploy` | Compila en modo `full` y despliega a Cloudflare con Wrangler |
| `npm run cf:deploy:digitador` | Compila en modo `digitador` y despliega como `elecciones-frontend-digitador` en Cloudflare |
