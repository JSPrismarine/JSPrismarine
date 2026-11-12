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

import { NetworkWorldReplicator } from './network/NetworkWorldReplicator';
import { fakePlayer } from './testing/fakePlayer.test.helper';
import type { ChangeEntry } from './world/changelog/ChangeEntry';

/** A fake player in a real store, whose log is the one its writes reach. */
const loggedPlayer = async () => {
    const fixture = fakePlayer();
    const { session, player, live } = fixture;
    player.gamemode = Gametype.SURVIVAL;
    const { store } = live.runtime;

    /**
     * Runs one tick of the player, its own part and then the store's entity pass, inside one tick
     * of the log, and returns what it appended.
     */
    const tick = async (tick: number, between?: () => Promise<void>): Promise<readonly ChangeEntry[]> => {
        store.beginTick();
        await between?.();
        await session.getActor()?.update(tick);
        live.runtime.tick(tick);
        return store.sealTick()?.entries ?? [];
    };

    // The store clears the breath the shipped `minecraft:breathable` keeps on a player's first
    // tick, which appends one component entry, and the player's first update starts its status
    // effect clock, which appends one more; the cases below start after them.
    store.beginTick();
    await session.getActor()?.update(0);
    live.runtime.tick(0);
    store.sealTick();

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
        const { tick } = await loggedPlayer();

        // Past the four-second hunger clock and the one-second advancement check.
        for (let at = 1; at <= 100; at++) expect(await tick(at)).toEqual([]);
    });

    it('appends at most one entry per field a walking player changes in a tick', async () => {
        const { session, player, tick } = await loggedPlayer();
        let exhausting = 0;

        for (let at = 1; at <= 40; at++) {
            const entries = await tick(at, async () => {
                const position = player.getPosition();
                await session.setPlayerPosition({ position: new Vector3(position.getX() + 0.2, 64, 0) }, false);
            });
            const fields = fieldsOf(entries);
            expect(new Set(fields).size).toBe(fields.length);
            // Walking writes where the player is and what the step cost, and nothing else.
            expect(fields.every((field) => field === 'entity:position' || field === 'entity:vitals.exhaustion')).toBe(
                true
            );
            exhausting += fields.filter((field) => field === 'entity:vitals.exhaustion').length;
        }
        expect(exhausting).toBe(40);
    });
});

describe("a player's movement belongs to its client", () => {
    it('logs a shove as one impulse occurrence, which replication asks the client to take', async () => {
        const { session, player, sent, tick, world, server } = await loggedPlayer();
        const motions = () => sent.filter((packet) => packet instanceof SetActorMotionPacket);

        const entries = await tick(1, async () => session.getActor()?.applyKnockback(1, 0, 0.4));

        expect(fieldsOf(entries)).toEqual(['occurrence']);
        expect(entries[0]).toMatchObject({
            occurrence: 'impulse',
            data: { entity: player.getRuntimeId(), x: 0.4, z: 0 }
        });
        expect(player.getPosition().getX()).toBe(0);
        // Nothing is sent while the tick runs: the impulse goes out once the tick has sealed.
        expect(motions()).toHaveLength(0);

        const replicator = new NetworkWorldReplicator(world, server);
        replicator.tickSealed({ tick: 1, entries });
        await replicator.flushOccurrences();

        expect(motions()).toHaveLength(1);
    });

    it("moves a player the server moves as a teleport, and drops the client's stale reports", async () => {
        const { session, sent } = await loggedPlayer();

        await session.setPlayerPosition({ position: new Vector3(20, 70, 0), type: PositionMode.Teleport });

        const moves = sent.filter((packet) => packet instanceof MovePlayerPacket);
        expect(moves.map((packet) => packet.getPacketData()?.mode)).toEqual([PositionMode.Teleport]);
        expect(session.holdsMovementForTeleport(new Vector3(0, 64, 0), false)).toBe(true);
        expect(session.holdsMovementForTeleport(new Vector3(20, 70.5, 0), true)).toBe(false);
    });
});

describe("a player's death keeps the entity", () => {
    it('commits a blow before the damage promise first waits', async () => {
        const { session, player, server } = await loggedPlayer();
        const posted = vi.spyOn(server, 'post');

        const landing = session.getActor()?.damage(5, DamageCause.Generic);
        expect(player.getHealth()).toBe(15);
        await landing;

        const deathly = session.getActor()?.damage(50, DamageCause.Generic);
        expect(player.getHealth() > 0).toBe(false);
        expect(posted.mock.calls.map(([[name]]) => name)).toContain('entityDeath');
        expect(server.getRespawnRequests().size).toBe(1);
        await deathly;
    });

    it('keeps its runtime id and appends no membership entry through death and respawn', async () => {
        const { session, player, roster, respawnRequests, tick } = await loggedPlayer();
        const id = player.getRuntimeId();

        const death = await tick(1, async () => void (await session.getActor()?.damage(50, DamageCause.Generic)));
        expect(fieldsOf(death)).toContain('entity:attribute:health');
        expect(fieldsOf(death)).not.toContain('membership');

        const respawn = await tick(2, async () => {
            await respawnRequests.admit();
            session.requestRespawn();
            await respawnRequests.admit();
        });
        expect(fieldsOf(respawn)).toContain('entity:attribute:health');
        expect(fieldsOf(respawn)).not.toContain('membership');

        expect(player.getHealth() > 0).toBe(true);
        expect(player.getRuntimeId()).toBe(id);
        expect(roster).toEqual([]);
    });
});
