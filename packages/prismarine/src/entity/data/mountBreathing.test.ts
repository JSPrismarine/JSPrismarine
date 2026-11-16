import { describe, expect, it } from 'vitest';

import { SHIPPED_PLAYER } from '../../testing/storePlayer.test.helper';
import { PLAYER_IDENTIFIER } from '../playerOverlay';
import { entityFixture, FLOOR_Y, TestEntityWorld } from './testing';

const AT = { x: 0.5, y: FLOOR_Y + 1, z: 0.5 };

/** A mount that seats one player, as the pack's nautilus does. */
const NAUTILUS = {
    components: {
        'minecraft:collision_box': { width: 0.875, height: 0.95 },
        'minecraft:health': { value: 15, max: 15 },
        'minecraft:rideable': { seat_count: 1, family_types: ['player'], seats: { position: [0, 0.5, 0] } },
        'minecraft:underwater_mount_breathing': {}
    }
};

/** A nautilus with a player on it, in water or out of it. */
const ridden = (inWater: boolean) => {
    const world = new TestEntityWorld();
    if (inWater) for (let y = AT.y; y <= AT.y + 2; y += 1) world.setBlock({ x: 0, y, z: 0 }, 'minecraft:water');
    const { runtime } = entityFixture(
        world,
        {},
        {
            [PLAYER_IDENTIFIER]: SHIPPED_PLAYER,
            'minecraft:nautilus': NAUTILUS
        }
    );
    const nautilus = runtime.spawn('minecraft:nautilus', AT);
    const player = runtime.spawn(PLAYER_IDENTIFIER, AT);
    const mount = nautilus === undefined ? undefined : runtime.mobById(nautilus.id);
    if (player === undefined || mount === undefined) throw new Error('the fixture declares no nautilus or player');
    runtime.mount(player.body, mount);
    return { runtime, player, world };
};

describe('a nautilus with a rider', () => {
    it('gives its player rider Breath of the Nautilus for 60 ticks, in water or out of it', () => {
        for (const inWater of [true, false]) {
            const { runtime, player } = ridden(inWater);
            runtime.tick(1);

            const breath = player.body.statusEffects.get('minecraft:breath_of_the_nautilus');
            expect(breath?.durationTicks).toBe(60);
        }
    });

    it('renews it only every 40 game ticks while the rider still has it', () => {
        const { runtime, player, world } = ridden(true);
        const step = () => {
            world.advance();
            runtime.tick(world.world.level.gameTime());
        };
        step();
        const breath = player.body.statusEffects.get('minecraft:breath_of_the_nautilus');
        if (breath === undefined) throw new Error('the rider got no breath');
        player.body.statusEffects.set(breath.id, { ...breath, durationTicks: 30 });
        while (world.world.level.gameTime() % 40 !== 39) step();
        expect(player.body.statusEffects.get(breath.id)?.durationTicks).toBe(30);
        step();

        expect(player.body.statusEffects.get(breath.id)?.durationTicks).toBe(60);
    });
});
