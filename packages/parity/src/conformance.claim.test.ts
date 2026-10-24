import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { FAMILIES } from './families.ts';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..');

// The sentence the plan adopts from docs/research/edition-behavior-differences.md section 14.
// A wording change there has to arrive here in the same review, which is the point.
const CLAIM =
    "JSPrismarine implements Java Edition's gameplay rules for every behavior a server decides, " +
    "verified against Java Edition's own implementation, and presents them through the Bedrock " +
    "client's model of the world.";

describe(FAMILIES.conformanceClaim, () => {
    // The documentation half of the conformance test in plan section 8: wherever the parity
    // claim is published, it must carry the exact adopted wording and link to the research note
    // that enumerates the exclusions. Today the plan is the only place that publishes it; when
    // a README or docs page takes the claim public, add that file here.
    const claimLocations = ['docs/plans/data-driven-vanilla.md'];

    it.each(claimLocations)('%s states the adopted parity claim verbatim', (location) => {
        const text = readFileSync(join(repoRoot, location), 'utf-8').replaceAll('\n', ' ');
        expect(text).toContain(CLAIM);
    });

    it.each(claimLocations)('%s links the claim to the edition differences note', (location) => {
        const text = readFileSync(join(repoRoot, location), 'utf-8');
        expect(text).toContain('edition-behavior-differences.md');
    });

    it('the cited research note still carries the claim it is cited for', () => {
        const note = readFileSync(join(repoRoot, 'docs/research/edition-behavior-differences.md'), 'utf-8');
        expect(note.replaceAll('\n', ' ')).toContain(CLAIM);
    });
});
