import { expect, it } from 'vitest';

import { checkAllowList } from './allowlist.ts';
import { FAMILIES } from './families.ts';
import { loadActorIdentifiers } from './goldens.ts';
import { describeFamily } from './measure.ts';
import { REFERENCES } from './references.ts';
import { loadVanillaEntityTypes } from './vanillaEntities.ts';

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
const compareAddActor = (): { gaps: string[]; advertised: number; detail: string[] } => {
    const types = loadVanillaEntityTypes();
    const identifiers = loadActorIdentifiers();
    const gaps: string[] = [];
    const detail: string[] = [];

    for (const identifier of identifiers) {
        const type = types.registry.get(identifier.id);
        if (type === undefined) {
            gaps.push(`no-definition:${identifier.id}`);
            continue;
        }
        if (type.flags.summonable !== identifier.summonable) {
            gaps.push(`summonable:${identifier.id}`);
            detail.push(
                `${identifier.id}: advertised summonable ${identifier.summonable}, definition ${type.flags.summonable}`
            );
        }
        if (!type.declaredComponents.includes('minecraft:collision_box')) {
            gaps.push(`no-collision-box:${identifier.id}`);
        }
    }

    return { gaps, advertised: identifiers.length, detail };
};

describeFamily(FAMILIES.entitiesAddActor, [REFERENCES.bedrockActorIdentifiers, REFERENCES.bedrockBehaviorPack], () => {
    const { gaps, advertised, detail } = compareAddActor();
    const verdict = checkAllowList(FAMILIES.entitiesAddActor, gaps);

    it('can build the packet for every actor type the server advertises', () => {
        expect(verdict.unexpected, detail.join('\n')).toEqual([]);
    });

    it('carries no stale allow-list entry', () => {
        expect(verdict.stale).toEqual([]);
    });

    it('walks the whole advertised actor list', () => {
        // The identifier list is the set of types a client can be sent, so every row has to
        // come from it rather than from the pack, which is the smaller of the two.
        expect(advertised).toBeGreaterThanOrEqual(136);
    });
});
