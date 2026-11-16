import { EntityTypes } from '@jsprismarine/entities';
import { describe, expect, it } from 'vitest';

import { JAVA_MAX_AIR_TICKS, javaAirSupplies, withJavaAirSupply } from './javaAirSupply';

const entityFile = (identifier: string, breathable: Record<string, unknown>) => ({
    format_version: '1.21.0',
    'minecraft:entity': {
        description: { identifier, is_spawnable: true, is_summonable: true },
        components: { 'minecraft:health': { value: 10, max: 10 }, 'minecraft:breathable': breathable }
    }
});

/** The tick of the first drowning blow on an entity held underwater, or undefined within `ticks`. */
const firstBlow = (data: unknown, identifier: string, ticks: number): number | undefined => {
    const types = new EntityTypes();
    types.load([{ data, pack: 'test', path: 'entities/test.json' }]);
    const entity = types.spawn(identifier, {
        environment: { filterContext: () => ({ self: { flag: (name) => name === 'in_water' } }) }
    });
    for (let tick = 1; tick <= ticks; tick += 1) {
        entity.tick();
        if (entity.attributes.value('health') < 10) return tick;
    }
    return undefined;
};

describe('withJavaAirSupply', () => {
    it("gives a bee Java's 300 ticks of air where Bedrock's pack gives it none", () => {
        const data = withJavaAirSupply(
            entityFile('minecraft:bee', { totalSupply: 0, suffocateTime: -1 }),
            javaAirSupplies()
        );

        expect(firstBlow(data, 'minecraft:bee', JAVA_MAX_AIR_TICKS)).toBeUndefined();
        expect(firstBlow(data, 'minecraft:bee', JAVA_MAX_AIR_TICKS + 40)).toBeGreaterThan(JAVA_MAX_AIR_TICKS);
    });

    it("keeps a dolphin's long breath, which Java's class gives it too", () => {
        const data = withJavaAirSupply(entityFile('minecraft:dolphin', { total_supply: 240 }), javaAirSupplies());

        expect(firstBlow(data, 'minecraft:dolphin', 4800)).toBeUndefined();
    });

    it('leaves a file the overlay knows nothing of unchanged', () => {
        const data = entityFile('test:diver', { total_supply: 2 });
        expect(withJavaAirSupply(data, javaAirSupplies())).toBe(data);
    });
});
