import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  InitializeParams,
  InitializeResult,
  TextDocumentSyncKind,
  SemanticTokensRequest,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import { Token, DialogueTree } from "./parser/ast";
import { tokenize } from "./parser/lexer";
import { parse } from "./parser/parser";
import { computeDiagnostics } from "./parser/diagnostics";
import { DocumentIndex, buildIndex } from "./features/documentIndex";
import { getCompletions } from "./features/completion";
import { getHover } from "./features/hover";
import { getDefinition } from "./features/definition";
import { getReferences } from "./features/references";
import { prepareRename, doRename } from "./features/rename";
import { getDocumentSymbols } from "./features/symbols";
import { getFoldingRanges } from "./features/folding";
import { getSemanticTokens, semanticTokensLegend } from "./features/semanticTokens";
import { getCodeActions } from "./features/codeActions";
import { getCodeLenses } from "./features/codeLens";
import { getDocumentColors, getColorPresentations } from "./features/colorDecorations";
import { buildDialogueGraph } from "./features/graphBuilder";

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

interface DocumentState {
  tokens: Token[];
  ast: DialogueTree;
  index: DocumentIndex;
}

const documentStates = new Map<string, DocumentState>();

connection.onInitialize((_params: InitializeParams): InitializeResult => {
  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: {
        triggerCharacters: ["[", "{", "$", "#", "-", "(", ",", ":"],
      },
      hoverProvider: true,
      definitionProvider: true,
      referencesProvider: true,
      renameProvider: { prepareProvider: true },
      documentSymbolProvider: true,
      foldingRangeProvider: true,
      semanticTokensProvider: {
        legend: semanticTokensLegend,
        full: true,
      },
      codeActionProvider: true,
      codeLensProvider: { resolveProvider: false },
      colorProvider: true,
    },
  };
});

documents.onDidChangeContent((change) => {
  const text = change.document.getText();
  const tokens = tokenize(text);
  const { ast, diagnostics: parseDiags } = parse(tokens);
  const analyzeDiags = computeDiagnostics(tokens, ast, text);
  const index = buildIndex(ast);

  documentStates.set(change.document.uri, { tokens, ast, index });

  connection.sendDiagnostics({
    uri: change.document.uri,
    diagnostics: [...parseDiags, ...analyzeDiags],
  });
});

documents.onDidClose((event) => {
  documentStates.delete(event.document.uri);
  connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] });
});

connection.onCompletion((params) => {
  const doc = documents.get(params.textDocument.uri);
  const state = documentStates.get(params.textDocument.uri);
  if (!doc || !state) return [];

  const lineText = doc.getText({
    start: { line: params.position.line, character: 0 },
    end: { line: params.position.line + 1, character: 0 },
  });

  return getCompletions(lineText, params.position, state.ast, state.index);
});

connection.onHover((params) => {
  const state = documentStates.get(params.textDocument.uri);
  if (!state) return null;
  return getHover(params.position, state.ast, state.index);
});

connection.onDefinition((params) => {
  const state = documentStates.get(params.textDocument.uri);
  if (!state) return null;
  return getDefinition(params.position, params.textDocument.uri, state.ast, state.index);
});

connection.onReferences((params) => {
  const state = documentStates.get(params.textDocument.uri);
  if (!state) return [];
  return getReferences(params.position, params.textDocument.uri, state.ast, state.index);
});

connection.onPrepareRename((params) => {
  const state = documentStates.get(params.textDocument.uri);
  if (!state) return null;
  return prepareRename(params.position, state.ast, state.index);
});

connection.onRenameRequest((params) => {
  const state = documentStates.get(params.textDocument.uri);
  if (!state) return null;
  return doRename(params.position, params.newName, params.textDocument.uri, state.ast, state.index);
});

connection.onDocumentSymbol((params) => {
  const state = documentStates.get(params.textDocument.uri);
  if (!state) return [];
  try {
    return getDocumentSymbols(state.ast);
  } catch {
    return [];
  }
});

connection.onFoldingRanges((params) => {
  const state = documentStates.get(params.textDocument.uri);
  if (!state) return [];
  return getFoldingRanges(state.ast, state.tokens);
});

connection.onRequest(SemanticTokensRequest.type, (params) => {
  const state = documentStates.get(params.textDocument.uri);
  if (!state) return { data: [] };
  return getSemanticTokens(state.ast, state.tokens);
});

connection.onCodeAction((params) => {
  const state = documentStates.get(params.textDocument.uri);
  if (!state) return [];
  return getCodeActions(params, state.ast);
});

connection.onCodeLens((params) => {
  const state = documentStates.get(params.textDocument.uri);
  if (!state) return [];
  return getCodeLenses(params.textDocument.uri, state.ast, state.index);
});

connection.onDocumentColor((params) => {
  const state = documentStates.get(params.textDocument.uri);
  if (!state) return [];
  return getDocumentColors(state.ast);
});

connection.onColorPresentation((params) => {
  return getColorPresentations(params.color, params.range);
});

connection.onRequest("ibralogue/getGraph", (params: { uri: string }) => {
  const state = documentStates.get(params.uri);
  if (!state) return null;
  return buildDialogueGraph(state.ast);
});

documents.listen(connection);
connection.listen();
