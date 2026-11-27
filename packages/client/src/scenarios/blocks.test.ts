/**
 * What a joined player sees of block changes on a flat world: the client e2e scenarios
 * `fill-replace-filter`, `piston-bedrock`, `falling-block-water`, `sub-chunk-block-changes`,
 * `edge-chunk-block-change`, `pressure-plate-lamp` and `redstone-dust`, played over a loopback
 * pipe against a server stepped by hand.
 *
 * The cinnabar versions read the blocks back with `testforblock` and, where they mine, look at
 * what the rendering client did. These ask the server the same questions through its console,
 * read its world directly, and check the block packets the client was sent against it.
 */
import BlockRuntimeIds from '@jsprismarine/prismarine/block/state/BlockRuntimeIds';
import { PlayerActionType, PlayerAuthInputData, UpdateBlockPacket } from '@jsprismarine/protocol';
import UpdateSubChunkBlocksPacket from '@jsprismarine/protocol/bedrock/packet/UpdateSubChunkBlocksPacket';
import BlockPos from '@jsprismarine/protocol/bedrock/structure/BlockPos';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { playerAuthInput } from '../playerAuthInput';
import { startLoopbackServer } from '../testing/loopbackServer.test-utils';
import { EYE_HEIGHT } from './scenarioSupport.test-utils';

import type { DecodedPacket } from '../net/ClientPacketRegistry';
import type { LoopbackPlayer, LoopbackServer } from '../testing/loopbackServer.test-utils';
import type { WorldPosition } from '../ClientWorld';

let jsp: LoopbackServer;

// Booting the server builds its content, the slow part, so it happens once for the file.
beforeAll(async () => {
    jsp = await startLoopbackServer({ name: 'block-scenarios' });
}, 900_000);

afterAll(async () => {
    await jsp?.close();
}, 60_000);

/** A block position, in whole blocks. */
interface BlockAt {
    readonly x: number;
    readonly y: number;
    readonly z: number;
}

/** The block changes one client was sent, from both block packets, on the normal layer. */
interface ShownBlocks {
    /** The runtime id the client was last told stands at a position, or `undefined` when it was never told. */
    at(at: BlockAt): number | undefined;
    /** Every `UpdateSubChunkBlocksPacket` the client was sent, oldest first, as the positions it changed. */
    readonly subChunkBatches: BlockAt[][];
}

/**
 * Records the block changes a client is sent: `UpdateBlockPacket` and the bulk
 * `UpdateSubChunkBlocksPacket`, which `ClientWorld` does not read.
 * @param player - The player whose client to listen to.
 * @returns What the client was sent, as it arrives.
 */
const showBlocks = (player: LoopbackPlayer): ShownBlocks => {
    const { client } = player;
    const registry = client.getRegistry();
    if (!registry.has(new UpdateSubChunkBlocksPacket().getId())) registry.register(UpdateSubChunkBlocksPacket);
    const blocks = new Map<string, number>();
    const subChunkBatches: BlockAt[][] = [];
    client.on('packet', ({ packet }: DecodedPacket) => {
        if (packet instanceof UpdateBlockPacket) {
            if (packet.layer === 0) blocks.set(`${packet.x},${packet.y},${packet.z}`, packet.blockRuntimeId);
        } else if (packet instanceof UpdateSubChunkBlocksPacket) {
            const update = packet.getPacketData();
            if (update === null) return;
            const batch: BlockAt[] = [];
            for (const { position, runtimeId } of update.blocksChanged.standards) {
                blocks.set(`${position.x},${position.y},${position.z}`, runtimeId);
                batch.push({ x: position.x, y: position.y, z: position.z });
            }
            subChunkBatches.push(batch);
        }
    });
    return { at: ({ x, y, z }) => blocks.get(`${x},${y},${z}`), subChunkBatches };
};

/** The Overworld every player here stands in. */
const overworld = () => jsp.server.getWorldManager().getEntryWorld();

/**
 * The runtime id the server's world holds at a position, as the wire carries it, or `undefined`
 * when its chunk is not loaded. The world keeps the hash as a signed 32-bit number and the
 * packets write it unsigned, so it is read back unsigned to compare.
 */
const serverRuntimeId = ({ x, y, z }: BlockAt): number | undefined => {
    const runtimeId = overworld().loadedBlockRuntimeIdAt(x, y, z);
    return runtimeId === undefined ? undefined : runtimeId >>> 0;
};

