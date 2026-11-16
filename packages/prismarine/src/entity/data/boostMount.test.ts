import { describe, expect, it } from 'vitest';

import { SHIPPED_PLAYER } from '../../testing/storePlayer.test.helper';
import { PLAYER_IDENTIFIER } from '../playerOverlay';
import { MIN_BOOST_TICKS } from './itemSteering';
import { entityFixture, FLOOR_Y, TestEntityWorld } from './testing';

const AT = { x: 0.5, y: FLOOR_Y + 1, z: 0.5 };

/** A saddled pig as the pack writes one: steered with a carrot on a stick, which boosts it. */
const PIG = {
    components: {
        'minecraft:collision_box': { width: 0.9, height: 0.9 },
        'minecraft:health': { value: 10, max: 10 },
        'minecraft:rideable': { seat_count: 1, family_types: ['player'], seats: { position: [0, 0.6, 0] } },
        'minecraft:item_controllable': { control_items: 'carrotOnAStick' },
        'minecraft:boostable': {
            speed_multiplier: 1.35,
            duration: 3,
            boost_items: [{ item: 'carrotOnAStick', damage: 2, replace_item: 'fishing_rod' }]
        }
    }
};

/** A pig with a player on it holding `held`. */
const ridden = (held: string) => {
    const world = new TestEntityWorld({ random: [0.5] });
    const { runtime } = entityFixture(world, {}, { [PLAYER_IDENTIFIER]: SHIPPED_PLAYER, 'minecraft:pig': PIG });
    const pig = runtime.spawn('minecraft:pig', AT);
    const player = runtime.spawn(PLAYER_IDENTIFIER, AT);
    const mount = pig === undefined ? undefined : runtime.mobById(pig.id);
    if (pig === undefined || player === undefined || mount === undefined)
        throw new Error('the fixture declares no pig or player');
    runtime.mount(player.body, mount);
    world.held.set(player.id, held);
    return { runtime, pig, player };
};

describe('a mount steered with an item', () => {
    it('is steered by its rider only while the rider holds the item', () => {
        const steered = ridden('minecraft:carrot_on_a_stick');
        expect(steered.runtime.itemControllingRider(steered.pig)).toBe(steered.player.id);

        const carried = ridden('minecraft:stick');
        expect(carried.runtime.itemControllingRider(carried.pig)).toBeUndefined();
    });

    it("boosts once for Java's 140 ticks and more, and not again until the boost runs out", () => {
        const { runtime, pig, player } = ridden('minecraft:carrot_on_a_stick');

        expect(runtime.boostMount(player.id, 'minecraft:warped_fungus_on_a_stick')).toBe(false);
        expect(runtime.boostMount(player.id, 'minecraft:carrot_on_a_stick')).toBe(true);
        const ticks = runtime.steeringOf(pig).boostTicks;
        expect(ticks).toBeGreaterThanOrEqual(MIN_BOOST_TICKS);
        expect(runtime.boostMount(player.id, 'minecraft:carrot_on_a_stick')).toBe(false);

        for (let tick = 1; tick <= ticks + 1; tick += 1) runtime.tick(tick);
        expect(runtime.steeringOf(pig).boosting).toBe(false);
        expect(runtime.boostMount(player.id, 'minecraft:carrot_on_a_stick')).toBe(true);
    });

    it('is steered by a mob riding it, whatever the mob holds', () => {
        const world = new TestEntityWorld();
        const { runtime } = entityFixture(world, {}, { 'minecraft:pig': PIG });
        const pig = runtime.spawn('minecraft:pig', AT);
        const jockey = runtime.spawn('minecraft:cow', AT);
        const mount = pig === undefined ? undefined : runtime.mobById(pig.id);
        if (pig === undefined || jockey === undefined || mount === undefined)
            throw new Error('the fixture declares no pig or cow');
        runtime.mount(jockey.body, mount);

        expect(runtime.itemControllingRider(pig)).toBe(jockey.id);
    });

    it('takes no boost from a rider who does not steer it', () => {
        const { runtime, player } = ridden('minecraft:stick');
        expect(runtime.boostMount(player.id, 'minecraft:carrot_on_a_stick')).toBe(false);
    });
});
