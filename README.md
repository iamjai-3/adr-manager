# ADR Manager

A full-featured **Architecture Decision Record (ADR) management platform** built for engineering teams. Capture, track, and collaborate on architectural decisions across multiple projects — with built-in requirements management, architecture diagrams, file attachments, version history, audit trails, and real-time notifications.

---

## What is an ADR?

An Architecture Decision Record (ADR) is a document that captures an important architectural decision made during a project, along with its context, rationale, and consequences. ADR Manager gives teams a structured, collaborative workspace to author and govern these decisions throughout their lifecycle.

---

## Features

### Core ADR Workflow
- Create, edit, and manage ADRs with rich text fields: Context, Decision, Consequences, and Alternatives
- Project-scoped ADR numbering (e.g. `PLAT-001`, `FE-002`)
- Full **status lifecycle**: Draft → Proposed → In Review → Accepted → Deprecated / Superseded
- Status transition enforcement with mandatory change reasons
- ADR **version history** — every status change or edit creates a new version snapshot
- **Archive** ADRs with a reason, hiding them from the default view

### Project-Based Access Control
- Administrators create **Projects** and assign users to them
- Three **project roles**: `admin`, `editor`, `viewer`
- Users only see projects and ADRs they are assigned to
- Global admin role for platform-level administration

### Architecture Diagrams
- Embedded **Excalidraw** editor per ADR — draw architecture diagrams directly inside the platform
- Auto-loads the most recently saved diagram when reopening the editor
- Save / update diagrams with custom names; load any previously saved version
- Export as PNG or SVG via Excalidraw's built-in menu

### ADR Document View
- View any ADR as a **rich formatted document** — a clean, printable page that includes:
  - Metadata header (author, team, project, dates, status, tags)
  - Numbered document sections (Context, Decision, Consequences, Alternatives)
  - Embedded read-only architecture diagram
  - Project requirements (FR & NFR)
  - Version history timeline
  - Discussion / comments
- **Print or export as PDF** with one click

### Requirements Management
- Add **Functional Requirements (FR)** and **Non-Functional Requirements (NFR)** at the project level
- Properties: title, description, type, priority (critical / high / medium / low), status (open / in-progress / implemented / deferred)
- Requirements are displayed in the ADR document view for traceability

### File Attachments
- Upload architecture diagrams, images, and documents to any project
- Stored in **MinIO** (S3-compatible object storage)
- Signed URL access for secure file downloads
- Drag-and-drop upload UI with image lightbox and PDF viewer

### Search
- **Global search** across all accessible ADRs
- Filter by status, team, tags, and author
- URL-synced filters for shareable search links
- Server-side pagination

### Comments & Collaboration
- Comment on any ADR with timestamped, attributed messages
- Comments appear in the document view

### Notifications
- In-app **notification bell** with unread badge
- Automatically notified on ADR status changes and when added to a project
- Mark individual or all notifications as read
- Polls for new notifications in the background

### Audit Trail
- Every create, update, delete, and status change is logged
- Admins can view the full audit log with entity type, action, performer, and timestamp

### User Management
- Admin-only user management page
- Create users, assign global roles (`admin`, `editor`, `viewer`)

### Theme
- Light and dark mode toggle, persisted across sessions

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, TypeScript |
| Routing | Wouter |
| Data Fetching | TanStack React Query v5 |
| UI Components | shadcn/ui (Radix UI + Tailwind CSS) |
| Diagrams | Excalidraw |
| Backend | Node.js, Express 5 |
| Auth | Passport.js (local strategy) + express-session |
| Database | PostgreSQL (via `pg`) |
| ORM | Drizzle ORM + Drizzle Kit |
| File Storage | MinIO (S3-compatible) via `minio` SDK |
| File Uploads | Multer |
| Validation | Zod |
| Containerisation | Docker Compose |

---

## Project Structure

