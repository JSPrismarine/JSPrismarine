import { describe, expect, it } from 'vitest';

import { load, reportIdentifiers } from '@jsprismarine/packs';
import type { ReferencedIdentifier } from '@jsprismarine/packs';
import { createPackIdentifierResolver } from './packIdentifierResolver';

/**
 * Phase 0's last exit criterion, measured: every Java identifier in the real
 * vanilla datapack maps to Bedrock or is allow-listed.
 *
 * This is the check plan section 5 describes and the one Geyser's
 * `BlockRegistryPopulator` has. It needs the extracted 26.3 datapack, which
 * `pnpm --filter @jsprismarine/bedrock-data run datagen:java` writes and
 * `scripts/real-data-env.mts` points `JSP_VANILLA_DATAPACK` at, so it runs
 * in the real-data job and skips in a clean checkout.
 */

const datapack = process.env.JSP_VANILLA_DATAPACK;

/** The whole corpus, which is 4088 distinct identifiers over 21 registries. */
const REFERENCES = 4088;

/**
 * The reviewed losses the corpus reaches, by registry. The three large rows
 * are the registries {@link import('./lossList').UNTRANSLATED_REGISTRIES}
 * allow-lists whole; the rest are the per-entry rows the earlier joins
 * recorded. Pinned so an allow list that quietly grows fails here.
 */
const LOSSES: Readonly<Record<string, number>> = {
    banner_pattern: 42,
    block: 2,
    enchantment: 1,
    entity_type: 3,
    instrument: 8,
    item: 3,
    painting_variant: 47,
    'worldgen/biome': 5
};

const countBy = (report: readonly ReferencedIdentifier[], of: (entry: ReferencedIdentifier) => string | undefined) => {
    const counts = new Map<string, number>();
    for (const entry of report) {
        const key = of(entry);
        if (key !== undefined) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return Object.fromEntries([...counts].sort());
};

describe.skipIf(!datapack)('every Java identifier in the vanilla 26.3 datapack', () => {
    it('maps to Bedrock or is allow-listed, with nothing left over', { timeout: 120_000 }, () => {
        const { definitions } = load([{ kind: 'datapack', path: datapack! }]);
        const report = reportIdentifiers(definitions, createPackIdentifierResolver());

        const unmapped = report.filter((entry) => entry.resolution === 'unknown');
        // Named rather than counted: a failure here has to say which
        // identifier the mapping tables and the allow list both missed.
        expect(unmapped.map((entry) => `${entry.registry} ${entry.id} (${entry.path})`)).toEqual([]);

        expect(report).toHaveLength(REFERENCES);
        expect(countBy(report, (entry) => (entry.resolution === 'loss' ? entry.registry : undefined))).toEqual(LOSSES);
    });

    it('closes 359 of them inside the pack stack rather than against Bedrock', { timeout: 120_000 }, () => {
        const { definitions } = load([{ kind: 'datapack', path: datapack! }]);
        const report = reportIdentifiers(definitions, createPackIdentifierResolver());

        // Tag references and the cross-registry calls one datapack file makes
        // to another. These never cross to a client, so the mapping tables
        // have nothing to say about them and the stack answers instead.
        expect(countBy(report, (entry) => entry.source)).toEqual({ pack: 359, resolver: 3729 });
        const closed = report.filter((entry) => entry.source === 'pack');
        expect(closed.every((entry) => entry.resolution === 'known')).toBe(true);
        expect(closed.filter((entry) => entry.id.startsWith('#'))).toHaveLength(298);
    });
});
