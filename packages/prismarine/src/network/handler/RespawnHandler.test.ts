import type { Logger } from '@jsprismarine/logger';
import { Vector3 } from '@jsprismarine/math';
import { describe, expect, it } from 'vitest';

import { inputContext } from '../../testing/handlerContext.test.helper';
import { identityNamed } from '../../testing/sessionIdentity.test.helper';
import { stubPlayerPort } from '../../testing/playerPort.test.helper';
import { stub } from '../../testing/stub.test.helper';
import { Position } from '../../world/Position';
import type { World } from '../../world/World';
import type { Arrival } from '../PlayerSession';
import type PlayerSession from '../PlayerSession';
import { PlayerRespawnState } from '@jsprismarine/minecraft';
import RespawnPacket from '@jsprismarine/protocol/packet/RespawnPacket';
import RespawnHandler from './RespawnHandler';

/**
 * The respawn exchange, and the order its three states go in.
 *
 * `SearchingForSpawn` at the death, `ClientReadyToSpawn` from the client when the respawn
 * button is pressed, `SearchingForSpawn` and `ReadyToSpawn` in answer. The middle one is the
 * only one this handler owns, and the answer to it is what lets go of the client: answered
 * wrongly, the player cannot move.
 */
const fakeSession = ({ alive = true, spawnWorld }: { alive?: boolean; spawnWorld?: World } = {}) => {
    const done: Array<{ state?: PlayerRespawnState; position?: Vector3; what?: string; arrival?: Arrival }> = [];
    const dropped: string[] = [];
    const world = stub<World>({});
    const standingAt = new Position(0, 64, 0, world);
    /** The respawn requests the handler filed, which {@link handle} answers as an input step would. */
    const requested: Array<() => Promise<void>> = [];

    return {
        done,
        dropped,
        standingAt,
        requested,
        world,
        session: stub<PlayerSession>({
            runtimeId: 7n,
            identity: identityNamed('tester'),
            sendRespawn: async (position, state) => void done.push({ state, position }),
            changeWorld: async (arrival) => void done.push({ what: 'changeWorld', arrival }),
            released: () => {},
            sendAttributes: async () => void done.push({ what: 'attributes' }),
            sendMetadata: async () => void done.push({ what: 'metadata' }),
            sendAbilities: async () => void done.push({ what: 'abilities' }),
            sendInventory: async () => void done.push({ what: 'inventory' }),
            getWorld: () => world,
            getPlayer: () =>
                stubPlayerPort({
                    getHealth: () => (alive ? 20 : 0),
                    getPosition: () => standingAt,
                    yaw: 90,
                    pitch: -5
                }),
            requestRespawnPoint: (apply) =>
                void requested.push(async () =>
                    apply({
                        world: spawnWorld ?? world,
                        announced: new Vector3(100.5, 71.62, 100.5),
                        block: new Vector3(100, 70, 100),
                        eyes: new Vector3(100, 71.62, 100)
                    })
                )
        }),
        log: stub<Logger>({ debug: (...message: string[]) => void dropped.push(message.join(' ')) })
    };
};

/** Applies one packet as the input step does: the handler, then what it deferred and sent. */
const handle = async (
    { session, log, requested }: Pick<ReturnType<typeof fakeSession>, 'session' | 'log' | 'requested'>,
    packet: RespawnPacket
): Promise<void> => {
    const { context, settled } = inputContext(session, { log });
    new RespawnHandler().handle(packet, context);
    await settled();
    for (const answer of requested.splice(0)) await answer();
};

const respawn = (state: PlayerRespawnState, runtimeEntityId = 7n): RespawnPacket =>
    new RespawnPacket({ position: { x: 0, y: 0, z: 0 }, state, runtimeEntityId });