```
ADR-Manager/
├── client/                   # React frontend (Vite)
│   └── src/
│       ├── components/       # Shared UI components
│       ├── hooks/            # Custom React hooks (auth, toast, etc.)
│       ├── lib/              # QueryClient, API helpers
│       └── pages/            # Route-level page components
│           ├── adr-create.tsx
│           ├── adr-detail.tsx
│           ├── adr-edit.tsx
│           ├── adr-view.tsx         # Rich document view with diagram
│           ├── audit-log.tsx
│           ├── dashboard.tsx
│           ├── diagram-editor.tsx   # Excalidraw-based diagram editor
│           ├── project-requirements.tsx
│           ├── project-settings.tsx
│           ├── projects.tsx
│           ├── search.tsx
│           └── user-management.tsx
├── server/                   # Express backend
│   ├── auth.ts               # Passport.js authentication
│   ├── audit.ts              # Audit logging helper
│   ├── db.ts                 # Drizzle DB connection
│   ├── file-storage.ts       # MinIO client wrapper
│   ├── index.ts              # Server entry point
│   ├── notifications.ts      # In-app notification helpers
│   ├── routes.ts             # All API route definitions
│   ├── seed.ts               # Database seeder with demo data
│   └── storage.ts            # Data access layer (all DB queries)
├── shared/
│   └── schema.ts             # Drizzle schema + shared types
├── docker-compose.yml        # PostgreSQL + MinIO services
├── drizzle.config.ts
├── .env.example
└── package.json
```

---

## Prerequisites

- **Node.js** 20+
- **Docker** and Docker Compose

---

## Getting Started

### 1. Clone and install dependencies

```bash
git clone <repo-url>
cd ADR-Manager
npm install
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` with your settings (defaults work out of the box with Docker Compose):

```env
DATABASE_URL=postgresql://admin:admin@localhost:5432/adr_manager
PORT=3000
SESSION_SECRET=your-secret-key-here

# MinIO
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_USE_SSL=false
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin123
MINIO_BUCKET=adr-manager
```

### 3. Start infrastructure (PostgreSQL + MinIO)

```bash
docker-compose up -d
```

This starts:
- **PostgreSQL** on port `5432`
- **MinIO** S3 API on port `9000`, Web Console on port `9001`

### 4. Push the database schema

```bash
npm run db:push
```

### 5. Seed demo data

```bash
npm run db:seed
```

This creates demo projects, users, and ADRs so you can explore the app immediately.

**Demo accounts:**

| Username | Password | Global Role |
|---|---|---|
| `admin` | `password` | Admin |
| `alice` | `password` | Editor |
| `bob` | `password` | Editor |
| `carol` | `password` | Viewer |
| `viewer` | `password` | Viewer |

### 6. Start the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Available Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start dev server with hot reload |
| `npm run build` | Build for production |
| `npm run start` | Run production build |
| `npm run check` | TypeScript type check |
| `npm run db:push` | Push schema changes to database |
| `npm run db:seed` | Seed database with demo data |

---

## Key API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/projects` | List accessible projects |
| `POST` | `/api/projects` | Create a project |
| `GET` | `/api/projects/:id/adrs` | List ADRs in a project |
| `POST` | `/api/projects/:id/adrs` | Create an ADR |
| `PATCH` | `/api/projects/:id/adrs/:id/status` | Change ADR status |
| `GET` | `/api/projects/:id/adrs/:id/versions` | ADR version history |
| `GET` | `/api/projects/:id/adrs/:adrId/diagrams` | Get diagrams for an ADR |
| `POST` | `/api/projects/:id/adrs/:adrId/diagrams` | Save a diagram |
| `GET` | `/api/projects/:id/requirements` | List project requirements |
| `GET` | `/api/search` | Global ADR search with filters |
| `GET` | `/api/notifications` | User notifications |
| `GET` | `/api/audit-logs` | Audit log (admin only) |

---

## MinIO Web Console

Access the MinIO admin console at [http://localhost:9001](http://localhost:9001)

- **Username**: `minioadmin`
- **Password**: `minioadmin123`

---

## ADR Status Lifecycle

```
Draft ──► Proposed ──► In Review ──► Accepted
                                        │
                              Deprecated / Superseded
```

Each transition requires a reason and creates a new version snapshot.

---

## License

MIT
