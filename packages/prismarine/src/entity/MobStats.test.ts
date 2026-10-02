import { describe, expect, it } from 'vitest';

import * as Entities from './Entities';
import { DEFAULT_STATS, MOB_STATS, statsOf } from './MobStats';
import { MOB_LOOT } from './LootTables';
import { Mob } from './Mob';

describe('mob stats', () => {
    it('has figures for every mob this server gives a brain to', () => {
        // The table and the classes are written in different files and nothing but this keeps them
        // in step, exactly as with `EntitySize`. Without it, adding a mob and forgetting its
        // figures is silent: it quietly gets a player's twenty health and one point of attack,
        // which is how a chicken came to be as hard to kill as a zombie.
        const missing = Object.values(Entities)
            .filter((entity): entity is typeof Mob => typeof entity === 'function' && entity.prototype instanceof Mob)
            .map((entity) => (entity as unknown as { MOB_ID?: string }).MOB_ID)
            .filter((type): type is string => typeof type === 'string')
            .filter((type) => !(type in MOB_STATS));

        expect(missing).toStrictEqual([]);
    });

    it('names every mob the way the client does', () => {
        for (const type of Object.keys(MOB_STATS)) {
            expect(type).toMatch(/^minecraft:[a-z0-9_]+$/);
        }
    });

    it('only has loot for mobs it also has figures for', () => {
        // A loot table keyed by a name the stats table does not know is a name one of the two has
        // wrong, and a mob that drops something it should not - or nothing when it should.
        const orphans = Object.keys(MOB_LOOT).filter((type) => !(type in MOB_STATS));

        expect(orphans).toStrictEqual([]);
    });

    it('is Bedrock’s numbers, not a guess', () => {
        expect(statsOf('minecraft:zombie').health).toBe(20);
        expect(statsOf('minecraft:zombie').attackDamage).toBe(3);
        expect(statsOf('minecraft:chicken').health).toBe(4);
        expect(statsOf('minecraft:iron_golem').health).toBe(100);
        expect(statsOf('minecraft:enderman').health).toBe(40);
        expect(statsOf('minecraft:spider').health).toBe(16);
    });

    it('burns the undead the sun kills, and spares the ones it does not', () => {
        // A husk is the zombie that survives the desert, and a wither skeleton comes from a
        // dimension with no sky. "Is it undead" and "does it burn" are different questions.
        for (const species of ['minecraft:zombie', 'minecraft:skeleton', 'minecraft:drowned']) {
            expect(statsOf(species).burnsInDaylight).toBe(true);
        }

        for (const species of ['minecraft:husk', 'minecraft:wither_skeleton', 'minecraft:zombie_pigman']) {
            expect(statsOf(species).burnsInDaylight).toBe(false);
        }
    });

    it('gives nothing that does not fight a reason to hit anybody', () => {
        for (const species of ['minecraft:cow', 'minecraft:sheep', 'minecraft:chicken', 'minecraft:villager']) {
            expect(statsOf(species).attackDamage).toBe(0);
        }
    });

    it('falls back to what an entity had before this table existed', () => {
        // Deliberately the base attribute defaults, so an unmodelled entity behaves as it did
        // rather than becoming accidentally weak or immortal.
        expect(statsOf('minecraft:allay_from_some_future_version')).toStrictEqual(DEFAULT_STATS);
        expect(DEFAULT_STATS).toStrictEqual({
            health: 20,
            attackDamage: 1,
            knockbackResistance: 0,
            followRange: 16,
            aquatic: false,
            burnsInDaylight: false
        });
    });
});
