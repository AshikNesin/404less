import { describe, expect, it } from "vite-plus/test";
import { hashPassword, needsRehash, verifyPassword } from "@groot/core/utils/password.utils";

describe("password hashing", () => {
  it("round-trips and rejects wrong passwords", async () => {
    const hash = await hashPassword("s3cret!");
    expect(hash.startsWith("pbkdf2-sha256$100000$")).toBe(true);
    expect(await verifyPassword("s3cret!", hash)).toBe(true);
    expect(await verifyPassword("S3cret!", hash)).toBe(false);
  });

  it("uses a fresh salt per hash", async () => {
    expect(await hashPassword("same")).not.toBe(await hashPassword("same"));
  });

  it("rejects malformed stored hashes instead of throwing", async () => {
    expect(await verifyPassword("x", "")).toBe(false);
    expect(await verifyPassword("x", "$2a$10$notbcryptanymore")).toBe(false);
    expect(await verifyPassword("x", "pbkdf2-sha256$100000$abc")).toBe(false);
    // pass the shape check but fail to decode or derive
    expect(await verifyPassword("x", "pbkdf2-sha256$0$c2FsdA$aGFzaA")).toBe(false);
    expect(await verifyPassword("x", "pbkdf2-sha256$NaN$c2FsdA$aGFzaA")).toBe(false);
    expect(await verifyPassword("x", "pbkdf2-sha256$100000$%%%$***")).toBe(false);
  });

  it("flags hashes with a different iteration count", async () => {
    expect(needsRehash(await hashPassword("x"))).toBe(false);
    expect(needsRehash("pbkdf2-sha256$1000$AAAA$BBBB")).toBe(true);
  });
});
