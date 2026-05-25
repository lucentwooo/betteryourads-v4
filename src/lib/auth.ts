const enc = new TextEncoder();
const PAYLOAD = "ok";

async function hmac(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(msg));
  return Buffer.from(new Uint8Array(sig)).toString("hex");
}
export async function signSession(secret: string): Promise<string> {
  return `${PAYLOAD}.${await hmac(secret, PAYLOAD)}`;
}
export async function verifySession(
  token: string | undefined,
  secret: string,
): Promise<boolean> {
  if (!token) return false;
  const [payload, sig] = token.split(".");
  if (payload !== PAYLOAD || !sig) return false;
  return sig === (await hmac(secret, PAYLOAD));
}
export const SESSION_COOKIE = "bya_session";
