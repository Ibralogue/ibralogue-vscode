import {
  SemanticTokensBuilder,
  SemanticTokensLegend,
  SemanticTokens,
} from "vscode-languageserver/node";
import { DialogueTree, Token, TokenType, Range as AstRange } from "../parser/ast";

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
    if (conv.commandRange) {
      const cmdLine = conv.commandRange.start.line;
      const cmdStart = conv.commandRange.start.character;
      push(b, {
        start: { line: cmdLine, character: cmdStart + 2 },
        end: { line: cmdLine, character: cmdStart + 2 + "ConversationName".length },
      }, "keyword", modBits("defaultLibrary"));
    }

    if (conv.nameRange) {
      push(b, conv.nameRange, "namespace", modBits("declaration"));
    }

    for (const dl of conv.dialogueLines) {
      const sRange = innerSpeakerRange(dl.speakerRange);
      push(b, sRange, "string", 0);

      if (dl.image) {
        const imgLine = dl.image.range.start.line;
        const imgStart = dl.image.range.start.character;
        push(b, {
          start: { line: imgLine, character: imgStart + 2 },
          end: { line: imgLine, character: imgStart + 2 + "Image".length },
        }, "keyword", modBits("defaultLibrary"));
        push(b, dl.image.pathRange, "string", 0);
      }

      if (dl.jump) {
        const jLine = dl.jump.range.start.line;
        const jStart = dl.jump.range.start.character;
        push(b, {
          start: { line: jLine, character: jStart + 2 },
          end: { line: jLine, character: jStart + 2 + "Jump".length },
        }, "keyword", modBits("defaultLibrary"));
        push(b, dl.jump.targetRange, "namespace", 0);
      }

      for (const sent of dl.sentences) {
        for (const frag of sent.fragments) {
          if (frag.kind === "function") {
            push(b, frag.nameRange, "function", 0);
            pushFunctionArgs(b, frag.range, frag.args);
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

        pushRichTextTags(b, sent.range, sent.fragments);
      }
    }

    for (const choice of conv.choices) {
      push(b, choice.textRange, "string", 0);

      if (choice.arrowRange.start.character !== choice.arrowRange.end.character) {
        push(b, choice.arrowRange, "operator", 0);
      }

      if (choice.target) {
        push(b, choice.targetRange, "namespace", 0);
      }

      for (const m of choice.metadata) {
        push(b, m.keyRange, "property", 0);
        if (m.valueRange) push(b, m.valueRange, "string", 0);
      }
    }
  }

  return b.build();
}

function innerSpeakerRange(r: AstRange): AstRange {
  return {
    start: { line: r.start.line, character: r.start.character + 1 },
    end: { line: r.end.line, character: r.end.character - 1 },
  };
}

function pushFunctionArgs(
  b: SemanticTokensBuilder,
  funcRange: AstRange,
  args: string[],
) {
  if (args.length === 0) return;
  // We don't have precise arg ranges from the AST fragment, so skip sub-arg tokens
  // The TextMate grammar handles basic arg highlighting
}

const RICH_TEXT_RE = /<\/?(?:b|i|u|s|sup|sub|color(?:=[^>]*)?)>/g;

function pushRichTextTags(
  b: SemanticTokensBuilder,
  sentRange: AstRange,
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
