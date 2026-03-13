import {
  CompletionItem,
  CompletionItemKind,
  InsertTextFormat,
  Position,
} from "vscode-languageserver/node";
import { DocumentIndex } from "./documentIndex";
import { DialogueTree } from "../parser/ast";

type Context =
  | "commandOrFunc"
  | "jumpArg"
  | "includeAsset"
  | "includeConv"
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
      return conversationCompletions(ast, index);
    case "includeAsset":
      return [];
    case "includeConv":
      return conversationCompletions(ast, index);
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

function detectContext(textBefore: string, _fullLine: string): Context {
  const lastOpen = textBefore.lastIndexOf("{{");
  const lastClose = textBefore.lastIndexOf("}}");
  if (lastOpen !== -1 && lastOpen > lastClose) {
    const inside = textBefore.substring(lastOpen + 2);
    if (inside.includes("(")) {
      const funcName = inside.substring(0, inside.indexOf("(")).trim();
      if (funcName === "Jump") return "jumpArg";
      if (funcName === "Include") return inside.includes(",") ? "includeConv" : "includeAsset";
      return "funcArg";
    }
    return "commandOrFunc";
  }

  const lastBracket = textBefore.lastIndexOf("[");
  const lastBracketClose = textBefore.lastIndexOf("]");
  if (lastBracket !== -1 && lastBracket > lastBracketClose) return "speaker";

  if (/\$[a-zA-Z0-9]*$/.test(textBefore)) return "variable";

  const trimmed = textBefore.trimStart();
  if (trimmed.startsWith("-") && textBefore.includes("->")) return "choiceTarget";
  if (textBefore.includes("##")) return "metadata";
  if (trimmed.startsWith("-") && !textBefore.includes("->")) return "choiceStart";

  return "none";
}

function commandAndFunctionCompletions(index: DocumentIndex): CompletionItem[] {
  const items: CompletionItem[] = [
    {
      label: "ConversationName",
      kind: CompletionItemKind.Keyword,
      insertText: "ConversationName($1)",
      insertTextFormat: InsertTextFormat.Snippet,
      detail: "Names this conversation block",
    },
    {
      label: "Jump",
      kind: CompletionItemKind.Keyword,
      insertText: "Jump($1)",
      insertTextFormat: InsertTextFormat.Snippet,
      detail: "Jump to another conversation",
    },
    {
      label: "Image",
      kind: CompletionItemKind.Keyword,
      insertText: "Image($1)",
      insertTextFormat: InsertTextFormat.Snippet,
      detail: "Set speaker portrait image",
    },
    {
      label: "Include",
      kind: CompletionItemKind.Keyword,
      insertText: "Include($1)",
      insertTextFormat: InsertTextFormat.Snippet,
      detail: "Include another dialogue file",
    },
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

function conversationCompletions(ast: DialogueTree, index: DocumentIndex): CompletionItem[] {
  return ast.conversations.map((conv) => {
    const def = index.conversationDefs.get(conv.name);
    const line = def?.commandRange?.start.line;
    return {
      label: conv.name,
      kind: CompletionItemKind.Reference,
      detail: line != null ? `Defined at line ${line + 1}` : "Default conversation",
    };
  });
}

function variableCompletions(index: DocumentIndex): CompletionItem[] {
  return [...index.variables.entries()].map(([name, ranges]) => ({
    label: name,
    kind: CompletionItemKind.Variable,
    detail: `Global variable (${ranges.length} references)`,
  }));
}

function speakerCompletions(index: DocumentIndex): CompletionItem[] {
  return [...index.speakers.entries()].map(([name, ranges]) => ({
    label: name,
    kind: CompletionItemKind.Value,
    detail: `Speaker (used ${ranges.length} times)`,
  }));
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
