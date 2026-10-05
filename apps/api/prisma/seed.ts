import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import argon2 from "argon2";
import { PrismaClient } from "../src/generated/prisma/client.js";

const email = process.env.SEED_ADMIN_EMAIL ?? "admin@starter.dev";
const password = process.env.SEED_ADMIN_PASSWORD;

if (!password) {
  console.error("Defina SEED_ADMIN_PASSWORD para criar o admin.");
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

// upsert: rodar o seed várias vezes não duplica o admin.
const admin = await prisma.user.upsert({
  where: { email },
  update: {},
  create: {
    name: "Administrador",
    email,
    passwordHash: await argon2.hash(password),
    role: "ADMIN",
  },
});

console.log(`Admin pronto: ${admin.email}`);
await prisma.$disconnect();
