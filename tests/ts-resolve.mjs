// Lets Node import the library the way the app does: extensionless TypeScript imports
// ("./dsp" -> "./dsp.ts") and the "@/" alias the whole codebase uses for the project root.
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve as resolvePath, dirname } from "node:path";

const ROOT = pathToFileURL(resolvePath(dirname(fileURLToPath(import.meta.url)), "..") + "/").href;

// "./x", "../x" or "@/lib/x" -> the file that actually exists, with its extension.
const withExtension = (base) => {
  if (/\.[cm]?[jt]sx?$/.test(base.href) && existsSync(fileURLToPath(base))) return base.href;
  for (const ext of [".ts", ".tsx", ".mjs", ".js", "/index.ts"]) {
    const cand = new URL(base.href + ext);
    if (existsSync(fileURLToPath(cand))) return cand.href;
  }
  return null;
};

registerHooks({
  resolve(spec, ctx, next) {
    if (spec.startsWith("@/")) {
      const hit = withExtension(new URL(spec.slice(2), ROOT));
      if (hit) return next(hit, ctx);
    }
    if ((spec.startsWith("./") || spec.startsWith("../")) && !/\.[cm]?[jt]sx?$/.test(spec) && ctx.parentURL) {
      const hit = withExtension(new URL(spec, ctx.parentURL));
      if (hit) return next(hit, ctx);
    }
    return next(spec, ctx);
  },
});
