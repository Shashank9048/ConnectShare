# ConnectShare — Collaboration Platform
A full-stack resource sharing and collaboration platform designed for 3rd year CS students. Think of it as Google Drive + Slack + Notion + AI Search, all in one unified system.

![NodeJS](https://img.shields.io/badge/Node.js-43853D?style=flat&logo=node.js&logoColor=white)
![React](https://img.shields.io/badge/React-20232A?style=flat&logo=react&logoColor=61DAFB)
![MongoDB](https://img.shields.io/badge/MongoDB-4EA94B?style=flat&logo=mongodb&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=flat&logo=postgresql&logoColor=white)
![Socket.IO](https://img.shields.io/badge/Socket.io-black?style=flat&logo=socket.io&badgeColor=010101)
![Gemini](https://img.shields.io/badge/Gemini-8E75B2?style=flat&logo=google&logoColor=white)

## ✨ Features
- 🚀 **Workspaces:** Create dedicated spaces for specific projects and invite team members.
- 🔒 **Role-Based Access Control (RBAC):** Admin, Member, and Viewer permissions mapped effectively.
- 💬 **Real-time Chat:** Instant messaging powered by Socket.IO with typing indicators.
- 🧠 **AI Semantic Search:** Google Gemini vector embeddings for semantic document search.
- 📦 **Resource Management:** Zlib stream compression for efficient file uploads.
- 🎨 **Dynamic UI:** Smooth Framer Motion animations, glassmorphism UI, dark mode, and robust skeleton loaders.

## 🏗️ Architecture
**Polyglot Persistence & Modular Monolith Pattern:**
- **PostgreSQL (via Prisma):** Relational data (Users, Workspaces, Members, RBAC) to strictly enforce referential integrity and role logic.
- **MongoDB (via Mongoose):** Flexible, document-heavy data (Resources, Activity Logs, Chat Messages) and high-dimensional AI Vector Embeddings.
- **Modular Monolith:** Separated concerns (routes, controllers, services, models) mimicking a microservices structure within a single Express app to simplify deployment while remaining scalable.

## 📂 Folder Structure
```text
ConnectShare/
├── connectshare-backend/
│   ├── prisma/             # PostgreSQL Schema
│   ├── src/
│   │   ├── config/         # DB & Env Configurations
│   │   ├── controllers/    # Request Handlers
│   │   ├── events/         # EventEmitter & Listeners
│   │   ├── middleware/     # Auth, RBAC, Errors
│   │   ├── models/         # MongoDB Mongoose Schemas
│   │   ├── routes/         # Express API Routes
│   │   ├── services/       # Core Business Logic & AI
│   │   └── sockets/        # Socket.IO Handlers
│   ├── tests/              # Jest Integration Tests
│   └── server.js           # Entry Point
└── connectshare-frontend/
    ├── public/             # Static Assets
    ├── src/
    │   ├── components/     # UI, Layout, Features
    │   ├── hooks/          # Custom Hooks (useToast, useSocket)
    │   ├── pages/          # React Router Pages
    │   ├── services/       # Axios API Config
    │   ├── store/          # Zustand State Management
    │   └── App.tsx         # Main Routing
    ├── tailwind.config.js  # Theme and Design Tokens
    └── vite.config.ts      # Vite Config
```

## 🚀 Quick Start

**Backend Setup:**
```bash
git clone <your-repo-url>
cd connectshare-backend
npm install
npx prisma generate
npx prisma db push
npm run dev
```

**Frontend Setup (in a new terminal):**
```bash
cd connectshare-frontend
npm install
npm run dev
```

## 📖 API Documentation

| Route | Method | Auth | Description |
|-------|--------|------|-------------|
| `/api/v1/auth/register` | POST | Public | Register a new user |
| `/api/v1/auth/login` | POST | Public | Authenticate user & get JWT |
| `/api/v1/workspaces` | GET, POST | User | List or create workspaces |
| `/api/v1/workspaces/:id` | GET, DELETE | User/Admin | Get or delete workspace |
| `/api/v1/workspaces/:id/invite`| POST | Admin | Invite a user to workspace |
| `/api/v1/resources` | GET | Member+ | List workspace resources |
| `/api/v1/resources/upload` | POST | Member+ | Upload and compress file |
| `/api/v1/resources/:id` | DELETE | Owner/Admin| Delete resource |
| `/api/v1/search/ai` | POST | Member+ | AI semantic search |
| `/api/v1/messages` | GET | Member+ | Get chat history |

## 🌍 Environment Variables

**Backend (`.env`)**
| Variable | Description | Source |
|----------|-------------|--------|
| `GEMINI_API_KEY` | Google AI API Key | [Google AI Studio](https://aistudio.google.com/) |
| `MONGODB_URI` | Atlas Connection String | [MongoDB Atlas](https://www.mongodb.com/) |
| `DATABASE_URL` | PostgreSQL URL | [Neon Tech](https://neon.tech/) |
| `JWT_ACCESS_SECRET` | Secret string for JWT | Generate locally |
| `CLIENT_URL` | Frontend URL | Default: `http://localhost:5173` |

## Deployed at: https://connectshare-frontend.onrender.com/
