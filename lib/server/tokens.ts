import { randomBytes } from "node:crypto";
/** 128-bit random, URL-safe ticket token. Contains no personal data; unguessable (unlike Reg IDs). */
export const newTicketToken = () => randomBytes(16).toString("base64url");
