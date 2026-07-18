import { prisma } from "../src/config/prisma.js";
import bcrypt from "bcryptjs";

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const rawPassword = process.env.ADMIN_PASSWORD;
  if (!email || !rawPassword) {
    throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD are required for seeding");
  }

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

main()
  .catch((e) => {
    console.error("Error seeding admin database:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
