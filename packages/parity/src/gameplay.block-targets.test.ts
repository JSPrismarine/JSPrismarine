import { BlockRuntimeIds } from '@jsprismarine/prismarine/block/state/BlockRuntimeIds';
import type { Config } from '@jsprismarine/prismarine/config/Config';
import { blockTargetRejection } from '@jsprismarine/prismarine/network/handler/BlockTarget';
import AnvilDamageHandler from '@jsprismarine/prismarine/network/handler/AnvilDamageHandler';
import type { SessionContext } from '@jsprismarine/prismarine/network/handler/HandlerContext';
import LabTableHandler from '@jsprismarine/prismarine/network/handler/LabTableHandler';
import LecternUpdateHandler from '@jsprismarine/prismarine/network/handler/LecternUpdateHandler';
import PlayerToggleCrafterSlotRequestHandler from '@jsprismarine/prismarine/network/handler/PlayerToggleCrafterSlotRequestHandler';
import StructureBlockUpdateHandler from '@jsprismarine/prismarine/network/handler/StructureBlockUpdateHandler';
import StructureTemplateDataRequestHandler from '@jsprismarine/prismarine/network/handler/StructureTemplateDataRequestHandler';
import type PlayerSession from '@jsprismarine/prismarine/network/PlayerSession';
import type Server from '@jsprismarine/prismarine/Server';
import { inertEntityRuntime } from '@jsprismarine/prismarine/testing/entityServer';
import { sessionContext } from '@jsprismarine/prismarine/testing/handlerContext.test.helper';
import { TEST_OVERWORLD_STEM, fakeLevel } from '@jsprismarine/prismarine/testing/level';
import { STEVE } from '@jsprismarine/prismarine/testing/sessionIdentity.test.helper';
import { stub } from '@jsprismarine/prismarine/testing/stub.test.helper';
import Chunk from '@jsprismarine/prismarine/world/chunk/Chunk';
import { Dimensions } from '@jsprismarine/prismarine/world/Dimension';
import type { Generator } from '@jsprismarine/prismarine/world/Generator';
import type BaseProvider from '@jsprismarine/prismarine/world/providers/BaseProvider';
import BlockPosition from '@jsprismarine/prismarine/world/BlockPosition';
import { Position } from '@jsprismarine/prismarine/world/Position';
import { World } from '@jsprismarine/prismarine/world/World';
import AnvilDamagePacket from '@jsprismarine/protocol/packet/AnvilDamagePacket';
import LabTablePacket, { LabTableReactionType, LabTableType } from '@jsprismarine/protocol/packet/LabTablePacket';
import LecternUpdatePacket from '@jsprismarine/protocol/packet/LecternUpdatePacket';
import PlayerToggleCrafterSlotRequestPacket from '@jsprismarine/protocol/packet/PlayerToggleCrafterSlotRequestPacket';
import StructureBlockUpdatePacket, {
    StructureBlockType,
    StructureRedstoneSaveMode
} from '@jsprismarine/protocol/packet/StructureBlockUpdatePacket';
import StructureTemplateDataRequestPacket, {
    StructureTemplateRequestOperation
} from '@jsprismarine/protocol/packet/StructureTemplateDataRequestPacket';
import BlockPos from '@jsprismarine/protocol/structure/BlockPos';
import { defaultStructureSettings } from '@jsprismarine/protocol/structure/StructureSettings';
import { expect, it } from 'vitest';

import { FAMILIES } from './families.ts';
import { pinnedJavaClass } from './javaClassFile.ts';
import type { JavaMethod } from './javaClassFile.ts';
import { describeFamily } from './measure.ts';
import { REFERENCES } from './references.ts';
import { serverContent } from './serverStack.ts';
import { reportParityCases } from './trackerCases.ts';

