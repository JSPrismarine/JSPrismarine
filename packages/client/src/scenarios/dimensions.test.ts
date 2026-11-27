// @module-tag integration

/**
 * What a joined player sees of travel between dimensions: the client e2e scenarios `dimensions`,
 * `portals`, `rejoin` and `spawnpoint-respawn`, played over a loopback pipe against a server
 * stepped by hand.
 *
 * The server is the cinnabar suite's: a flat Overworld, a flat Nether and End whose floors top
 * out at y 3, and a custom dimension from a datapack, with natural spawning off. Where cinnabar
 * reads the client's `dimension` and `server_position` state, these read the `ChangeDimension`,
 * `MovePlayer` and `Respawn` packets the client was sent, and the server's own player.
 *
 * Every scenario that reaches the End is tagged `real-data`: the End's dragon fight needs the
 * Bedrock pack's entity types.
 */
import { PlayerRespawnState } from '@jsprismarine/minecraft';
import { PlayerActionPacket, PlayerActionType, RespawnPacket } from '@jsprismarine/protocol';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { LoopbackPlayer, LoopbackServer } from '../testing/loopbackServer.test-utils';
import { startLoopbackServer } from '../testing/loopbackServer.test-utils';
import { EYE_HEIGHT, leaveAndWait } from './scenarioSupport.test-utils';

/** The Bedrock dimension ids `ChangeDimension` carries. */
const OVERWORLD = 0;
const NETHER = 1;
const THE_END = 2;
/** The first id the server hands a custom dimension. */
const CUSTOM = 1000;

/** The top of the flat Nether, End and custom dimension floors. */
const FLAT_FLOOR_Y = 3;

/** A flat dimension of bedrock and three layers of one block, as the cinnabar suite's are. */
const flatGenerator = (block: string) => ({
    type: 'minecraft:flat',
    settings: {
        layers: [
            { block: 'minecraft:bedrock', height: 1 },
            { block, height: 3 }
        ],
        biome: 'minecraft:plains',
        lakes: false,
        features: false,
        structure_overrides: []
    }
});

/** The datapack that defines the custom dimension type, as the cinnabar suite's fixture does. */
const DATAPACK = {
    'datapack/pack.mcmeta': JSON.stringify({
        pack: { min_format: 0, max_format: Number.MAX_SAFE_INTEGER, description: 'Loopback dimensions' }
    }),
    'datapack/data/client_e2e/dimension_type/custom.json': JSON.stringify({
        min_y: 0,
        height: 256,
        logical_height: 256,
        coordinate_scale: 1,
        has_skylight: true,
        has_ceiling: false,
        ambient_light: 0,
        monster_spawn_light_level: 0,
        monster_spawn_block_light_limit: 0,
        infiniburn: '#minecraft:infiniburn_overworld'
    })
};

let jsp: LoopbackServer;

// Booting the server builds its content, the slow part, so it happens once for the file.
beforeAll(async () => {
    jsp = await startLoopbackServer({
        name: 'dimension-scenarios',
        files: DATAPACK,
        config: (stateRoot) => ({
            'content-datapacks': [`${stateRoot}/datapack`],
            worlds: {
                world: {
                    preset: 'minecraft:flat',
                    provider: 'LevelDB',
                    seed: '1',
                    dimensions: {
                        'minecraft:the_nether': {
                            type: 'minecraft:the_nether',
                            generator: flatGenerator('minecraft:netherrack')
                        },
                        'minecraft:the_end': {
                            type: 'minecraft:the_end',
                            generator: flatGenerator('minecraft:end_stone')
                        },
                        'client_e2e:custom': { type: 'client_e2e:custom', generator: flatGenerator('minecraft:stone') }
                    }
                }
            }
        })
    });
    // As the cinnabar runner does: natural spawning is chance, and a scenario that needs a mob summons it.
    await jsp.command('gamerule doMobSpawning false');
}, 1_200_000);

afterAll(async () => {
    await jsp?.close();
}, 60_000);

