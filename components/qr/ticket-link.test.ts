import { describe, expect, it } from "vitest";
import { extractToken } from "./QrScanner";
import { isTicketToken, originFromHeaders, ticketUrl } from "./ticket-link";

const TOK = "AbCdEfGhIjKlMnOpQr_-12"; // 22 chars, fake

describe("ticket links", () => {
  it("extracts a token from a URL, a path or a bare token", () => {
    expect(extractToken(`https://desk.example.com/t/${TOK}`)).toBe(TOK);
    expect(extractToken(`  /t/${TOK}/?utm=x \n`)).toBe(TOK);
    expect(extractToken(TOK)).toBe(TOK);
    expect(extractToken("SX-1070")).toBeNull();
    expect(extractToken("https://evil.example.com/t/short")).toBeNull();
  });
  it("validates token format", () => {
    expect(isTicketToken(TOK)).toBe(true);
    expect(isTicketToken(TOK + "x")).toBe(false);
    expect(isTicketToken("../../etc/passwd....")).toBe(false);
  });
  it("builds the origin from proxy headers and rejects odd hosts", () => {
    expect(originFromHeaders(new Headers({ host: "localhost:3000" }))).toBe("http://localhost:3000");
    expect(originFromHeaders(new Headers({ host: "a.vercel.app", "x-forwarded-proto": "https" }))).toBe("https://a.vercel.app");
    expect(originFromHeaders(new Headers({ host: "a.vercel.app" }))).toBe("https://a.vercel.app");
    expect(originFromHeaders(new Headers({ host: "x/<script>" }))).toBe("http://localhost:3000");
    expect(ticketUrl("https://a.vercel.app", TOK)).toBe(`https://a.vercel.app/t/${TOK}`);
  });
});
