import { describe, expect, it } from 'vitest';

import { blocksTable } from './tables';
import { BLOCK_SUPPORT_JAVA_VERSION, bedrockBlockSupportOf } from './blockSupport';
import { javaBlockStateToBedrock } from './blockMapping';

/** A Java state's Bedrock block and states, through the block mapping. */
const bedrock = (javaId: string, properties: Record<string, string> = {}) => {
    const mapped = javaBlockStateToBedrock(javaId, properties);
    if (mapped.kind !== 'mapped' && mapped.kind !== 'loss') throw new RangeError(`${javaId} maps to nothing`);
    return mapped.bedrock;
};

/** Java's support facts for a Java state, read back through the Bedrock state it maps to. */
const supportOf = (javaId: string, properties: Record<string, string> = {}) => {
    const { name, states } = bedrock(javaId, properties);
    const support = bedrockBlockSupportOf(name, states);
    if (support === undefined) throw new RangeError(`${name} has no support facts`);
    return support;
};

describe('bedrockBlockSupportOf', () => {
    it('follows the release the block table pins', () => {
        expect(BLOCK_SUPPORT_JAVA_VERSION).toBe(blocksTable.javaVersion);
    });

    it("answers Java's legacy solid flag, which is wider than a full cube", () => {
        for (const solid of ['minecraft:stone', 'minecraft:soul_sand', 'minecraft:cactus', 'minecraft:cobweb']) {
            expect(supportOf(solid).solid, solid).toBe(true);
        }
        expect(supportOf('minecraft:stone_slab', { type: 'bottom' }).solid).toBe(true);
        expect(supportOf('minecraft:oak_sign').solid).toBe(true);
        expect(supportOf('minecraft:nether_portal', { axis: 'x' }).solid).toBe(false);
        expect(supportOf('minecraft:air').solid).toBe(false);
        expect(supportOf('minecraft:short_grass').solid).toBe(false);
    });

    it('tells a slab half by the face it fills', () => {
        const bottom = supportOf('minecraft:stone_slab', { type: 'bottom' });
        const top = supportOf('minecraft:stone_slab', { type: 'top' });
        expect([bottom.isFaceSturdy('down'), bottom.isFaceSturdy('up')]).toEqual([true, false]);
        expect([top.isFaceSturdy('down'), top.isFaceSturdy('up')]).toEqual([false, true]);
    });

    it('separates the full, center and rigid support types', () => {
        const stone = supportOf('minecraft:stone');
        for (const type of ['full', 'center', 'rigid'] as const) expect(stone.isFaceSturdy('up', type)).toBe(true);
        // A fence post holds a lantern on its center, and nothing that needs a whole face.
        const fence = supportOf('minecraft:oak_fence');
        expect(fence.isFaceSturdy('up', 'center')).toBe(true);
        expect(fence.isFaceSturdy('up')).toBe(false);
        expect(fence.isFaceSturdy('up', 'rigid')).toBe(false);
        // A standing lantern's base holds a lantern hung under it.
        const lantern = supportOf('minecraft:lantern', { hanging: 'false' });
        expect(lantern.isFaceSturdy('down', 'center')).toBe(true);
        expect(lantern.isFaceSturdy('down')).toBe(false);
    });

    it('turns with a facing block, such as the back of a ladder', () => {
        const ladder = supportOf('minecraft:ladder', { facing: 'north' });
        expect(ladder.isFaceSturdy('north')).toBe(false);
        expect(ladder.isFaceSturdy('south')).toBe(true);
        expect(ladder.solid).toBe(false);
    });

    it('leaves a Bedrock-only block to the caller', () => {
        expect(bedrockBlockSupportOf('minecraft:element_1')).toBeUndefined();
        expect(bedrockBlockSupportOf('minecraft:not_a_block')).toBeUndefined();
    });
});
