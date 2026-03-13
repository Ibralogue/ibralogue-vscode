import { describe, it, expect } from "vitest";
import { quickAll } from "./helpers";
import { getFoldingRanges } from "../src/server/features/folding";
import { FoldingRangeKind } from "vscode-languageserver/node";

function fold(text: string) {
  const { ast, tokens } = quickAll(text);
  return getFoldingRanges(ast, tokens);
}

describe("Folding", () => {
  it("conversation block creates region fold", () => {
    const text = "{{ConversationName(A)}}\n[NPC]\nHi.\nBye.";
    const ranges = fold(text);
    const regions = ranges.filter((r) => r.kind === FoldingRangeKind.Region);
    expect(regions.length).toBeGreaterThanOrEqual(1);
    expect(regions[0].startLine).toBe(0);
  });

  it("dialogue line creates region fold", () => {
    const text = "{{ConversationName(A)}}\n[NPC]\nLine 1.\nLine 2.";
    const ranges = fold(text);
    const dlFolds = ranges.filter(
      (r) => r.kind === FoldingRangeKind.Region && r.startLine === 1,
    );
    expect(dlFolds.length).toBeGreaterThanOrEqual(1);
  });

  it("choice group creates region fold", () => {
    const text = "[NPC]\nHi.\n- A -> X\n- B -> Y\n- C -> Z";
    const ranges = fold(text);
    const choiceFold = ranges.find(
      (r) => r.kind === FoldingRangeKind.Region && r.startLine === 2,
    );
    expect(choiceFold).toBeDefined();
    expect(choiceFold!.endLine).toBe(4);
  });

  it("consecutive comment lines create comment fold", () => {
    const text = "# line 1\n# line 2\n# line 3\n[NPC]\nHi.";
    const ranges = fold(text);
    const comments = ranges.filter((r) => r.kind === FoldingRangeKind.Comment);
    expect(comments).toHaveLength(1);
    expect(comments[0].startLine).toBe(0);
    expect(comments[0].endLine).toBe(2);
  });

  it("single-line constructs do not create folds", () => {
    const text = "# single comment";
    const ranges = fold(text);
    const commentFolds = ranges.filter((r) => r.kind === FoldingRangeKind.Comment);
    expect(commentFolds).toHaveLength(0);
  });

  it("multiple conversations create separate folds", () => {
    const text =
      "{{ConversationName(A)}}\n[NPC]\nHi.\n{{ConversationName(B)}}\n[NPC]\nBye.";
    const ranges = fold(text);
    const convFolds = ranges.filter(
      (r) => r.kind === FoldingRangeKind.Region && (r.startLine === 0 || r.startLine === 3),
    );
    expect(convFolds.length).toBe(2);
  });
});
