import { Hover, MarkupKind, Position } from "vscode-languageserver/node";
import { DialogueTree } from "../parser/ast";
import { DocumentIndex, findSymbolAt } from "./documentIndex";
import { SILENT_SPEAKER, CONTINUE_TARGET } from "../parser/keywords";

export function getHover(
  position: Position,
  ast: DialogueTree,
  index: DocumentIndex,
): Hover | null {
  const sym = findSymbolAt(position, ast, index);
  if (!sym) return null;

  let md: string;

  switch (sym.kind) {
    case "speaker": {
      if (sym.name === SILENT_SPEAKER) {
        md = `**Silent Line**: [${SILENT_SPEAKER}]\n\nRuns invocations without displaying anything in the dialogue view.`;
        break;
      }
      const count = index.speakers.get(sym.name)?.length ?? 0;
      md = `**Speaker**: ${sym.name}\n\nAppears in ${count} dialogue line(s).`;
      break;
    }

    case "conversationDef": {
      const conv = ast.conversations.find((c) => c.name === sym.name);
      const lines = conv?.dialogueLines.length ?? 0;
      const choices = conv?.choices.length ?? 0;
      const refCount = countConversationRefs(sym.name, index);
      md = `**Conversation**: ${sym.name}\n\n${lines} dialogue line(s), ${choices} choice(s)\n\nReferenced by: ${refCount} choice(s)/jump(s)`;
      break;
    }

    case "choiceTarget": {
      if (sym.name === CONTINUE_TARGET) {
        md = `**Continue**: -> ${CONTINUE_TARGET}\n\nContinues the dialogue in the current conversation without jumping.`;
        break;
      }
      const def = index.conversationDefs.get(sym.name);
      const loc = def ? `line ${def.commandRange!.start.line + 1}` : "not defined";
      md = `**Choice Target**: -> ${sym.name}\n\nDefined at ${loc}.`;
      break;
    }

    case "jumpTarget": {
      const def = index.conversationDefs.get(sym.name);
      const loc = def ? `line ${def.commandRange!.start.line + 1}` : "not defined";
      md = `**Jump**: -> ${sym.name}\n\nDefined at ${loc}.\n\nAfter this dialogue line finishes, the engine switches to the target conversation.`;
      break;
    }

    case "variable": {
      const count = index.variables.get(sym.name)?.length ?? 0;
      md = `**Variable**: $${sym.name}\n\nReferenced ${count} time(s) in this file.`;
      break;
    }

    case "function": {
      const count = index.functions.get(sym.name)?.length ?? 0;
      md = `**Function Invocation**: ${sym.name}\n\nCalled ${count} time(s).\n\nThe return value (if any) is inserted into the dialogue text.`;
      break;
    }

    case "metadataKey": {
      const count = index.metadataKeys.get(sym.name)?.length ?? 0;
      md = `**Metadata Key**: ${sym.name}\n\nUsed ${count} time(s) in this file.`;
      break;
    }

    case "commandKeyword": {
      md = commandKeywordDocs(sym.name);
      break;
    }

    default:
      return null;
  }

  return { contents: { kind: MarkupKind.Markdown, value: md }, range: sym.range };
}

function countConversationRefs(name: string, index: DocumentIndex): number {
  let count = 0;
  for (const ct of index.choiceTargets) if (ct.target === name) count++;
  for (const jt of index.jumpTargets) if (jt.target === name) count++;
  return count;
}

const KEYWORD_DOCS: Record<string, string> = {
  ConversationName:
    "**ConversationName**(Name)\n\nNames the following conversation block. Everything after this line belongs to this conversation.",
  Jump:
    "**Jump**(Target)\n\nAuto-jumps to the target conversation after the current dialogue line finishes.",
  Image:
    "**Image**(Path)\n\nSets the speaker portrait image for the current dialogue line via the `PortraitImagePlugin`.",
  Include:
    "**Include**(Asset[, Conversation])\n\nInserts content from another .ibra file at this location during preprocessing.",
  Audio:
    "**Audio**(ClipId)\n\nPlays an audio clip via the engine's `IAudioProvider`. Fires at its text position when inline.",
  Wait:
    "**Wait**(Seconds)\n\nPauses the display for the given duration. Meaningful with animated dialogue views.",
  Speed:
    "**Speed**(Multiplier)\n\nChanges the text reveal speed. 2 = twice as fast, 0.5 = half speed. Affects animated views only.",
  If:
    "**If**(Condition)\n\nConditional block. The body is shown only when the condition evaluates to true at runtime.",
  ElseIf:
    "**ElseIf**(Condition)\n\nAlternative branch checked when prior conditions were false.",
  Else:
    "**Else**\n\nFallback branch executed when no prior `If`/`ElseIf` condition matched.",
  EndIf:
    "**EndIf**\n\nCloses a conditional block started by `{{If(...)}}`. Required.",
  Set:
    "**Set**($Variable, Expression)\n\nAssigns a value to a variable. Creates a local variable if it doesn't exist.",
  Global:
    "**Global**($Variable[, Expression])\n\nDeclares or updates a global variable that persists across all dialogue files.",
};

function commandKeywordDocs(name: string): string {
  return KEYWORD_DOCS[name] ?? `**${name}**`;
}
