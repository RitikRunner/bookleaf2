import bcrypt from 'bcryptjs';
import { prisma } from '../../lib/prisma.js';
import { NotFoundError, UnauthorizedError } from '../../lib/errors.js';
import type { SessionUser } from '../../lib/session.js';

// Compared against when the email is unknown, so response time does not reveal which emails have accounts.
const DUMMY_PASSWORD_HASH = bcrypt.hashSync('not-a-real-password', 10);

const profileSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  author: { select: { id: true } },
} as const;

type ProfileRecord = {
  id: string;
  email: string;
  name: string;
  role: SessionUser['role'];
  author: { id: string } | null;
};

function toProfile(user: ProfileRecord) {
  return { id: user.id, email: user.email, name: user.name, role: user.role, authorId: user.author?.id ?? null };
}

export type Profile = ReturnType<typeof toProfile>;

export async function login(email: string, password: string): Promise<Profile> {
  const user = await prisma.user.findUnique({ where: { email }, select: { ...profileSelect, passwordHash: true } });
  const passwordMatches = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
  // Same message for unknown email and wrong password, so the response does not confirm an account exists.
  if (!user || !passwordMatches) throw new UnauthorizedError('Invalid email or password');
  return toProfile(user);
}

export async function getProfile(userId: string): Promise<Profile> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: profileSelect });
  if (!user) throw new NotFoundError('User');
  return toProfile(user);
}
