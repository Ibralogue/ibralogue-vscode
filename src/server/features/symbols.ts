import { DocumentSymbol, SymbolKind } from "vscode-languageserver/node";
import { DialogueTree, Conversation, DialogueLine, Sentence, ChoiceNode } from "../parser/ast";

export function getDocumentSymbols(ast: DialogueTree): DocumentSymbol[] {
  const symbols: DocumentSymbol[] = [];
  for (const conv of ast.conversations) {
    symbols.push(buildConversationSymbol(conv));
  }
  return symbols;
}

function buildConversationSymbol(conv: Conversation): DocumentSymbol {
  const children: DocumentSymbol[] = [];

  for (const dl of conv.dialogueLines) {
    children.push(buildDialogueLineSymbol(dl));
  }

  for (const choice of conv.choices) {
    children.push(buildChoiceSymbol(choice));
  }

  const nameRange = conv.nameRange ?? conv.fullRange;

  return {
    name: `Conversation "${conv.name}"`,
    kind: SymbolKind.Namespace,
    range: conv.fullRange,
    selectionRange: nameRange,
    children,
  };
}

function buildDialogueLineSymbol(dl: DialogueLine): DocumentSymbol {
  const children: DocumentSymbol[] = [];

  for (const sent of dl.sentences) {
    children.push(...buildSentenceSymbols(sent));
  }

  if (dl.image) {
    children.push({
      name: `{{Image(${dl.image.path})}}`,
      kind: SymbolKind.File,
      range: dl.image.range,
      selectionRange: dl.image.pathRange,
    });
  }

  if (dl.jump) {
    children.push({
      name: `{{Jump(${dl.jump.target})}}`,
      kind: SymbolKind.Function,
      range: dl.jump.range,
      selectionRange: dl.jump.targetRange,
    });
  }

  return {
    name: `[${dl.speaker}]`,
    kind: SymbolKind.String,
    range: dl.range,
    selectionRange: dl.speakerRange,
    children,
  };
}

function buildSentenceSymbols(sent: Sentence): DocumentSymbol[] {
  const symbols: DocumentSymbol[] = [];

  const textParts: string[] = [];
  for (const frag of sent.fragments) {
    if (frag.kind === "text") textParts.push(frag.value);
    else if (frag.kind === "function") textParts.push(`{{${frag.name}}}`);
    else if (frag.kind === "variable") textParts.push(`$${frag.name}`);
    else textParts.push(frag.value);
  }

  const preview = textParts.join("").substring(0, 60);
  if (preview.trim().length > 0) {
    symbols.push({
      name: preview,
      kind: SymbolKind.String,
      range: sent.range,
      selectionRange: sent.range,
    });
  }

  for (const frag of sent.fragments) {
    if (frag.kind === "function") {
      symbols.push({
        name: `{{${frag.name}}}`,
        kind: SymbolKind.Function,
        range: frag.range,
        selectionRange: frag.nameRange,
      });
    }
    if (frag.kind === "variable") {
      symbols.push({
        name: `$${frag.name}`,
        kind: SymbolKind.Variable,
        range: frag.range,
        selectionRange: frag.nameRange,
      });
    }
  }

  if (sent.metadata) {
    for (const m of sent.metadata) {
      symbols.push({
        name: m.isTag ? m.key : `${m.key}:${m.value}`,
        kind: SymbolKind.Property,
        range: m.range,
        selectionRange: m.keyRange,
      });
    }
  }

  return symbols;
}

function buildChoiceSymbol(choice: ChoiceNode): DocumentSymbol {
  const label = choice.target
    ? `"${choice.text}" -> ${choice.target}`
    : `"${choice.text}"`;

  return {
    name: `Choice: ${label}`,
    kind: SymbolKind.Event,
    range: choice.range,
    selectionRange: choice.textRange,
  };
}
