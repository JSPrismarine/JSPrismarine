/**
 * Checks that packet payload codecs support both serialization and deserialization.
 *
 * `NetworkPacket<T>` enforces its codec pair with abstract methods. The older Prismarine and
 * RakNet bases provide empty payload methods, so this check protects their one-way packet
 * implementations and fingerprints the existing gaps until each packet is completed.
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { glob } from 'glob';
import type { ClassDeclaration, ConstructorDeclaration, Node, SourceFile } from 'tsc-ts/api';
import {
    getCombinedModifierFlags,
    getLineAndCharacterOfPosition,
    ModifierFlags,
    parseSourceFile,
    SyntaxKind,
    tokenStartOfNode
} from 'tsc-ts/api';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCES = ['packages/prismarine/src/network/packet/**/*.ts', 'packages/raknet/src/protocol/**/*.ts'];
const EXCLUDED = ['**/*.test.*', '**/*.d.ts'];
const BASE_CLASSES = new Set(['Packet', 'OfflinePacket', 'AcknowledgePacket']);
const RAKNET_INTERMEDIATES = new Set(['Packet', 'OfflinePacket']);
const baselinePath = path.join(repoRoot, 'scripts', 'packet-codec-baseline.json');

interface Finding {
    file: string;
    line: number;
    className: string;
    missing: string[];
}

const nameOf = (node: Node): string => {
    if (
        'name' in node &&
        typeof node.name === 'object' &&
        node.name !== null &&
        'text' in node.name &&
        typeof node.name.text === 'string'
    ) {
        return node.name.text;
    }
    return '(anonymous)';
};

const isClassDeclaration = (node: Node): node is ClassDeclaration => node.kind === SyntaxKind.ClassDeclaration;
const isConstructorDeclaration = (node: Node): node is ConstructorDeclaration => node.kind === SyntaxKind.Constructor;

const extendsClass = (declaration: ClassDeclaration, className: string): boolean =>
    declaration.heritageClauses?.nodes.some(
        (clause) =>
            clause.types.nodes.some((type) => {
                const expression = type.expression;
                return 'text' in expression && typeof expression.text === 'string' && expression.text === className;
            }) ?? false
    ) ?? false;

const classDeclarationsIn = (source: SourceFile): ClassDeclaration[] =>
    source.statements.nodes.filter(isClassDeclaration);

const methodNamesOf = (declaration: ClassDeclaration): Set<string> =>
    new Set(declaration.members.nodes.filter((member) => member.kind === SyntaxKind.MethodDeclaration).map(nameOf));

const hasInstanceProperties = (declaration: ClassDeclaration): boolean =>
    declaration.members.nodes.some(
        (member) =>
            (member.kind === SyntaxKind.PropertyDeclaration &&
                !(getCombinedModifierFlags(member) & ModifierFlags.Static)) ||
            (isConstructorDeclaration(member) &&
                member.parameters.nodes.some(
                    (parameter) =>
                        getCombinedModifierFlags(parameter) &
                        (ModifierFlags.Public |
                            ModifierFlags.Private |
                            ModifierFlags.Protected |
                            ModifierFlags.Readonly)
                ))
    );

const methodsFor = (file: string, methods: Set<string>) => {
    if (file.startsWith('packages/prismarine/')) {
        return {
            encode: methods.has('encodePayload'),
            decode: methods.has('decodePayload')
        };
    }

    return {
        encode: methods.has('encode') || methods.has('encodePayload') || methods.has('toBinary'),
        decode: methods.has('decode') || methods.has('decodePayload') || methods.has('fromBinary')
    };
};

const fingerprintOf = (file: string): string =>
    createHash('sha256')
        .update(readFileSync(path.join(repoRoot, file)))
        .digest('hex');

const isBaseline = (value: unknown): value is Record<string, string> =>
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.entries(value).every(
        ([file, hash]) => file.endsWith('.ts') && typeof hash === 'string' && /^[a-f0-9]{64}$/.test(hash)
    );

const findingsIn = (file: string, source: SourceFile): Finding[] => {
    const findings: Finding[] = [];
    const isPrismarine = file.startsWith('packages/prismarine/');

    for (const declaration of classDeclarationsIn(source)) {
        if (getCombinedModifierFlags(declaration) & ModifierFlags.Abstract) continue;
        const className = nameOf(declaration);
        const methods = methodNamesOf(declaration);
        const packetBase = isPrismarine
            ? extendsClass(declaration, 'DataPacket') || (className !== 'DataPacket' && className.endsWith('Packet'))
            : Array.from(BASE_CLASSES).some((base) => extendsClass(declaration, base)) ||
              methods.has('toBinary') ||
              methods.has('fromBinary');
        if (!packetBase) continue;
        if (!isPrismarine && RAKNET_INTERMEDIATES.has(className)) continue;

        const codec = methodsFor(file, methods);
        const declaresPayload = hasInstanceProperties(declaration) || codec.encode || codec.decode;
        if (!declaresPayload || (codec.encode && codec.decode)) continue;

        const { line } = getLineAndCharacterOfPosition(source, tokenStartOfNode(declaration));
        findings.push({
            file,
            line: line + 1,
            className,
            missing: [!codec.encode ? 'serialization' : null, !codec.decode ? 'deserialization' : null].filter(
                (direction): direction is string => direction !== null
            )
        });
    }

    return findings;
};

const files = (await Promise.all(SOURCES.map((pattern) => glob(pattern, { cwd: repoRoot, ignore: EXCLUDED }))))
    .flat()
    .sort();
const findings: Finding[] = [];
for (const file of files) {
    const source = parseSourceFile(file, readFileSync(path.join(repoRoot, file), 'utf8'), {});
    findings.push(...findingsIn(file, source));
}

const parsedBaseline: unknown = JSON.parse(readFileSync(baselinePath, 'utf8'));
if (!isBaseline(parsedBaseline)) {
    throw new Error(`${baselinePath} must map TypeScript source paths to SHA-256 fingerprints.`);
}
const baseline = parsedBaseline;
const allowed = new Set<string>();
const fresh: Finding[] = [];

for (const finding of findings) {
    if (baseline[finding.file] === fingerprintOf(finding.file)) {
        allowed.add(finding.file);
    } else {
        fresh.push(finding);
    }
}

const stale = Object.keys(baseline).filter((file) => !allowed.has(file));
if (process.argv.includes('--update')) {
    if (fresh.length > 0) {
        for (const finding of fresh) {
            console.error(
                `${finding.file}:${finding.line} ${finding.className} is missing ${finding.missing.join(' and ')}; implement both directions before updating the baseline`
            );
        }
        process.exit(1);
    }

    const nextBaseline = Object.fromEntries([...allowed].sort().map((file) => [file, baseline[file]]));
    writeFileSync(baselinePath, `${JSON.stringify(nextBaseline, null, 4)}\n`);
    console.log(`Packet codec baseline updated; removed ${stale.length} completed or removed entries.`);
    process.exit(0);
}

if (fresh.length > 0) {
    for (const finding of fresh) {
        console.error(
            `${finding.file}:${finding.line} ${finding.className} is missing ${finding.missing.join(' and ')}; packet payloads need both directions`
        );
    }
    console.error(`\n${fresh.length} packet codec gaps are new or changed (${files.length} files checked).`);
    process.exit(1);
}

if (stale.length > 0) {
    console.log(
        `Completed or removed packet entries can leave the baseline; run \`node scripts/check-packet-codecs.mts --update\`.`
    );
}
console.log(`No new or changed one-way packet payloads (${files.length} files checked).`);
