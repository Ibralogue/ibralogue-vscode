import * as esbuild from "esbuild";

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

/** @type {import('esbuild').BuildOptions} */
const sharedConfig = {
  bundle: true,
  format: "cjs",
  minify: production,
  sourcemap: !production,
  sourcesContent: false,
  platform: "node",
  logLevel: "info",
};

/** @type {import('esbuild').BuildOptions} */
const extensionConfig = {
  ...sharedConfig,
  entryPoints: ["src/extension.ts"],
  outfile: "dist/extension.js",
  external: ["vscode"],
};

/** @type {import('esbuild').BuildOptions} */
const serverConfig = {
  ...sharedConfig,
  entryPoints: ["src/server/server.ts"],
  outfile: "dist/server.js",
};

async function main() {
  if (watch) {
    const [extCtx, srvCtx] = await Promise.all([
      esbuild.context(extensionConfig),
      esbuild.context(serverConfig),
    ]);
    await Promise.all([extCtx.watch(), srvCtx.watch()]);
    console.log("Watching for changes...");
  } else {
    await Promise.all([
      esbuild.build(extensionConfig),
      esbuild.build(serverConfig),
    ]);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
