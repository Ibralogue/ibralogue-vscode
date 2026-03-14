import {
  CompletionItem,
  CompletionItemKind,
  InsertTextFormat,
  Position,
} from "vscode-languageserver/node";
import { DocumentIndex } from "./documentIndex";
import { DialogueTree } from "../parser/ast";
import { CONTINUE_TARGET, SILENT_SPEAKER } from "../parser/keywords";

type Context =
  | "commandOrFunc"
  | "jumpArg"
  | "includeAsset"
  | "includeConv"
  | "setArg"
  | "globalArg"
  | "ifArg"
  | "funcArg"
  | "speaker"
  | "variable"
  | "choiceTarget"
  | "metadata"
  | "choiceStart"
  | "none";

export function getCompletions(
  lineText: string,
  position: Position,
  ast: DialogueTree,
  index: DocumentIndex,
): CompletionItem[] {
  const textBefore = lineText.substring(0, position.character);
  const ctx = detectContext(textBefore, lineText);

  switch (ctx) {
    case "commandOrFunc":
      return commandAndFunctionCompletions(index);
    case "jumpArg":
    case "choiceTarget":
      return conversationCompletions(ast, index, ctx === "choiceTarget");
    case "includeAsset":
      return [];
    case "includeConv":
      return conversationCompletions(ast, index, false);
    case "setArg":
    case "globalArg":
    case "ifArg":
    case "funcArg":
    case "variable":
      return variableCompletions(index);
    case "speaker":
      return speakerCompletions(index);
    case "metadata":
      return metadataCompletions(index);
    case "choiceStart":
      return choiceSnippetCompletion();
    default:
      return [];
  }
}

// ── Context Detection ───────────────────────────────────────────────

function detectContext(textBefore: string, _fullLine: string): Context {
  const lastOpen = textBefore.lastIndexOf("{{");
  const lastClose = textBefore.lastIndexOf("}}");
  if (lastOpen !== -1 && lastOpen > lastClose) {
    const inside = textBefore.substring(lastOpen + 2);
    if (inside.includes("(")) {
      const funcName = inside.substring(0, inside.indexOf("(")).trim();
      if (funcName === "Jump") return "jumpArg";
      if (funcName === "Include") return inside.includes(",") ? "includeConv" : "includeAsset";
      if (funcName === "Set" || funcName === "Global") return inside.includes(",") ? "variable" : "setArg";
      if (funcName === "If" || funcName === "ElseIf") return "ifArg";
      return "funcArg";
    }
    return "commandOrFunc";
  }

  const lastBracket = textBefore.lastIndexOf("[");
  const lastBracketClose = textBefore.lastIndexOf("]");
  if (lastBracket !== -1 && lastBracket > lastBracketClose) return "speaker";

  if (/\$[a-zA-Z0-9_]*$/.test(textBefore)) return "variable";

  const trimmed = textBefore.trimStart();
  if (trimmed.startsWith("-") && textBefore.includes("->")) return "choiceTarget";
  if (textBefore.includes("##")) return "metadata";
  if (trimmed.startsWith("-") && !textBefore.includes("->")) return "choiceStart";

  return "none";
}

// ── Completion Providers ────────────────────────────────────────────

function commandAndFunctionCompletions(index: DocumentIndex): CompletionItem[] {
  const items: CompletionItem[] = [
    kwSnippet("ConversationName", "ConversationName($1)", "Names this conversation block"),
    kwSnippet("Jump", "Jump($1)", "Jump to another conversation"),
    kwSnippet("Image", "Image($1)", "Set speaker portrait image"),
    kwSnippet("Include", "Include($1)", "Include another dialogue file"),
    kwSnippet("Audio", "Audio($1)", "Play an audio clip"),
    kwSnippet("Wait", "Wait($1)", "Pause display for N seconds"),
    kwSnippet("Speed", "Speed($1)", "Change text reveal speed multiplier"),
    kwSnippet("If", "If($1)", "Conditional block — show content when condition is true"),
    kwSnippet("ElseIf", "ElseIf($1)", "Alternative condition branch"),
    kw("Else", "Else branch — shown when no prior condition matched"),
    kw("EndIf", "Closes a conditional block"),
    kwSnippet("Set", "Set(\\$$1, $2)", "Assign a variable value"),
    kwSnippet("Global", "Global(\\$$1, $2)", "Declare a global variable"),
  ];

  for (const name of index.functions.keys()) {
    items.push({
      label: name,
      kind: CompletionItemKind.Function,
      detail: `Function (used ${index.functions.get(name)!.length} times)`,
    });
  }

  return items;
}

function conversationCompletions(
  ast: DialogueTree,
  index: DocumentIndex,
  includeContinue: boolean,
): CompletionItem[] {
  const items: CompletionItem[] = ast.conversations.map((conv) => {
    const def = index.conversationDefs.get(conv.name);
    const line = def?.commandRange?.start.line;
    return {
      label: conv.name,
      kind: CompletionItemKind.Reference,
      detail: line != null ? `Defined at line ${line + 1}` : "Default conversation",
    };
  });

  if (includeContinue) {
    items.push({
      label: CONTINUE_TARGET,
      kind: CompletionItemKind.Keyword,
      detail: "Continue in the current conversation without jumping",
    });
  }

  return items;
}

function variableCompletions(index: DocumentIndex): CompletionItem[] {
  return [...index.variables.entries()].map(([name, ranges]) => ({
    label: name,
    kind: CompletionItemKind.Variable,
    detail: `Variable (${ranges.length} references)`,
  }));
}

function speakerCompletions(index: DocumentIndex): CompletionItem[] {
  const items: CompletionItem[] = [...index.speakers.entries()].map(([name, ranges]) => ({
    label: name,
    kind: CompletionItemKind.Value,
    detail: `Speaker (used ${ranges.length} times)`,
  }));

  items.push({
    label: SILENT_SPEAKER,
    kind: CompletionItemKind.Keyword,
    detail: "Silent line — runs invocations without showing dialogue",
  });

  return items;
}

function metadataCompletions(index: DocumentIndex): CompletionItem[] {
  return [...index.metadataKeys.entries()].map(([key, ranges]) => ({
    label: `${key}:`,
    kind: CompletionItemKind.Property,
    detail: `Metadata key (used ${ranges.length} times)`,
  }));
}

function choiceSnippetCompletion(): CompletionItem[] {
  return [
    {
      label: "- Choice",
      kind: CompletionItemKind.Snippet,
      insertText: " ${1:Choice text} -> ${2:TargetConversation}",
      insertTextFormat: InsertTextFormat.Snippet,
      detail: "Choice declaration",
    },
  ];
}

// ── Helpers ─────────────────────────────────────────────────────────

function kwSnippet(label: string, insertText: string, detail: string): CompletionItem {
  return {
    label,
    kind: CompletionItemKind.Keyword,
    insertText,
    insertTextFormat: InsertTextFormat.Snippet,
    detail,
  };
}

function kw(label: string, detail: string): CompletionItem {
  return {
    label,
    kind: CompletionItemKind.Keyword,
    detail,
  };
}
