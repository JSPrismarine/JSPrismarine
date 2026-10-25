import { UNTRANSLATED_REGISTRIES, createPackIdentifierResolver } from '@jsprismarine/mapping';
import { javaIdentifiersTable } from '@jsprismarine/mapping/tables';
import { expect, it } from 'vitest';

import { checkAllowList } from './allowlist.ts';
import { FAMILIES } from './families.ts';
import { describeFamily } from './measure.ts';
import { REFERENCES } from './references.ts';

/**
 * The registries a datapack can reference whose entries reach a Bedrock client as something
 * other than an identifier, and which the mapping therefore names nothing of.
 *
 * A banner pattern travels as a two-letter code in block entity NBT, a goat horn as an item
 * data value and a painting as a resource pack texture name. Neither GeyserMC/mappings nor the
 * bedrock-samples metadata publishes the pairing, so there is no table to generate and the
 * whole registry is one accepted gap until a Phase 2 or Phase 3 capture produces the Bedrock
 * side. `UNTRANSLATED_REGISTRIES` in `@jsprismarine/mapping` declares which three they are and
 * how many entries the pinned Java 26.3 data publishes for each, and both the allow-list rows
 * and this row's expectations come from it rather than a second copy.
 *
 * Two properties keep the gap from widening on its own. Every identifier the census holds for
 * these registries resolves as a loss, so the loader accounts for it and refuses to start on
 * anything else; and the census holds exactly the pinned number of them, so a Java version
 * that adds a banner pattern fails this row rather than being absorbed.
 *
 * Gap id: `untranslated:<registry>`, one per registry.
 */

/** What one registry's census came to: the resolution of every identifier in it. */
interface MeasuredRegistry {
    readonly registry: string;
    /** How many identifiers the census publishes for the registry. */
    readonly published: number;
    /** How many of those the resolver answers for, as a loss rather than a Bedrock name. */
    readonly lost: number;
    /** How many the resolver maps onto a Bedrock name, which would make the registry translated. */
    readonly named: number;
}

const compareUntranslatedRegistries = (): { gaps: string[]; measured: MeasuredRegistry[] } => {
    const resolver = createPackIdentifierResolver();
    const measured = UNTRANSLATED_REGISTRIES.map((untranslated) => {
        const published = javaIdentifiersTable.registries[untranslated.registry] ?? [];
        const resolutions = published.map((javaId) => resolver.resolve(untranslated.registry, javaId));

        return {
            registry: untranslated.registry,
            published: published.length,
            lost: resolutions.filter((resolution) => resolution === 'loss').length,
            named: resolutions.filter((resolution) => resolution === 'known').length
        };
    });

    return { gaps: measured.filter((row) => row.lost > 0).map((row) => `untranslated:${row.registry}`), measured };
};

describeFamily(FAMILIES.mappingUntranslated, [REFERENCES.javaIdentifierCensus], () => {
    const { gaps, measured } = compareUntranslatedRegistries();
    const verdict = checkAllowList(FAMILIES.mappingUntranslated, gaps);

    it('names a Bedrock value for every registry but the ones with no published pairing', () => {
        expect(verdict.unexpected).toEqual([]);
    });

    it('carries no stale allow-list entry', () => {
        // A registry that stopped losing entries has a table behind it now, and its row has to
        // come off the allow list and go onto `mapping.registries` instead.
        expect(verdict.stale).toEqual([]);
    });

    it('accounts for every identifier of an untranslated registry, naming none of them', () => {
        // `unknown` is the resolution that refuses a server start, so a census entry that
        // resolved to neither a loss nor a Bedrock name would be an identifier the loader
        // rejects. Counting both ends against the published total catches it.
        for (const row of measured) {
            expect(row.lost, row.registry).toBe(row.published);
            expect(row.named, row.registry).toBe(0);
        }
    });

    it('holds the pinned entry count for each, so a Java version that adds one comes back for review', () => {
        const published = Object.fromEntries(measured.map((row) => [row.registry, row.published]));
        const pinned = Object.fromEntries(UNTRANSLATED_REGISTRIES.map((row) => [row.registry, row.entries.count]));

        expect(published).toEqual(pinned);
    });
});
