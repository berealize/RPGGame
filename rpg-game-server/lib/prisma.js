const { PrismaClient } = require('@prisma/client');

const globalForPrisma = globalThis;

// Reuse a single PrismaClient during development reloads to avoid duplicate pools.
const prisma = globalForPrisma.prisma || new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

module.exports = prisma;