/** The name of the block the server's world holds at a position. */
const serverBlockName = ({ x, y, z }: BlockAt): string | undefined => {
    const runtimeId = overworld().loadedBlockRuntimeIdAt(x, y, z);
    return runtimeId === undefined ? undefined : BlockRuntimeIds.getState(runtimeId)?.name;
};

/**
 * Asks the server whether a block stands at a position, as the cinnabar scenarios do.
 * @param at - Where to look.
 * @param block - The block, with states in brackets when they matter.
 * @returns Whether `testforblock` found it.
 */
const found = async ({ x, y, z }: BlockAt, block: string): Promise<boolean> => {
    const { messages } = await jsp.command(`testforblock ${x} ${y} ${z} ${block}`);
    return messages.some((line) => /Found the block at/.test(line));
};

/**
 * Sets a block and checks the server holds it, the loopback's `placeBlockAndWait`. The chunk is
 * loaded already, so one command is enough.
 */
const place = async (at: BlockAt, block: string): Promise<void> => {
    await jsp.command(`setblock ${at.x} ${at.y} ${at.z} ${block}`);
    expect(await found(at, block), `${block} stands at ${at.x} ${at.y} ${at.z}`).toBe(true);
};

/** The column a position is in. */
const chunkOf = ({ x, z }: { readonly x: number; readonly z: number }) => ({
    x: Math.floor(x) >> 4,
    z: Math.floor(z) >> 4
});

/**
 * Teleports the player and waits until the client stands there with the chunks around it, and
 * the server has the chunk loaded, so a `setblock` there lands.
 * @param player - Who moves.
 * @param at - Where the feet go.
 */
const standAt = async (player: LoopbackPlayer, at: WorldPosition): Promise<void> => {
    const before = player.world.getTeleportCount();
    await jsp.command(`teleport ${player.name} ${at.x} ${at.y} ${at.z}`);
    await jsp.until(() => player.world.getTeleportCount() > before, `${player.name} was never sent the teleport`);
    await player.input();
    const column = chunkOf(at);
    const there = (): boolean => {
        const position = player.session()?.getPlayer().getPosition();
        return (
            position !== undefined &&
            Math.hypot(position.getX() - at.x, position.getY() - EYE_HEIGHT - at.y, position.getZ() - at.z) < 0.5
        );
    };
    await jsp.until(
        () => player.world.chunksLoadedAround(1) && overworld().getLoadedChunk(column.x, column.z) !== null && there(),
        `${player.name} never stood at ${at.x} ${at.y} ${at.z} with its chunks`
    );
};

/**
 * Sends a player's block actions on a position, one input a tick, as a client does.
 *
 * The inputs carry their own tick numbers, past any the player's own `input` has used.
 * @param player - Who acts.
 * @param at - The block, acted on from its top face.
 * @returns A sender of one input, with a block action or with none.
 */
const blockActions = (player: LoopbackPlayer, at: BlockAt): ((action?: PlayerActionType) => Promise<void>) => {
    const position = player.world.getPosition();
    if (position === undefined) throw new Error(`${player.name} has no position to act from`);
    let inputTick = 1_000_000n;
    return async (action) => {
        inputTick += 1n;
        const packet = playerAuthInput({ position, pitch: 0, yaw: 0, headYaw: 0 }, { tick: inputTick });
        const input = packet.getPacketData();
        if (input !== null && action !== undefined) {
            input.inputData.add(PlayerAuthInputData.PERFORM_BLOCK_ACTIONS);
            input.blockActions = [{ action, position: new BlockPos(at.x, at.y, at.z), face: 1 }];
        }
        await player.client.getSession().send(packet);
        await jsp.tick();
    };
};

/**
 * Mines a block as a survival client with server-timed breaking does: a start in the input's
 * block actions, an input a tick while the button is held, then the predicted destroy.
 * @param player - Who mines.
 * @param at - The block, mined from its top face.
 * @param ticks - How many ticks the button is held before the break is predicted.
 */
const mine = async (player: LoopbackPlayer, at: BlockAt, ticks: number): Promise<void> => {
    const send = blockActions(player, at);
    await send(PlayerActionType.StartDestroyBlock);
    for (let tick = 0; tick < ticks; tick++) await send();
    await send(PlayerActionType.PredictDestroyBlock);
};

