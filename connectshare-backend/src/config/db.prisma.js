const { PrismaClient } = require('@prisma/client');

// Singleton pattern — one instance for the whole app
const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' 
    ? ['error', 'warn'] 
    : ['error'],
});

// Test connection
prisma.$connect()
  .then(() => console.log('✅ PostgreSQL (Prisma) connected'))
  .catch((err) => {
    console.error('❌ Prisma connection failed:', err.message);
    process.exit(1);
  });

module.exports = prisma;
