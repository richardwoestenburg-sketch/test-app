// Versleutelt het Microsoft-ververstoken (refresh token) voor het in KV wordt
// bewaard. De sleutel wordt afgeleid van DAGLOG_TOKEN (dezelfde secret die al
// gebruikt wordt om de API te beveiligen), zodat er geen apart geheim nodig is.
async function deriveKey(env) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(env.DAGLOG_TOKEN));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

function toB64(bytes) {
  return btoa(String.fromCharCode(...bytes));
}
function fromB64(b64) {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

export async function encryptSecret(env, plaintext) {
  const key = await deriveKey(env);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext)
  );
  return `${toB64(iv)}.${toB64(new Uint8Array(ciphertext))}`;
}

export async function decryptSecret(env, stored) {
  if (!stored) return null;
  const [ivB64, dataB64] = stored.split(".");
  if (!ivB64 || !dataB64) return null;
  const key = await deriveKey(env);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromB64(ivB64) },
    key,
    fromB64(dataB64)
  );
  return new TextDecoder().decode(plain);
}