describe('fill-replace-filter', () => {
    /** A row of four blocks above the flat world's surface: two stone, then two obsidian. */
    const ROW = { y: -58, z: 12, from: 12, to: 15 } as const;

    it('replaces only the blocks that match the filter', async () => {
        const player = await jsp.join('Filler');
        const shown = showBlocks(player);
        const { y, z, from, to } = ROW;
        const fill = async (line: string): Promise<string> => (await jsp.command(line)).messages.join('\n');

        expect(await fill(`fill ${from} ${y} ${z} ${from + 1} ${y} ${z} minecraft:stone`)).toMatch(/Filled 2 blocks/);
        expect(await fill(`fill ${from + 2} ${y} ${z} ${to} ${y} ${z} minecraft:obsidian`)).toMatch(/Filled 2 blocks/);

        // Obsidian over obsidian changes nothing, as Bedrock and Java both report.
        const same = await fill(
            `fill ${from} ${y} ${z} ${to} ${y + 1} ${z} minecraft:obsidian replace minecraft:obsidian`
        );
        expect(same).toMatch(/Filled \d+ blocks|No blocks|Could not/);
        expect(same).not.toMatch(/Filled [1-9]/);

        const replaced = await fill(
            `fill ${from} ${y} ${z} ${to} ${y + 1} ${z} minecraft:dirt replace minecraft:stone`
        );
        expect(replaced).toMatch(/Filled 2 blocks/);
        await jsp.tick();

        for (let x = from; x <= to; x++) {
            const wanted = x < from + 2 ? 'minecraft:dirt' : 'minecraft:obsidian';
            expect(serverBlockName({ x, y, z }), `the block at ${x}`).toBe(wanted);
            // The client was sent the block the server holds.
            expect(shown.at({ x, y, z }), `what the client was sent for ${x}`).toBe(serverRuntimeId({ x, y, z }));
        }
        expect(serverBlockName({ x: from, y: y + 1, z })).toBe('minecraft:air');
        expect(shown.at({ x: from, y: y + 1, z }), 'the air above was never sent as changed').toBeUndefined();

        await jsp.command(`fill ${from} ${y} ${z} ${to} ${y} ${z} minecraft:air`);
        player.leave();
        await jsp.tick();
    });
});

describe('piston-bedrock', { tags: ['real-data'] }, () => {
    it('leaves bedrock in its original position', async () => {
        const player = await jsp.join('Pusher');
        const shown = showBlocks(player);
        await jsp.command(`gamemode creative ${player.name}`);
        await standAt(player, { x: 64.5, y: 66, z: 0.5 });

        for (const [index, piston] of ['minecraft:piston', 'minecraft:sticky_piston'].entries()) {
            const x = 64 + index * 4;
            const bedrock = { x, y: 65, z: 2 };
            const destination = { x, y: 65, z: 3 };
            const power = { x, y: 65, z: 0 };
            await place(destination, 'minecraft:air');
            await place(bedrock, 'minecraft:bedrock');
            await place({ x, y: 65, z: 1 }, `${piston} ["facing_direction"=2]`);
            await place(power, 'minecraft:redstone_block');
            await jsp.tick(20);
            expect(await found(bedrock, 'minecraft:bedrock'), `${piston} left the bedrock`).toBe(true);
            expect(await found(destination, 'minecraft:air'), `${piston} pushed nothing`).toBe(true);

            // Confirm this same powered fixture can move an ordinary block.
            await place(power, 'minecraft:air');
            await jsp.tick(20);
            await place(bedrock, 'minecraft:stone');
            await place(power, 'minecraft:redstone_block');
            await jsp.tick(20);
            expect(await found(destination, 'minecraft:stone'), `${piston} pushed the stone`).toBe(true);
            // The client was told the stone moved.
            expect(shown.at(destination)).toBe(serverRuntimeId(destination));
        }
        player.leave();
        await jsp.tick();
    });
});

