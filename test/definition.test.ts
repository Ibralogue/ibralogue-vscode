import { describe, it, expect } from "vitest";
import { quickAll } from "./helpers";
import { getDefinition } from "../src/server/features/definition";

const URI = "file:///test.ibra";

function def(text: string, line: number, character: number) {
  const { ast, index } = quickAll(text);
  return getDefinition({ line, character }, URI, ast, index);
}

const DOC = `{{ConversationName(Greeting)}}
[NPC]
Hello, $PLAYER.
{{GetDay}}
{{Jump(Farewell)}}
- Go -> Farewell
{{ConversationName(Farewell)}}
[NPC]
Bye.`;

describe("Definition", () => {
  it("choice target -> conversation def", () => {
    const result = def(DOC, 5, 10);
    expect(result).not.toBeNull();
    if (!Array.isArray(result)) {
      expect(result!.range.start.line).toBe(6);
    }
  });

  it("jump target -> conversation def", () => {
    const result = def(DOC, 4, 9);
    expect(result).not.toBeNull();
    if (!Array.isArray(result)) {
      expect(result!.range.start.line).toBe(6);
    }
  });

  it("conversation def -> self", () => {
    const result = def(DOC, 0, 22);
    expect(result).not.toBeNull();
    if (!Array.isArray(result)) {
      expect(result!.range.start.line).toBe(0);
    }
  });

  it("speaker -> all usages", () => {
    const result = def(DOC, 1, 2);
    expect(result).not.toBeNull();
    expect(Array.isArray(result)).toBe(true);
    if (Array.isArray(result)) {
      expect(result.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("variable -> all usages", () => {
    const result = def(DOC, 2, 8);
    expect(result).not.toBeNull();
    if (Array.isArray(result)) {
      expect(result.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("function -> all usages", () => {
    const result = def(DOC, 3, 3);
    expect(result).not.toBeNull();
    if (Array.isArray(result)) {
      expect(result.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("command keyword -> null", () => {
    const result = def(DOC, 0, 5);
    expect(result).toBeNull();
  });

  it("empty position -> null", () => {
    const result = def(DOC, 2, 0);
    expect(result).toBeNull();
  });

  it("result URIs match provided URI", () => {
    const result = def(DOC, 5, 10);
    if (result && !Array.isArray(result)) {
      expect(result.uri).toBe(URI);
    }
  });

  it("undefined target returns null", () => {
    const text = "[NPC]\nHi.\n- Go -> Nowhere";
    const result = def(text, 2, 12);
    expect(result).toBeNull();
  });
});
