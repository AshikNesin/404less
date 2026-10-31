# Passkey authentication

Passwordless sign-in with WebAuthn (Face ID, Touch ID, Windows Hello, security
keys) on top of the password flow. Server: `packages/core/src/passkey/` on
`@simplewebauthn/server`, mounted at `/api/v1/passkey`. Client:
`passkeyService` from `@groot/shell/services/passkey` on
`@simplewebauthn/browser`, the `<PasskeyManager />` component, and the session
store's `loginWithPasskey()`.

## How it works

**Registration** (signed in): `POST /register/options` returns creation
options and stores the challenge → the browser creates a credential →
`POST /register/verify` checks it and saves the passkey (public key, counter,
transports, device type, a name such as "This device"). The options ask for a
platform authenticator (`authenticatorAttachment: "platform"` in
`webauthn.utils.ts`), so browsers steer users to the device's built-in one;
remove that line to let users register hardware security keys.

**Login** (public): `POST /login/options` (an optional `email` narrows
`allowCredentials` to that user's passkeys; the shell sends none, so the
browser offers any passkey it holds for the site) → the browser signs the
challenge → `POST /login/verify` verifies the signature and counter, updates
`lastUsedAt`, sets the `token` cookie and returns `{ token, user }` like
password login.

Challenges live in the `kv` table (`passkey:challenge:` namespace) with a
five-minute TTL and are consumed on first use, so they survive restarts and
work across Workers isolates. A user can register any number of passkeys; the
last one cannot be deleted.

## Configuration

The relying party comes from `RP_NAME`, `RP_ID` and `ORIGIN` through
`config.passkey`; defaults are in the [setup guide](../setup-guide.md).
`RP_ID` is the bare domain (no scheme or port) and `ORIGIN` the full origin
the browser shows (`https://your-domain`); production refuses to boot without
both. Under portless set `RP_ID=groot.localhost` and
`ORIGIN=https://groot.localhost` in `.env` (see
[portless](../guides/portless-https.md)). On Cloudflare they are `vars` in
`wrangler.jsonc`. WebAuthn needs HTTPS everywhere except `localhost`.

## API (`/api/v1/passkey`)

| Method | Path                | Auth   | Body                            | Returns                          |
| ------ | ------------------- | ------ | ------------------------------- | -------------------------------- |
| POST   | `/register/options` | JWT    |                                 | `200` creation options           |
| POST   | `/register/verify`  | JWT    | `{ response, credentialName? }` | `200` the passkey                |
| POST   | `/login/options`    | public | `{ email? }`                    | `200` request options            |
| POST   | `/login/verify`     | public | `{ response }`                  | `200` `{ token, user }` + cookie |
| GET    | `/list`             | JWT    |                                 | `200` the user's passkeys        |
| PATCH  | `/:id`              | JWT    | `{ credentialName }`            | `200` the passkey                |
| DELETE | `/:id`              | JWT    |                                 | `204`                            |

The login routes share the auth rate limiter with `/auth/login`
(`config.rateLimits.auth`, 20 requests per 15 minutes per IP by default; see
[config](../reference/config.md)). Request recipes are in
[API requests](../reference/api-requests.md).

A passkey comes back as `PasskeySummary` (`passkey.schema.ts`): `{ id,
credentialName, kind, label, backedUp, canDelete, lastUsedAt, createdAt }`,
dates as ISO strings, never with the public key or credential id. The server
decides what the client shows: `kind` is `"security-key"` (USB, NFC or
Bluetooth transports), `"synced"` (a `multiDevice` credential) or `"device"`;
`label` names it ("Security key (USB)", "Synced passkey", "Device-bound
passkey"); `canDelete` is `false` for the user's last passkey, which `DELETE`
refuses.

## Client

```ts
import { passkeyService } from "@groot/shell/services/passkey";

await passkeyService.registerPasskey("My laptop"); // signed in
await passkeyService.listPasskeys();
await passkeyService.updatePasskeyName(passkeyId, "Work laptop");
await passkeyService.deletePasskey(passkeyId);
```

Passkey sign-in is part of the session: `useAuthStore.getState().loginWithPasskey()`
(`@groot/shell/store/auth`) runs the browser ceremony and starts the session.
To check browser support first, use `browserSupportsWebAuthn()` from
`@simplewebauthn/browser`.

```tsx
import { PasskeyManager } from "@groot/shell/components/PasskeyManager";

<PasskeyManager />; // list, add, rename, delete — used on the settings page
```

`PasskeyManager` disables Delete when `canDelete` is `false`.

## Security properties

| Property                    | How                                                                                |
| --------------------------- | ---------------------------------------------------------------------------------- |
| Challenge-response          | One-time challenge stored server-side, consumed on first use, five-minute TTL      |
| Counter validation          | The counter must advance, so a cloned credential fails; synced passkeys report `0` |
| Public keys only            | Private keys never leave the device                                                |
| Origin and RP checks        | Responses are verified against `ORIGIN` and `RP_ID`                                |
| User verification preferred | Biometric or PIN requested on registration and login                               |

## Troubleshooting

| Symptom                                      | Likely cause                                             | Fix                                             |
| -------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------- |
| Registration or login fails                  | `RP_ID` / `ORIGIN` do not match the page's origin        | Set them to the real domain and origin; restart |
| `NotAllowedError` in the browser             | User cancelled, or the call did not come from a gesture  | Trigger from a click                            |
| `InvalidStateError`, or "already registered" | This authenticator already holds a passkey for the user  | Use it, or register another authenticator       |
| "Challenge not found or expired"             | More than five minutes passed, or the challenge was used | Start the flow again                            |
| "Cannot delete the last passkey"             | By design                                                | Add another passkey first                       |

## Schema

The `passkeys` table is defined in `packages/core/src/database/schema.ts`
(`userId` → `users.id` with cascade delete, unique `credentialId`, `publicKey`
blob, `counter`, `transports` JSON, `deviceType`, `backedUp`, `credentialName`,
`lastUsedAt`). Change it the normal way: edit the schema, `pnpm db:generate`.

## Resources

- [WebAuthn Guide](https://webauthn.guide/)
- [SimpleWebAuthn](https://simplewebauthn.dev/)
- [Passkeys.dev](https://passkeys.dev/)
