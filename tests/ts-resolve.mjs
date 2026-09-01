// Lets Node import the ears library's extensionless TypeScript imports ("./dsp" -> "./dsp.ts").
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

registerHooks({
  resolve(spec, ctx, next) {
    if ((spec.startsWith("./") || spec.startsWith("../")) && !/\.[cm]?[jt]sx?$/.test(spec) && ctx.parentURL) {
      const base = new URL(spec, ctx.parentURL);
      for (const ext of [".ts", "/index.ts"]) {
        const cand = new URL(base.href + ext);
        if (existsSync(fileURLToPath(cand))) return next(cand.href, ctx);
      }
    }
    return next(spec, ctx);
  },
});
