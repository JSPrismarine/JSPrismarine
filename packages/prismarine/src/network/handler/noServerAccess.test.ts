import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ImportDeclaration, Node } from 'tsc-ts/api';
import { getTextOfNode, parseSourceFile, SyntaxKind, walkPreorder } from 'tsc-ts/api';
import { describe, expect, it } from 'vitest';

const here = fileURLToPath(new URL('.', import.meta.url));
const src = resolve(here, '../..');

const isImport = (node: Node): node is ImportDeclaration => node.kind === SyntaxKind.ImportDeclaration;

/** The modules of the handler directory, tests and test helpers left out. */
const handlerModules = (): string[] =>
    readdirSync(here, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith('.ts') && !entry.name.includes('.test.'))
        .map((entry) => entry.name)
        .sort();

/** Whether `specifier`, imported from `file`, is `src/Server` or the package root. */
const resolvesTo = (file: string, specifier: string): 'server' | 'root' | null => {
    if (!specifier.startsWith('.')) return null;
    const target = resolve(dirname(file), specifier);
    if (target === join(src, 'Server') || target === join(src, 'Server.ts')) return 'server';
    if (target === src || target === join(src, 'index') || target === join(src, 'index.ts')) return 'root';
    return null;
};

/**
 * Whether a module imports `Server`: anything from `src/Server`, or a binding named `Server`
 * from the package root.
 */
const importsServer = (file: string, text = readFileSync(file, 'utf8')): boolean => {
    const source = parseSourceFile(file, text);
    for (const statement of source.statements.nodes) {
        if (!isImport(statement)) continue;
        const target = resolvesTo(file, getTextOfNode(statement.moduleSpecifier).slice(1, -1));
        if (target === 'server') return true;
        const bindings = statement.importClause?.namedBindings;
        if (target !== 'root' || bindings === undefined) continue;
        let named = false;
        walkPreorder(bindings, (node) => {
            if (node.kind === SyntaxKind.Identifier && getTextOfNode(node) === 'Server') named = true;
        });
        if (named) return true;
    }
    return false;
};

/** Whether a module calls `getServer()` on anything, such as a session or a world. */
const callsGetServer = (file: string, text = readFileSync(file, 'utf8')): boolean => {
    let calls = false;
    walkPreorder(parseSourceFile(file, text), (node) => {
        if (node.kind === SyntaxKind.PropertyAccessExpression && getTextOfNode(node).endsWith('.getServer')) {
            calls = true;
        }
    });
    return calls;
};

describe('network/handler', () => {
    it('reaches Server from no module', () => {
        // The slice 6 target "No `Server` import in a handler"
        // (docs/plans/entity-simulation-rearchitecture.md, phase D).
        const modules = handlerModules();
        const importing = modules.filter((name) => importsServer(join(here, name)) || callsGetServer(join(here, name)));

        expect(importing).toStrictEqual([]);
        expect(modules.length).toBeGreaterThan(0);
    });

    it('finds each way a module can reach Server', () => {
        const file = join(here, 'Example.ts');
        expect(importsServer(file, "import type Server from '../../Server';")).toBe(true);
        expect(importsServer(file, "import type { Server } from '../../';")).toBe(true);
        expect(importsServer(file, "import { Server as Host } from '../../index';")).toBe(true);
        expect(importsServer(file, "import type { PlayerSession } from '../../';")).toBe(false);
        expect(importsServer(file, "import type { SessionContext } from './HandlerContext';")).toBe(false);
        expect(importsServer(file, "import type { ServerContent } from '../../content/ServerContent';")).toBe(false);
        expect(callsGetServer(file, 'const content = session.getServer().getContent();')).toBe(true);
        expect(callsGetServer(file, 'const world = session.getWorld();')).toBe(false);
    });
});
