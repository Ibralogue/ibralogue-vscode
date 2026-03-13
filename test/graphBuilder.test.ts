import { describe, it, expect } from "vitest";
import { quickAll, FIXTURE } from "./helpers";
import { buildDialogueGraph } from "../src/server/features/graphBuilder";

function graph(text: string) {
  const { ast } = quickAll(text);
  return buildDialogueGraph(ast);
}

describe("Graph Builder", () => {
  it("single conversation produces one node, no edges", () => {
    const g = graph("[NPC]\nHi.");
    expect(g.conversations).toHaveLength(1);
    expect(g.edges).toHaveLength(0);
  });

  it("choice creates a choice edge", () => {
    const g = graph(
      "{{ConversationName(A)}}\n[NPC]\nHi.\n- Go -> B\n{{ConversationName(B)}}\n[NPC]\nBye.",
    );
    expect(g.edges).toHaveLength(1);
    expect(g.edges[0].from).toBe("A");
    expect(g.edges[0].to).toBe("B");
    expect(g.edges[0].type).toBe("choice");
  });

  it("jump creates a jump edge", () => {
    const g = graph(
      "{{ConversationName(A)}}\n[NPC]\nHi.\n{{Jump(B)}}\n{{ConversationName(B)}}\n[NPC]\nBye.",
    );
    const jumpEdge = g.edges.find((e) => e.type === "jump");
    expect(jumpEdge).toBeDefined();
    expect(jumpEdge!.from).toBe("A");
    expect(jumpEdge!.to).toBe("B");
  });

  it("orphan detection: unreferenced conversation is orphan", () => {
    const g = graph(
      "{{ConversationName(A)}}\n[NPC]\nHi.\n{{ConversationName(B)}}\n[NPC]\nBye.",
    );
    const orphan = g.conversations.find((c) => c.id === "B");
    expect(orphan!.isOrphan).toBe(true);
  });

  it("first conversation is never orphan", () => {
    const g = graph(
      "{{ConversationName(A)}}\n[NPC]\nHi.\n{{ConversationName(B)}}\n[NPC]\nBye.",
    );
    expect(g.conversations[0].isOrphan).toBe(false);
  });

  it("hasJumpOut is set correctly", () => {
    const g = graph("[NPC]\nHi.\n{{Jump(X)}}");
    expect(g.conversations[0].hasJumpOut).toBe(true);
  });

  it("hasJumpOut is false when no jump", () => {
    const g = graph("[NPC]\nHi.");
    expect(g.conversations[0].hasJumpOut).toBe(false);
  });

  it("line previews include speaker and text", () => {
    const g = graph("[NPC]\nHello, world.");
    expect(g.conversations[0].lines).toHaveLength(1);
    expect(g.conversations[0].lines[0].speaker).toBe("NPC");
    expect(g.conversations[0].lines[0].textPreview).toContain("Hello");
  });

  it("choice previews include text and target", () => {
    const g = graph("[NPC]\nHi.\n- Accept -> Quest");
    expect(g.conversations[0].choices).toHaveLength(1);
    expect(g.conversations[0].choices[0].text).toBe("Accept");
    expect(g.conversations[0].choices[0].target).toBe("Quest");
  });

  it("default conversation sets isDefault", () => {
    const g = graph("[NPC]\nHi.");
    expect(g.conversations[0].isDefault).toBe(true);
  });

  it("fixture produces correct graph", () => {
    const g = graph(FIXTURE);
    expect(g.conversations.length).toBeGreaterThanOrEqual(5);
    const hidden = g.conversations.find((c) => c.id === "HiddenDialogue");
    expect(hidden).toBeDefined();
    expect(hidden!.isOrphan).toBe(true);
    expect(g.edges.length).toBeGreaterThanOrEqual(4);
  });
});