describe('falling-block-water', { tags: ['real-data'] }, () => {
    /** Where the player stands, beside the pit, on the flat world's surface. */
    const STAND = { x: 26.5, y: -60, z: 20.5 };
    /** The pit's column: water two deep over the flat world's dirt. */
    const PIT = { x: 28, z: 20 };
    const FLOOR_Y = -62;
    const SURFACE_Y = -61;

    it('sinks gravel dropped into water to the floor of the pit, where it does not fall again', async () => {
        const player = await jsp.join('Dropper');
        const shown = showBlocks(player);
        await standAt(player, STAND);

        await jsp.command(`fill ${PIT.x} ${FLOOR_Y} ${PIT.z} ${PIT.x} ${SURFACE_Y} ${PIT.z} minecraft:water`);
        await jsp.tick(5);
        await jsp.command(`setblock ${PIT.x} ${SURFACE_Y + 1} ${PIT.z} minecraft:gravel`);
        await jsp.tick(60);

        const floor = { x: PIT.x, y: FLOOR_Y, z: PIT.z };
        expect(await found(floor, 'minecraft:gravel'), 'the gravel reached the floor of the pit').toBe(true);
        expect(shown.at(floor), 'the client was sent the gravel on the floor').toBe(serverRuntimeId(floor));

        // The bug this guards against: the block landed on the surface, fell again, and kept a
        // falling block alive every other tick for as long as the chunk stayed loaded.
        const { messages } = await jsp.command('testfor @e[type=minecraft:falling_block]');
        expect(messages.join('\n')).toMatch(/No entity was found|Found 0/);
        expect(player.world.actorsOfType('minecraft:falling_block')).toEqual([]);

        await jsp.command(`fill ${PIT.x} ${FLOOR_Y} ${PIT.z} ${PIT.x} ${SURFACE_Y} ${PIT.z} minecraft:dirt`);
        player.leave();
        await jsp.tick();
    });
});

describe('sub-chunk-block-changes', () => {
    /** A spot in the air, clear of the flat surface and of what the other scenarios build. */
    const FLOOR = { x: 100, y: 63, z: 100 };

    it('sends the client the blocks one fill changed in a sub chunk, as one packet', async () => {
        const player = await jsp.join('BulkMiner');
        const shown = showBlocks(player);
        const { x, y, z } = FLOOR;
        const stand = { x: x + 1.5, y: y + 1, z: z + 1.5 };
        // Nothing stands up here yet, and a survival player would fall a hundred blocks.
        await jsp.command(`gamemode creative ${player.name}`);
        await standAt(player, stand);

        // Something to stand on, then a wall in front of it. Each is one fill, so its blocks
        // share a sub chunk and travel as one `UpdateSubChunkBlocksPacket` rather than as one
        // `UpdateBlockPacket` each.
        await jsp.command(`fill ${x} ${y} ${z} ${x + 2} ${y} ${z + 2} minecraft:stone`);
        // Dirt, because the wall is what gets mined and a bare hand takes nothing off stone.
        await jsp.command(`fill ${x + 1} ${y + 2} ${z + 3} ${x + 1} ${y + 4} ${z + 3} minecraft:dirt`);
        await jsp.tick();

        const platform: BlockAt[] = [];
        for (let dx = 0; dx <= 2; dx++) for (let dz = 0; dz <= 2; dz++) platform.push({ x: x + dx, y, z: z + dz });
        const wall: BlockAt[] = [2, 3, 4].map((dy) => ({ x: x + 1, y: y + dy, z: z + 3 }));
        const key = ({ x, y, z }: BlockAt) => `${x},${y},${z}`;
        const batches = shown.subChunkBatches.map((batch) => new Set(batch.map(key)));
        for (const [name, blocks] of [
            ['platform', platform],
            ['wall', wall]
        ] as const) {
            expect(
                batches.some((batch) => blocks.every((at) => batch.has(key(at)))),
                `the ${name} arrived in one sub chunk packet`
            ).toBe(true);
            for (const at of blocks) expect(shown.at(at)).toBe(serverRuntimeId(at));
        }

        // The cinnabar client breaks a block out of the wall, which it can only aim at when it
        // applied the fill. Here the client mines it as survival, and the server breaks it.
        await jsp.command(`gamemode survival ${player.name}`);
        const target = { x: x + 1, y: y + 2, z: z + 3 };
        await mine(player, target, 30);
        expect(await found(target, 'minecraft:air'), 'the client broke a block of the filled wall').toBe(true);
        expect(shown.at(target)).toBe(serverRuntimeId(target));
        player.leave();
        await jsp.tick();
    });
});

