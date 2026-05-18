// ============================================================
// database.js - shared DB bootstrap helpers
// ============================================================
const mongoose = require('mongoose');
const prisma = require('./db.prisma');

function getPrisma() {
  return prisma;
}

async function initializePrisma() {
  const client = getPrisma();
  try {
    await client.$connect();
    console.log('✅ PostgreSQL connected via Prisma (or local fallback if DB unreachable)');
  } catch (error) {
    console.error('PostgreSQL connection failed:', error.message);
  }
  return client;
}

async function connectMongoDB() {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log(`MongoDB connected: ${conn.connection.host}`);
  } catch (error) {
    console.error('MongoDB connection failed:', error.message);
  }
}

process.on('SIGINT', async () => {
  await mongoose.connection.close();
  await prisma.$disconnect();
  console.log('Database connections closed');
  process.exit(0);
});

module.exports = {
  connectMongoDB,
  initializePrisma,
  getPrisma,
};
