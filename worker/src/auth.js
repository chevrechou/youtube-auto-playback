// Firebase custom token minting.
//
// Library note (see final report for the full writeup): the task brief asked
// for either `flarebase-auth` (github.com/Marplex/flarebase-auth) or
// `firebase-auth-cloudflare-workers` (github.com/Code-Hex/firebase-auth-cloudflare-workers)
// to avoid hand-rolling JWT signing. Both were evaluated by reading their
// published source directly:
//   - flarebase-auth: only implements signInWithEmailAndPassword/signUp/
//     createSessionCookie/verifySessionCookie/lookupUser/changePassword. No
//     createCustomToken (or any custom-token minting) method exists in its
//     source (github.com/Marplex/flarebase-auth/blob/master/src/lib/flarebase-auth.ts).
//   - firebase-auth-cloudflare-workers: is a *verification* library (ID
//     tokens, session cookies) plus user-record admin calls
//     (setCustomUserClaims on an *existing* signed-in user). It has no
//     createCustomToken/mint-a-sign-in-token API either
//     (github.com/Code-Hex/firebase-auth-cloudflare-workers/blob/main/src/auth.ts).
// Neither library actually mints the kind of custom token this worker needs
// to hand to a client for signInWithCustomToken(). Custom token minting is
// not a REST call at all — it's a local RS256 JWT signed with the service
// account's private key, and Firebase's own docs document the exact required
// claim structure for exactly this "no Admin SDK available" scenario:
// https://firebase.google.com/docs/auth/admin/create-custom-tokens#create_custom_tokens_using_a_third-party_jwt_library
// We follow that spec precisely (see buildCustomTokenClaims below) using
// `jose` for RS256 signing — jose is a vetted, widely used JWT library (and
// is itself a dependency of both libraries evaluated above); we are not
// hand-rolling the crypto, only assembling the documented claim shape.

import { SignJWT, importPKCS8 } from 'jose';

const FIREBASE_CUSTOM_TOKEN_AUDIENCE =
  'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit';
const GOOGLE_TOKEN_AUDIENCE = 'https://oauth2.googleapis.com/token';
const CUSTOM_TOKEN_TTL_SECONDS = 60 * 60; // 1 hour — Firebase's documented max.

/**
 * Parses the FIREBASE_SERVICE_ACCOUNT_KEY secret (raw JSON string) into the
 * fields we need. Throws if the JSON is malformed or missing required fields.
 */
export function parseServiceAccount(rawJson) {
  let parsed;
  try {
    parsed = JSON.parse(rawJson);
  } catch (err) {
    throw new Error(`FIREBASE_SERVICE_ACCOUNT_KEY is not valid JSON: ${err.message}`);
  }
  const { project_id: projectId, client_email: clientEmail, private_key: privateKey } = parsed;
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      'FIREBASE_SERVICE_ACCOUNT_KEY JSON is missing project_id, client_email, or private_key'
    );
  }
  return { projectId, clientEmail, privateKey };
}

let cachedPrivateKey = null;
let cachedPrivateKeyPem = null;

async function getSigningKey(privateKeyPem) {
  if (cachedPrivateKeyPem === privateKeyPem && cachedPrivateKey) {
    return cachedPrivateKey;
  }
  const key = await importPKCS8(privateKeyPem, 'RS256');
  cachedPrivateKey = key;
  cachedPrivateKeyPem = privateKeyPem;
  return key;
}

/**
 * Mints a Firebase custom token scoped to a room via the `roomCode` custom
 * claim. Firebase security rules (owned by a separate workstream) must check
 * `auth.token.roomCode == $roomCode` on read/write at /rooms/$roomCode —
 * without this claim a token minted for one room could read/write another.
 *
 * @param {{clientEmail: string, privateKey: string}} serviceAccount
 * @param {string} uid Firebase Auth uid to embed (max 128 chars per Firebase).
 * @param {{roomCode: string}} claims Custom claims (reserved words like
 *   `firebase`, `iss`, `sub`, `aud`, `exp`, `iat` must never appear here).
 */
export async function mintCustomToken(serviceAccount, uid, claims) {
  const key = await getSigningKey(serviceAccount.privateKey);
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ uid, claims })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(serviceAccount.clientEmail)
    .setSubject(serviceAccount.clientEmail)
    .setAudience(FIREBASE_CUSTOM_TOKEN_AUDIENCE)
    .setIssuedAt(now)
    .setExpirationTime(now + CUSTOM_TOKEN_TTL_SECONDS)
    .sign(key);
}

/**
 * Mints a short-lived Google OAuth2 access token for the service account,
 * used only for this worker's own admin-level REST calls to the Firebase
 * Realtime Database (separate concern from the custom token above, which is
 * handed to end-user clients). This is the standard JWT-bearer grant flow for
 * server-to-server auth; it requires one network round trip to Google's
 * token endpoint, injected via `fetchFn` so tests can mock it.
 */
export async function mintGoogleAccessToken(serviceAccount, scopes, fetchFn = fetch) {
  const key = await getSigningKey(serviceAccount.privateKey);
  const now = Math.floor(Date.now() / 1000);
  const assertion = await new SignJWT({ scope: scopes.join(' ') })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(serviceAccount.clientEmail)
    .setAudience(GOOGLE_TOKEN_AUDIENCE)
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);

  const response = await fetchFn(GOOGLE_TOKEN_AUDIENCE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${assertion}`,
  });

  if (!response.ok) {
    throw new Error(`Google OAuth token exchange failed: ${response.status}`);
  }
  const json = await response.json();
  if (!json.access_token) {
    throw new Error('Google OAuth token exchange response missing access_token');
  }
  return json.access_token;
}