/**
 * The `gameplay.block-targets` row: what the server does with a block position a client's packet
 * names, against what Java's packet listener does with one.
 *
 * Java 26.3's `ServerGamePacketListenerImpl.handlePickItemFromBlock` checks that the position is
 * within the player's reach, then that its chunk is loaded (`ServerLevel.isLoaded`), and only
 * then reads the block; it returns without a word at the first check that fails, so a packet
 * never loads a chunk. `updateSignText` checks `hasChunkAt` before it reads the block entity.
 * The row reads those calls out of the pinned jar, so a Java version that drops or reorders a
 * check fails it.
 *
 * On the server's side `blockTargetRejection` is where the rule lives, and the six read-lane
 * handlers that name a block go through it. The row runs it and each handler against a real
 * `World` with one chunk in memory: a position in reach in a chunk that is not loaded is dropped
 * and no chunk is read from the provider, a position out of reach is dropped before the world is
 * asked, and the same packet aimed at the block in the loaded chunk goes ahead.
 *
 * The reach bound itself is not compared. Java measures from the eyes to the block's box with
 * the player's interaction range, and the server bounds nonsense with the creative reach.
 */

/** Java's packet listener, whose handlers make the checks. */
const LISTENER = 'net/minecraft/server/network/ServerGamePacketListenerImpl';

/** A check a block target goes through, in the names both sides share. */
type Step = 'reach' | 'loaded' | 'read';

/** Which of Java's calls make each check. Every other call is not a block target check. */
const JAVA_STEPS: ReadonlyMap<string, Step> = new Map([
    ['ServerPlayer.isWithinBlockInteractionRange', 'reach'],
    ['ServerLevel.isLoaded', 'loaded'],
    ['ServerLevel.hasChunkAt', 'loaded'],
    ['ServerLevel.getBlockState', 'read'],
    ['ServerLevel.getBlockEntity', 'read']
]);

/** The checks a Java method makes, each at its first call, in order. */
const javaSteps = (methods: readonly JavaMethod[], name: string): Step[] => {
    const method = methods.find((candidate) => candidate.name === name);
    if (method === undefined) throw new Error(`${LISTENER} has no ${name}`);
    const steps: Step[] = [];
    for (const call of method.calls) {
        const step = JAVA_STEPS.get(call);
        if (step !== undefined && !steps.includes(step)) steps.push(step);
    }
    return steps;
};

/** Where the player's eyes are: in the loaded chunk at the origin, a block and a half from its west edge. */
const EYES = Position.fromObject({ x: 1.5, y: 65.62, z: 0.5 });

/** In reach, one block over the border into the chunk west of the loaded one. */
const UNLOADED_IN_REACH = new BlockPosition(-1, 64, 0);

/** Out of reach, in a chunk that is not loaded either. */
const UNLOADED_OUT_OF_REACH = new BlockPosition(70, 64, 0);

/** A position as the packets carry it. */
const blockPos = (position: BlockPosition) => new BlockPos(position.getX(), position.getY(), position.getZ());

/** Each read-lane handler that names a block, the block it expects and where that block stands. */
const HANDLERS: readonly {
    readonly packet: string;
    readonly block: string;
    readonly at: BlockPosition;
    readonly handle: (position: BlockPosition, context: SessionContext) => void;
}[] = [
    {
        packet: 'AnvilDamagePacket',
        block: 'minecraft:anvil',
        at: new BlockPosition(2, 64, 0),
        handle: (position, context) =>
            new AnvilDamageHandler().handle(new AnvilDamagePacket({ blockPosition: blockPos(position) }), context)
    },
    {
        packet: 'LabTablePacket',
        block: 'minecraft:lab_table',
        at: new BlockPosition(2, 64, 1),
        handle: (position, context) =>
            new LabTableHandler().handle(
                new LabTablePacket({
                    type: LabTableType.StartCombine,
                    position: blockPos(position),
                    reaction: LabTableReactionType.None
                }),
                context
            )
    },
    {
        packet: 'LecternUpdatePacket',
        block: 'minecraft:lectern',
        at: new BlockPosition(2, 64, 2),
        handle: (position, context) =>
            new LecternUpdateHandler().handle(
                new LecternUpdatePacket({ newPage: 1, totalPages: 3, position: blockPos(position) }),
                context
            )
    },
    {
        packet: 'PlayerToggleCrafterSlotRequestPacket',
        block: 'minecraft:crafter',
        at: new BlockPosition(2, 64, 3),
        handle: (position, context) =>
            new PlayerToggleCrafterSlotRequestHandler().handle(
                Object.assign(new PlayerToggleCrafterSlotRequestPacket(), {
                    posX: position.getX(),
                    posY: position.getY(),
                    posZ: position.getZ(),
                    slotIndex: 4,
                    isDisabled: true
                }),
                context
            )
    },
    {
        packet: 'StructureBlockUpdatePacket',
        block: 'minecraft:structure_block',
        at: new BlockPosition(3, 64, 0),
        handle: (position, context) =>
            new StructureBlockUpdateHandler().handle(
                new StructureBlockUpdatePacket({
                    blockPosition: blockPos(position),
                    structureData: {
                        structureName: { unredacted: 'house', redacted: null },
                        dataField: '',
                        shouldIncludePlayers: false,
                        shouldShowBoundingBox: false,
                        structureBlockType: StructureBlockType.Data,
                        structureSettings: defaultStructureSettings(),
                        redstoneSaveMode: StructureRedstoneSaveMode.SavesToMemory
                    },
                    trigger: false,
                    isWaterlogged: false
                }),
                context
            )
    },
    {
        packet: 'StructureTemplateDataRequestPacket',
        block: 'minecraft:structure_block',
        at: new BlockPosition(3, 64, 0),
        handle: (position, context) =>
            new StructureTemplateDataRequestHandler().handle(
                new StructureTemplateDataRequestPacket({
                    structureName: 'house',
                    structurePosition: blockPos(position),
                    structureSettings: defaultStructureSettings(),
                    requestedOperation: StructureTemplateRequestOperation.QuerySavedStructure
                }),
                context
            )
    }
];

