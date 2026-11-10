/**
 * Checks that every protocol packet class takes its wire body from a declarative layout, or is a
 * recorded exception.
 *
 * A packet class in `packages/protocol/src/packet` is a layout packet when it calls `layoutAt`.
 * One that writes its own body must appear in `scripts/wire-layout-exceptions.json` with the
 * reason the layout vocabulary cannot express it (`docs/adr/0003-declarative-wire-layouts.md`
 * lists the reasons). A new hand-written packet fails this check until someone adds it with
 * `--update --reason <reason>`, which makes hand-writing a body a deliberate, reviewed choice. An
 * exception that has become a layout packet, or whose file is gone, fails too, so the list only
 * shrinks by conversion.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { glob } from 'glob';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baselinePath = path.join(repoRoot, 'scripts', 'wire-layout-exceptions.json');

/** The reasons a body can stay hand-written, as the ADR describes them. */
const REASONS = ['conditional', 'structure', 'context', 'repeated-record', 'raw-stream'] as const;
type Reason = (typeof REASONS)[number];

const isReason = (value: unknown): value is Reason => REASONS.some((reason) => reason === value);

const isBaseline = (value: unknown): value is Record<string, Reason> =>
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.entries(value).every(([file, reason]) => file.endsWith('.ts') && isReason(reason));

const files = (
    await glob('packages/protocol/src/packet/*Packet.ts', {
        cwd: repoRoot,
        ignore: ['**/*.test.*', '**/*.d.ts']
    })
).sort();

/**
 * Packet classes that write their own body: they extend a packet base, never call `layoutAt` and
 * declare a payload. A packet whose `serializePayload` takes no arguments has no body to describe.
 */
const handWritten = files.filter((file) => {
    const source = readFileSync(path.join(repoRoot, file), 'utf8');
    const payloadFree = /serializePayload\(\)/.test(source);
    return /extends (Field)?NetworkPacket\b/.test(source) && !payloadFree && !/\blayoutAt\(/.test(source);
});

const parsed: unknown = JSON.parse(readFileSync(baselinePath, 'utf8'));
if (!isBaseline(parsed)) {
    throw new Error(`${baselinePath} must map packet source paths to one of: ${REASONS.join(', ')}.`);
}
const baseline = parsed;

const fresh = handWritten.filter((file) => !(file in baseline));
const stale = Object.keys(baseline).filter((file) => !handWritten.includes(file));

const reasonArgument = process.argv.indexOf('--reason');
const reason = reasonArgument === -1 ? undefined : process.argv[reasonArgument + 1];

if (process.argv.includes('--update')) {
    if (fresh.length > 0 && !isReason(reason)) {
        console.error(`${fresh.length} new hand-written packets need --reason <${REASONS.join('|')}>:`);
        for (const file of fresh) console.error(`  ${file}`);
        process.exit(1);
    }

    const next: Record<string, Reason> = {};
    for (const file of handWritten) {
        const existing = baseline[file];
        if (existing !== undefined) next[file] = existing;
        else if (isReason(reason)) next[file] = reason;
    }
    writeFileSync(baselinePath, `${JSON.stringify(next, null, 4)}\n`);
    console.log(`Wire layout exceptions updated: ${fresh.length} added, ${stale.length} removed.`);
    process.exit(0);
}

if (fresh.length > 0 || stale.length > 0) {
    for (const file of fresh) {
        console.error(`${file} writes its own body but is not a recorded exception; define a layout for it`);
        console.error(
            '  in packages/protocol/src/wire/definitions, or run `node scripts/check-wire-layouts.mts --update --reason <reason>`.'
        );
    }
    for (const file of stale) {
        console.error(
            `${file} is listed as an exception but now uses a layout or is gone; run with --update to drop it.`
        );
    }
    console.error(
        `\n${fresh.length} new and ${stale.length} stale wire layout exceptions (${files.length} packets checked).`
    );
    process.exit(1);
}

console.log(`${files.length - handWritten.length} layout packets, ${handWritten.length} recorded exceptions.`);
