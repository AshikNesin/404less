import { SignJWT, jwtVerify } from "jose";
import ms from "ms";
import { Boom } from "../errors";
import { env } from "../env";
import { config } from "../config";
import { utf8Encode } from "./encoding.utils";
import type { AuthUser } from "../types";

const ALGORITHM = "HS256";

function secret(): Uint8Array {
  return utf8Encode(env.JWT_SECRET_KEY);
}

/** Token lifetime in milliseconds, from `config.auth.jwtExpiresIn` (e.g. "30d"). */
export function jwtExpiresInMs(): number {
  const parsed = ms(config.auth.jwtExpiresIn as ms.StringValue);
  if (typeof parsed !== "number" || Number.isNaN(parsed)) {
    throw new Error(`Invalid auth.jwtExpiresIn: ${config.auth.jwtExpiresIn}`);
  }
  return parsed;
}

export async function generateToken(user: AuthUser): Promise<string> {
  return new SignJWT({ userId: user.userId, email: user.email })
    .setProtectedHeader({ alg: ALGORITHM })
    .setIssuedAt()
    .setExpirationTime(config.auth.jwtExpiresIn)
    .sign(secret());
}

export async function verifyToken(token: string): Promise<AuthUser> {
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: [ALGORITHM] });
    if (typeof payload.userId !== "number" || typeof payload.email !== "string") {
      throw Boom.unauthorized("Invalid token payload");
    }
    return { userId: payload.userId, email: payload.email };
  } catch (error) {
    if (Boom.isHttpError(error)) throw error;
    throw Boom.unauthorized("Invalid or expired token");
  }
}