describe('RespawnHandler', () => {
    it('answers the client with the state that ends the exchange', async () => {
        // Once a second, for as long as it takes. No answer is a screen that never lifts and
        // a log filling with `RespawnPacket`.
        const { done, standingAt, ...fake } = fakeSession();

        await handle(fake, respawn(PlayerRespawnState.CLIENT_READY_TO_SPAWN));

        expect(done[0]).toEqual({ state: PlayerRespawnState.READY_TO_SPAWN, position: standingAt });
    });

    it('answers a dead player as a Bedrock server does: searching at the spawn block, then ready at its eyes', async () => {
        // The client reports ready when the button is pressed, before its respawn action, so
        // the player is still dead here. A Bedrock Dedicated Server 1.26.52 sends these two
        // and nothing else; describing the dead player after them left the client frozen.
        const { done, ...fake } = fakeSession({ alive: false });

        await handle(fake, respawn(PlayerRespawnState.CLIENT_READY_TO_SPAWN));

        expect(done).toEqual([
            { state: PlayerRespawnState.SEARCHING_FOR_SPAWN, position: new Vector3(100, 70, 100) },
            { state: PlayerRespawnState.READY_TO_SPAWN, position: new Vector3(100, 71.62, 100) }
        ]);
    });

    it("files a dead player's answer as a respawn request, which an input step answers", async () => {
        // The search reads blocks that may not be loaded, so the handler sends nothing, defers
        // nothing and files one request.
        const fake = fakeSession({ alive: false });
        const { context, outputs, deferred, settled } = inputContext(fake.session, { log: fake.log });

        new RespawnHandler().handle(respawn(PlayerRespawnState.CLIENT_READY_TO_SPAWN), context);

        expect(fake.done).toEqual([]);
        expect(deferred).toHaveLength(0);
        expect(outputs).toHaveLength(0);
        expect(fake.requested).toHaveLength(1);
        await settled();
        expect(fake.done).toEqual([]);
        await fake.requested[0]!();
        expect(fake.done).toHaveLength(2);
    });

    it('respawns in place when the spawn is in the world the player died in', async () => {
        const { done, ...fake } = fakeSession({ alive: false });

        await handle(fake, respawn(PlayerRespawnState.CLIENT_READY_TO_SPAWN));

        expect(done.filter((step) => step.what === 'changeWorld')).toHaveLength(0);
    });

    it('changes world first, as a respawn, when the spawn is in another one', async () => {
        // A Nether death with an Overworld bed. The client asked for a `ChangeDimension` with
        // `Respawn` set, as gophertunnel documents, and gets exactly one, at the spawn block,
        // before the two `Respawn` answers that end the exchange.
        const overworld = stub<World>({});
        const { done, ...fake } = fakeSession({ alive: false, spawnWorld: overworld });

        await handle(fake, respawn(PlayerRespawnState.CLIENT_READY_TO_SPAWN));

        const changes = done.filter((step) => step.what === 'changeWorld');
        expect(changes).toHaveLength(1);
        expect(changes[0]?.arrival).toEqual({
            world: overworld,
            position: new Vector3(100, 70, 100),
            yaw: 90,
            pitch: -5,
            respawn: true,
            closesLoadingScreen: false
        });
        expect(done.map((step) => step.what ?? step.state)).toEqual([
            'changeWorld',
            PlayerRespawnState.SEARCHING_FOR_SPAWN,
            PlayerRespawnState.READY_TO_SPAWN
        ]);
    });

    it('describes a player who has already respawned again once the exchange has closed', async () => {
        // The respawn action came first, which a Bedrock server was not recorded doing: the
        // player is alive, and is described again after the answer, as before.
        const { done, ...fake } = fakeSession();

        await handle(fake, respawn(PlayerRespawnState.CLIENT_READY_TO_SPAWN));

        expect(done.map((step) => step.what).filter(Boolean)).toEqual([
            'attributes',
            'metadata',
            'abilities',
            'inventory'
        ]);
        // After the answer, never before it.
        expect(done[0]!.state).toBe(PlayerRespawnState.READY_TO_SPAWN);
    });

    it("ignores the states that are the server's to send", async () => {
        const { done, ...fake } = fakeSession();

        for (const state of [PlayerRespawnState.SEARCHING_FOR_SPAWN, PlayerRespawnState.READY_TO_SPAWN]) {
            await handle(fake, respawn(state));
        }

        expect(done).toHaveLength(0);
    });

    it('drops a respawn for another runtime id', async () => {
        const { done, dropped, ...fake } = fakeSession();

        await handle(fake, respawn(PlayerRespawnState.CLIENT_READY_TO_SPAWN, 8n));

        expect(done).toHaveLength(0);
        expect(dropped).toHaveLength(1);
    });
});
