import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { registeredCodecs } from './CodecRegistry';

/** The BDS pins in `sources.json`, the file client-e2e reads to decide which protocols cinnabar tests. */
const bdsPins = (): Record<string, { preview?: boolean }> =>
    // Parsed JSON is an untyped boundary; only `bds.versions[*].preview` is read.
    JSON.parse(readFileSync(new URL('../../../../bedrock-data/sources.json', import.meta.url), 'utf8')).bds.versions;

describe('network/codec/CodecRegistry', () => {
    it('marks the same protocols as previews as the BDS pins client-e2e reads', () => {
        const pins = bdsPins();

        for (const codec of registeredCodecs) {
            const pin = pins[String(codec.protocolVersion)];
            expect(pin, `protocol ${codec.protocolVersion} has a BDS pin`).toBeDefined();
            expect(pin?.preview === true, `protocol ${codec.protocolVersion} preview flag`).toBe(
                codec.preview === true
            );
        }
    });
});
