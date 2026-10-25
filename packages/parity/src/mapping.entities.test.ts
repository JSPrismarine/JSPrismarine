import { ENTITY_LOSSES, javaEntityTypeToBedrock } from '@jsprismarine/mapping';
import { entitiesTable } from '@jsprismarine/mapping/tables';
import { expect, it } from 'vitest';

import { checkAllowList } from './allowlist.ts';
import { FAMILIES } from './families.ts';
import { loadActorIdentifiers } from './goldens.ts';
import { describeFamily } from './measure.ts';
import { REFERENCES } from './references.ts';

/**
 * The Java types the table has no row for, because the loss list answers for them before the
 * table is consulted. Walking them too is what proves the mapping is total over all 161 Java
 * types rather than over the 148 that map cleanly.
 */
const LOSS_JAVA_IDS: readonly string[] = ENTITY_LOSSES.map((loss) => loss.javaId);

/**
 * Chunker's totality property for the entity domain, which plan section 13 names as the seam
 * most likely to leak. Every Java entity type resolves, every output is an actor type the
 * server actually advertises, and the only types without one are the reviewed losses.
 *
 * Gap ids: `unknown:<java id>` for a type that does not map, `loss:<java id>` for a reviewed
 * loss, `merge:<bedrock id>` for an actor type more than one Java type reaches, and
 * `unadvertised:<bedrock id>` for an output the actor identifier golden does not carry.
 */
const compareEntityMapping = (): { gaps: string[]; types: number } => {
    const advertised = new Set(loadActorIdentifiers().map((identifier) => identifier.id));
    const gaps = new Set<string>();
    const javaByBedrock = new Map<string, Set<string>>();

    const javaIds = [...Object.keys(entitiesTable.entities), ...LOSS_JAVA_IDS];
    for (const javaId of javaIds) {
        const result = javaEntityTypeToBedrock(javaId);
        if (result.kind === 'unknown') {
            gaps.add(`unknown:${javaId}`);
            continue;
        }
        if (result.kind === 'loss') {
            gaps.add(`loss:${javaId}`);
            continue;
        }

        const bedrockId = result.bedrock;
        if (!advertised.has(bedrockId)) gaps.add(`unadvertised:${bedrockId}`);

        const sources = javaByBedrock.get(bedrockId);
        if (sources) sources.add(javaId);
        else javaByBedrock.set(bedrockId, new Set([javaId]));
    }

    for (const [bedrockId, sources] of javaByBedrock) {
        if (sources.size > 1) gaps.add(`merge:${bedrockId}`);
    }

    return { gaps: [...gaps], types: javaIds.length };
};

describeFamily(FAMILIES.mappingEntities, [REFERENCES.bedrockActorIdentifiers], () => {
    const { gaps, types } = compareEntityMapping();
    const verdict = checkAllowList(FAMILIES.mappingEntities, gaps);

    it('maps every Java entity type onto an actor type the server advertises', () => {
        expect(verdict.unexpected).toEqual([]);
    });

    it('carries no stale allow-list entry', () => {
        expect(verdict.stale).toEqual([]);
    });

    it("covers all 161 of Java 26.3's entity types", () => {
        // docs/research/java-to-bedrock-translation.md section 6 counted 161 Java entity types
        // against Bedrock's 136. A smaller walk here means the table lost types.
        expect(types).toBe(161);
    });
});
