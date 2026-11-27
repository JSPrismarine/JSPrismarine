/**
 * What a joined player sees of Java's noise generation: the client e2e scenarios
 * `worldgen-spawn`, `generated-fluid-flow` and `worldgen-dimensions`, played over a loopback
 * pipe against a server stepped by hand.
 *
 * The server starts the normal preset at seed 1234, with the preset's own Nether and End, as the
 * cinnabar harness's `worldgenSpawn` option does. A noise chunk is slow to generate, so the view
 * distance stays at two and nothing is preloaded: the client is sent the square of radius one
 * around it, where the cinnabar client waits for radius two.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startLoopbackServer } from '../testing/loopbackServer.test-utils';

import type { LoopbackPlayer, LoopbackServer } from '../testing/loopbackServer.test-utils';
import type { WorldPosition } from '../ClientWorld';

/** The square of columns around the player that a view distance of two sends whole. */
const LOADED_RADIUS = 1;
/** More ticks than generating the noise chunks around one arrival takes on a stepped server. */
const GENERATION_TICKS = 400;

let jsp: LoopbackServer;

beforeAll(async () => {
    jsp = await startLoopbackServer({
        name: 'worldgen-scenarios',
        config: { worlds: { world: { preset: 'minecraft:normal', provider: 'LevelDB', seed: '1234' } } }
    });
}, 900_000);

afterAll(async () => {
    await jsp?.close();
}, 120_000);

/** The column a position is in. */
const chunkOf = ({ x, z }: WorldPosition): [number, number] => [Math.floor(x) >> 4, Math.floor(z) >> 4];

/** Waits until the client holds the columns around the player. */
const chunksAround = (player: LoopbackPlayer): Promise<number> =>
    jsp.until(
        () => player.world.chunksLoadedAround(LOADED_RADIUS),
        `${player.name} never loaded the chunks around it`,
        GENERATION_TICKS
    );

/**
 * Asks the server whether a block stands at a position, as the cinnabar scenario does.
 * @returns The console's reply.
 */
const testForBlock = async ({ x, y, z }: WorldPosition, block: string): Promise<string> =>
    (await jsp.command(`testforblock ${x} ${y} ${z} ${block}`)).messages.join('\n');

describe('worldgen-spawn', { tags: ['real-data'] }, () => {
    let player: LoopbackPlayer;

    // Generating the noise terrain around the spawn is the slow part, so it happens here.
    beforeAll(async () => {
        player = await jsp.join('Spawned');
        await chunksAround(player);
    }, 600_000);

    it("joins the client in Java seed 1234's climate-selected spawn chunk (-33, 4)", async () => {
        // The Java 26.3 vector in packages/worldgen/vectors/26.3/spawn.json selects (-33, 4).
        expect(chunkOf(player.world.getPosition()!)).toEqual([-33, 4]);
        expect(player.client.isConnected()).toBe(true);
        player.leave();
        await jsp.tick();
    });
});

describe('generated-fluid-flow', { tags: ['real-data'] }, () => {
    /**
     * A water source the seed 1234 Overworld leaves marked for post-processing, with cave air
     * beside it; the cinnabar scenario's comment says how it was found.
     */
    const SOURCE = { x: -585, y: 16, z: 11 };
    const BESIDE = { x: -584, y: 16, z: 11 };
    let player: LoopbackPlayer;

    // Generating the cave's chunk is the slow part, so it happens here.
    beforeAll(async () => {
        player = await jsp.join('Caver');
        await jsp.command(`gamemode spectator ${player.name}`);
        const before = player.world.getTeleportCount();
        await jsp.command(`teleport ${player.name} ${SOURCE.x + 0.5} ${SOURCE.y + 2} ${SOURCE.z + 0.5}`);
        await jsp.until(() => player.world.getTeleportCount() > before, 'the client was never sent the teleport');
        await player.input();

        // The client's view says nothing about when the server has the chunk; ask the server.
        const overworld = jsp.server.getWorldManager().getEntryWorld();
        await jsp.until(
            () => overworld.getLoadedChunk(SOURCE.x >> 4, SOURCE.z >> 4) !== null,
            'the server never loaded the marked water',
            GENERATION_TICKS
        );
    }, 600_000);

    it('flows water Java marks for post-processing in a freshly generated cave into the air beside it', async () => {
        expect(await testForBlock(SOURCE, 'minecraft:water')).toMatch(/Found the block at/);

        // The tick was due the moment the chunk entered the world, and a water tick spreads in five.
        await jsp.tick(40);
        expect(
            await testForBlock(BESIDE, 'minecraft:water'),
            'the marked water flowed into the cave air beside it'
        ).toMatch(/Found the block at/);
        player.leave();
        await jsp.tick();
    });
});

describe('worldgen-dimensions', { tags: ['real-data'] }, () => {
    /**
     * Below the Nether's bedrock roof and above the End's main island. The player is a
     * spectator, so neither the netherrack it may land in nor a fall can hurt it.
     */
    const ARRIVAL = { x: 8.5, y: 100, z: 8.5 } as const;
    const DESTINATIONS = [
        ['minecraft:the_nether', 1],
        ['minecraft:the_end', 2]
    ] as const;
    /** What the player saw on arriving in each dimension. */
    const arrivals: { dimension: string; id: number; shown?: number; column: [number, number]; server?: number }[] = [];
    let player: LoopbackPlayer;

    // Generating each dimension's terrain is the slow part, so the trip happens here.
    beforeAll(async () => {
        player = await jsp.join('Traveler');
        await jsp.command(`gamemode spectator ${player.name}`);
        for (const [dimension, id] of DESTINATIONS) {
            await jsp.command(
                `execute in ${dimension} run teleport ${player.name} ${ARRIVAL.x} ${ARRIVAL.y} ${ARRIVAL.z}`
            );
            await jsp.until(
                () => player.world.getDimension() === id,
                `the client never changed to ${dimension}`,
                GENERATION_TICKS
            );
            // A chunk that fails to generate never reaches the client, which then waits here.
            await chunksAround(player);
            arrivals.push({
                dimension,
                id,
                shown: player.world.getDimension(),
                column: chunkOf(player.world.getPosition()!),
                server: player.session()?.getWorld().getDimension().bedrockId
            });
        }
    }, 900_000);

    it('sends the client the Nether and End terrain the Java noise generator builds', async () => {
        expect(arrivals).toEqual(
            DESTINATIONS.map(([dimension, id]) => ({ dimension, id, shown: id, column: [0, 0], server: id }))
        );
        player.leave();
        await jsp.tick();
    });
});
