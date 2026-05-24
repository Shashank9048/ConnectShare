require('dotenv').config(); // MUST be line 1

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const { ensureUploadDir } = require('./src/utils/storagePaths');

const app = express();
const httpServer = http.createServer(app); // ← NOT app.listen

const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true,
    methods: ['GET', 'POST'],
  },
  pingTimeout: 60000,
  pingInterval: 25000,
  transports: ['websocket', 'polling'],
});

// Middleware
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
  methods: ['GET','POST','PUT','DELETE','PATCH','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Uploads directory
const uploadDir = ensureUploadDir();
app.use('/uploads', express.static(uploadDir));

// Initialize events
require('./src/events/listeners')(io);

// Pass io instance to socket handler
require('./src/sockets/chat.socket')(io);

// Routes
app.use('/api/v1/auth', require('./src/routes/auth.routes'));
app.use('/api/v1/resources', require('./src/routes/resource.routes'));
app.use('/api/v1/workspaces', require('./src/routes/workspace.routes'));
app.use('/api/v1/ai', require('./src/routes/ai.routes'));
app.use('/api/v1/messages', require('./src/routes/message.routes'));
try { app.use('/api/v1/activity', require('./src/routes/activity.routes')); } catch(e){}
try { app.use('/api/v1/stats', require('./src/routes/stats.routes')); } catch(e){}

// Test route for Prisma
app.get('/api/test-prisma', async (req, res) => {
  try {
    const prisma = require('./src/config/db.prisma');
    const count = await prisma.user.count();
    res.json({ success: true, userCount: count });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.all('*', (req, res) => res.status(404).json({ success: false, error: 'Route not found' }));
app.use(require('./src/middleware/error.middleware'));

const startServer = async () => {
  await require('./src/config/db.mongo').connectMongoDB();
  await require('./src/config/db.prisma').$connect();
  console.log('✅ PostgreSQL connected');

  const { testGemini } = require('./src/config/gemini');
  await testGemini();

  httpServer.listen(process.env.PORT || 5000, () => {
    console.log(`✅ Server + Socket.IO on port ${process.env.PORT || 5000}`);
  });
};

if (require.main === module) {
  startServer().catch(err => { console.error(err); process.exit(1); });
}

module.exports = { app, httpServer, startServer };
