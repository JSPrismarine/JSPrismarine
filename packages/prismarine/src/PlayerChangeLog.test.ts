/**
 * What a player's own tick writes to the change log, counted (ADR 0012). A player who does
 * nothing appends nothing, and one who walks appends a bounded number of entries per tick.
 *
 * Also the rules ADR 0008 gives a player, as entries: the client owns its movement, so a shove
 * is an occurrence and a server move waits for the client's acknowledgment, and a death keeps
 * the entity, so death and respawn append no membership entry and keep the runtime id.
 */
import { Vector3 } from '@jsprismarine/math';
import { Gametype } from '@jsprismarine/minecraft';
import { PositionMode } from '@jsprismarine/protocol';
import MovePlayerPacket from '@jsprismarine/protocol/packet/MovePlayerPacket';
import SetActorMotionPacket from '@jsprismarine/protocol/packet/SetActorMotionPacket';
import { describe, expect, it, vi } from 'vitest';

import { DamageCause } from './entity/DamageCause';

import type { LiveEntityRuntime } from './entity/data/live';
import { EntityStore } from './entity/data/EntityStore';
import { legacyInverseWriter } from './entity/legacyAdapter';
import { fakePlayer } from './testing/fakePlayer.test.helper';
import { stub } from './testing/stub.test.helper';
import type { ChangeEntry } from './world/changelog/ChangeEntry';

/** A fake player whose world logs into a real store, as a world with an entity runtime does. */
const loggedPlayer = () => {
    const fixture = fakePlayer();
    const { player, world } = fixture;
    player.gamemode = Gametype.SURVIVAL;
    const store = new EntityStore();
    Object.assign(world, {
        hasEntityStore: () => true,
        getEntityStore: () => store,
        getEntity: (id: bigint) => (id === player.getRuntimeId() ? player : null),
        dataEntities: () => stub<LiveEntityRuntime>({})
    });
    store.addInverseWriter(legacyInverseWriter(world));

    /** Runs one tick of the player inside one tick of the log, and returns what it appended. */
    const tick = async (tick: number, between?: () => Promise<void>): Promise<readonly ChangeEntry[]> => {
        store.beginTick();
        await between?.();
        await player.update(tick);
        return store.sealTick()?.entries ?? [];
    };

    return { ...fixture, store, tick };
};

/** The field each entry changed, as `<kind>:<field or container>`. */
const fieldsOf = (entries: readonly ChangeEntry[]): string[] =>
    entries.map((entry) => {
        if (entry.kind !== 'field') return entry.kind;
        if (entry.field === 'entity') return `entity:${entry.address.field}`;
        if (entry.field === 'inventory-slot') return `slot:${entry.address.container}`;
        return entry.field;
    });

describe("a player's change log", () => {
    it('appends nothing while the player stands still with nothing to do', async () => {
        const { tick } = loggedPlayer();

        // Past the four-second hunger clock and the one-second advancement check.
        for (let at = 1; at <= 100; at++) expect(await tick(at)).toEqual([]);
    });

    it('appends at most one entry per field a walking player changes in a tick', async () => {
        const { player, tick } = loggedPlayer();
        let exhausting = 0;

        for (let at = 1; at <= 40; at++) {
            const entries = await tick(at, async () => {
                const position = player.getPosition();
                await player.setPlayerPosition({ position: new Vector3(position.getX() + 0.2, 64, 0) }, false);
            });
            const fields = fieldsOf(entries);
            expect(new Set(fields).size).toBe(fields.length);
            // This world double files no positions, so walking leaves only what the steps cost.
            expect(fields.every((field) => field === 'entity:vitals.exhaustion')).toBe(true);
            exhausting += fields.length;
        }
        expect(exhausting).toBe(40);
    });
});

describe("a player's movement belongs to its client", () => {
    it('logs a shove as one impulse occurrence and asks the client to take it', async () => {
        const { player, sent, tick } = loggedPlayer();

        const entries = await tick(1, async () => player.applyKnockback(1, 0, 0.4));

        expect(fieldsOf(entries)).toEqual(['occurrence']);
        expect(entries[0]).toMatchObject({
            occurrence: 'impulse',
            data: { entity: player.getRuntimeId(), x: 0.4, z: 0 }
        });
        expect(sent.filter((packet) => packet instanceof SetActorMotionPacket)).toHaveLength(1);
        expect(player.getPosition().getX()).toBe(0);
    });

    it("moves a player the server moves as a teleport, and drops the client's stale reports", async () => {
        const { player, sent } = loggedPlayer();
        const session = player.getNetworkSession();

        await player.setPosition({ position: new Vector3(20, 70, 0) });

        const moves = sent.filter((packet) => packet instanceof MovePlayerPacket);
        expect(moves.map((packet) => packet.getPacketData()?.mode)).toEqual([PositionMode.Teleport]);
        expect(session.holdsMovementForTeleport(new Vector3(0, 64, 0), false)).toBe(true);
        expect(session.holdsMovementForTeleport(new Vector3(20, 70.5, 0), true)).toBe(false);
    });
});

describe("a player's death keeps the entity", () => {
    it('commits a blow before the damage promise first waits', async () => {
        const { player, server } = loggedPlayer();
        const posted = vi.spyOn(server, 'post');

        const landing = player.damage(5, DamageCause.Generic);
        expect(player.getHealth()).toBe(15);
        await landing;

        const deathly = player.damage(50, DamageCause.Generic);
        expect(player.isAlive()).toBe(false);
        expect(posted.mock.calls.map(([[name]]) => name)).toContain('entityDeath');
        expect(server.getRespawnRequests().size).toBe(1);
        await deathly;
    });

    it('keeps its runtime id and appends no membership entry through death and respawn', async () => {
        const { player, roster, respawnRequests, tick } = loggedPlayer();
        const id = player.getRuntimeId();

        const death = await tick(1, async () => void (await player.damage(50, DamageCause.Generic)));
        expect(fieldsOf(death)).toContain('entity:health');
        expect(fieldsOf(death)).not.toContain('membership');

        const respawn = await tick(2, async () => {
            await respawnRequests.admit();
            await player.respawn();
        });
        expect(fieldsOf(respawn)).toContain('entity:health');
        expect(fieldsOf(respawn)).not.toContain('membership');

        expect(player.isAlive()).toBe(true);
        expect(player.getRuntimeId()).toBe(id);
        expect(roster).toEqual([]);
    });
});
