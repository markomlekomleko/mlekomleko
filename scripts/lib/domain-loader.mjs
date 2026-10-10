// Run the project's TypeScript domain services from a local Node script.
import { registerHooks } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve as resolvePath } from 'node:path';
import ts from 'typescript';
const root = fileURLToPath(new URL('../../', import.meta.url));
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith('@/') || (specifier.startsWith('.') && context.parentURL?.startsWith('file:') && !context.parentURL.includes('/node_modules/'))) {
      const base = specifier.startsWith('@/') ? pathToFileURL(resolvePath(root, specifier.slice(2))) : new URL(specifier, context.parentURL);
      for (const suffix of ['', '.ts', '/index.ts']) {
        const url = new URL(base.href + suffix);
        if (url.pathname.endsWith('.ts') && existsSync(url)) return { url: url.href, shortCircuit: true };
      }
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.startsWith('file:') && url.endsWith('.ts') && !url.includes('/node_modules/')) {
      return { format: 'module', shortCircuit: true, source: ts.transpileModule(readFileSync(new URL(url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText };
    }
    return next(url, context);
  },
});
