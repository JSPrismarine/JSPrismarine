/**
 * Emits a package's declaration files into `dist/` with tsc-ts, then adds what a
 * declaration-only build leaves out:
 *
 * - the hand-written `.d.ts` files under `src/` (ambient module and global
 *   declarations), copied alongside the emitted ones;
 * - a `<name>.json.d.ts` beside every JSON module the emitted declarations import.
 *   Vite bundles the JSON into JavaScript, so the published package ships no raw
 *   JSON; TypeScript resolves `./data.json` to `data.json.d.ts`, which is how the
 *   published packages have always typed their data.
 *
 * Run from the package directory, after `vite build`.
 */

import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageDir = process.cwd();
const srcDir = path.join(packageDir, 'src');
const distDir = path.join(packageDir, 'dist');
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Resolve the compiler from the workspace root so the script also works when it is
// started directly rather than through a package script that puts .bin on PATH.
const tscTs = path.join(repoRoot, 'node_modules', 'tsc-ts', 'bin', 'tsc-ts.js');
execFileSync(process.execPath, [tscTs, '-p', 'tsconfig.dts.json'], { cwd: packageDir, stdio: 'inherit' });

const walk = (directory: string, visit: (file: string) => void): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const file = path.join(directory, entry.name);
        if (entry.isDirectory()) walk(file, visit);
        else visit(file);
    }
};

/** A structural type for a JSON value, with primitives widened. */
const typeOf = (value: unknown): string => {
    if (value === null) return 'null';
    if (Array.isArray(value)) {
        const members = [...new Set(value.map(typeOf))];
        if (members.length === 0) return 'never[]';
        return members.length === 1 ? `${members[0]}[]` : `(${members.join(' | ')})[]`;
    }
    if (typeof value === 'object') {
        const fields = Object.entries(value).map(([key, field]) => `${JSON.stringify(key)}: ${typeOf(field)}`);
        return fields.length === 0 ? '{}' : `{ ${fields.join('; ')} }`;
    }
    return typeof value;
};

const JSON_IMPORT = /from\s+['"](\.[^'"]*\.json)['"]/g;

if (existsSync(srcDir)) {
    walk(srcDir, (file) => {
        if (!file.endsWith('.d.ts')) return;
        const target = path.join(distDir, path.relative(srcDir, file));
        mkdirSync(path.dirname(target), { recursive: true });
        cpSync(file, target);
    });
}

const declareJson = (source: string, declaration: string): void => {
    if (existsSync(declaration)) return;
    const value: unknown = JSON.parse(readFileSync(source, 'utf8'));
    mkdirSync(path.dirname(declaration), { recursive: true });
    writeFileSync(declaration, `declare const _default: ${typeOf(value)};\nexport default _default;\n`);
};

// Vite turns every JSON file under src/ into a module of its own, reachable through the
// package's `./*` export, so each one gets a declaration next to the built module.
if (existsSync(srcDir) && existsSync(distDir)) {
    walk(srcDir, (file) => {
        if (!file.endsWith('.json')) return;
        const relative = path.relative(srcDir, file).slice(0, -'.json'.length);
        if (!existsSync(path.join(distDir, `${relative}.es.js`))) return;
        declareJson(file, path.join(distDir, `${relative}.d.ts`));
        declareJson(file, path.join(distDir, `${relative}.json.d.ts`));
    });
}

if (existsSync(distDir)) {
    walk(distDir, (file) => {
        if (!file.endsWith('.d.ts') || file.endsWith('.json.d.ts')) return;
        for (const [, specifier] of readFileSync(file, 'utf8').matchAll(JSON_IMPORT)) {
            if (!specifier) continue;
            const declaration = path.resolve(path.dirname(file), `${specifier}.d.ts`);
            if (existsSync(declaration)) continue;
            const source = path.join(srcDir, path.relative(distDir, path.resolve(path.dirname(file), specifier)));
            declareJson(source, declaration);
        }
    });
}
