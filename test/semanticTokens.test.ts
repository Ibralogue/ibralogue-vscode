import { describe, it, expect } from "vitest";
import { quickAll } from "./helpers";
import { getSemanticTokens, TOKEN_TYPES, TOKEN_MODIFIERS } from "../src/server/features/semanticTokens";

interface DecodedToken {
  line: number;
  char: number;
  length: number;
  type: string;
  modifiers: string[];
}

function decode(text: string): DecodedToken[] {
  const { ast, tokens } = quickAll(text);
  const result = getSemanticTokens(ast, tokens);
  const data = result.data;
  const decoded: DecodedToken[] = [];
  let prevLine = 0;
  let prevChar = 0;

  for (let i = 0; i < data.length; i += 5) {
    const dLine = data[i];
    const dChar = data[i + 1];
    const length = data[i + 2];
    const typeIdx = data[i + 3];
    const modBits = data[i + 4];

    const line = prevLine + dLine;
    const char = dLine === 0 ? prevChar + dChar : dChar;

    const mods: string[] = [];
    for (let m = 0; m < TOKEN_MODIFIERS.length; m++) {
      if (modBits & (1 << m)) mods.push(TOKEN_MODIFIERS[m]);
    }

    decoded.push({ line, char, length, type: TOKEN_TYPES[typeIdx], modifiers: mods });
    prevLine = line;
    prevChar = char;
  }
  return decoded;
}

function findToken(tokens: DecodedToken[], type: string, line?: number): DecodedToken | undefined {
  return tokens.find((t) => t.type === type && (line === undefined || t.line === line));
}

const DOC = `{{ConversationName(Greeting)}}
[NPC]
Hello, $PLAYER.
Today is {{GetDay}}.
Bye. ## mood:happy
- Go -> Farewell
{{ConversationName(Farewell)}}
[NPC]
See you.
{{Jump(Farewell)}}`;

describe("Semantic Tokens", () => {
  it("conversation name has namespace type with declaration modifier", () => {
    const tokens = decode(DOC);
    const ns = findToken(tokens, "namespace", 0);
    expect(ns).toBeDefined();
    expect(ns!.modifiers).toContain("declaration");
  });

  it("ConversationName keyword has keyword type with defaultLibrary", () => {
    const tokens = decode(DOC);
    const kw = findToken(tokens, "keyword", 0);
    expect(kw).toBeDefined();
    expect(kw!.modifiers).toContain("defaultLibrary");
  });

  it("speaker gets string type", () => {
    const tokens = decode(DOC);
    const s = findToken(tokens, "string", 1);
    expect(s).toBeDefined();
  });

  it("variable gets variable type with readonly modifier", () => {
    const tokens = decode(DOC);
    const v = findToken(tokens, "variable", 2);
    expect(v).toBeDefined();
    expect(v!.modifiers).toContain("readonly");
  });

  it("function name gets function type", () => {
    const tokens = decode(DOC);
    const f = findToken(tokens, "function", 3);
    expect(f).toBeDefined();
  });

  it("metadata key gets property type", () => {
    const tokens = decode(DOC);
    const p = findToken(tokens, "property", 4);
    expect(p).toBeDefined();
  });

  it("choice arrow gets operator type", () => {
    const tokens = decode(DOC);
    const op = findToken(tokens, "operator", 5);
    expect(op).toBeDefined();
  });

  it("choice target gets namespace type", () => {
    const tokens = decode(DOC);
    const nss = tokens.filter((t) => t.type === "namespace" && t.line === 5);
    expect(nss.length).toBeGreaterThanOrEqual(1);
  });

  it("Jump keyword gets keyword type", () => {
    const tokens = decode(DOC);
    const kw = tokens.filter((t) => t.type === "keyword" && t.line === 9);
    expect(kw.length).toBeGreaterThanOrEqual(1);
  });

  it("comment gets comment type", () => {
    const text = "# comment\n[NPC]\nHi.";
    const tokens = decode(text);
    const c = findToken(tokens, "comment", 0);
    expect(c).toBeDefined();
  });
});
