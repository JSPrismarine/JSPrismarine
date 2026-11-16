import { describe, expect, it } from 'vitest';

import { SHIPPED_PLAYER } from '../../testing/storePlayer.test.helper';
import { PLAYER_IDENTIFIER } from '../playerOverlay';
import { entityFixture, FLOOR_Y, TestEntityWorld } from './testing';

const AT = { x: 0.5, y: FLOOR_Y + 1, z: 0.5 };

/** A mount that seats one player and gives its riders air under water, as the pack's nautilus does. */
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
    return { runtime, player };
};

describe('a nautilus with a rider', () => {
    it('keeps its player rider in Breath of the Nautilus for 60 ticks while it is in water', () => {
        const { runtime, player } = ridden(true);
        for (let tick = 1; tick <= 3; tick += 1) runtime.tick(tick);

        const breath = player.body.statusEffects.get('minecraft:breath_of_the_nautilus');
        expect(breath?.durationTicks).toBe(60);
    });

    it('gives nothing out of water', () => {
        const { runtime, player } = ridden(false);
        runtime.tick(1);

        expect(player.body.statusEffects.has('minecraft:breath_of_the_nautilus')).toBe(false);
    });
});
