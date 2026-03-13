import { describe, it, expect } from "vitest";
import { quickAll } from "./helpers";
import { getReferences } from "../src/server/features/references";

const URI = "file:///test.ibra";

function refs(text: string, line: number, character: number) {
  const { ast, index } = quickAll(text);
  return getReferences({ line, character }, URI, ast, index);
}

const DOC = `{{ConversationName(Greeting)}}
[NPC]
Hello, $PLAYER.
{{GetDay}}
- Go -> Farewell
{{Jump(Farewell)}}
{{ConversationName(Farewell)}}
[NPC]
Bye. ## mood:happy`;

describe("References", () => {
  it("conversation def includes def + choice targets + jump targets", () => {
    const result = refs(DOC, 0, 22);
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it("choice target returns same refs as conversation def", () => {
    const fromDef = refs(DOC, 6, 22);
    const fromChoice = refs(DOC, 4, 10);
    expect(fromChoice.length).toBe(fromDef.length);
  });

  it("speaker returns all speaker usages", () => {
    const result = refs(DOC, 1, 2);
    expect(result.length).toBe(2);
  });

  it("variable returns all usages", () => {
    const result = refs(DOC, 2, 8);
    expect(result.length).toBe(1);
  });

  it("function returns all usages", () => {
    const result = refs(DOC, 3, 3);
    expect(result.length).toBe(1);
  });

  it("metadata key returns all usages", () => {
    const result = refs(DOC, 8, 8);
    expect(result.length).toBe(1);
  });

  it("unknown position returns empty", () => {
    const result = refs(DOC, 2, 0);
    expect(result).toHaveLength(0);
  });

  it("all results have correct URI", () => {
    const result = refs(DOC, 1, 2);
    for (const loc of result) {
      expect(loc.uri).toBe(URI);
    }
  });
});
