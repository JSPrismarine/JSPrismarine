/**
 * The three host rules a store player follows (ADR 0008): its health comes from the overlay,
 * its client owns its movement, and its death keeps it in the store until respawn revives it.
 * Asserted as counts of change log entries, store members and removals.
 */
import { describe, expect, it } from 'vitest';

import { entityFixture, FLOOR_Y } from './data/testing';
import type { ChangeEntry } from '../world/changelog/ChangeEntry';
import { PLAYER_IDENTIFIER, withPlayerOverlay } from './playerOverlay';

/** The parts of the shipped `entities/player.json` these rules read: no `minecraft:health`. */
const SHIPPED_PLAYER = {
    components: {
        'minecraft:collision_box': { width: 0.6, height: 1.8 },
        'minecraft:type_family': { family: ['player'] },
        'minecraft:loot': { table: 'loot_tables/empty.json' },
        'minecraft:movement': { value: 0.1 },
        'minecraft:physics': { push_towards_closest_space: true }
    }
};

const fixture = () => entityFixture(undefined, {}, { [PLAYER_IDENTIFIER]: SHIPPED_PLAYER });

/** Runs `work` inside one tick of the store's log and returns what it appended. */
const logged = (runtime: ReturnType<typeof fixture>['runtime'], work: () => void): readonly ChangeEntry[] => {
    runtime.store.beginTick();
    work();
    return runtime.store.sealTick()?.entries ?? [];
};

const fieldsOf = (entries: readonly ChangeEntry[], field: string): readonly ChangeEntry[] =>
    entries.filter((entry) => entry.kind === 'field' && entry.field === 'entity' && entry.address.field === field);

const playerFile = (components: Record<string, unknown>) => ({
    format_version: '1.21.0',
    'minecraft:entity': { description: { identifier: PLAYER_IDENTIFIER }, components }
});

describe('withPlayerOverlay', () => {
    it('adds the health Bedrock keeps in code to the shipped player file', () => {
        const overlaid = withPlayerOverlay(playerFile({ 'minecraft:movement': { value: 0.1 } }));
        expect(overlaid).toEqual(
            playerFile({ 'minecraft:health': { value: 20, max: 20 }, 'minecraft:movement': { value: 0.1 } })
        );
    });

    it("keeps a pack's own player health and leaves other files as they are", () => {
        const own = playerFile({ 'minecraft:health': { value: 40, max: 40 } });
        expect(withPlayerOverlay(own)).toBe(own);

        const cow = { 'minecraft:entity': { description: { identifier: 'minecraft:cow' }, components: {} } };
        expect(withPlayerOverlay(cow)).toBe(cow);
    });
});

describe('a store player', () => {
    it('takes a blow on the health the overlay gives it', () => {
        const { runtime } = fixture();
        const player = runtime.spawn(PLAYER_IDENTIFIER, { x: 0.5, y: FLOOR_Y + 1, z: 0.5 });
        expect(player?.instance.attributes.get('health')?.current).toBe(20);

        expect(runtime.hurt(player!, undefined, 'entity_attack', 3)).toBe(true);
        expect(player?.instance.attributes.get('health')?.current).toBe(17);
    });

    it('is not moved by the tick: no gravity, no pushes, and no position entry', () => {
        const { runtime } = fixture();
        const player = runtime.spawn(PLAYER_IDENTIFIER, { x: 0.5, y: FLOOR_Y + 6, z: 0.5 })!;
        runtime.spawn('minecraft:cow', { x: 0.7, y: FLOOR_Y + 6, z: 0.5 });

        const entries: ChangeEntry[] = [];
        for (let tick = 1; tick <= 20; tick += 1) entries.push(...logged(runtime, () => runtime.tick(tick)));

        expect(player.position).toEqual({ x: 0.5, y: FLOOR_Y + 6, z: 0.5 });
        const playerPositions = fieldsOf(entries, 'position').filter(
            (entry) => entry.kind === 'field' && entry.field === 'entity' && entry.address.entity === BigInt(player.id)
        );
        expect(playerPositions).toHaveLength(0);
    });

    it('moves where its client says, with one position entry for one report', () => {
        const { runtime } = fixture();
        const player = runtime.spawn(PLAYER_IDENTIFIER, { x: 0.5, y: FLOOR_Y + 1, z: 0.5 })!;
        const entries = logged(runtime, () => {
            expect(
                runtime.applyClientMovement(player.id, {
                    position: { x: 2.5, y: FLOOR_Y + 1, z: 0.5 },
                    yaw: 90,
                    pitch: 0,
                    onGround: true
                })
            ).toBe(true);
        });

        expect(player.position).toEqual({ x: 2.5, y: FLOOR_Y + 1, z: 0.5 });
        expect(fieldsOf(entries, 'position')).toHaveLength(1);
    });

    it('refuses a client report for a body the server moves', () => {
        const { runtime } = fixture();
        const cow = runtime.spawn('minecraft:cow', { x: 0.5, y: FLOOR_Y + 1, z: 0.5 })!;
        const movement = { position: { x: 9, y: FLOOR_Y + 1, z: 9 }, yaw: 0, pitch: 0, onGround: true };
        expect(runtime.applyClientMovement(cow.id, movement)).toBe(false);
        expect(cow.position).toEqual({ x: 0.5, y: FLOOR_Y + 1, z: 0.5 });
    });

    it("sends a blow's knockback as one impulse occurrence and keeps its velocity", () => {
        const { runtime } = fixture();
        const player = runtime.spawn(PLAYER_IDENTIFIER, { x: 0.5, y: FLOOR_Y + 1, z: 0.5 })!;
        const entries = logged(runtime, () => {
            runtime.damage({
                target: player.id,
                cause: 'entity_attack',
                amount: 2,
                source: { route: 'melee', knockback: { origin: { x: -1, y: FLOOR_Y + 1, z: 0.5 }, levels: 0 } }
            });
        });

        const impulses = entries.filter((entry) => entry.kind === 'occurrence' && entry.occurrence === 'impulse');
        expect(impulses).toHaveLength(1);
        expect(player.body.velocity).toEqual({ x: 0, y: 0, z: 0 });
        expect(fieldsOf(entries, 'velocity')).toHaveLength(0);
    });

    it('stays in the store with its id through death and respawn', () => {
        const { runtime, removed } = fixture();
        const player = runtime.spawn(PLAYER_IDENTIFIER, { x: 0.5, y: FLOOR_Y + 1, z: 0.5 })!;
        const members = runtime.store.size;

        const death = logged(runtime, () => {
            runtime.hurt(player, undefined, 'entity_attack', 50);
        });
        expect(runtime.store.get(player.id)).toBe(player);
        expect(player.removed).toBeUndefined();
        expect(removed).toHaveLength(0);
        expect(runtime.store.size).toBe(members);
        expect(death.filter((entry) => entry.kind === 'membership')).toHaveLength(0);

        // A dead player takes no more blows.
        expect(runtime.hurt(player, undefined, 'entity_attack', 1)).toBe(false);

        const respawn = logged(runtime, () => {
            expect(runtime.revive(player.id)).toBe(true);
        });
        expect(runtime.store.get(player.id)).toBe(player);
        expect(player.instance.attributes.get('health')?.current).toBe(20);
        expect(respawn.filter((entry) => entry.kind === 'membership')).toHaveLength(0);
        expect(runtime.revive(player.id)).toBe(false);
    });
});