/** What a log recorded, by level. */
interface Logged {
    readonly debug: string[];
    readonly verbose: string[];
}

/** A logger that keeps each line said at debug and verbose level. */
const recordingLogger = (logged: Logged = { debug: [], verbose: [] }) =>
    stub<ReturnType<Server['getLogger']>>({
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: (...message) => void logged.debug.push(message[0] ?? ''),
        verbose: (...message) => void logged.verbose.push(message[0] ?? '')
    });

/**
 * A real world whose provider answers every chunk with an empty Overworld chunk, the one at the
 * origin holding each handler's block, and counts what it was asked for.
 */
const worldWithOneChunk = async () => {
    const reads: string[] = [];
    const server = stub<Server>({
        getLogger: () => recordingLogger(),
        getConfig: () => stub<Config>({ getEntityTrackingInterval: () => 20 }),
        getContent: () => serverContent(),
        getEntityRuntime: () => inertEntityRuntime()
    });
    const provider = stub<BaseProvider>({
        readChunk: async (_dimension, x, z) => {
            reads.push(`${x},${z}`);
            const chunk = new Chunk(x, z, new Map(), Dimensions.Overworld);
            if (x !== 0 || z !== 0) return chunk;
            for (const { block, at } of HANDLERS) {
                chunk.setBlockRuntimeId(at.getX(), at.getY(), at.getZ(), BlockRuntimeIds.getByName(block));
            }
            return chunk;
        }
    });
    const world = new World({
        name: 'block-targets',
        path: 'block-targets',
        server,
        level: fakeLevel({ server, provider }),
        stem: TEST_OVERWORLD_STEM,
        generator: stub<Generator>({})
    });
    await world.loadChunk(0, 0);
    reads.length = 0;
    return { world, reads };
};

/**
 * Steve's session in `world`, which records each check `blockTargetRejection` makes: reading the
 * eyes is the reach check, asking for the loaded chunk the chunk check, and reading the block
 * there the read.
 */
const recordingSession = (world: World, steps: Step[] = []) => {
    const recordingWorld = stub<World>({
        getLoadedChunk: (cx, cz) => {
            steps.push('loaded');
            const chunk = world.getLoadedChunk(cx, cz);
            if (chunk === null) return null;
            return stub<Chunk>({
                getBlock: (x, y, z) => {
                    steps.push('read');
                    return chunk.getBlock(x, y, z);
                }
            });
        }
    });
    const session = stub<PlayerSession>({
        identity: STEVE,
        getViewPosition: () => {
            steps.push('reach');
            return EYES;
        },
        getWorld: () => recordingWorld
    });
    return { session, steps };
};

