import {
  SemanticTokensBuilder,
  SemanticTokensLegend,
  SemanticTokens,
} from "vscode-languageserver/node";
import { DialogueTree, Token, TokenType, Range as AstRange } from "../parser/ast";
import { ALL_KEYWORD_SET } from "../parser/keywords";

export const TOKEN_TYPES = [
  "namespace",
  "function",
  "variable",
  "parameter",
  "keyword",
  "string",
  "comment",
  "operator",
  "property",
  "decorator",
] as const;

export const TOKEN_MODIFIERS = [
  "declaration",
  "readonly",
  "defaultLibrary",
] as const;

export const semanticTokensLegend: SemanticTokensLegend = {
  tokenTypes: [...TOKEN_TYPES],
  tokenModifiers: [...TOKEN_MODIFIERS],
};

const typeIndex = new Map(TOKEN_TYPES.map((t, i) => [t, i]));
const modIndex = new Map(TOKEN_MODIFIERS.map((m, i) => [m, i]));

function modBits(...mods: (typeof TOKEN_MODIFIERS[number])[]): number {
  let bits = 0;
  for (const m of mods) {
    const idx = modIndex.get(m);
    if (idx !== undefined) bits |= 1 << idx;
  }
  return bits;
}

function push(
  b: SemanticTokensBuilder,
  range: AstRange,
  type: typeof TOKEN_TYPES[number],
  modifiers: number,
) {
  const len = range.end.character - range.start.character;
  if (len <= 0) return;
  b.push(range.start.line, range.start.character, len, typeIndex.get(type)!, modifiers);
}

export function getSemanticTokens(
  ast: DialogueTree,
  tokens: Token[],
): SemanticTokens {
  const b = new SemanticTokensBuilder();

  for (const t of tokens) {
    if (t.type === TokenType.Comment) {
      push(b, t.range, "comment", 0);
    }
  }

  for (const conv of ast.conversations) {
    tokenizeConversationHeader(b, conv);
    tokenizeDialogueLines(b, conv);
    tokenizeChoices(b, conv);
    tokenizeConditionals(b, conv);
    tokenizeVariableCommands(b, conv);
  }

  return b.build();
}

function tokenizeConversationHeader(b: SemanticTokensBuilder, conv: DialogueTree["conversations"][number]) {
  if (conv.commandRange) {
    push(b, kwRange(conv.commandRange, "ConversationName"), "keyword", modBits("defaultLibrary"));
  }
  if (conv.nameRange) {
    push(b, conv.nameRange, "namespace", modBits("declaration"));
  }
}

function tokenizeDialogueLines(b: SemanticTokensBuilder, conv: DialogueTree["conversations"][number]) {
  for (const dl of conv.dialogueLines) {
    push(b, innerSpeakerRange(dl.speakerRange), "string", 0);

    if (dl.image) {
      push(b, kwRange(dl.image.range, "Image"), "keyword", modBits("defaultLibrary"));
      push(b, dl.image.pathRange, "string", 0);
    }

    if (dl.jump) {
      push(b, kwRange(dl.jump.range, "Jump"), "keyword", modBits("defaultLibrary"));
      push(b, dl.jump.targetRange, "namespace", 0);
    }

    for (const sent of dl.sentences) {
      for (const frag of sent.fragments) {
        if (frag.kind === "function") {
          if (ALL_KEYWORD_SET.has(frag.name)) {
            push(b, frag.nameRange, "keyword", modBits("defaultLibrary"));
          } else {
            push(b, frag.nameRange, "function", 0);
          }
        }
        if (frag.kind === "variable") {
          push(b, frag.range, "variable", modBits("readonly"));
        }
        if (frag.kind === "escape") {
          push(b, frag.range, "string", 0);
        }
      }

      if (sent.metadata) {
        for (const m of sent.metadata) {
          push(b, m.keyRange, "property", 0);
          if (m.valueRange) push(b, m.valueRange, "string", 0);
        }
      }

      pushRichTextTags(b, sent.fragments);
    }
  }
}

function tokenizeChoices(b: SemanticTokensBuilder, conv: DialogueTree["conversations"][number]) {
  for (const choice of conv.choices) {
    push(b, choice.textRange, "string", 0);

    if (choice.arrowRange.start.character !== choice.arrowRange.end.character) {
      push(b, choice.arrowRange, "operator", 0);
    }

    if (choice.target) {
      push(b, choice.targetRange, choice.isContinue ? "keyword" : "namespace", 0);
    }

    for (const m of choice.metadata) {
      push(b, m.keyRange, "property", 0);
      if (m.valueRange) push(b, m.valueRange, "string", 0);
    }
  }
}

function tokenizeConditionals(b: SemanticTokensBuilder, conv: DialogueTree["conversations"][number]) {
  for (const cond of conv.conditionals) {
    for (const branch of cond.branches) {
      push(b, branch.keywordRange, "keyword", modBits("defaultLibrary"));
    }
  }
  // EndIf keywords that closed blocks are part of the conditional range end,
  // but branches only store If/ElseIf/Else. EndIf is handled via commandKeywords
  // in the document index which is used by the grammar for highlighting.
}

function tokenizeVariableCommands(b: SemanticTokensBuilder, conv: DialogueTree["conversations"][number]) {
  for (const set of conv.setCommands) {
    push(b, kwRange(set.range, "Set"), "keyword", modBits("defaultLibrary"));
    push(b, set.variableRange, "variable", modBits("readonly"));
  }
  for (const g of conv.globalDecls) {
    push(b, kwRange(g.range, "Global"), "keyword", modBits("defaultLibrary"));
    push(b, g.variableRange, "variable", modBits("readonly"));
  }
}

function innerSpeakerRange(r: AstRange): AstRange {
  return {
    start: { line: r.start.line, character: r.start.character + 1 },
    end: { line: r.end.line, character: r.end.character - 1 },
  };
}

function kwRange(commandRange: AstRange, name: string): AstRange {
  return {
    start: { line: commandRange.start.line, character: commandRange.start.character + 2 },
    end: { line: commandRange.start.line, character: commandRange.start.character + 2 + name.length },
  };
}

const RICH_TEXT_RE = /<\/?(?:b|i|u|s|sup|sub|size(?:=[^>]*)?|color(?:=[^>]*)?|sprite[^>]*)>/g;

function pushRichTextTags(
  b: SemanticTokensBuilder,
  fragments: readonly { kind: string; range: AstRange; value?: string }[],
) {
  for (const frag of fragments) {
    if (frag.kind !== "text" || !frag.value) continue;

    RICH_TEXT_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = RICH_TEXT_RE.exec(frag.value)) !== null) {
      const start = frag.range.start.character + match.index;
      push(b, {
        start: { line: frag.range.start.line, character: start },
        end: { line: frag.range.start.line, character: start + match[0].length },
      }, "decorator", 0);
    }
  }
}
