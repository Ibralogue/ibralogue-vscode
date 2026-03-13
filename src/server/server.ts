import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  InitializeParams,
  InitializeResult,
  TextDocumentSyncKind,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import { Token } from "./parser/ast";
import { tokenize } from "./parser/lexer";

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

interface DocumentState {
  tokens: Token[];
}

const documentStates = new Map<string, DocumentState>();

connection.onInitialize((_params: InitializeParams): InitializeResult => {
  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
    },
  };
});

documents.onDidChangeContent((change) => {
  const text = change.document.getText();
  const tokens = tokenize(text);
  documentStates.set(change.document.uri, { tokens });
});

documents.onDidClose((event) => {
  documentStates.delete(event.document.uri);
});

documents.listen(connection);
connection.listen();
