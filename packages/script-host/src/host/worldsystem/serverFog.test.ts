import { describe, expect, it } from 'vitest';

import type { ScriptCall } from '../../shape/implementations';
import { ScriptApiImplementations } from '../../shape/implementations';
import type { ScriptValue } from '../../values';
import { MemoryWorld } from '../../testing/memoryWorld.test-utils';
import { SERVER } from '../serverObjects';
import { memoryWorldSystem } from './memoryWorldSystem';
import { implementFog } from './serverFog';

/**
 * A call of a `FogSettings` member on a player's object, as `Player.fogSettings` makes it, with
 * plain arguments. The members read no engine, so reaching it fails the test.
 */
const callOn = (player: string, args: readonly ScriptValue[]): ScriptCall => ({
    get engine(): never {
        throw new TypeError('the fog members read no engine');
    },
    pack: 'fog',
    self: undefined,
    tag: 1009,
    state: JSON.stringify({ id: player, typeId: 'minecraft:player' }),
    setState: () => {},
    stateOf: () => '',
    setStateOf: () => {},
    // A list argument stands in as its JSON, which is what the members read of one.
    stringify: (value) => (typeof value === 'string' && value.startsWith('[') ? value : undefined),
    args
});

describe("a player's fogSettings", () => {
    const world = new MemoryWorld();
    const system = memoryWorldSystem('0', world);
    const implementations = new ScriptApiImplementations();
    implementFog(implementations, { world: Object.assign(world, { worldSystem: system }) });
    const run = (member: string, player: string, ...args: ScriptValue[]): ScriptValue => {
        const found = implementations.find(SERVER, 'FogSettings', member);
        if (typeof found !== 'function') throw new TypeError(`${member} is not a method`);
        return found(callOn(player, args));
    };

    it("pushes, pops and removes layers by tag, and replaces a tag's layers", () => {
        const steve = world.join('Steve');
        expect(run('push', steve, 'minecraft:fog_hell', 'jsp')).toBe(0);
        expect(run('push', steve, 'minecraft:fog_ocean', 'other')).toBe(1);
        expect(run('push', steve, 'minecraft:fog_crimson', 'jsp')).toBe(2);
        expect(run('getStack', steve)).toBe('["minecraft:fog_hell","minecraft:fog_ocean","minecraft:fog_crimson"]');
        expect(run('getTags', steve)).toBe('["jsp","other","jsp"]');
        expect(run('pop', steve, 'jsp')).toBe('minecraft:fog_crimson');
        expect(run('pop', steve, 'none')).toBeUndefined();
        expect(run('setStack', steve, '["minecraft:fog_a","minecraft:fog_b"]', 'other')).toBeUndefined();
        expect(system.fogStack(steve)).toEqual([
            { fogId: 'minecraft:fog_hell', tag: 'jsp' },
            { fogId: 'minecraft:fog_a', tag: 'other' },
            { fogId: 'minecraft:fog_b', tag: 'other' }
        ]);
        expect(run('remove', steve, 'other')).toBe(true);
        expect(run('remove', steve, 'other')).toBe(false);
        expect(run('getStack', steve)).toBe('["minecraft:fog_hell"]');
    });

    it('throws for a player who left', () => {
        const alex = world.join('Alex');
        world.leave(alex);
        expect(() => run('getStack', alex)).toThrow(
            "Failed to call function 'getStack' due to Entity being invalid (has the Entity been removed?)."
        );
    });
});
