import { scrypt, timingSafeEqual } from "node:crypto";

function scryptAsync(password: string, salt: Buffer, keylen: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

// "salt:hash" (হেক্স) ফরম্যাটের সাথে মিলিয়ে দেখে
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  if (salt.length === 0 || expected.length === 0) return false;
  const actual = await scryptAsync(password, salt, expected.length);
  return timingSafeEqual(actual, expected);
}

// ইমেইল ভুল হলেও একই সময় লাগে, যাতে বাইরে থেকে ইমেইল আন্দাজ করা না যায়
const DUMMY_HASH = `${"00".repeat(16)}:${"00".repeat(64)}`;

export async function verifyAdminLogin(email: string, password: string): Promise<boolean> {
  const adminEmail = process.env.ADMIN_EMAIL;
  const stored = process.env.ADMIN_PASSWORD_HASH;
  if (!adminEmail || !stored) {
    console.error("ADMIN_EMAIL or ADMIN_PASSWORD_HASH is not set");
    return false; // কনফিগ না থাকলে কাউকে ঢুকতে দেওয়া হবে না
  }
  if (password.length === 0 || password.length > 256) return false;

  const emailOk = safeEqual(email.trim().toLowerCase(), adminEmail.trim().toLowerCase());
  const passOk = await verifyPassword(password, emailOk ? stored : DUMMY_HASH);
  return emailOk && passOk;
}