/** Whether the player has finished a change into `dimension`: the client is there and its screen closed. */
const arrivedIn = (player: LoopbackPlayer, dimension: number): boolean =>
    player.world.getDimension() === dimension &&
    player.client.getDimensionChange().getPending() === null &&
    player.session()?.getWorld().getDimension().bedrockId === dimension;

/**
 * Ticks until the player is settled in `dimension`, then reports where it stands, as the client
 * does once its loading screen closes.
 */
const settleIn = async (player: LoopbackPlayer, dimension: number, what: string, maxTicks = 200): Promise<void> => {
    await jsp.until(() => arrivedIn(player, dimension), what, maxTicks);
    // The teleport that ends a change comes after the client closed its screen.
    await jsp.tick(5);
    await player.input();
    await jsp.tick();
};

describe('dimensions', { tags: ['real-data'] }, () => {
    /** The Overworld gets a stone pad; every other dimension's arrival stands on its flat floor. */
    const OVERWORLD_PAD = { from: 5, to: 11, y: 63 };
    const destinations = [
        { id: 'minecraft:nether', dimension: NETHER, pad: false },
        { id: 'minecraft:overworld', dimension: OVERWORLD, pad: true },
        { id: 'minecraft:the_end', dimension: THE_END, pad: false },
        { id: 'minecraft:overworld', dimension: OVERWORLD, pad: true },
        { id: 'client_e2e:custom', dimension: CUSTOM, pad: false },
        { id: 'minecraft:overworld', dimension: OVERWORLD, pad: true }
    ] as const;

    it('changes between the Overworld, Nether, End, and a custom dimension', async () => {
        const player = await jsp.join('Traveler');
        await jsp.until(() => player.world.health() !== undefined, 'the client never learned its health');

        for (const destination of destinations) {
            const [x, z] = [8, 8];
            const y = (destination.pad ? OVERWORLD_PAD.y : FLAT_FLOOR_Y) + 1;
            if (destination.pad) {
                const { from, to, y: padY } = OVERWORLD_PAD;
                await jsp.command(
                    `execute in ${destination.id} run fill ${from} ${padY} ${from} ${to} ${padY} ${to} minecraft:stone`
                );
            }
            const before = player.world.health()!;

            await jsp.command(`execute in ${destination.id} run teleport ${player.name} ${x} ${y} ${z}`);
            await settleIn(player, destination.dimension, `the client never arrived in ${destination.id}`);
            await jsp.until(
                () => player.world.chunksLoadedAround(1),
                `no chunks around the arrival in ${destination.id}`
            );

            const position = player.world.getPosition()!;
            expect(Math.hypot(position.x - x, position.z - z), `arrived in ${destination.id}`).toBeLessThan(3);

            // As cinnabar lets the client finish with each arrival before asking for the next.
            await jsp.tick(40);
            expect(player.world.health(), `hurt arriving in ${destination.id}`).toBeGreaterThanOrEqual(before);
        }
        player.leave();
        await jsp.tick();
    });
});

