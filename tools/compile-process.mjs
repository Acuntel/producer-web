// knowledge/process/CORE.md -> lib/brain/process.ts (a cached system block).
import { readFileSync, writeFileSync, existsSync } from "node:fs";
const src = "knowledge/process/CORE.md";
if (!existsSync(src)) { console.error("missing", src); process.exit(1); }
const md = readFileSync(src, "utf8").trim();
const out = `// Compiled production PROCESS knowledge (knowledge/process/CORE.md). Regenerate with \`node tools/compile-process.mjs\`.\nexport const PROCESS: string = ${JSON.stringify(md)};\n`;
writeFileSync("lib/brain/process.ts", out);
console.log(`compiled ${md.length} chars from ${src}`);
