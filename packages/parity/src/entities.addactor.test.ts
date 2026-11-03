import { expect, it } from 'vitest';

import { checkAllowList } from './allowlist.ts';
import { FAMILIES } from './families.ts';
import { loadActorIdentifiers } from './goldens.ts';
import { describeFamily } from './measure.ts';
import { REFERENCES } from './references.ts';
import { loadVanillaEntityTypes } from './vanillaEntities.ts';
import { reportParityProgress } from './progress.ts';
import { reportParityCases } from './trackerCases.ts';

/**
 * Phase 3's exit criterion: an `AddActorPacket` row per advertised actor type.
 *
 * The packet carries the actor's type string, whether a player can summon it, and the size the
 * client draws its shadow and nameplate from. All three come from the entity definition, so
 * the row is one per advertised type: the server has a definition for it, the definition's
 * summonable flag agrees with what the identifier list advertises, and the definition declares
 * the collision box the packet's size field reads.
 *
 * Gap ids: `no-definition:<id>`, `summonable:<id>` where the definition and the advertised
 * list disagree, and `no-collision-box:<id>`.
 */
interface AddActorCase {
    readonly id: string;
    readonly gaps: string[];
}

const compareAddActor = (): { gaps: string[]; advertised: number; detail: string[]; cases: AddActorCase[] } => {
    const types = loadVanillaEntityTypes();
    const identifiers = loadActorIdentifiers();
    const gaps: string[] = [];
    const detail: string[] = [];
    const cases: AddActorCase[] = [];

    for (const identifier of identifiers) {
        const caseGaps: string[] = [];
        const type = types.registry.get(identifier.id);
        if (type === undefined) {
            caseGaps.push(`no-definition:${identifier.id}`);
            gaps.push(...caseGaps);
            cases.push({ id: identifier.id, gaps: caseGaps });
            continue;
        }
        if (type.flags.summonable !== identifier.summonable) {
            caseGaps.push(`summonable:${identifier.id}`);
            detail.push(
                `${identifier.id}: advertised summonable ${identifier.summonable}, definition ${type.flags.summonable}`
            );
        }
        if (!type.declaredComponents.includes('minecraft:collision_box'))
            caseGaps.push(`no-collision-box:${identifier.id}`);
        gaps.push(...caseGaps);
        cases.push({ id: identifier.id, gaps: caseGaps });
    }

    return { gaps, advertised: identifiers.length, detail, cases };
};

describeFamily(
    FAMILIES.entitiesAddActor,
    [REFERENCES.bedrockActorIdentifiers, REFERENCES.bedrockBehaviorPack],
    () => {
        const { gaps, advertised, detail, cases } = compareAddActor();
        const verdict = checkAllowList(FAMILIES.entitiesAddActor, gaps);
        const unexpected = new Set(verdict.unexpected);

        reportParityCases(
            FAMILIES.entitiesAddActor,
            import.meta.filename,
            cases.map(({ id, gaps: caseGaps }) => ({
                id,
                title: id,
                context: 'Entity definition fields used to build the AddActorPacket',
                status: caseGaps.some((gap) => unexpected.has(gap)) ? 'failed' : 'passed',
                ...(caseGaps.length === 0 ? {} : { details: caseGaps.join(', ') })
            }))
        );

        it('can build the packet for every actor type the server advertises', () => {
            expect(verdict.unexpected, detail.join('\n')).toEqual([]);
        });

        it('carries no stale allow-list entry', () => {
            expect(verdict.stale).toEqual([]);
        });

        it('reports how many advertised actor types have a packet comparison', () => {
            reportParityProgress(FAMILIES.entitiesAddActor, { advertisedActors: advertised });
            expect(advertised).toBeGreaterThan(0);
        });
    },
    { tags: ['real-data'] }
);
