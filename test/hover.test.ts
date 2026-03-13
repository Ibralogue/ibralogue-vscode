import { describe, it, expect } from "vitest";
import { quickAll } from "./helpers";
import { getHover } from "../src/server/features/hover";

function hover(text: string, line: number, character: number) {
  const { ast, index } = quickAll(text);
  return getHover({ line, character }, ast, index);
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
{{Jump(Greeting)}}`;

describe("Hover", () => {
  it("speaker name shows speaker info", () => {
    const h = hover(DOC, 1, 2);
    expect(h).not.toBeNull();
    expect(h!.contents).toHaveProperty("value");
    expect((h!.contents as any).value).toContain("Speaker");
  });

  it("conversation name shows conversation info", () => {
    const h = hover(DOC, 0, 22);
    expect(h).not.toBeNull();
    expect((h!.contents as any).value).toContain("Conversation");
  });

  it("variable shows variable info", () => {
    const h = hover(DOC, 2, 8);
    expect(h).not.toBeNull();
    expect((h!.contents as any).value).toContain("Variable");
  });

  it("function shows function info", () => {
    const h = hover(DOC, 3, 12);
    expect(h).not.toBeNull();
    expect((h!.contents as any).value).toContain("Function");
  });

  it("metadata key shows metadata info", () => {
    const h = hover(DOC, 4, 8);
    expect(h).not.toBeNull();
    expect((h!.contents as any).value).toContain("Metadata");
  });

  it("command keyword shows docs", () => {
    const h = hover(DOC, 0, 5);
    expect(h).not.toBeNull();
    expect((h!.contents as any).value).toContain("ConversationName");
  });

  it("choice target shows target info", () => {
    const h = hover(DOC, 5, 10);
    expect(h).not.toBeNull();
    expect((h!.contents as any).value).toContain("Target");
  });

  it("jump target shows jump info", () => {
    const h = hover(DOC, 9, 9);
    expect(h).not.toBeNull();
    expect((h!.contents as any).value).toContain("Jump");
  });

  it("empty position returns null", () => {
    const h = hover(DOC, 2, 0);
    expect(h).toBeNull();
  });

  it("hover range matches symbol range", () => {
    const h = hover(DOC, 1, 2);
    expect(h).not.toBeNull();
    expect(h!.range).toBeDefined();
    expect(h!.range!.start.line).toBe(1);
  });
});
