/**
 * Creates an admin account, or resets the password of an existing one.
 *
 *   ADMIN_EMAIL=owner@example.com ADMIN_PASSWORD='a long passphrase' pnpm --filter api create-admin
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { MongoClient, ObjectId } from 'mongodb';

const MIN_PASSWORD_LENGTH = 12;
const BCRYPT_COST = 12;

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim();
  const password = process.env.ADMIN_PASSWORD ?? '';
  const name = process.env.ADMIN_NAME?.trim() || 'Admin';

  if (!email) throw new Error('Set ADMIN_EMAIL');
  if (password.length < MIN_PASSWORD_LENGTH) throw new Error(`ADMIN_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters`);

  const client = new MongoClient(process.env.DATABASE_URL || 'mongodb://localhost:27017/adarsharestro');
  try {
    const users = client.db().collection('User');
    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
    const now = new Date();
    const result = await users.updateOne(
      { email },
      {
        $set: { passwordHash, role: 'ADMIN', isActive: true, updatedAt: now },
        $setOnInsert: { _id: new ObjectId(), email, name, createdAt: now },
      },
      { upsert: true },
    );
    console.log(result.upsertedCount ? `Created admin ${email}` : `Reset password and admin role for ${email}`);
  } finally {
    await client.close();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