describe('portals', { tags: ['real-data'] }, () => {
    /** The Overworld pad everything stands on. */
    const PAD = { from: { x: 16, z: 16 }, to: { x: 36, z: 28 }, y: 63 } as const;
    /** The nether portal's frame, four wide along x and five tall, standing on the pad. */
    const FRAME = { x: 20, z: 20 } as const;
    /** The end portal block, set into the pad. */
    const END_PORTAL = { x: 32, z: 24 } as const;
    /** Where a player lands in the End: Java's `END_SPAWN_POINT` (100, 50, 0) with a player one lower. */
    const END_ARRIVAL = { x: 100.5, y: 49, z: 0.5 } as const;

    it('goes through a nether portal into the Nether and an end portal onto the End platform', async () => {
        const player = await jsp.join('Portaler');
        const floor = PAD.y + 1;
        await jsp.command(`fill ${PAD.from.x} ${PAD.y} ${PAD.from.z} ${PAD.to.x} ${PAD.y} ${PAD.to.z} stone`);
        await jsp.command(`fill ${FRAME.x} ${floor} ${FRAME.z} ${FRAME.x + 3} ${floor + 4} ${FRAME.z} obsidian`);
        await jsp.command(
            `fill ${FRAME.x + 1} ${floor + 1} ${FRAME.z} ${FRAME.x + 2} ${floor + 3} ${FRAME.z} minecraft:portal`
        );
        await jsp.command(`teleport ${player.name} ${FRAME.x + 1.5} ${floor} ${FRAME.z + 3.5}`);
        await jsp.tick(20);
        await player.input();
        await jsp.until(() => player.world.health() !== undefined, 'the client never learned its health');
        const before = player.world.health()!;

        // Into the interior, on the frame's bottom row. A survival player waits 80 ticks.
        let teleports = player.world.getTeleportCount();
        await jsp.command(`teleport ${player.name} ${FRAME.x + 1.5} ${floor + 1} ${FRAME.z + 0.5}`);
        await jsp.until(() => player.world.getTeleportCount() > teleports, 'the client was never sent the teleport');
        await player.input();
        await settleIn(player, NETHER, 'the nether portal never took the player to the Nether', 400);
        await jsp.tick(20);

        // The trip lands the player in the portal it built: (20, 20) / 8 is (2.5, 2.5).
        const nether = player.world.getPosition()!;
        expect(Math.hypot(nether.x - 2.5, nether.z - 2.5), 'the Nether arrival is at the scaled portal').toBeLessThan(
            3
        );
        expect(player.world.health()).toBeGreaterThanOrEqual(before);

        await jsp.command(
            `execute in minecraft:overworld run teleport ${player.name} ${FRAME.x + 1.5} ${floor} ${FRAME.z + 6.5}`
        );
        await settleIn(player, OVERWORLD, 'the player never came back to the Overworld');
        await jsp.tick(20);

        await jsp.command(`setblock ${END_PORTAL.x} ${PAD.y} ${END_PORTAL.z} minecraft:end_portal`);
        await jsp.tick(5);
        teleports = player.world.getTeleportCount();
        await jsp.command(`teleport ${player.name} ${END_PORTAL.x + 0.5} ${floor} ${END_PORTAL.z + 0.5}`);
        await jsp.until(() => player.world.getTeleportCount() > teleports, 'the client was never sent the teleport');
        await player.input();
        // The end portal block has no collision, so a retail client falls into it from the pad's
        // top; this client has no physics, so it reports the drop itself, feet inside the block.
        await player.input({
            position: { x: END_PORTAL.x + 0.5, y: PAD.y + 0.25 + EYE_HEIGHT, z: END_PORTAL.z + 0.5 }
        });
        await settleIn(player, THE_END, 'the end portal never took the player to the End', 400);
        await jsp.tick(20);

        const eyes = player.world.getPosition()!;
        expect(
            Math.hypot(eyes.x - END_ARRIVAL.x, eyes.z - END_ARRIVAL.z),
            'the End arrival is on the platform'
        ).toBeLessThan(1);
        expect(Math.abs(eyes.y - EYE_HEIGHT - END_ARRIVAL.y)).toBeLessThan(1);
        player.leave();
        await jsp.tick();
    });
});

