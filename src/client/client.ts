import * as path from "path";
import * as vscode from "vscode";
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
} from "vscode-languageclient/node";

let client: LanguageClient | undefined;

export function createLanguageClient(
  context: vscode.ExtensionContext,
): LanguageClient {
  const serverModule = context.asAbsolutePath(path.join("dist", "server.js"));

  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: { execArgv: ["--nolazy", "--inspect=6009"] },
    },
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: "file", language: "ibralogue" }],
  };

  client = new LanguageClient(
    "ibralogue",
    "Ibralogue Language Server",
    serverOptions,
    clientOptions,
  );

  return client;
}

export function getClient(): LanguageClient | undefined {
  return client;
}
