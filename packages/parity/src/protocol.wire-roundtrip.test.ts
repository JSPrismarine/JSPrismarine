import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import BinaryStream from '@jsprismarine/binaryutils';
import { codecForProtocol } from '@jsprismarine/prismarine/network/codec/CodecRegistry';
import { layoutAt, wireDefinitions } from '@jsprismarine/protocol';
import { describe, expect, it } from 'vitest';

import { reportProgress } from '../../../.test/reportProgress.ts';
import { FAMILIES } from './families.ts';

/**
 * Holds every declarative wire layout to `encode(decode(bytes)) === bytes` over raw payloads a
 * real Bedrock Dedicated Server sent during a login, captured per protocol version by the
 * `packets` pass (`dump:bedrock`) into `src/jsp/v<protocol>/wire/`, one file per packet id.
 *
 * This is the proof that transfers between roles: the layout our client decoded a real server's
 * bytes through is the same frozen record our server encodes with, so one byte-exact round trip
 * covers both directions and both sides. A packet joins this suite by gaining a definition in
 * `@jsprismarine/protocol`'s registry, which is the one place a wire layout is written;
 * coverage is reported, not gated, until every captured packet is defined.
 */
const jspRoot = fileURLToPath(new URL('../../bedrock-data/src/jsp', import.meta.url));

/** The captured wire fixtures of one protocol version: packet id to raw payload. */
const fixturesOf = (protocolVersion: number): Map<number, Buffer> => {
    const directory = path.join(jspRoot, `v${protocolVersion}`, 'wire');
    const fixtures = new Map<number, Buffer>();
    for (const file of readdirSync(directory).sort()) {
        const id = Number.parseInt(file.replace('.bin', ''), 16);
        fixtures.set(id, readFileSync(path.join(directory, file)));
    }

    return fixtures;
};

describe(FAMILIES.protocolWireRoundtrip, () => {
    for (const protocolVersion of [2193, 2225]) {
        describe(`protocol ${protocolVersion}`, () => {
            const codec = codecForProtocol(protocolVersion)!;
            const fixtures = fixturesOf(protocolVersion);
            const nameOf = (id: number): string | undefined =>
                Object.entries(codec.ids).find(([, wireId]) => wireId === id)?.[0];

            const defined = [...fixtures.keys()].filter((id) => {
                const name = nameOf(id);
                return name !== undefined && wireDefinitions.has(name);
            });

            it('knows a packet name for every captured fixture', () => {
                const unknown = [...fixtures.keys()].filter((id) => nameOf(id) === undefined);
                expect(unknown.map((id) => `0x${id.toString(16)}`)).toEqual([]);
            });

            it('re-encodes every defined packet to the bytes the real server sent', () => {
                expect(defined.length).toBeGreaterThan(0);
                for (const id of defined) {
                    const bytes = fixtures.get(id)!;
                    const layout = layoutAt(wireDefinitions.get(nameOf(id)!)!, protocolVersion);

                    const stream = new BinaryStream(bytes);
                    const payload = layout.decode(stream);
                    // The layout must consume the whole payload: trailing bytes mean missing fields.
                    expect(stream.feof(), `${layout.name} left bytes unread`).toBe(true);

                    const encoded = new BinaryStream();
                    layout.encode(encoded, payload);
                    expect(encoded.getBuffer(), layout.name).toStrictEqual(bytes);
                }
            });

            it('reports how much of the captured login a definition covers', () => {
                reportProgress(
                    `protocol ${protocolVersion}: ${defined.length} of ${fixtures.size} captured wire fixtures have declarative layouts`
                );
                expect(defined.length).toBeLessThanOrEqual(fixtures.size);
            });
        });
    }
});
