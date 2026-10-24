// Generates a one-time invite code and the hash to put in INVITE_CODE_HASH.
// Only the hash is stored on the server; the code itself is never saved anywhere.
import { createHash, randomBytes } from "node:crypto";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I to avoid typos
const bytes = randomBytes(15);
let body = "";
for (const b of bytes) body += ALPHABET[b % ALPHABET.length];
const code = `DQ-${body.slice(0, 5)}-${body.slice(5, 10)}-${body.slice(10, 15)}`;
const hash = createHash("sha256").update(code).digest("hex");

console.log(`Invite code:      ${code}`);
console.log(`INVITE_CODE_HASH: ${hash}`);
