import {
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
  type RegistrationResponseJSON,
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import { config } from "../config";
import type { Passkey } from "../database";
import type { PasskeyKind } from "./passkey.schema";

function transports(passkey: Passkey): AuthenticatorTransportFuture[] {
  return passkey.transports as AuthenticatorTransportFuture[];
}

export async function generatePasskeyRegistrationOptions(
  user: { id: number; email: string },
  existingCredentials: Passkey[] = [],
) {
  return generateRegistrationOptions({
    rpName: config.passkey.rpName,
    rpID: config.passkey.rpId,
    userName: user.email,
    userDisplayName: user.email,
    excludeCredentials: existingCredentials.map((passkey) => ({
      id: passkey.credentialId,
      type: "public-key",
      transports: transports(passkey),
    })),
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
      authenticatorAttachment: "platform",
    },
    attestationType: "none",
  });
}

export async function verifyPasskeyRegistration(
  response: RegistrationResponseJSON,
  expectedChallenge: string,
) {
  return verifyRegistrationResponse({
    response,
    expectedChallenge,
    expectedOrigin: config.passkey.origin,
    expectedRPID: config.passkey.rpId,
  });
}

export async function generatePasskeyAuthenticationOptions(userPasskeys: Passkey[] = []) {
  return generateAuthenticationOptions({
    rpID: config.passkey.rpId,
    allowCredentials: userPasskeys.map((passkey) => ({
      id: passkey.credentialId,
      type: "public-key",
      transports: transports(passkey),
    })),
    userVerification: "preferred",
  });
}

export async function verifyPasskeyAuthentication(
  response: AuthenticationResponseJSON,
  expectedChallenge: string,
  passkey: Passkey,
) {
  return verifyAuthenticationResponse({
    response,
    expectedChallenge,
    expectedOrigin: config.passkey.origin,
    expectedRPID: config.passkey.rpId,
    credential: {
      id: passkey.credentialId,
      publicKey: new Uint8Array(passkey.publicKey),
      counter: passkey.counter,
    },
  });
}

// The wire definition lives in passkey.schema; re-exported here so existing
// imports from webauthn.utils keep working.
export type { PasskeyKind };

/**
 * How to present a stored passkey. Roaming transports mean a hardware key;
 * otherwise a `multiDevice` credential syncs through the platform's password
 * manager and a `singleDevice` one stays on the authenticator that made it.
 */
export function describePasskey(passkey: Pick<Passkey, "deviceType" | "transports">): {
  kind: PasskeyKind;
  label: string;
} {
  const roaming = passkey.transports.filter((t) => t === "usb" || t === "nfc" || t === "ble");
  if (roaming.length > 0 && !passkey.transports.includes("internal")) {
    const names = roaming.map((t) => ({ usb: "USB", nfc: "NFC", ble: "Bluetooth" })[t]);
    return { kind: "security-key", label: `Security key (${names.join(", ")})` };
  }
  if (passkey.deviceType === "multiDevice") {
    return { kind: "synced", label: "Synced passkey" };
  }
  return { kind: "device", label: "Device-bound passkey" };
}

export function generateDeviceName(
  authenticatorAttachment?: "platform" | "cross-platform",
  transports?: string[],
): string {
  if (authenticatorAttachment === "platform") return "This device";
  if (transports?.includes("usb")) return "Security key (USB)";
  if (transports?.includes("nfc")) return "Security key (NFC)";
  if (transports?.includes("ble")) return "Security key (Bluetooth)";
  return "Security key";
}