describe('edge-chunk-block-change', () => {
    it('sends a block update across the -1/0 chunk edge to the client', async () => {
        const player = await jsp.join('EdgeMiner');
        const shown = showBlocks(player);
        // Keep the player four blocks from the drop, as the cinnabar scenario does.
        await jsp.command('setblock -1 63 -4 minecraft:stone');
        await jsp.command('setblock -1 63 -1 minecraft:stone');
        await jsp.command('setblock -1 64 0 minecraft:stone');
        await standAt(player, { x: -0.5, y: 64, z: -3.5 });
        expect(chunkOf(player.world.getPosition()!)).toEqual({ x: -1, z: -1 });

        // The client stands in chunk z=-1 and receives the update for chunk z=0.
        const edge = { x: -1, y: 65, z: 0 };
        await jsp.command(`setblock ${edge.x} ${edge.y} ${edge.z} minecraft:dirt`);
        await jsp.tick(10);
        expect(serverBlockName(edge)).toBe('minecraft:dirt');
        expect(shown.at(edge), 'the client was sent the dirt in chunk z=0').toBe(serverRuntimeId(edge));

        const before = player.world.actorsOfType('minecraft:item').length;
        await mine(player, edge, 25);
        await jsp.until(
            () => player.world.actorsOfType('minecraft:item').length > before,
            'breaking the updated edge block never showed its drop'
        );
        expect(serverBlockName(edge)).toBe('minecraft:air');
        player.leave();
        await jsp.tick();
    });
});

describe('creative-break-container', { tags: ['real-data'] }, () => {
    /** A spot on the flat surface, clear of what the other scenarios build. */
    const STAND = { x: 140.5, y: -60, z: 140.5 };

    it('spills what a chest held when a creative player breaks it, and drops no chest', async () => {
        const player = await jsp.join('Collector');
        await jsp.command(`gamemode creative ${player.name}`);
        await standAt(player, STAND);
        await jsp.command('kill @e[type=item]');

        const chest = { x: 142, y: -60, z: 140 };
        await place(chest, 'minecraft:chest');
        await jsp.command(`replaceitem block ${chest.x} ${chest.y} ${chest.z} slot.container 0 minecraft:stick 3`);
        const before = player.world.actorsOfType('minecraft:item').length;

        await blockActions(player, chest)(PlayerActionType.CreativeDestroyBlock);
        await jsp.until(
            () => player.world.actorsOfType('minecraft:item').length > before,
            'breaking the chest in creative never showed what it held'
        );
        await jsp.tick(5);

        expect(serverBlockName(chest)).toBe('minecraft:air');
        // One stack of three, the sticks, and no chest: creative takes the block's own drop away.
        const drops = player.world.actorsOfType('minecraft:item').slice(before);
        expect(drops.map(({ item }) => item?.stackSize)).toEqual([3]);

        await jsp.command('kill @e[type=item]');
        player.leave();
        await jsp.tick();
    });
});

describe('pressure-plate-lamp', { tags: ['real-data'] }, () => {
    const FIXTURE_X = 72;
    const PLATE = { x: FIXTURE_X, y: 64, z: 2 };
    const LAMP = { x: FIXTURE_X + 1, y: 64, z: 2 };
    const OFF_PLATE = { x: FIXTURE_X + 0.5, y: 64, z: 0.5 };
    const ON_PLATE = { x: FIXTURE_X + 0.5, y: 64, z: 2.5 };
    /** How many ticks the lamp gets to follow the plate; a plate releases 20 ticks after it empties. */
    const LAMP_TICKS = 60;

    it('lights the lamp beside a pressure plate while the player stands on it, and puts it out after', async () => {
        const player = await jsp.join('Stepper');
        const shown = showBlocks(player);
        await jsp.command(`gamemode creative ${player.name}`);
        await standAt(player, OFF_PLATE);
        for (const z of [0, 1, 2]) {
            await place({ x: FIXTURE_X, y: 63, z }, 'minecraft:stone');
            await place({ x: FIXTURE_X + 1, y: 63, z }, 'minecraft:stone');
        }
        await place(PLATE, 'minecraft:stone_pressure_plate');
        await place(LAMP, 'minecraft:redstone_lamp');
        expect(await found(LAMP, 'minecraft:redstone_lamp'), 'the lamp starts unlit').toBe(true);

        /** Reports the player at `at` every tick until `condition` holds. */
        const holdUntil = async (at: WorldPosition, condition: () => boolean, what: string): Promise<void> => {
            for (let tick = 0; !condition(); tick++) {
                if (tick >= LAMP_TICKS) throw new Error(`${what}: still false after ${LAMP_TICKS} ticks`);
                await player.input({ position: { ...at, y: at.y + EYE_HEIGHT } });
                await jsp.tick();
            }
        };

        await holdUntil(
            ON_PLATE,
            () => serverBlockName(LAMP) === 'minecraft:lit_redstone_lamp',
            'the lamp lights while the player stands on the plate'
        );
        expect(await found(LAMP, 'minecraft:lit_redstone_lamp')).toBe(true);
        expect(shown.at(LAMP), 'the client was sent the lit lamp').toBe(serverRuntimeId(LAMP));

        await holdUntil(
            OFF_PLATE,
            () => serverBlockName(LAMP) === 'minecraft:redstone_lamp',
            'the lamp goes out once the player has stepped off the plate'
        );
        expect(await found(LAMP, 'minecraft:redstone_lamp')).toBe(true);
        expect(shown.at(LAMP), 'the client was sent the unlit lamp').toBe(serverRuntimeId(LAMP));
        player.leave();
        await jsp.tick();
    });
});

