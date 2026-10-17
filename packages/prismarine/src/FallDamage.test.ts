import { describe, expect, it } from 'vitest';

import { Gametype } from '@jsprismarine/minecraft';
import { Vector3 } from '@jsprismarine/math';
import Player from './Player';
import { DamageCause } from './entity/Entity';
import MovementType from './network/type/MovementType';
import { Position } from './world/Position';

/**
 * Fall damage.
 *
 * Movement here is client authoritative - `StartGamePacket` announces server authoritative movement
 * as off - so the server never simulates the fall and can only add up the positions it is told
 * about. These drive a player through the same calls the movement handler makes, and check what
 * comes out the other end.
 */

/** A player with everything but the fall bookkeeping replaced. */
const fallingPlayer = ({ gamemode = Gametype.SURVIVAL, landingOn = 'minecraft:stone', flying = false } = {}) => {
    const hits: Array<{ amount: number; cause: DamageCause }> = [];

    const world: any = {
        getName: () => 'test',
        getServer: () => ({}),
        getGameRuleManager: () => ({ getGameRule: () => [true, true] }),
        getBlockState: async () => ({ name: landingOn }),
        broadcastMove: async () => {}
    };

    const player: Player = Object.assign(Object.create(Player.prototype), {
        gamemode,
        flying,
        onGround: false,
        fallDistance: 0,
        // A real `Position`, because `Entity.setPosition` reads the world off the one it replaces.
        position: new Position(0, 100, 0, world),
        pitch: 0,
        yaw: 0,
        headYaw: 0,
        networkSession: { sendMove: async () => {} },
        metadata: { sprinting: false },
        // Records the hit instead of taking it, so the amount can be asserted rather than
        // reverse-engineered from a health bar.
        damage: async (amount: number, cause: DamageCause) => {
            hits.push({ amount, cause });
            return true;
        },
        getWorld: () => world,
        addMovementExhaustion: () => {},
        consumesFood: () => false
    });

    /** Walks the player down from one height to another, a block at a time, then lands. */
    const fall = async (from: number, to: number) => {
        (player as any).position = new Position(0, from, 0, world);

        for (let y = from - 1; y >= to; y--) {
            await player.setPosition({ position: new Vector3(0, y, 0), type: MovementType.Normal }, false);
        }

        await player.setOnGround(true);
    };

    return { player, hits, fall };
};

describe('fall damage', () => {
    it('costs nothing for a drop the player can walk off', async () => {
        // Vanilla's three blocks of grace: stepping off a two block ledge is free.
        const { hits, fall } = fallingPlayer();
        await fall(100, 97);

        expect(hits).toEqual([]);
    });

    it('takes a half-heart for every block past the third', async () => {
        // Ten blocks fallen, three forgiven, seven half-hearts.
        const { hits, fall } = fallingPlayer();
        await fall(100, 90);

        expect(hits).toEqual([{ amount: 7, cause: DamageCause.Fall }]);
    });

    it('hurts more the further it is', async () => {
        const short = fallingPlayer();
        await short.fall(100, 94);

        const long = fallingPlayer();
        await long.fall(100, 80);

        expect(long.hits[0]!.amount).toBeGreaterThan(short.hits[0]!.amount);
    });

    it('starts the fall at the top of a jump, not at the ground', async () => {
        // Rising resets the distance. Without that, a jump would be measured from the floor the
        // player jumped off and every hop would eventually land for its own height.
        const { player, hits } = fallingPlayer();

        for (const y of [100, 101, 102, 101, 100, 99]) {
            await player.setPosition({ position: new Vector3(0, y, 0), type: MovementType.Normal }, false);
        }
        await player.setOnGround(true);

        expect(hits).toEqual([]);
    });

    it('is broken by landing in water', async () => {
        const { hits, fall } = fallingPlayer({ landingOn: 'minecraft:water' });
        await fall(100, 60);

        expect(hits).toEqual([]);
    });

    it('leaves a creative player alone', async () => {
        const { hits, fall } = fallingPlayer({ gamemode: Gametype.CREATIVE });
        await fall(100, 40);

        expect(hits).toEqual([]);
    });

    it('does not charge a flying player for descending', async () => {
        const { hits, fall } = fallingPlayer({ flying: true });
        await fall(100, 40);

        expect(hits).toEqual([]);
    });

    it('forgets the fall after landing, so the next step is free', async () => {
        const { player, hits, fall } = fallingPlayer();
        await fall(100, 90);
        expect(hits).toHaveLength(1);

        // Walk along the ground and land again.
        await player.setOnGround(false);
        await player.setPosition({ position: new Vector3(0, 90, 1), type: MovementType.Normal }, false);
        await player.setOnGround(true);

        expect(hits).toHaveLength(1);
    });

    it('does not charge for a teleport that happens to end lower down', async () => {
        // A world change or a `/tp` is not a fall, however far down it lands.
        const { player, hits } = fallingPlayer();

        await player.setPosition({ position: new Vector3(0, 20, 0), type: MovementType.Teleport }, false);
        await player.setOnGround(true);

        expect(hits).toEqual([]);
    });
});
