/**
 * Checks that exported declarations carry a JSDoc description.
 *
 * The repository requires JSDoc on exported functions, classes, interfaces,
 * type aliases, enums and constants, and on public methods of exported
 * classes. Biome cannot host this rule: its GritQL plugins receive
 * comment-stripped text and its JavaScript plugins expose no trivia, so this
 * check parses with the TypeScript 7 API (`tsc-ts/api`) and runs as part of
 * `pnpm lint` beside Biome.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { glob } from 'glob';
import type { Node, SourceFile } from 'tsc-ts/api';
import {
    getCombinedModifierFlags,
    getJSDoc,
    getLineAndCharacterOfPosition,
    ModifierFlags,
    parseSourceFile,
    SyntaxKind,
    tokenStartOfNode
} from 'tsc-ts/api';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const SOURCES = 'packages/*/src/**/*.ts';
const EXCLUDED = [
    '**/*.test.*',
    '**/*.d.ts',
    '**/@types/**',
    'packages/bedrock-data/src/generated/**',
    'packages/bedrock-data/src/jsp/**',
    'packages/bedrock-data/src/resources/**',
    'packages/minecraft/src/generated/**'
];

const DECLARATIONS = new Set([
    SyntaxKind.FunctionDeclaration,
    SyntaxKind.ClassDeclaration,
    SyntaxKind.InterfaceDeclaration,
    SyntaxKind.TypeAliasDeclaration,
    SyntaxKind.EnumDeclaration,
    SyntaxKind.VariableStatement
]);

interface Finding {
    file: string;
    line: number;
    what: string;
}

const nameOf = (node: Node): string => {
    const named = node as Node & { name?: { text?: string } };
    return named.name?.text ?? '(anonymous)';
};

const findingsIn = (file: string, source: SourceFile): Finding[] => {
    const findings: Finding[] = [];
    const report = (node: Node, what: string) => {
        const { line } = getLineAndCharacterOfPosition(source, tokenStartOfNode(node));
        findings.push({ file, line: line + 1, what });
    };

    for (const statement of source.statements.nodes) {
        if (!DECLARATIONS.has(statement.kind)) continue;
        if (!(getCombinedModifierFlags(statement as never) & ModifierFlags.Export)) continue;

        if (getJSDoc(statement).length === 0) {
            const what =
                statement.kind === SyntaxKind.VariableStatement
                    ? `exported constant \`${nameOf((statement as never as { declarationList: { declarations: { nodes: Node[] } } }).declarationList.declarations.nodes[0]!)}\``
                    : `exported ${SyntaxKind[statement.kind]!.replace('Declaration', '').toLowerCase()} \`${nameOf(statement)}\``;
            report(statement, what);
        }

        if (statement.kind !== SyntaxKind.ClassDeclaration) continue;
        const members = (statement as never as { members: { nodes: Node[] } }).members.nodes;
        for (const member of members) {
            if (member.kind !== SyntaxKind.MethodDeclaration) continue;
            const flags = getCombinedModifierFlags(member as never);
            if (flags & (ModifierFlags.Private | ModifierFlags.Protected)) continue;
            if (getJSDoc(member).length === 0) {
                report(member, `public method \`${nameOf(statement)}.${nameOf(member)}\``);
            }
        }
    }
    return findings;
};

const files = (await glob(SOURCES, { cwd: repoRoot, ignore: EXCLUDED })).sort();
const findings: Finding[] = [];
for (const file of files) {
    const source = parseSourceFile(file, readFileSync(path.join(repoRoot, file), 'utf8'), {});
    findings.push(...findingsIn(file, source));
}

// Symbols that predate this check live in the baseline and stay allowed until
// someone documents them; anything new must ship with its JSDoc. `--update`
// rewrites the baseline after documenting (or removing) old symbols.
const baselinePath = path.join(repoRoot, 'scripts', 'jsdoc-baseline.json');
const keyOf = (finding: Finding): string => `${finding.file} ${finding.what}`;

if (process.argv.includes('--update')) {
    writeFileSync(baselinePath, `${JSON.stringify(findings.map(keyOf).sort(), null, 4)}\n`);
    console.log(`Baseline updated with ${findings.length} known findings.`);
    process.exit(0);
}

const baseline = new Set<string>(JSON.parse(readFileSync(baselinePath, 'utf8')) as string[]);
const fresh = findings.filter((finding) => !baseline.has(keyOf(finding)));

if (fresh.length > 0) {
    for (const finding of fresh) {
        console.error(`${finding.file}:${finding.line} ${finding.what} is missing its JSDoc description`);
    }
    console.error(
        `\n${fresh.length} exported declarations are missing JSDoc (${files.length} files checked, ${baseline.size} known findings baselined in scripts/jsdoc-baseline.json).`
    );
    process.exit(1);
}

const gone = baseline.size - findings.filter((finding) => baseline.has(keyOf(finding))).length;
if (gone > 0) {
    console.log(
        `${gone} baselined findings are documented now; run \`node scripts/check-jsdoc.mts --update\` to shrink the baseline.`
    );
}
console.log(`No new exported declarations without JSDoc (${files.length} files checked).`);
