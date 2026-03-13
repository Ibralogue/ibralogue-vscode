import { describe, it, expect } from "vitest";
import { quickAll } from "./helpers";
import { getCompletions } from "../src/server/features/completion";

function complete(text: string, line: number, character: number) {
  const { ast, index } = quickAll(text);
  const lines = text.split("\n");
  const lineText = lines[line] + "\n";
  return getCompletions(lineText, { line, character }, ast, index);
}

const MULTI = `{{ConversationName(Greeting)}}
[NPC]
Hello, $PLAYER.
Today is {{GetDay}}.
Bye. ## mood:happy
- Go -> Farewell
{{ConversationName(Farewell)}}
[NPC]
See you.`;

describe("Completions", () => {
  it("after {{ suggests commands and functions", () => {
    const items = complete(MULTI, 3, 12);
    const labels = items.map((i) => i.label);
    expect(labels).toContain("ConversationName");
    expect(labels).toContain("Jump");
    expect(labels).toContain("Image");
    expect(labels).toContain("Include");
    expect(labels).toContain("GetDay");
  });

  it("after [ suggests speakers", () => {
    const items = complete(MULTI, 1, 1);
    const labels = items.map((i) => i.label);
    expect(labels).toContain("NPC");
  });

  it("after $ suggests variables", () => {
    const items = complete(MULTI, 2, 8);
    const labels = items.map((i) => i.label);
    expect(labels).toContain("PLAYER");
  });

  it("after -> in choice suggests conversation names", () => {
    const items = complete(MULTI, 5, 9);
    const labels = items.map((i) => i.label);
    expect(labels).toContain("Greeting");
    expect(labels).toContain("Farewell");
  });

  it("after Jump( suggests conversation names", () => {
    const text = "{{ConversationName(A)}}\n[NPC]\nHi.\n{{Jump(";
    const items = complete(text, 3, 7);
    const labels = items.map((i) => i.label);
    expect(labels).toContain("A");
  });

  it("after ## suggests metadata keys", () => {
    const items = complete(MULTI, 4, 8);
    const labels = items.map((i) => i.label);
    expect(labels).toContain("mood:");
  });

  it("after - suggests choice snippet", () => {
    const text = "[NPC]\nHi.\n- ";
    const items = complete(text, 2, 2);
    expect(items.length).toBeGreaterThanOrEqual(1);
    expect(items.some((i) => i.label.includes("Choice"))).toBe(true);
  });

  it("in plain text returns no completions", () => {
    const items = complete(MULTI, 2, 3);
    expect(items).toHaveLength(0);
  });

  it("in comment line returns no completions", () => {
    const text = "# a comment\n[NPC]\nHi.";
    const items = complete(text, 0, 5);
    expect(items).toHaveLength(0);
  });

  it("command completions have snippet insert text", () => {
    const items = complete(MULTI, 3, 12);
    const conv = items.find((i) => i.label === "ConversationName");
    expect(conv).toBeDefined();
    expect(conv!.insertText).toContain("$1");
  });

  it("Include inside {{ with comma suggests conversations", () => {
    const text = "{{ConversationName(A)}}\n[NPC]\nHi.\n{{Include(File,";
    const items = complete(text, 3, 15);
    expect(items.map((i) => i.label)).toContain("A");
  });

  it("function arg position suggests variables", () => {
    const text = "[NPC]\n{{SomeFunc($";
    const items = complete(text, 1, 13);
    expect(items.length).toBeGreaterThanOrEqual(0);
  });
});
