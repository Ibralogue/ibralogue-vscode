import { describe, it, expect } from "vitest";
import { quickAll } from "./helpers";
import { prepareRename, doRename } from "../src/server/features/rename";

const URI = "file:///test.ibra";

function prepare(text: string, line: number, character: number) {
  const { ast, index } = quickAll(text);
  return prepareRename({ line, character }, ast, index);
}

function rename(text: string, line: number, character: number, newName: string) {
  const { ast, index } = quickAll(text);
  return doRename({ line, character }, newName, URI, ast, index);
}

const DOC = `{{ConversationName(Greeting)}}
[NPC]
Hello, $PLAYER.
{{GetDay}}
- Go -> Farewell
{{ConversationName(Farewell)}}
[NPC]
Bye. ## mood:happy`;

describe("Rename", () => {
  it("prepareRename on conversation returns range + placeholder", () => {
    const result = prepare(DOC, 0, 22);
    expect(result).not.toBeNull();
    expect(result!.placeholder).toBe("Greeting");
  });

  it("prepareRename on speaker returns range", () => {
    const result = prepare(DOC, 1, 2);
    expect(result).not.toBeNull();
    expect(result!.placeholder).toBe("NPC");
  });

  it("prepareRename on command keyword returns null (rejected)", () => {
    const result = prepare(DOC, 0, 5);
    expect(result).toBeNull();
  });

  it("prepareRename on function name returns null (rejected)", () => {
    const result = prepare(DOC, 3, 3);
    expect(result).toBeNull();
  });

  it("rename conversation updates def + choice target + jump target", () => {
    const text = "{{ConversationName(A)}}\n[NPC]\nHi.\n{{Jump(A)}}\n- Go -> A";
    const result = rename(text, 0, 19, "B");
    expect(result).not.toBeNull();
    const edits = result!.changes![URI];
    expect(edits.length).toBe(3);
    for (const edit of edits) {
      expect(edit.newText).toBe("B");
    }
  });

  it("rename speaker updates all usages", () => {
    const result = rename(DOC, 1, 2, "Villager");
    expect(result).not.toBeNull();
    const edits = result!.changes![URI];
    expect(edits.length).toBe(2);
  });

  it("rename variable updates all usages", () => {
    const result = rename(DOC, 2, 8, "NAME");
    expect(result).not.toBeNull();
    const edits = result!.changes![URI];
    expect(edits.length).toBe(1);
  });

  it("rename metadata key updates all usages", () => {
    const result = rename(DOC, 7, 8, "emotion");
    expect(result).not.toBeNull();
    const edits = result!.changes![URI];
    expect(edits.length).toBe(1);
  });
});