describe('rejoin', () => {
    /** Where the first visit leaves from: the Nether's flat floor tops out at y 3. */
    const SPOT = { x: 8, y: 4, z: 8 };

    it('logs a player who left hurt in the Nether back in there, as hurt as they left', async () => {
        // Health that regenerated between the save and the return would hide a record that lost it.
        await jsp.command('gamerule naturalRegeneration false');
        try {
            const first = await jsp.join('Returning');
            await jsp.command(`execute in minecraft:nether run teleport ${first.name} ${SPOT.x} ${SPOT.y} ${SPOT.z}`);
            await settleIn(first, NETHER, 'the first visit never reached the Nether');

            await jsp.until(() => first.world.health() !== undefined, 'the client never learned its health');
            const full = first.world.health()!;
            await jsp.command(`damage ${first.name} 7`);
            await jsp.until(() => first.world.health()! < full, 'the player never took the damage');
            const leftAt = first.world.getPosition()!;
            const leftHealth = first.world.health()!;

            await leaveAndWait(jsp, first);

            const second = await jsp.join('Returning');
            await jsp.until(() => second.world.getDimension() !== undefined, 'the second visit never spawned');
            await jsp.tick(5);
            expect(
                {
                    client: second.world.getDimension(),
                    server: second.session()?.getWorld().getDimension().bedrockId,
                    pending: second.client.getDimensionChange().getPending()
                },
                'the second visit did not log in to the Nether'
            ).toEqual({ client: NETHER, server: NETHER, pending: null });
            await jsp.until(() => second.world.health() !== undefined, 'the client never learned its health');
            const backAt = second.world.getPosition()!;
            expect(
                Math.hypot(backAt.x - leftAt.x, backAt.y - leftAt.y, backAt.z - leftAt.z),
                `came back at ${JSON.stringify(backAt)}, having left at ${JSON.stringify(leftAt)}`
            ).toBeLessThan(1);
            expect(second.world.health(), 'came back on other health than they left on').toBe(leftHealth);
            second.leave();
            await jsp.tick();
        } finally {
            await jsp.command('gamerule naturalRegeneration true');
        }
    });
});

describe('spawnpoint-respawn', () => {
    /** On the flat Nether's floor, which tops out at y 3. */
    const POINT = { x: 4, y: 4, z: 4 };
    /** The block position a `PlayerActionPacket` carries when the action has no block. */
    const NO_BLOCK = { x: 0, y: 0, z: 0 };

    /**
     * Presses the death screen's respawn button, as a retail client does: `ClientReadyToSpawn`
     * first, and the `Respawn` player action once the server said where the player comes back.
     */
    const respawn = async (player: LoopbackPlayer): Promise<void> => {
        const runtimeEntityId = player.client.getStartGame()!.runtimeEntityId;
        await player.client.getSession().send(
            new RespawnPacket({
                position: { x: 0, y: 0, z: 0 },
                state: PlayerRespawnState.CLIENT_READY_TO_SPAWN,
                runtimeEntityId
            })
        );
        await jsp.until(
            () => player.world.getRespawnState() === PlayerRespawnState.READY_TO_SPAWN,
            'the server never said where the player respawns'
        );
        await player.client.getSession().send(
            new PlayerActionPacket({
                runtimeEntityId,
                action: PlayerActionType.Respawn,
                blockPosition: NO_BLOCK,
                resultPosition: NO_BLOCK,
                blockFace: 0
            })
        );
        await jsp.settle();
    };

    it('respawns a player whose spawn point is in the Nether there after dying in the Overworld', async () => {
        const player = await jsp.join('Respawner');
        await jsp.command(
            `execute in minecraft:the_nether run spawnpoint ${player.name} ${POINT.x} ${POINT.y} ${POINT.z}`
        );
        await jsp.tick(5);
        await jsp.command(`kill ${player.name}`);
        await jsp.until(
            () => player.world.getRespawnState() === PlayerRespawnState.SEARCHING_FOR_SPAWN,
            'the client was never shown the death screen'
        );

        // The death screen ignores clicks for a moment after it opens.
        await jsp.tick(30);
        await respawn(player);
        await settleIn(player, NETHER, 'the player respawned outside the Nether');
        await jsp.until(() => player.world.health()! > 0, 'the player never regained health after respawning');

        const eyes = player.world.getPosition()!;
        const feet = { x: eyes.x, y: eyes.y - EYE_HEIGHT, z: eyes.z };
        expect(
            Math.abs(feet.x - POINT.x) < 0.5 && Math.abs(feet.y - POINT.y) < 0.5 && Math.abs(feet.z - POINT.z) < 0.5,
            `the player respawned away from their spawn point: feet ${JSON.stringify(feet)}`
        ).toBe(true);

        // Back to the Overworld, as cinnabar leaves the player for the scenarios after it.
        await jsp.command(`execute in minecraft:overworld run teleport ${player.name} 8 64 8`);
        await settleIn(player, OVERWORLD, 'the player never returned to the Overworld');
        player.leave();
        await jsp.tick();
    });
});