describe('redstone-dust', { tags: ['real-data'] }, () => {
    const FIXTURE_X = 96;
    const ROW_Z = 2;
    const SOURCE = { x: FIXTURE_X, y: 64, z: ROW_Z };
    const DUST = [1, 2, 3].map((step) => ({ x: FIXTURE_X + step, y: 64, z: ROW_Z }));
    const LAMP = { x: FIXTURE_X + 4, y: 64, z: ROW_Z };
    /** How many ticks the circuit gets to settle; Bedrock turns a lamp off four ticks late. */
    const SETTLE_TICKS = 40;

    it('connects a run of dust, fades it a level a block into the lamp at its end, and darkens it with its source', async () => {
        const player = await jsp.join('Wirer');
        const shown = showBlocks(player);
        await jsp.command(`gamemode creative ${player.name}`);
        await standAt(player, { x: FIXTURE_X + 2.5, y: 64, z: 0.5 });

        await place({ x: FIXTURE_X + 2, y: 63, z: 0 }, 'minecraft:stone');
        for (let step = 0; step <= 4; step++) await place({ x: FIXTURE_X + step, y: 63, z: ROW_Z }, 'minecraft:stone');
        await place(LAMP, 'minecraft:redstone_lamp');
        for (const at of DUST) await place(at, 'minecraft:redstone_wire');

        /** Ticks until `testforblock` finds `block` at `at`, for at most {@link SETTLE_TICKS}. */
        const settlesTo = async (at: BlockAt, block: string): Promise<void> => {
            for (let tick = 0; !(await found(at, block)); tick++) {
                if (tick >= SETTLE_TICKS) throw new Error(`${block} never stood at ${at.x} ${at.y} ${at.z}`);
                await jsp.tick();
            }
        };

        await place(SOURCE, 'minecraft:redstone_block');
        for (const [index, at] of DUST.entries()) {
            await settlesTo(at, `minecraft:redstone_wire ["redstone_signal"=${15 - index}]`);
        }
        await settlesTo(LAMP, 'minecraft:lit_redstone_lamp');
        // Each dust in the run is drawn along it. The shape is checked once the circuit has run:
        // like Java's, `setblock` writes the dust with no shape update, and a dust takes its shape
        // when something beside it changes.
        for (const at of DUST) {
            const line =
                'minecraft:redstone_wire ["redstone_east"="side","redstone_west"="side","redstone_north"="none","redstone_south"="none"]';
            expect(await found(at, line), `the dust at ${at.x} ${at.y} ${at.z} is drawn along the run`).toBe(true);
        }
        // What the cinnabar scenario takes a screenshot of: the client holds the lit run. The
        // changes go out at the end of a tick, and the circuit can settle without one.
        await jsp.tick();
        for (const at of [...DUST, LAMP])
            expect(shown.at(at), `what the client was sent for ${at.x}`).toBe(serverRuntimeId(at));

        await place(SOURCE, 'minecraft:air');
        for (const at of DUST) await settlesTo(at, 'minecraft:redstone_wire ["redstone_signal"=0]');
        await settlesTo(LAMP, 'minecraft:redstone_lamp');
        await jsp.tick();
        for (const at of [...DUST, LAMP])
            expect(shown.at(at), `what the client was sent for ${at.x}`).toBe(serverRuntimeId(at));
        player.leave();
        await jsp.tick();
    });
});
