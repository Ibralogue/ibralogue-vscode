import { FoldingRange, FoldingRangeKind } from "vscode-languageserver/node";
import { DialogueTree, Token, TokenType } from "../parser/ast";

export function getFoldingRanges(
  ast: DialogueTree,
  tokens: Token[],
): FoldingRange[] {
  const ranges: FoldingRange[] = [];

  for (const conv of ast.conversations) {
    if (conv.fullRange.end.line > conv.fullRange.start.line) {
      ranges.push({
        startLine: conv.fullRange.start.line,
        endLine: conv.fullRange.end.line,
        kind: FoldingRangeKind.Region,
      });
    }

    for (const dl of conv.dialogueLines) {
      if (dl.range.end.line > dl.range.start.line) {
        ranges.push({
          startLine: dl.range.start.line,
          endLine: dl.range.end.line,
          kind: FoldingRangeKind.Region,
        });
      }
    }

    if (conv.choices.length > 1) {
      const first = conv.choices[0];
      const last = conv.choices[conv.choices.length - 1];
      if (last.range.start.line > first.range.start.line) {
        ranges.push({
          startLine: first.range.start.line,
          endLine: last.range.start.line,
          kind: FoldingRangeKind.Region,
        });
      }
    }
  }

  foldCommentBlocks(tokens, ranges);

  return ranges;
}

function foldCommentBlocks(tokens: Token[], ranges: FoldingRange[]) {
  let blockStart = -1;
  let blockEnd = -1;

  for (const t of tokens) {
    if (t.type === TokenType.Comment) {
      if (blockStart === -1) {
        blockStart = t.range.start.line;
      }
      blockEnd = t.range.start.line;
    } else if (t.type !== TokenType.EndOfLine && t.type !== TokenType.EndOfFile) {
      if (blockStart !== -1 && blockEnd > blockStart) {
        ranges.push({
          startLine: blockStart,
          endLine: blockEnd,
          kind: FoldingRangeKind.Comment,
        });
      }
      blockStart = -1;
      blockEnd = -1;
    }
  }

  if (blockStart !== -1 && blockEnd > blockStart) {
    ranges.push({
      startLine: blockStart,
      endLine: blockEnd,
      kind: FoldingRangeKind.Comment,
    });
  }
}