describeFamily(
    FAMILIES.gameplayBlockTargets,
    [REFERENCES.javaServerJar, REFERENCES.bedrockBehaviorPack],
    () => {
        it("checks reach, then that the chunk is loaded, then the block, as Java's packet listener does", async () => {
            const java = pinnedJavaClass(LISTENER);
            const pickBlock = javaSteps(java, 'handlePickItemFromBlock');
            const signUpdate = javaSteps(java, 'updateSignText');

            const { world, reads } = await worldWithOneChunk();
            const target = HANDLERS.find(({ block }) => block === 'minecraft:lectern');
            if (target === undefined) throw new Error('no handler names a lectern');
            const blocks = new Set([target.block]);
            const accepted = recordingSession(world);
            const unloaded = recordingSession(world);
            const outOfReach = recordingSession(world);

            const acceptedRejection = blockTargetRejection(accepted.session, target.at, blocks);
            const unloadedRejection = blockTargetRejection(unloaded.session, UNLOADED_IN_REACH, blocks);
            const outOfReachRejection = blockTargetRejection(outOfReach.session, UNLOADED_OUT_OF_REACH, blocks);

            const orderMatches = accepted.steps.join() === pickBlock.join();
            reportParityCases(FAMILIES.gameplayBlockTargets, import.meta.filename, [
                {
                    id: 'block-target/check-order',
                    title: 'The order of the checks on a block position',
                    context: `Java: ${pickBlock.join(', ')}; server: ${accepted.steps.join(', ')}`,
                    status: orderMatches ? 'passed' : 'failed'
                },
                {
                    id: 'block-target/unloaded-chunk',
                    title: 'A block position in a chunk that is not loaded',
                    context: 'Dropped before the block is read, and the chunk is not loaded',
                    status:
                        unloadedRejection === 'its chunk is not loaded' &&
                        !unloaded.steps.includes('read') &&
                        reads.length === 0
                            ? 'passed'
                            : 'failed'
                }
            ]);

            expect(pickBlock).toEqual(['reach', 'loaded', 'read']);
            expect(signUpdate).toEqual(['loaded', 'read']);

            expect(acceptedRejection).toBeNull();
            expect(accepted.steps).toEqual(pickBlock);
            expect(unloadedRejection).toBe('its chunk is not loaded');
            expect(unloaded.steps).toEqual(['reach', 'loaded']);
            expect(outOfReachRejection).toMatch(/blocks away$/);
            expect(outOfReach.steps).toEqual(['reach']);

            expect(reads).toEqual([]);
            expect(world.getLoadedChunkCount()).toBe(1);
        });

        it('drops each read-lane block packet aimed into an unloaded chunk, and loads nothing', async () => {
            const { world, reads } = await worldWithOneChunk();

            const outcomes = HANDLERS.map(({ packet, at, handle }) => {
                const run = (position: BlockPosition): Logged => {
                    const logged: Logged = { debug: [], verbose: [] };
                    const { session } = recordingSession(world);
                    handle(position, sessionContext(session, { log: recordingLogger(logged) }));
                    return logged;
                };
                return { packet, unloaded: run(UNLOADED_IN_REACH), loaded: run(at) };
            });

            reportParityCases(
                FAMILIES.gameplayBlockTargets,
                import.meta.filename,
                outcomes.map(({ packet, unloaded, loaded }) => ({
                    id: `${packet}/unloaded-chunk`,
                    title: packet,
                    context: 'Dropped when it names a block in a chunk that is not loaded, accepted in a loaded one',
                    status:
                        unloaded.debug.length === 0 &&
                        unloaded.verbose.length === 1 &&
                        unloaded.verbose[0]?.endsWith(': its chunk is not loaded') === true &&
                        loaded.debug.length === 1 &&
                        loaded.verbose.length === 0
                            ? 'passed'
                            : 'failed'
                }))
            );

            for (const { packet, unloaded, loaded } of outcomes) {
                expect({ packet, debug: unloaded.debug, verbose: unloaded.verbose.length }).toEqual({
                    packet,
                    debug: [],
                    verbose: 1
                });
                expect(unloaded.verbose[0]).toMatch(/: its chunk is not loaded$/);
                expect({ packet, debug: loaded.debug.length, verbose: loaded.verbose }).toEqual({
                    packet,
                    debug: 1,
                    verbose: []
                });
            }
            expect(reads).toEqual([]);
            expect(world.getLoadedChunkCount()).toBe(1);
        });
    },
    { tags: ['real-data'] }
);
