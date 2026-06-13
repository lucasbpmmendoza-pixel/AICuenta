# AICuenta

Plataforma SaaS de contabilidad y fiscalización inteligente para contribuyentes en México. Centraliza CFDIs, genera estados financieros, calcula impuestos (ISR, IVA), concilia pagos y ofrece asistentes de IA para preguntas fiscales y consulta documental.

Construida sobre **Next.js 16 (App Router)**, **React 19**, **TypeScript**, **Tailwind CSS 4** y **Azure SQL Server**.

---

## Tabla de contenidos

1. [Características principales](#características-principales)
2. [Stack tecnológico](#stack-tecnológico)
3. [Arquitectura general](#arquitectura-general)
4. [Estructura del proyecto](#estructura-del-proyecto)
5. [Modelo de datos](#modelo-de-datos)
6. [Configuración del entorno](#configuración-del-entorno)
7. [Scripts de npm](#scripts-de-npm)
8. [Módulos funcionales](#módulos-funcionales)
9. [Sistema de autenticación y planes](#sistema-de-autenticación-y-planes)
10. [API HTTP](#api-http)
11. [Scripts auxiliares](#scripts-auxiliares)
12. [Despliegue](#despliegue)
13. [Notas de desarrollo](#notas-de-desarrollo)

---

## Características principales

- **Dashboard fiscal**: indicadores mensuales por RFC con ingresos, egresos, IVA, ISR y flujo de efectivo.
- **Catálogo de Facturas (CFDIs)**: ingresos, egresos, nómina y retenciones consultables y exportables.
- **Estados Financieros**: balance, resultados y desglose por conceptos con caché en memoria para queries pesadas.
- **Notas de crédito y Pagos (REP)**: conciliación de complementos de pago tipo P contra CFDIs.
- **Efectivamente pagado**: vista contable de flujo real (cobrado/pagado) por forma de pago y método.
- **Chatbot Fiscal (`/dashboard/chat`)**: asistente IA con herramientas SQL para responder preguntas sobre la información del contribuyente (ISR, IVA, top facturas, proveedores, etc.).
- **Chatbot de Documentos (`/dashboard/chat-docs`)**: consulta sobre catálogo SAT y base de documentos internos (Resolución Miscelánea, leyes, normativa).
- **Bot de WhatsApp** (Baileys): cada cuenta puede vincular un número con QR para recibir comprobantes de pago, extraerlos con OCR/IA y guardarlos en la base.
- **Carga de e.firma (FIEL)**: gestión de archivos FIEL del usuario para la descarga de XML desde el SAT.
- **Suscripciones Stripe**: planes mensuales/anuales (Basic, Business Pro, Business Scale) con checkout, portal de cliente y webhook.
- **Cuentas multi-usuario**: roles `owner`, `member` y `chikenelo` con gestión de RFCs por equipo.
- **Modo Demo**: experiencia limitada (solo lectura, sin descargas) controlada por cookie `aicuenta_demo`.
- **Onboarding guiado**: beacons y modales para nuevos usuarios.
- **Exportaciones a Excel** con `exceljs` desde la mayoría de los módulos.

---

## Stack tecnológico

| Capa            | Tecnología                                                              |
|-----------------|-------------------------------------------------------------------------|
| Framework       | Next.js **16.2.4** (App Router, RSC)                                    |
| Lenguaje        | TypeScript 5                                                            |
| UI              | React 19, Tailwind CSS 4, Recharts                                      |
| Base de datos   | Azure SQL Server (`mssql` driver con pool singleton)                    |
| Auth            | JWT firmado con `jose` + cookies httpOnly, bcrypt para passwords        |
| Pagos           | Stripe (suscripciones + webhooks)                                       |
| IA              | OpenAI (GPT-4o-mini con *function/tool calling*)                        |
| Email           | Resend                                                                  |
| Almacenamiento  | Vercel Blob (`@vercel/blob`)                                            |
| WhatsApp        | Baileys (`@whiskeysockets/baileys`) con QR                              |
| OAuth           | Google Sign-In                                                          |
| Anti-bot        | reCAPTCHA v3                                                            |
| Excel           | `exceljs`                                                               |
| Imagen          | `jimp`, `sharp`, `qrcode`                                               |
| Validación      | `zod`                                                                   |
| XML             | `fast-xml-parser`                                                       |

> **Importante** — esta versión de Next.js trae cambios que pueden no coincidir con el conocimiento general de tus modelos: consulta `node_modules/next/dist/docs/` antes de añadir código nuevo (ver `AGENTS.md`).

---

## Arquitectura general

```
                   ┌─────────────────────────────────────────────┐
                   │                Usuario (navegador)          │
                   └────────────────────────┬────────────────────┘
                                            │ HTTPS
                                            ▼
                ┌───────────────────────────────────────────────┐
                │             Next.js (App Router)              │
                │  ├─ Páginas RSC + componentes 'use client'    │
                │  ├─ Middleware JWT (cookies httpOnly)         │
                │  └─ Route Handlers en /app/api/**             │
                └────┬──────────────────────┬───────────────────┘
                     │                      │
       ┌─────────────▼────┐         ┌───────▼─────────┐
       │   Azure SQL       │         │   Servicios     │
       │   (mssql pool)    │         │   externos      │
       │  ─ users          │         │  ─ Stripe       │
       │  ─ EFIELES        │         │  ─ OpenAI       │
       │  ─ documents      │         │  ─ Resend       │
       │  ─ comprobantes   │         │  ─ Vercel Blob  │
       │  ─ plans/membre.  │         │  ─ Google OAuth │
       │  ─ notifications  │         │  ─ reCAPTCHA    │
       │  ─ logs / etc.    │         │  ─ WhatsApp     │
       └───────────────────┘         └─────────────────┘
```

- **Server Components** llaman a `getSession()` directamente y obtienen datos vía `lib/*-query.ts`.
- **Client Components** consumen `fetch('/api/...')`.
- El middleware (`middleware.ts`) protege `/dashboard/**` y `/upload-fiel/**` validando el JWT.
- Las queries pesadas usan el pool largo (`getDbLong`, `requestTimeout: 300_000`) y una caché en memoria por RFC + rango + límite (TTL 15 min) para Estados Financieros.

---

## Estructura del proyecto

```
aicuenta/
├─ app/
│  ├─ layout.tsx                 Root layout (TopBar + AuthProvider)
│  ├─ page.tsx                   Redirige a /dashboard/chat-docs (o demo)
│  ├─ globals.css                Tailwind 4
│  ├─ favicon.ico
│  ├─ components/                Componentes UI (Sidebar, Dashboard, vistas...)
│  ├─ hooks/                     useTheme, etc.
│  ├─ dashboard/
│  │  ├─ page.tsx
│  │  ├─ chat/                   Chatbot fiscal
│  │  ├─ chat-docs/              Chatbot documental
│  │  ├─ comprobantes/           Comprobantes capturados por WhatsApp
│  │  ├─ configuracion/          Cuenta, contraseña, RFC, alias
│  │  ├─ estados-financieros/    Reportes EF
│  │  ├─ facturas/               Listado CFDI + filtros
│  │  ├─ rfcs/                   Gestión RFCs (planes multi)
│  │  ├─ soporte/                Tickets
│  │  ├─ suscripcion/            Plan actual + checkout Stripe
│  │  ├─ unete/                  Invitación de miembros
│  │  ├─ usuarios/               Administración de miembros
│  │  └─ whatsapp-bot/           Conexión WhatsApp + QR
│  ├─ login/ register/ forgot-password/ reset-password/
│  ├─ privacidad/ terminos/
│  ├─ upload-fiel/               Carga inicial de e.firma
│  └─ api/                       (ver sección API)
│
├─ lib/
│  ├─ db.ts                      Pools de Azure SQL (corto y largo)
│  ├─ auth.ts                    JWTs (sesión, verificación, reset)
│  ├─ session.ts                 getSession() para Server Components
│  ├─ account-plan.ts            Limites por plan (RFCs, miembros)
│  ├─ stripe.ts                  Cliente Stripe singleton
│  ├─ email.ts                   Envío de correos (Resend)
│  ├─ recaptcha.ts               Verificación reCAPTCHA
│  ├─ facturas-query.ts          Queries y tools del chat fiscal
│  ├─ docs-query.ts              Queries de catálogo SAT y docs
│  ├─ chat-docs-export-store.ts  Excel descargables (one-shot URLs)
│  ├─ chat-fiscal-context.ts     Historial de chat persistido
│  ├─ demo-mode.ts / demo-data.ts / demo-download-limit.ts
│  ├─ rfc-aliases.ts / rfc-regimen-preference.ts / rfc-selection.ts
│  ├─ whatsapp-manager.ts        Singleton Baileys por owner
│  ├─ whatsapp-worker.ts         OCR + IA para comprobantes
│  ├─ logs.ts                    Auditoría de acciones
│  ├─ validations.ts             Esquemas Zod
│  └─ redirect.ts
│
├─ scripts/                      Diagnóstico y mantenimiento (Node JS)
├─ sql/                          Esquemas SQL (Azure SQL)
├─ public/                       SVGs e iconografía
├─ middleware.ts                 Gate JWT para rutas privadas
├─ next.config.ts
├─ tsconfig.json
├─ eslint.config.mjs
├─ postcss.config.mjs
├─ AGENTS.md / CLAUDE.md         Notas para asistentes de IA
└─ package.json
```

---

## Modelo de datos

Todas las tablas viven en Azure SQL. Los scripts `CREATE TABLE` están en `sql/`. Tablas principales:

| Tabla                  | Descripción                                                                 |
|------------------------|-----------------------------------------------------------------------------|
| `users`                | Usuarios (UUID, email único, password bcrypt, RFC, `email_verified`).        |
| `EFIELES`              | e.firmas registradas por usuario+RFC para descarga SAT.                     |
| `documents`            | Catálogo documental para el chatbot (título, tags, resumen, contenido).      |
| `Comprobantes`         | Transferencias detectadas por el bot de WhatsApp (banco, monto, folio…).    |
| `plans`                | Catálogo de planes Stripe (precio, duración, `stripe_price_id`).             |
| `membresias`           | Suscripciones activas: `stripe_subscription_id`, expiración, estado.         |
| `stripe_webhooks`      | Auditoría de eventos recibidos.                                              |
| `team_members`         | Miembros invitados a una cuenta multi.                                       |
| `member_rfcs`          | Asociación de miembros a RFCs.                                               |
| `notifications`        | Notificaciones internas (campana en TopBar).                                 |
| `support_tickets`      | Mensajes desde el módulo de Soporte.                                         |
| `logs`                 | Registro de acciones del usuario.                                            |
| `chat_fiscal_context`  | Historial del chat fiscal por usuario.                                       |

Tablas adicionales asumidas en el dominio SAT (no creadas aquí): `cfdi`, `conceptos`, `nomina`, `retenciones`, `pagos`, etc. — son alimentadas por procesos externos (workers SAT 69-B en `scripts/`).

Migraciones puntuales:

- `add_account_type.sql`, `add_plan_type.sql` — tipo de cuenta (single/multi) y plan.
- `add_downloads_enabled.sql` — gate de descargas para demo.
- `add_alias_efieles.sql`, `add_auth_code_efieles.sql` — alias y código de invitación de e.firmas.
- `add_team_members.sql`, `create_member_rfcs.sql` — multi-usuario.
- `add_conceptos_indexes.sql` — performance.
- `alter_logs_userid.sql`, `fix_comprobantes_owner_id.sql`, `update_plans_stripe.sql`.

---

## Configuración del entorno

Crea un archivo `.env` en la raíz con las siguientes variables (los valores ejemplo de este repo deben rotarse antes de producción):

```dotenv
# ── Azure SQL ──
AZURE_SQL_SERVER=<host>.database.windows.net
AZURE_SQL_DATABASE=<db>
AZURE_SQL_USER=<user>
AZURE_SQL_PASSWORD=<password>
AZURE_SQL_PORT=1433

# ── JWT (32+ chars) ──
JWT_SECRET=<openssl rand -base64 32>

# ── App ──
NEXT_PUBLIC_APP_URL=http://localhost:3000

# ── Correo (Resend) ──
RESEND_API_KEY=<resend>

# ── Google OAuth ──
GOOGLE_CLIENT_ID=<id>.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=<secret>

# ── reCAPTCHA v3 ──
NEXT_PUBLIC_RECAPTCHA_SITE_KEY=<site>
RECAPTCHA_SECRET_KEY=<secret>

# ── Vercel Blob ──
BLOB_READ_WRITE_TOKEN=<token>

# ── OpenAI ──
OPENAI_API_KEY=sk-...
CHAT_DOCS_MODEL_PREMIUM=gpt-4o-mini       # opcional
CHAT_DOCS_MODEL_PUBLIC=gpt-4o-mini        # opcional
PUBLIC_CHAT_DOCS_DAILY_LIMIT=30           # mensajes diarios para no-suscriptores

# ── Stripe ──
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

> El archivo `.env` actual contiene **secretos en claro**. Rótalos y nunca los publiques. `package.json` y `.gitignore` ya excluyen `node_modules` y `.env*` de Git.

### Inicializar la base de datos

1. Crea la base en Azure SQL.
2. Ejecuta en orden los scripts de `sql/`. Como mínimo:
   ```
   create_users.sql
   create_efieles.sql
   create_documents.sql
   create_comprobantes.sql
   create_plans.sql
   create_logs.sql
   create_notifications.sql
   create_support_tickets.sql
   create_chat_fiscal_context.sql
   create_member_rfcs.sql
   ```
   Después aplica los `add_*.sql`/`alter_*.sql` que aparecen en la carpeta.
3. Carga planes de ejemplo con `insert_test_plans.sql` y enlázalos a productos/precios reales en Stripe.

---

## Scripts de npm

```bash
npm install        # instala dependencias
npm run dev        # servidor de desarrollo en http://localhost:3000
npm run build      # compila la app de producción
npm run start      # sirve el build (next start)
npm run lint       # ESLint (config Next.js)
```

---

## Módulos funcionales

### Dashboard (`/dashboard`)
Vista por defecto cuando no se redirige al chat. Selector de RFC + mes/año y tarjetas con KPIs (ingresos, egresos, IVA, ISR), top de conceptos y gráficas con Recharts.

Endpoint: `GET /api/dashboard?rfc=...&year=...&month=...`

### Facturas (`/dashboard/facturas`)
Listado paginado de CFDIs con filtros por movimiento (INGRESO/EGRESO), tipo (`I`, `E`, `N`, `P`), texto libre, periodo. Exportable a Excel desde `/api/export/facturas`.

### Estados Financieros (`/dashboard/estados-financieros`)
Balance y resultados a partir de los CFDIs. Calcula:
- Base IVA 16/8/0/exento.
- Trasladados y retenciones de ISR/IVA/IEPS.
- Flujo (cuadro de flujo de efectivo) y desglose por conceptos.

Implementado en `lib/facturas-query.ts:fetchEstadosFinancieros` con caché en memoria.

### Notas de crédito (`/api/notas-credito`)
Listado y exportación de comprobantes tipo `E` ligados a ingresos.

### Pagos / Efectivamente pagado
- `/api/pagos`: complementos de pago tipo `P` y su importe.
- `/api/efectivamente-pagado`: flujo real cobrado/pagado por método y forma de pago.

### Comprobantes (`/dashboard/comprobantes`)
Comprobantes capturados por el bot de WhatsApp. Cada fila contiene el banco detectado, monto, folio, beneficiario, cuenta destino y referencia.

### Chatbot Fiscal (`/dashboard/chat`)
Asistente IA con `openai.chat.completions.create` y `tools` definidas en `app/api/chat/route.ts`. El modelo elige entre:

- `chat_search_cfdis`, `chat_aggregate_cfdis`, `chat_get_cfdi_detail`
- `chat_get_top_facturas`, `chat_get_conceptos_analysis`
- `chat_get_resumen_fiscal`, `chat_get_iva_desglose`, `chat_get_nomina`
- `chat_get_flujo_efectivo`, `chat_get_facturas_canceladas`
- `chat_conciliar_pagos`
- `create_excel` (entrega URL one-shot vía `chat-docs-export-store`)

Conversa solo con datos reales (regla del prompt: "nunca inventes valores").

### Chatbot Docs (`/dashboard/chat-docs`)
Consulta sobre `documents` (Resolución Miscelánea, leyes, etc.) y catálogo SAT (`catprodserv`). Diferenciación de límites entre usuarios premium y públicos:

- Premium: 8 mensajes/contexto, 1.500 chars/mensaje, modelo `CHAT_DOCS_MODEL_PREMIUM`.
- Público (sin login): 4 mensajes, 700 chars, cuota diaria configurable (`PUBLIC_CHAT_DOCS_DAILY_LIMIT`, máx. 100).

### WhatsApp Bot (`/dashboard/whatsapp-bot`)
Cada owner puede vincular un número:

1. UI llama `/api/whatsapp/connect` y abre un *stream*.
2. `whatsapp-manager.ts` (singleton en `globalThis`) crea una sesión Baileys.
3. Emite eventos `qr` y `status` a los listeners del cliente.
4. Cuando llega una imagen, `whatsapp-worker.ts` la baja, la pasa por OpenAI (visión) y guarda el resultado en `Comprobantes`.

Estado en `/api/whatsapp/status`, desconexión en `/api/whatsapp/disconnect`.

### Suscripciones (`/dashboard/suscripcion`)
- `GET /api/billing/plans` — planes activos.
- `POST /api/billing/checkout` — crea `checkout.sessions` de Stripe.
- `GET /api/billing/portal` — portal del cliente Stripe.
- `POST /api/stripe/webhook` — recibe eventos y actualiza `membresias` + `stripe_webhooks`.

Los limites (`maxRfcs`, `maxMembers`) viven en `lib/account-plan.ts`:

| Tipo cuenta | Plan             | RFCs | Miembros |
|-------------|------------------|------|----------|
| single      | basic            | 1    | 0        |
| multi       | business_pro     | 5    | 5        |
| multi       | business_scale   | 20   | 20       |

### Equipos / Multi-usuario
- `GET /api/team`, `POST /api/team`, `DELETE /api/team/[id]` — gestión de miembros.
- `/dashboard/unete` + `/api/unete/registro` + `/api/unete/token` — endpoint de invitación.
- `lib/rfc-aliases.ts` — alias amigables por RFC.

### Soporte y notificaciones
- `POST /api/support` — crea tickets.
- `GET/PATCH /api/notifications` + `/api/notifications/[id]` — campana en `TopBar`.

### Auditoría
- `POST /api/logs` desde el cliente (`lib/logs.ts`).
- `GET /api/logs/get` para administración.

### Exportaciones (`/api/export/...`)
Cada submódulo de la app genera Excel con `exceljs`:

- `facturas`, `estados-financieros`, `flujo`, `efectivamente-pagado`,
- `notas-credito`, `pagos`, `comprobantes`, `diot`.

---

## Sistema de autenticación y planes

- **JWT HS256** firmado con `JWT_SECRET` (mínimo 32 chars). Tres "purposes":
  - `auth_token` (sesión, 7d).
  - `email_verification` (24h).
  - `password_reset` (1h).
- Cookies httpOnly, `sameSite=lax`, `secure` en producción.
- **Roles**: `owner`, `member`, `chikenelo`. Los miembros y chikenelos viajan con `ownerId` para resolver el dueño efectivo en queries.
- **Demo mode**: cookie `aicuenta_demo`. Si el visitante entra con `?demo=1` o sin sesión, el middleware deja pasar y `buildDemoSession()` arma un payload sintético. Las descargas están topeadas en `lib/demo-download-limit.ts`.
- **Google Sign-In**: `app/api/auth/google/`.
- **Reset / forgot password** envían correo con `Resend`.

---

## API HTTP

Route handlers organizados bajo `app/api/`:

| Ruta                                         | Método      | Propósito                                  |
|----------------------------------------------|-------------|--------------------------------------------|
| `/api/auth/register`                         | POST        | Alta de usuario + email de verificación    |
| `/api/auth/login`                            | POST        | Inicio de sesión + cookie JWT              |
| `/api/auth/logout`                           | POST        | Cerrar sesión                              |
| `/api/auth/me`                               | GET         | Sesión actual                              |
| `/api/auth/profile`                          | GET/PATCH   | Perfil del usuario                        |
| `/api/auth/verify`                           | GET         | Confirmación de email                      |
| `/api/auth/forgot-password`                  | POST        | Solicita reset                             |
| `/api/auth/reset-password`                   | POST        | Aplica reset                               |
| `/api/auth/google`                           | GET/POST    | OAuth Google                               |
| `/api/auth/account-type`                     | PATCH       | single ↔ multi                             |
| `/api/auth/set-rfc`                          | POST        | Setea RFC inicial                          |
| `/api/rfcs`, `/api/rfcs/[id]`                | CRUD        | RFCs del owner                             |
| `/api/dashboard`                             | GET         | Datos del dashboard                        |
| `/api/facturas`                              | GET         | Lista CFDI                                 |
| `/api/estados-financieros`                   | GET         | Balance/EF                                 |
| `/api/notas-credito`                         | GET         | CFDIs E                                    |
| `/api/pagos`                                 | GET         | CFDIs P                                    |
| `/api/efectivamente-pagado`                  | GET         | Flujo real                                 |
| `/api/comprobantes`                          | GET         | Comprobantes WhatsApp                      |
| `/api/chat`                                  | POST        | Chat fiscal                                |
| `/api/chat-docs`                             | POST        | Chat documental                            |
| `/api/chat/export`, `/api/chat-docs/export`  | GET         | Descarga Excel one-shot                    |
| `/api/whatsapp/connect`                      | GET (SSE)   | Inicia sesión Baileys, emite QR/estado     |
| `/api/whatsapp/status`                       | GET         | Estado actual                              |
| `/api/whatsapp/disconnect`                   | POST        | Cierra sesión                              |
| `/api/billing/plans`                         | GET         | Planes activos                             |
| `/api/billing/checkout`                      | POST        | Crea Checkout Session                      |
| `/api/billing/portal`                        | GET         | Portal de cliente Stripe                   |
| `/api/stripe/webhook`                        | POST        | Webhook firmado                            |
| `/api/team`, `/api/team/[id]`                | CRUD        | Miembros                                   |
| `/api/unete/registro`, `/api/unete/token`    | POST/GET    | Invitaciones                               |
| `/api/notifications`, `/api/notifications/[id]` | CRUD     | Campana de notificaciones                  |
| `/api/support`                               | POST        | Tickets                                    |
| `/api/logs`, `/api/logs/get`                 | POST/GET    | Auditoría                                  |
| `/api/export/*`                              | GET         | Excel por módulo                           |
| `/api/actions/*`                             | server fns  | `upload`, `uploadRfc`, `registerOwnRfc`    |

---

## Scripts auxiliares

`scripts/*.js` son utilidades Node sueltas para diagnóstico, fix de datos y workers SAT 69-B. No están enganchadas a `package.json`; se ejecutan con `node scripts/<archivo>.js`.

| Script                         | Propósito                                                       |
|--------------------------------|------------------------------------------------------------------|
| `diag-dashboard.js`            | Compara totales del dashboard contra SQL crudo                   |
| `diag-dmm-egresos.js`          | Diagnóstico de egresos por dimensiones                           |
| `diag-ef-vs-facturas.js`       | Verifica Estados Financieros vs facturas                         |
| `diag-estados-financieros.js`  | Validación de EF                                                 |
| `diag-gastos.js`, `diag-isr.js`, `diag-iva.js` | Diagnósticos puntuales                            |
| `fix-dup-conceptos-mayo2026.js`| Limpia conceptos duplicados                                      |
| `worker_sat69b.js`             | Worker que llama al SAT (descarga masiva 69-B)                   |
| `NotasCredito.js`, `pagos.js`, `formato.js` | Procesamiento/normalización XML                     |
| `schema_check.js`, `schema_pagos.js` | Inspección de esquema                                      |
| `variablesEspecificas.js`, `variablesEstaticas.js` | Configs compartidas                            |
| `_verify-fix.js`               | Verificación tras hot-fix                                        |

---

## Despliegue

La app está pensada para **Vercel**:

1. `git push` al repositorio conectado.
2. Define las variables de entorno en el dashboard de Vercel (idénticas a `.env`).
3. Habilita **Vercel Blob** para `BLOB_READ_WRITE_TOKEN`.
4. Asegura que el webhook de Stripe apunte a `https://<tu-dominio>/api/stripe/webhook` con `STRIPE_WEBHOOK_SECRET`.
5. Configura el dominio en `NEXT_PUBLIC_APP_URL`.

> El bot de WhatsApp usa el filesystem para guardar sesiones Baileys. En Vercel, `whatsapp-manager.ts` detecta `process.env.VERCEL` y cae en `os.tmpdir()`. Para producción persistente conviene moverlo a un host con disco (Railway/Fly/VM).

Build local:

```bash
npm run build
npm start
```

---

## Notas de desarrollo

- Esta versión de Next.js **no es la del entrenamiento clásico** de los modelos: lee `node_modules/next/dist/docs/` antes de cambiar APIs. Ver `AGENTS.md`.
- Las queries fiscales pesadas viven en `lib/facturas-query.ts`. Antes de cambiar SQL, corre los `scripts/diag-*.js` correspondientes para validar el impacto.
- Las descargas del chat se generan en memoria y se exponen vía `chat-docs-export-store.ts` (URLs efímeras). No persisten.
- Mantén `tsconfig.json` con `paths` `"@/*": ["./*"]` — los imports de `lib` dependen de eso.
- Los tests informales viven en `test.js` (Node script suelto); no hay framework configurado.
- `tsconfig.tsbuildinfo` y `.next/` son artefactos de build — no editar.

---

## Licencia

Proyecto privado.
