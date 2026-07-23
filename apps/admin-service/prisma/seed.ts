import { prisma } from "../src/config/prisma.js";
import bcrypt from "bcryptjs";
import { env } from "../src/config/env.js";

async function main() {
  const email = env.ADMIN_EMAIL;
  const rawPassword = env.ADMIN_PASSWORD;

  console.log(`Seeding admin account for ${email}...`);

  const passwordHash = await bcrypt.hash(rawPassword, 10);

  const admin = await prisma.admin.upsert({
    where: { email },
    update: {
      passwordHash,
    },
    create: {
      email,
      passwordHash,
    },
  });

  console.log(`Admin account seeded successfully: ${admin.id}`);
}

try {
  await main();
} catch (e) {
  console.error("Error seeding admin database:", e);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
