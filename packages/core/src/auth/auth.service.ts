import { eq } from "drizzle-orm";
import { db, users, type User } from "../database";
import { Boom } from "../errors";
import { generateToken } from "../utils/jwt.utils";
import { hashPassword, verifyPassword } from "../utils/password.utils";
import type { CreateUserDTO, LoginDTO, SessionUser } from "./auth.schema";

export type PublicUser = Pick<User, "id" | "email" | "name" | "createdAt">;

/** A well-formed hash that matches nothing, so login timing is identical for unknown emails. */
const DUMMY_HASH = `pbkdf2-sha256$100000$${"A".repeat(22)}$${"A".repeat(43)}`;

const publicColumns = {
  id: users.id,
  email: users.email,
  name: users.name,
  createdAt: users.createdAt,
};

export async function findUserById(id: number): Promise<User | null> {
  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return user ?? null;
}

export async function findUserByEmail(email: string): Promise<User | null> {
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return user ?? null;
}

export async function login(data: LoginDTO): Promise<{ token: string; user: SessionUser }> {
  const user = await findUserByEmail(data.email);
  const isValid = await verifyPassword(data.password, user?.password ?? DUMMY_HASH);
  if (!user || !isValid) {
    throw Boom.unauthorized("Invalid email or password");
  }

  const token = await generateToken({ userId: user.id, email: user.email });
  return { token, user: { id: user.id, email: user.email, name: user.name } };
}

export async function createUser(data: CreateUserDTO): Promise<PublicUser> {
  if (await findUserByEmail(data.email)) {
    throw Boom.conflict("User with this email already exists");
  }

  const [user] = await db
    .insert(users)
    .values({ email: data.email, password: await hashPassword(data.password), name: data.name })
    .returning(publicColumns);
  return user!;
}

export async function getUserById({ userId }: { userId: number }): Promise<PublicUser> {
  const user = await findUserById(userId);
  if (!user) {
    throw Boom.notFound(`User with identifier '${userId}' not found`);
  }
  return { id: user.id, email: user.email, name: user.name, createdAt: user.createdAt };
}

export async function getAllUsers(): Promise<PublicUser[]> {
  return db.select(publicColumns).from(users).orderBy(users.id);
}
