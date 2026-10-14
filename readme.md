# Real-Time Collaborative Kanban Board

[![Python](https://img.shields.io/badge/Python-3.11%20%7C%203.12%20%7C%203.13-blue.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688.svg?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-19.0-61DAFB.svg?logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x%20%2F%206.x-3178C6.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16--alpine-336791.svg?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Redis](https://img.shields.io/badge/Redis-7--alpine-DC382D.svg?logo=redis&logoColor=white)](https://redis.io/)
[![Vite](https://img.shields.io/badge/Vite-8.x-646CFF.svg?logo=vite&logoColor=white)](https://vitejs.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A high-performance, real-time collaborative Kanban board built for scale. Featuring fractional indexing ($O(1)$ Lexorank card positioning), atomic optimistic concurrency control (OCC), multi-tenant workspaces with role-based access control (RBAC), and distributed WebSocket broadcasting powered by Redis Pub/Sub.

---

## Table of Contents

- [Architectural Highlights](#architectural-highlights)
  - [O(1) Lexorank Fractional Indexing](#o1-lexorank-fractional-indexing)
  - [Optimistic Concurrency Control (OCC)](#optimistic-concurrency-control-occ)
  - [Distributed Real-Time Engine](#distributed-real-time-engine)
  - [Multi-Tenancy & RBAC](#multi-tenancy--rbac)
  - [Enterprise Security & Session Hardening](#enterprise-security--session-hardening)
- [Tech Stack](#tech-stack)
- [System Architecture](#system-architecture)
- [Directory Structure](#directory-structure)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [1. Infrastructure Setup (Docker Compose)](#1-infrastructure-setup-docker-compose)
  - [2. Backend Setup](#2-backend-setup)
  - [3. Frontend Setup](#3-frontend-setup)
- [Configuration (.env)](#configuration-env)
- [API Reference](#api-reference)
  - [REST API Endpoints](#rest-api-endpoints)
  - [WebSocket Protocol & Event Stream](#websocket-protocol--event-stream)
- [Testing & Quality Assurance](#testing--quality-assurance)
- [License](#license)

---

## Architectural Highlights

### O(1) Lexorank Fractional Indexing
Traditional Kanban implementations re-index every card in a column when an item is inserted or moved (an $O(N)$ write explosion causing database locks and latency spikes). This project utilizes Jira-style **Lexorank fractional indexing**:
- **Constant Time Updates:** Reordering only requires an $O(1)$ write updating the target card's `rank` string without touching surrounding cards.
- **Dynamic 6-Digit Spacing:** Initial ranks and column rebalances calculate adaptive steps (`step = max(1, min(step, 999_999 // (count + 1)))`) ensuring strict 6-digit rank strings (`0|083333:`, `0|166666:`, etc.).
- **Deterministic ASCII Collation:** Postgres rank columns are declared with `COLLATE "C"`, guaranteeing byte-level ASCII sorting matching clientside string comparators across operating systems and locales.
- **Rank Space Exhaustion Recovery:** If consecutive subdivisions exhaust available characters, a `RankSpaceExhausted` exception triggers synchronous row-locked rebalancing (`rebalance_column_cards` with `SELECT ... FOR UPDATE`), cleanly recalculating ranks and broadcasting updates.

### Optimistic Concurrency Control (OCC)
- Every card row maintains a `version: int` column.
- Concurrent updates and drag-and-drop operations execute an atomic database condition:
  ```sql
  UPDATE cards
  SET column_id = :target_col, rank = :new_rank, version = cards.version + 1
  WHERE cards.id = :id AND cards.version = :version
  RETURNING cards.version;
  ```
- If another client updated the card concurrently, the query returns zero rows, rolling back and returning `HTTP 409 Conflict`, completely preventing lost updates and race conditions.

### Distributed Real-Time Engine
- **Horizontal Scalability:** Backend workers publish board events (`CARD_MOVED`, `CARD_CREATED`, `COLUMN_REBALANCED`, etc.) to Redis Pub/Sub channels (`board:{board_id}`), enabling synchronization across multiple application server instances.
- **Connection Isolation:** WebSocket handshakes authenticate via short-lived database sessions and immediately release them before the receive loop starts, eliminating connection pool starvation.
- **Auto-Reconnection & Backoff:** The background Redis subscriber features an exponential backoff reconnect loop, and frontend clients automatically invalidate their React Query caches upon reconnecting to synchronize any missed state.
- **Concurrent Non-Blocking Broadcasts:** Event broadcasts use `asyncio.gather` with timeouts so a slow or stalling client socket cannot block other users on the board.

### Multi-Tenancy & RBAC
- **Strict Isolation:** Every workspace forms a distinct tenancy boundary. Boards, columns, and cards verify membership on every request (`check_board_access`, `check_column_access`, `check_card_access`).
- **Granular Roles:**
  - `owner`: Full administrative control, workspace deletion, role promotions, and member removal.
  - `admin`: Board management, column lifecycle, triggering rebalances, and adding members.
  - `member`: Collaborative card creation, card updates, and drag-and-drop movement.
- **Enumeration Resistance:** Member invitation endpoints return generic status messages to prevent malicious user enumeration.

### Enterprise Security & Session Hardening
- **JWT Authentication:** Dual-token model with short-lived access tokens (30 minutes) and HttpOnly rotating refresh tokens (7 days).
- **Atomic Refresh Token Rotation:** Single-use refresh token consumption is validated atomically in Redis using `SET NX` with remaining TTL, mitigating replay attacks.
- **Fail-Closed Blocklist:** Token revocation fails closed with `HTTP 503 Service Unavailable` if Redis is unreachable. Logout invalidates both the access token's `jti` and refresh token.
- **Offloaded Bcrypt Hashing:** Passwords are constrained to 72 bytes and processed via threadpool execution (`anyio.to_thread.run_sync`), keeping the asynchronous event loop responsive.
- **Automatic Client Token Renewal:** The frontend HTTP client intercepts `401 Unauthorized` responses, coordinates a shared token refresh promise, and retries pending requests transparently.

---

## Tech Stack

| Layer | Technologies |
|---|---|
| **Backend Framework** | [FastAPI](https://fastapi.tiangolo.com/) (Python 3.13 / 3.12 / 3.11), [Uvicorn](https://www.uvicorn.org/) |
| **Database & ORM** | [PostgreSQL 16](https://www.postgresql.org/), [SQLAlchemy 2.0 (Async)](https://docs.sqlalchemy.org/), [asyncpg](https://github.com/MagicStack/asyncpg), [Alembic](https://alembic.sqlalchemy.org/) |
| **Cache & Pub/Sub** | [Redis 7](https://redis.io/) (redis-py async client) |
| **Frontend Framework** | [React 19](https://react.dev/), [Vite 8](https://vitejs.dev/), [TypeScript](https://www.typescriptlang.org/) |
| **State & Data Fetching** | [@tanstack/react-query v5](https://tanstack.com/query/latest) |
| **Drag & Drop** | [@dnd-kit/core](https://dndkit.com/), `@dnd-kit/sortable`, `@dnd-kit/utilities` |
| **Styling & Icons** | Vanilla CSS Design System, [Tailwind CSS v4](https://tailwindcss.com/), [Lucide React](https://lucide.dev/) |
| **Validation & Security** | [Pydantic v2](https://docs.pydantic.dev/), [PyJWT](https://pyjwt.readthedocs.io/), [bcrypt](https://pypi.org/project/bcrypt/) |
| **Testing** | [Pytest](https://pytest.org/), [pytest-asyncio](https://github.com/pytest-dev/pytest-asyncio), [HTTPX](https://www.python-httpx.org/) |

---

## System Architecture

```text
  ┌─────────────────────────────────────────────────────────────┐
  │                    React 19 Frontend                        │
  │     (Vite + @tanstack/react-query + @dnd-kit + Vanilla CSS) │
  └──────────────┬──────────────────────────────▲───────────────┘
                 │ REST API (JSON)              │ WebSockets (Events)
                 ▼                              │
  ┌─────────────────────────────────────────────┴───────────────┐
  │                    FastAPI Backend Workers                  │
  │   - Tenancy Middleware & RBAC Security Guards               │
  │   - Lexorank O(1) Reordering & Optimistic Concurrency Engine│
  │   - ConnectionManager with Periodic Re-authorization        │
  └──────────────┬──────────────────────────────┬───────────────┘
                 │ Async SQLAlchemy             │ Pub/Sub & Blocklist
                 ▼                              ▼
  ┌──────────────────────────────┐ ┌────────────────────────────┐
  │     PostgreSQL 16 Alpine     │ │       Redis 7 Alpine       │
  │  - Workspaces & Memberships  │ │  - Channel: board:{board}  │
  │  - Boards, Columns, Cards    │ │  - Token Blocklist (SET NX)│
  │  - Collation "C" Rank Index  │ │  - Rate Limiting & Ephemeral│
  └──────────────────────────────┘ └────────────────────────────┘
```

---

## Directory Structure

```text
kanban-board/
├── alembic/                       # Database migration scripts
│   ├── env.py                     # Async migration configuration
│   └── versions/                  # Revision versions (indexes, collation, schema)
├── app/                           # Core backend application
│   ├── api/                       # API router & route endpoints
│   │   ├── deps.py                # Security dependencies & role extractors
│   │   └── v1/                    # API v1 routes
│   │       ├── auth.py            # Authentication, registration, refresh, logout
│   │       ├── boards.py          # Board CRUD & membership checks
│   │       ├── cards.py           # Card operations, O(1) moves, OCC verification
│   │       ├── columns.py         # Column management & rebalance triggers
│   │       ├── router.py          # API router registry
│   │       ├── websockets.py      # Resilient WebSocket endpoints & handshake
│   │       └── workspaces.py      # Workspace management & RBAC administration
│   ├── core/                      # Application infrastructure & configuration
│   │   ├── config.py              # Pydantic Settings with secret validators
│   │   ├── database.py            # Async engine, sessionmaker, and context providers
│   │   ├── redis.py               # Redis pool with event-loop awareness & SET NX
│   │   └── security.py            # JWT encoding, password hashing, and token verification
│   ├── models/                    # SQLAlchemy declarative ORM models
│   │   ├── board.py               # Board, Column, Card (indexes, versioning, collation)
│   │   ├── user.py                # User model
│   │   └── workspace.py           # Workspace and WorkspaceMember models
│   ├── schemas/                   # Pydantic request/response schemas
│   │   ├── auth.py                # Login, register, token schemas
│   │   ├── board.py               # Board, column, card, and move request schemas
│   │   ├── user.py                # User representations
│   │   └── workspace.py           # Workspace request schemas
│   └── services/                  # Business logic services
│       ├── lexorank.py            # Lexorank algorithms, spacing, monotonic subdivision
│       └── websocket_manager.py   # Redis Pub/Sub multiplexer & concurrent broadcast
├── frontend/                      # React + TypeScript frontend
│   ├── src/
│   │   ├── components/            # UI components (BoardView, DragOverlay, Navbar, etc.)
│   │   ├── hooks/                 # Custom hooks (useWebSocket, useAuth)
│   │   ├── services/              # API clients & client Lexorank calculator
│   │   ├── types/                 # TypeScript type declarations
│   │   ├── App.tsx                # Application root with router
│   │   └── main.tsx               # DOM entry point
│   ├── package.json
│   └── vite.config.ts
├── tests/                         # Automated test suite
│   ├── conftest.py                # Async fixtures, loop engine, client overrides
│   ├── test_auth.py               # Auth flows, password limits, replay protection
│   ├── test_boards_crud.py        # Board, column, card lifecycle & concurrency tests
│   ├── test_lexorank.py           # Lexorank mathematical & boundary unit tests
│   ├── test_websockets_redis.py   # Multi-client WebSocket & broadcast integration
│   └── test_workspaces.py         # Multi-tenancy isolation & RBAC enforcement
├── compose.yaml                   # Docker Compose definition (PostgreSQL & Redis)
├── main.py                        # FastAPI application entry point with lifespan
├── pytest.ini                     # Pytest configuration
├── requirements.txt               # Backend Python dependencies
└── README.md                      # Project documentation
```

---

## Getting Started

### Prerequisites

Ensure you have the following installed on your machine:
- **Docker & Docker Compose** (for PostgreSQL 16 and Redis 7)
- **Python 3.11+** (Python 3.12 or 3.13 recommended)
- **Node.js 18+** and **npm**

---

### 1. Infrastructure Setup (Docker Compose)

Start the PostgreSQL 16 database and Redis 7 service in the background:

```bash
docker compose up -d
```

Verify services are healthy:
```bash
docker compose ps
```

---

### 2. Backend Setup

1. **Create and activate a virtual environment:**
   ```bash
   # Linux / macOS
   python3 -m venv venv
   source venv/bin/activate

   # Windows (PowerShell)
   python -m venv venv
   .\venv\Scripts\Activate.ps1
   ```

2. **Install backend dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

3. **Configure Environment Variables:**
   Create a `.env` file from the example template:
   ```bash
   cp .env.example .env
   ```
   *(Ensure `SECRET_KEY` is set to a secure string of at least 32 characters).*

4. **Run Database Migrations:**
   Apply Alembic schema migrations:
   ```bash
   alembic upgrade head
   ```

5. **Start the FastAPI Development Server:**
   ```bash
   uvicorn main:app --host 127.0.0.1 --port 8000 --reload
   ```

The backend API will be available at [http://127.0.0.1:8000](http://127.0.0.1:8000), and interactive documentation will be hosted at [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs).

---

### 3. Frontend Setup

1. **Navigate to the frontend directory:**
   ```bash
   cd frontend
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the Vite development server:**
   ```bash
   npm run dev
   ```

Open your browser at [http://localhost:5173](http://localhost:5173). The Vite dev server proxies `/api` and `/ws` requests directly to `http://127.0.0.1:8000`.

---

## Configuration (.env)

| Variable | Type | Default | Description |
|---|---|---|---|
| `PROJECT_NAME` | string | `Real-Time Collaborative Kanban` | Name of the project displayed in docs and health metadata. |
| `API_V1_STR` | string | `/api` | Base path prefix for REST routes. |
| `DATABASE_URL` | string | `postgresql+asyncpg://postgres:password@127.0.0.1:5432/kanban_board` | Asynchronous connection string for PostgreSQL. |
| `REDIS_URL` | string | `redis://127.0.0.1:6379/0` | Redis instance connection string. |
| `SECRET_KEY` | string | *Required* | Cryptographically secure secret key for signing JWTs (min 32 chars). |
| `ALGORITHM` | string | `HS256` | JWT signing algorithm. |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | int | `30` | Access token lifespan in minutes. |
| `REFRESH_TOKEN_EXPIRE_DAYS` | int | `7` | Refresh token lifespan in days. |
| `COOKIE_SECURE` | bool | `false` | Set to `true` in production to require HTTPS for refresh cookies. |
| `COOKIE_SAMESITE` | string | `lax` | SameSite cookie attribute (`lax`, `strict`, or `none`). |
| `CORS_ORIGINS` | JSON list | `["http://localhost:5173", "http://127.0.0.1:5173"]` | Permitted browser origins for CORS. |

---

## API Reference

### REST API Endpoints

Interactive Swagger UI documentation is available at `/docs` and ReDoc at `/redoc`.

#### Authentication (`/api/auth`)
- `POST /api/auth/register` - Create a new user account.
- `POST /api/auth/token` - Authenticate with email/password and obtain JWT access & refresh tokens.
- `POST /api/auth/refresh` - Rotate refresh token and issue a fresh access token.
- `POST /api/auth/logout` - Revoke current access token (`jti`) and refresh token.
- `GET /api/auth/me` - Retrieve current user profile.
- `PATCH /api/auth/me` - Update user display name.

#### Workspaces (`/api/workspaces`)
- `GET /api/workspaces` - List workspaces the caller belongs to.
- `POST /api/workspaces` - Create a new workspace (creator assigned as `owner`).
- `GET /api/workspaces/{id}` - Retrieve workspace details and member roster.
- `PATCH /api/workspaces/{id}` - Update workspace title (`owner` or `admin`).
- `DELETE /api/workspaces/{id}` - Delete workspace (`owner` only).
- `POST /api/workspaces/{id}/members` - Invite a user to workspace by email (`owner` or `admin`).
- `PATCH /api/workspaces/{id}/members/{user_id}` - Update member role (`owner` only).
- `DELETE /api/workspaces/{id}/members/{user_id}` - Remove a member (`owner` or `admin`).

#### Boards (`/api`)
- `GET /api/workspaces/{id}/boards` - List all boards in a workspace.
- `POST /api/workspaces/{id}/boards` - Create a board (generates default "To Do", "In Progress", and "Done" columns).
- `GET /api/boards/{id}` - Retrieve board hierarchy (eagerly loads columns and cards).
- `PATCH /api/boards/{id}` - Update board title.
- `DELETE /api/boards/{id}` - Delete board and cascade children (`owner` or `admin`).

#### Columns (`/api`)
- `POST /api/boards/{id}/columns` - Add a column (enforces maximum 10 columns per board).
- `PATCH /api/columns/{id}` - Update column title.
- `DELETE /api/columns/{id}` - Delete column and cascade cards (`owner` or `admin`).
- `POST /api/columns/{id}/rebalance` - Trigger column Lexorank rebalancing (`owner` or `admin`).

#### Cards (`/api`)
- `POST /api/columns/{id}/cards` - Create a card with calculated Lexorank positioning.
- `GET /api/cards/{id}` - Retrieve card details.
- `PATCH /api/cards/{id}` - Update card title, description, or assignee (validates workspace membership).
- `PATCH /api/cards/{id}/move` - Move card across columns or ranks with $O(1)$ Lexorank calculation and atomic optimistic concurrency check (`version`).
- `DELETE /api/cards/{id}` - Delete a card.

---

### WebSocket Protocol & Event Stream

Connect to `/ws/boards/{board_id}?token={access_token}` to stream real-time updates.

#### Client-to-Server Messages
- **Heartbeat Ping:**
  ```json
  { "type": "PING" }
  ```
  *Server replies with `{ "type": "PONG" }`.*

#### Server-to-Client Broadcast Events
When a mutation occurs on the board, an event is published to Redis and broadcast to all connected WebSocket clients:

| Event Type | Payload Attributes | Trigger Description |
|---|---|---|
| `CARD_CREATED` | `card_id`, `column_id`, `board_id`, `title`, `description`, `assignee_id`, `rank`, `version` | Card created in a column. |
| `CARD_UPDATED` | `card_id`, `column_id`, `board_id`, `title`, `description`, `assignee_id`, `version` | Card content or assignee modified. |
| `CARD_MOVED` | `card_id`, `source_column_id`, `target_column_id`, `new_rank`, `version` | Card moved to a new column or reordered. |
| `CARD_DELETED` | `card_id`, `column_id`, `board_id` | Card deleted. |
| `COLUMN_CREATED` | `column_id`, `board_id`, `title`, `rank` | New column added. |
| `COLUMN_UPDATED` | `column_id`, `board_id`, `title` | Column title renamed. |
| `COLUMN_DELETED` | `column_id`, `board_id` | Column removed. |
| `COLUMN_REBALANCED` | `column_id`, `board_id`, `cards` | Column ranks redistributed. |

---

## Testing & Quality Assurance

The codebase includes an extensive automated test suite covering security boundaries, multi-tenancy isolation, Lexorank algorithms, race conditions, and real-time WebSockets:

```bash
# Run the complete test suite with verbose output
venv\Scripts\pytest -v

# Run tests targeting a specific module
venv\Scripts\pytest tests/test_lexorank.py -v
venv\Scripts\pytest tests/test_boards_crud.py -v
```

### Test Coverage Highlights:
- **`test_auth.py`**: Registration/login cycles, case-insensitive email normalization, password bounds (rejecting $>72$ bytes), atomic refresh token replay protection, and access token revocation upon logout.
- **`test_boards_crud.py`**: Column limit enforcement ($\le 10$), cross-column moves, optimistic concurrency conflict handling ($HTTP\ 409$), outsider assignee rejection, and role-guarded column operations.
- **`test_lexorank.py`**: Mathematical string subdivision, adjacent collision detection, $10+$ card spacing monotonicity, repeated head/tail insertions, and space exhaustion handling.
- **`test_websockets_redis.py`**: Multi-client pub/sub broadcasting, heartbeat pings, unauthorized connection rejections, and real-time card/column lifecycle emissions.
- **`test_workspaces.py`**: Multi-tenancy isolation guards, member invitation workflows, admin removal protection, and user enumeration resistance.

---

## License

This project is licensed under the [MIT License](LICENSE).
