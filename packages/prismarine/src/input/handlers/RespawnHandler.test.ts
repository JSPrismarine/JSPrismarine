import { Vector3 } from '@jsprismarine/math';
import { PlayerRespawnState } from '@jsprismarine/minecraft';
import { describe, expect, it } from 'vitest';

import type { Arrival } from '../../player/PlayerSession';
import type PlayerSession from '../../player/PlayerSession';
import { inputContext } from '../../testing/handlerContext.test.helper';
import { stubPlayerPort } from '../../testing/playerPort.test.helper';
import { identityNamed } from '../../testing/sessionIdentity.test.helper';
import { stub } from '../../testing/stub.test.helper';
import { Position } from '../../world/Position';
import type { World } from '../../world/World';
import RespawnHandler from './RespawnHandler';

/**
 * The respawn exchange, and the order its three states go in.
 *
 * `SearchingForSpawn` at the death, `ClientReadyToSpawn` from the client when the respawn button
 * is pressed, `SearchingForSpawn` and `ReadyToSpawn` in answer. The middle one is the intent
 * this handler owns, and the answer to it is what lets go of the client: answered wrongly, the
 * player cannot move.
 */
const fakeSession = ({ alive = true, spawnWorld }: { alive?: boolean; spawnWorld?: World } = {}) => {
    const done: Array<{ state?: PlayerRespawnState; position?: Vector3; what?: string; arrival?: Arrival }> = [];
    const world = stub<World>({});
    const standingAt = new Position(0, 64, 0, world);
    /** The respawn requests the handler filed, which {@link handle} answers as an input step would. */
    const requested: Array<() => Promise<void>> = [];

    return {
        done,
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
        })
    };
};

/** Applies the intent as the input step does: the handler, then what it sent. */
const handle = async ({
    session,
    requested
}: Pick<ReturnType<typeof fakeSession>, 'session' | 'requested'>): Promise<void> => {
    const { context, settled } = inputContext(session);
    new RespawnHandler().handle({ kind: 'respawn' }, context);
    await settled();
    for (const answer of requested.splice(0)) await answer();
};

describe('input/handlers/RespawnHandler', () => {
    it('answers the client with the state that ends the exchange', async () => {
        // Once a second, for as long as it takes. No answer is a screen that never lifts and
        // a log filling with `RespawnPacket`.
        const { done, standingAt, ...fake } = fakeSession();

        await handle(fake);

        expect(done[0]).toEqual({ state: PlayerRespawnState.READY_TO_SPAWN, position: standingAt });
    });

    it('answers a dead player as a Bedrock server does: searching at the spawn block, then ready at its eyes', async () => {
        // The client reports ready when the button is pressed, before its respawn action, so
        // the player is still dead here. A Bedrock Dedicated Server 1.26.52 sends these two
        // and nothing else; describing the dead player after them left the client frozen.
        const { done, ...fake } = fakeSession({ alive: false });

        await handle(fake);

        expect(done).toEqual([
            { state: PlayerRespawnState.SEARCHING_FOR_SPAWN, position: new Vector3(100, 70, 100) },
            { state: PlayerRespawnState.READY_TO_SPAWN, position: new Vector3(100, 71.62, 100) }
        ]);
    });

    it("files a dead player's answer as a respawn request, which an input step answers", async () => {
        // The search reads blocks that may not be loaded, so the handler sends nothing, defers
        // nothing and files one request.
        const fake = fakeSession({ alive: false });
        const { context, outputs, settled } = inputContext(fake.session);

        new RespawnHandler().handle({ kind: 'respawn' }, context);

        expect(fake.done).toEqual([]);
        expect(outputs).toHaveLength(0);
        expect(fake.requested).toHaveLength(1);
        await settled();
        expect(fake.done).toEqual([]);
        await fake.requested[0]!();
        expect(fake.done).toHaveLength(2);
    });

    it('respawns in place when the spawn is in the world the player died in', async () => {
        const { done, ...fake } = fakeSession({ alive: false });

        await handle(fake);

        expect(done.filter((step) => step.what === 'changeWorld')).toHaveLength(0);
    });

    it('changes world first, as a respawn, when the spawn is in another one', async () => {
        // A Nether death with an Overworld bed. The client asked for a `ChangeDimension` with
        // `Respawn` set, as gophertunnel documents, and gets exactly one, at the spawn block,
        // before the two `Respawn` answers that end the exchange.
        const overworld = stub<World>({});
        const { done, ...fake } = fakeSession({ alive: false, spawnWorld: overworld });

        await handle(fake);

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

        await handle(fake);

        expect(done.map((step) => step.what).filter(Boolean)).toEqual([
            'attributes',
            'metadata',
            'abilities',
            'inventory'
        ]);
        // After the answer, never before it.
        expect(done[0]!.state).toBe(PlayerRespawnState.READY_TO_SPAWN);
    });
});
