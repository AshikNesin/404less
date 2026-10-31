import { describe, expect, it } from "vite-plus/test";
import { generateToken, jwtExpiresInMs, verifyToken } from "@groot/core/utils/jwt.utils";
import { Boom } from "@groot/core/errors";

describe("jwt", () => {
  it("round-trips the user claims", async () => {
    const token = await generateToken({ userId: 7, email: "a@b.c" });
    expect(await verifyToken(token)).toEqual({ userId: 7, email: "a@b.c" });
  });

  it("rejects tampered or garbage tokens with a 401", async () => {
    const token = await generateToken({ userId: 7, email: "a@b.c" });
    const tampered = `${token.slice(0, -2)}xx`;
    for (const bad of [tampered, "not-a-token", ""]) {
      const error = await verifyToken(bad).catch((e: unknown) => e);
      expect(Boom.isHttpError(error) && error.statusCode).toBe(401);
    }
  });

  it("derives the cookie lifetime from config", () => {
    expect(jwtExpiresInMs()).toBe(30 * 24 * 60 * 60 * 1000);
  });
});
