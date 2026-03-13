import { describe, it, expect } from "vitest";
import { quickAll } from "./helpers";
import { getDocumentSymbols } from "../src/server/features/symbols";
import { SymbolKind } from "vscode-languageserver/node";

function symbols(text: string) {
  const { ast } = quickAll(text);
  return getDocumentSymbols(ast);
}

describe("Document Symbols", () => {
  it("conversations appear as Namespace symbols", () => {
    const syms = symbols("{{ConversationName(Greeting)}}\n[NPC]\nHi.");
    expect(syms).toHaveLength(1);
    expect(syms[0].kind).toBe(SymbolKind.Namespace);
    expect(syms[0].name).toContain("Greeting");
  });

  it("speaker appears as String child of conversation", () => {
    const syms = symbols("[NPC]\nHi.");
    const conv = syms[0];
    expect(conv.children).toBeDefined();
    const speaker = conv.children!.find((c) => c.kind === SymbolKind.String);
    expect(speaker).toBeDefined();
    expect(speaker!.name).toContain("NPC");
  });

  it("choices appear as Event children", () => {
    const syms = symbols("[NPC]\nHi.\n- Go -> Target");
    const conv = syms[0];
    const choice = conv.children!.find((c) => c.kind === SymbolKind.Event);
    expect(choice).toBeDefined();
    expect(choice!.name).toContain("Go");
  });

  it("jump appears as Function child of dialogue line", () => {
    const syms = symbols("[NPC]\nHi.\n{{Jump(X)}}");
    const dl = syms[0].children!.find((c) => c.kind === SymbolKind.String);
    expect(dl).toBeDefined();
    const jump = dl!.children!.find((c) => c.kind === SymbolKind.Function);
    expect(jump).toBeDefined();
  });

  it("empty file returns empty array", () => {
    const syms = symbols("");
    expect(syms).toHaveLength(0);
  });
});
