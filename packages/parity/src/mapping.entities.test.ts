import { ENTITY_LOSSES, javaEntityTypeToBedrock } from '@jsprismarine/mapping';
import { entitiesTable } from '@jsprismarine/mapping/tables';
import { expect, it } from 'vitest';

import { checkAllowList } from './allowlist.ts';
import { FAMILIES } from './families.ts';
import { loadActorIdentifiers } from './goldens.ts';
import { describeFamily } from './measure.ts';
import { REFERENCES } from './references.ts';
import { reportParityProgress } from './progress.ts';
import { reportParityCases } from './trackerCases.ts';

/**
 * The Java types the table has no row for, because the loss list answers for them before the
 * table is consulted. Walking them too is what proves the mapping is total over the Java type
 * registry rather than only the types that map cleanly.
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
interface EntityMappingCase {
    readonly javaId: string;
    readonly result: ReturnType<typeof javaEntityTypeToBedrock>;
    readonly gaps: string[];
}

const compareEntityMapping = (): { gaps: string[]; types: number; cases: EntityMappingCase[] } => {
    const advertised = new Set(loadActorIdentifiers().map((identifier) => identifier.id));
    const gaps = new Set<string>();
    const javaByBedrock = new Map<string, Set<string>>();
    const cases: EntityMappingCase[] = [];

    const javaIds = [...new Set([...Object.keys(entitiesTable.entities), ...LOSS_JAVA_IDS])];
    for (const javaId of javaIds) {
        const result = javaEntityTypeToBedrock(javaId);
        const caseGaps: string[] = [];
        if (result.kind === 'unknown') {
            caseGaps.push(`unknown:${javaId}`);
            gaps.add(caseGaps[0]!);
            cases.push({ javaId, result, gaps: caseGaps });
            continue;
        }
        if (result.kind === 'loss') {
            caseGaps.push(`loss:${javaId}`);
            gaps.add(caseGaps[0]!);
            cases.push({ javaId, result, gaps: caseGaps });
            continue;
        }

        const bedrockId = result.bedrock;
        if (!advertised.has(bedrockId)) {
            caseGaps.push(`unadvertised:${bedrockId}`);
            gaps.add(caseGaps.at(-1)!);
        }

        const sources = javaByBedrock.get(bedrockId);
        if (sources) sources.add(javaId);
        else javaByBedrock.set(bedrockId, new Set([javaId]));
        cases.push({ javaId, result, gaps: caseGaps });
    }

    for (const [bedrockId, sources] of javaByBedrock) {
        if (sources.size <= 1) continue;
        const merge = `merge:${bedrockId}`;
        gaps.add(merge);
        for (const javaId of sources) cases.find((entry) => entry.javaId === javaId)?.gaps.push(merge);
    }

    return { gaps: [...gaps], types: javaIds.length, cases };
};

describeFamily(FAMILIES.mappingEntities, [REFERENCES.bedrockActorIdentifiers], () => {
    const { gaps, types, cases } = compareEntityMapping();
    const verdict = checkAllowList(FAMILIES.mappingEntities, gaps);
    const unexpected = new Set(verdict.unexpected);

    reportParityCases(
        FAMILIES.mappingEntities,
        import.meta.filename,
        cases.map(({ javaId, result, gaps: caseGaps }) => ({
            id: javaId,
            title: javaId,
            context:
                result.kind === 'mapped' ? `Java entity type → ${result.bedrock}` : `Java entity type · ${result.kind}`,
            status: caseGaps.some((gap) => unexpected.has(gap)) ? 'failed' : 'passed',
            ...(caseGaps.length === 0 ? {} : { details: caseGaps.join(', ') })
        }))
    );

    it('maps every Java entity type onto an actor type the server advertises', () => {
        expect(verdict.unexpected).toEqual([]);
    });

    it('carries no stale allow-list entry', () => {
        expect(verdict.stale).toEqual([]);
    });

    it('reports the current number of Java entity types in the mapping comparison', () => {
        reportParityProgress(FAMILIES.mappingEntities, { javaEntityTypes: types });
        expect(types).toBeGreaterThan(0);
    });
});
