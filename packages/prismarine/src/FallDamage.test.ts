import { describe, expect, it } from 'vitest';

import { Gametype } from '@jsprismarine/minecraft';

import type { DataEntity } from './entity/data/DataEntity';
import { FLOOR_Y } from './entity/data/testing';
import type { EntityFixture } from './entity/data/testing';
import { PLAYER_IDENTIFIER } from './entity/playerOverlay';
import { storePlayerFixture } from './testing/storePlayer.test.helper';

/**
 * Fall damage, on a store player.
 *
 * Movement here is client authoritative - `StartGamePacket` announces server authoritative movement
 * as off - so the server never simulates the fall and can only add up the positions it is told
 * about. These report moves the way the input step does, through
 * `EntityRuntime.applyClientMovement`, and read what the store's player systems took off the
 * player's health. `entity/data/playerSystems.test.ts` covers the log and the game rule.
 */

/** A store player standing on the fixture's floor, whose fall a test drives. */
const fallingPlayer = ({
    gamemode = Gametype.SURVIVAL,
    landingOn,
    flying = false
}: { gamemode?: Gametype; landingOn?: string; flying?: boolean } = {}) => {
    const fixture: EntityFixture = storePlayerFixture();
    if (landingOn !== undefined) fixture.world.setBlock({ x: 0, y: FLOOR_Y + 1, z: 0 }, landingOn);
    const player: DataEntity = fixture.runtime.spawn(PLAYER_IDENTIFIER, { x: 0.5, y: FLOOR_Y + 1, z: 0.5 })!;
    const components = fixture.runtime.playerSystems.componentsOf(player);
    components.set('abilities.gamemode', gamemode);
    components.set('abilities.flying', flying);

    /** Reports the feet at `y` blocks above the floor's top. */
    const report = (y: number, onGround: boolean) =>
        fixture.runtime.applyClientMovement(player.id, {
            position: { x: 0.5, y: FLOOR_Y + 1 + y, z: 0.5 },
            yaw: 0,
            pitch: 0,
            onGround
        });

    /** Walks the player down from one height to another, a block at a time, then lands. */
    const fall = (from: number, to = 0) => {
        report(from, false);
        for (let y = from - 1; y >= to; y--) report(y, y === to);
    };

    const taken = () => 20 - (player.instance.attributes.get('health')?.current ?? 0);
    return { fixture, player, components, report, fall, taken };
};

describe('fall damage', () => {
    it('costs nothing for a drop the player can walk off', () => {
        const { fall, taken } = fallingPlayer();

        fall(3);

        expect(taken()).toBe(0);
    });

    it('takes a half-heart for every block past the third', () => {
        const { fall, taken } = fallingPlayer();

        fall(10);

        expect(taken()).toBe(7);
    });

    it('hurts more the further it is', () => {
        const short = fallingPlayer();
        const long = fallingPlayer();

        short.fall(6);
        long.fall(12);

        expect(long.taken()).toBeGreaterThan(short.taken());
    });

    it('is broken by landing in water', () => {
        const { fall, taken } = fallingPlayer({ landingOn: 'minecraft:water' });

        fall(10);

        expect(taken()).toBe(0);
    });

    it('leaves a creative player alone', () => {
        const { fall, taken } = fallingPlayer({ gamemode: Gametype.CREATIVE });

        fall(10);

        expect(taken()).toBe(0);
    });

    it('does not charge a flying player for descending', () => {
        const { fall, taken } = fallingPlayer({ flying: true });

        fall(10);

        expect(taken()).toBe(0);
    });

    it('forgets the fall after landing, so the next step is free', () => {
        const { fall, report, taken } = fallingPlayer();

        fall(10);
        expect(taken()).toBe(7);

        report(0, false);
        report(0, true);
        expect(taken()).toBe(7);
    });

    it('does not charge for a teleport that happens to end lower down', () => {
        const { fixture, player, report, taken } = fallingPlayer();

        report(20, false);
        fixture.runtime.teleportPlayer(player.id, { x: 0.5, y: FLOOR_Y + 1, z: 0.5 });
        report(0, true);

        expect(taken()).toBe(0);
    });
});
