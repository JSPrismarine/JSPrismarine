import type { Logger } from '@jsprismarine/logger';
import { Vector3 } from '@jsprismarine/math';
import { Gametype } from '@jsprismarine/minecraft';
import {
    ClientPlayMode,
    HandSlot,
    InputMode,
    ItemUseActionType,
    NewInteractionModel,
    PlayerActionType,
    PlayerAuthInputData
} from '@jsprismarine/protocol';
import PlayerAuthInputPacket from '@jsprismarine/protocol/packet/PlayerAuthInputPacket';
import { Attributes } from '@jsprismarine/protocol/wire/structures/Attribute';
import { describe, expect, it, vi } from 'vitest';

import type { EntityRuntime } from '../../entity/data/EntityRuntime';
import type { LiveEntityRuntime } from '../../entity/data/live';
import { PlayerComponents } from '../../entity/playerComponents';
import type HumanInventory from '../../inventory/HumanInventory';
import { Item } from '../../item/Item';
import { inputContext } from '../../testing/handlerContext.test.helper';
import { identityNamed } from '../../testing/sessionIdentity.test.helper';
import { stubPlayerPort } from '../../testing/playerPort.test.helper';
import { stub } from '../../testing/stub.test.helper';
import type { ShownPlayer } from '../../world/ShownPlayer';
import BlockPosition from '../../world/BlockPosition';
import { Position } from '../../world/Position';
import type { World } from '../../world/World';
import type Chunk from '../../world/chunk/Chunk';
import type PlayerSession from '../PlayerSession';
import type { Arrival } from '../PlayerSession';
import Codec2193 from '../codec/Codec2193';
import type { ServerAuthInputItemUse, ServerPlayerAuthInput } from '../PlayerAuthInputAdapter';
import { playerAuthInputFromProtocol, playerAuthInputToProtocol } from '../PlayerAuthInputAdapter';
import InventoryTransactionHandler from './InventoryTransactionHandler';
import PlayerAuthInputHandler, { rejectionReason } from './PlayerAuthInputHandler';

/**
 * A session whose player records what is done to it, and a server that posts nothing.
 *
 * Only what the handler touches is faked, and the movement path goes through the real
 * `applyClientMovement`: the point of these tests is that an input packet reaches the same
 * code a `MovePlayerPacket` does, and the same code a `PlayerActionPacket` does.
 */
const fake = ({ serverAuthoritativeBreaking = false, changingDimension = false, awaitingTeleport = false } = {}) => {
    const calls: string[] = [];
    const logged: string[] = [];
    const world = stub<World>({
        getViewers: () => [],
        broadcastMove: vi.fn(async () => {}),
        hitBlock: (position, face) =>
            void calls.push(`hit ${position.getX()},${position.getY()},${position.getZ()} face ${face}`),
        // Every chunk is loaded, and every block in it is stone.
        getLoadedChunk: () => stub<Chunk>({}),
        loadedBlockAt: () => ({ name: 'minecraft:stone', states: {} }),
        sendWorldEvent: () => {},
        startBlockCracking: (position, face) => {
            calls.push(`crack ${position.getX()},${position.getY()},${position.getZ()} face ${face}`);
            return null;
        },
        breakBlock: (position) => {
            calls.push(`break ${position.getX()},${position.getY()},${position.getZ()}`);
            return true;
        }
    });
    let groundState = false;
    const components = new PlayerComponents(new Attributes(Attributes.getPlayerDefaults()), () => {});
    const player = stubPlayerPort({
        gamemode: Gametype.SURVIVAL,
        getPosition: () => new Position(0, 64, 0, world),
        isOnGround: () => groundState,
        // The crack animation reads the held item, so the break time is the
        // tool's rather than a fist's.
        getInventory: () => stub<HumanInventory>({ getItemInHand: () => Item.air() }),
        getComponents: () => components
    });
    let joined = true;
    // The runtime that takes the player's inputs.
    const inputs = stub<EntityRuntime>({
        setPlayerMining: () => {},
        playerJumped: () => void calls.push('jump'),
        setPlayerSneaking: (_player, sneaking) => void calls.push(`sneak ${sneaking}`)
    });
    Object.assign(world, { dataEntities: () => stub<LiveEntityRuntime>({ runtime: inputs }) });
    const session = stub<PlayerSession>({
        runtimeId: 1n,
        identity: identityNamed('tester'),
        getPlayer: () => player,
        getWorld: () => world,
        inputs: () => inputs,
        isConnected: () => joined,
        // The move event reads where the player was from the session.
        getViewPosition: () => new Position(0, 64, 0, world),
        shown: () => stub<ShownPlayer>({}),
        setPlayerPosition: vi.fn(
            async ({ position }: { position: Vector3 }) =>
                void calls.push(`move ${position.getX()},${position.getY()},${position.getZ()}`)
        ),
        setOnGround: vi.fn((onGround: boolean) => {
            groundState = onGround;
            calls.push(`ground ${onGround}`);
        }),
        setSprinting: async (sprinting: boolean) => void calls.push(`sprint ${sprinting}`),
        getConnection: () => stub<ReturnType<PlayerSession['getConnection']>>({ codec: Codec2193 }),
        sendMove: vi.fn(),
        recordInputTick: vi.fn(),
        pendingDimensionChange: () =>
            changingDimension ? { loadingScreenId: 3, arrival: stub<Arrival>() } : undefined,
        pendingCreditsArrival: () => undefined,
        holdsMovementForTeleport: (_position, handledTeleport) => awaitingTeleport && !handledTeleport
    });

    return {
        calls,
        logged,
        player,
        session,
        log: stub<Logger>({ verbose: () => {}, debug: (...message) => void logged.push(String(message[0] ?? '')) }),
        config: { getServerAuthoritativeBlockBreaking: () => serverAuthoritativeBreaking },
        services: { events: { post: () => 0, emit: async () => {} } },
        leave: () => {
            joined = false;
        }
    };
};

type Scene = ReturnType<typeof fake>;

/** The context of one input from the scene's player, with what it defers and sends kept. */
const contextOf = ({ session, log, config, services }: Scene) => inputContext(session, { log, config, services });

/** Applies one input as the input step does: the handler, then what it sent. */
const handle = async (scene: Scene, packet: PlayerAuthInputPacket): Promise<void> => {
    const { context, settled } = contextOf(scene);
    new PlayerAuthInputHandler().handle(packet, context);
    await settled();
};

const input = (configure: (input: ServerPlayerAuthInput) => void = () => {}): PlayerAuthInputPacket => {
    const input: ServerPlayerAuthInput = {
        pitch: 5,
        yaw: 90,
        position: new Vector3(3, 70, -4),
        moveVector: { x: 0, y: 0 },
        headYaw: 85,
        inputData: new Set(),
        inputMode: InputMode.Undefined,
        playMode: ClientPlayMode.Normal,
        interactionModel: NewInteractionModel.Touch,
        interactRotation: { x: 5, y: 90 },
        tick: 0n,
        delta: Vector3.ZERO,
        itemUseTransaction: null,
        itemStackRequest: null,
        blockActions: null,
        vehicleRotation: null,
        predictedVehicle: null,
        analogMoveVector: { x: 0, y: 0 },
        cameraOrientation: Vector3.ZERO,
        rawMoveVector: { x: 0, y: 0 }
    };
    configure(input);
    return new PlayerAuthInputPacket(playerAuthInputToProtocol(input, Codec2193.context));
};

/** Two block actions on one block, with the flag the docs gate them on. */
const breaking = (packet: ServerPlayerAuthInput): void => {
    packet.inputData.add(PlayerAuthInputData.PERFORM_BLOCK_ACTIONS);
    packet.blockActions = [
        { action: PlayerActionType.StartDestroyBlock, position: new BlockPosition(1, 63, 2), face: 1 },
        { action: PlayerActionType.CrackBlock, position: new BlockPosition(1, 63, 2), face: 1 }
    ];
};

/** A block placement carried inside a PlayerAuthInput item-use section. */
const blockPlacement = (): ServerAuthInputItemUse => ({
    legacyRequestId: 0,
    legacySlotChanges: [],
    actions: [],
    data: {
        kind: 'useItem',
        actionType: ItemUseActionType.PLACE,
        triggerType: 1,
        blockPosition: new BlockPosition(1, 63, 2),
        blockFace: 1,
        hotbarSlot: 0,
        hand: HandSlot.MAINHAND,
        itemInHand: Item.air(),
        playerPosition: Vector3.ZERO,
        clickPosition: Vector3.ZERO,
        blockRuntimeId: 0,
        clientInteractPrediction: 1,
        clientCooldownState: 0
    }
});

describe('PlayerAuthInputHandler', () => {
    it('moves the player to where the input says they are', async () => {
        const scene = fake();
        const { calls, session } = scene;

        await handle(scene, input());

        expect(calls[0]).toBe('move 3,70,-4');
        expect(session.setPlayerPosition).toHaveBeenCalledWith(
            { position: new Vector3(3, 70, -4), pitch: 5, yaw: 90, headYaw: 85 },
            false
        );
    });

    it('passes the interaction rotation to the embedded item use without changing movement rotation', async () => {
        const scene = fake();
        const { session } = scene;
        const handleTransaction = vi.spyOn(InventoryTransactionHandler.prototype, 'handle').mockReturnValue(undefined);

        try {
            await handle(
                scene,
                input((packet) => {
                    packet.inputData.add(PlayerAuthInputData.PERFORM_ITEM_INTERACTION);
                    packet.interactRotation = { x: -25, y: 135 };
                    packet.itemUseTransaction = blockPlacement();
                })
            );

            expect(session.setPlayerPosition).toHaveBeenCalledWith(
                { position: new Vector3(3, 70, -4), pitch: 5, yaw: 90, headYaw: 85 },
                false
            );
            expect(handleTransaction.mock.calls[0]?.[2]).toEqual({ pitch: -25, yaw: 135 });
        } finally {
            handleTransaction.mockRestore();
        }
    });

    it('applies a movement and a jump in its own unit, deferring nothing', () => {
        const scene = fake();
        const { context } = contextOf(scene);

        new PlayerAuthInputHandler().handle(
            input((packet) => packet.inputData.add(PlayerAuthInputData.START_JUMPING)),
            context
        );

        expect(scene.calls).toEqual(['move 3,70,-4', 'jump']);
    });

    it('applies an item use after the break before it, both in the handler', () => {
        // A client that breaks a block and places one in the same tick reports both in one
        // input. Applied at once, the placement would land before the break it came after.
        const scene = fake({ serverAuthoritativeBreaking: true });
        const use = vi.spyOn(InventoryTransactionHandler.prototype, 'handle').mockImplementation(() => {
            scene.calls.push('use');
            return undefined;
        });

        try {
            const { context } = contextOf(scene);
            new PlayerAuthInputHandler().handle(
                input((packet) => {
                    packet.inputData.add(PlayerAuthInputData.PERFORM_BLOCK_ACTIONS);
                    packet.blockActions = [
                        { action: PlayerActionType.PredictDestroyBlock, position: new BlockPosition(1, 63, 2), face: 1 }
                    ];
                    packet.inputData.add(PlayerAuthInputData.PERFORM_ITEM_INTERACTION);
                    packet.itemUseTransaction = blockPlacement();
                }),
                context
            );

            // The break, then the use, in the order the client gave them.
            expect(scene.calls).toEqual(['move 3,70,-4', 'break 1,63,2', 'use']);
        } finally {
            use.mockRestore();
        }
    });

    it('takes a vertical collision as standing on the ground', async () => {
        const scene = fake();
        const { calls } = scene;

        await handle(
            scene,
            input((packet) => packet.inputData.add(PlayerAuthInputData.VERTICAL_COLLISION))
        );
        await handle(scene, input());

        expect(calls.filter((call) => call.startsWith('ground'))).toEqual(['ground true', 'ground false']);
    });

    it('treats the flags that used to be actions as those actions', async () => {
        const scene = fake();
        const { calls } = scene;

        await handle(
            scene,
            input((packet) => {
                packet.inputData.add(PlayerAuthInputData.START_JUMPING);
                packet.inputData.add(PlayerAuthInputData.START_SPRINTING);
                packet.inputData.add(PlayerAuthInputData.STOP_SNEAKING);
            })
        );

        expect(calls).toContain('jump');
        expect(calls).toContain('sprint true');
        expect(calls).toContain('sneak false');
    });

    it('hands each block action to the action handler, block and face intact', async () => {
        const scene = fake();
        const { calls } = scene;

        await handle(scene, input(breaking));

        // With the client timing breaks, the start swings once and a crack swings again: two
        // hits, both on the block named.
        expect(calls.filter((call) => call.startsWith('hit'))).toEqual(['hit 1,63,2 face 1', 'hit 1,63,2 face 1']);
    });

    it('cracks, swings and breaks in order when the server times breaks', async () => {
        const scene = fake({ serverAuthoritativeBreaking: true });
        const { calls } = scene;

        await handle(
            scene,
            input((packet) => {
                breaking(packet);
                packet.blockActions?.push({
                    action: PlayerActionType.PredictDestroyBlock,
                    position: new BlockPosition(1, 63, 2),
                    face: 1
                });
            })
        );

        // The start starts the cracks, a crack swings, and the predicted destroy breaks the
        // block, as a client running server-authoritative block breaking reports it.
        expect(calls.filter((call) => /^(crack|hit|break)/.test(call))).toEqual([
            'crack 1,63,2 face 1',
            'hit 1,63,2 face 1',
            'break 1,63,2'
        ]);
    });

    it('ignores block actions sent without the PerformBlockActions flag, and still moves', async () => {
        const scene = fake();
        const { calls, logged } = scene;

        await handle(
            scene,
            input((packet) => {
                breaking(packet);
                packet.inputData.delete(PlayerAuthInputData.PERFORM_BLOCK_ACTIONS);
            })
        );

        expect(calls.filter((call) => call.startsWith('hit'))).toEqual([]);
        expect(calls[0]).toBe('move 3,70,-4');
        expect(logged).toEqual([
            'Ignored the Player Block Actions of an input from tester: the PERFORM_BLOCK_ACTIONS flag is not set'
        ]);
    });

    it('ignores an item use sent without the PerformItemInteraction flag', async () => {
        const scene = fake();
        const { calls, logged } = scene;

        await handle(
            scene,
            input((packet) => {
                packet.itemUseTransaction = {
                    legacyRequestId: 0,
                    legacySlotChanges: [],
                    actions: [],
                    data: {
                        kind: 'useItem',
                        actionType: ItemUseActionType.DESTROY,
                        triggerType: 1,
                        blockPosition: new BlockPosition(1, 63, 2),
                        blockFace: 1,
                        hotbarSlot: 0,
                        hand: HandSlot.MAINHAND,
                        itemInHand: Item.air(),
                        playerPosition: Vector3.ZERO,
                        clickPosition: Vector3.ZERO,
                        blockRuntimeId: 0,
                        clientInteractPrediction: 1,
                        clientCooldownState: 0
                    }
                };
            })
        );

        expect(calls[0]).toBe('move 3,70,-4');
        expect(logged).toEqual([
            'Ignored the Item Use Transaction of an input from tester: the PERFORM_ITEM_INTERACTION flag is not set'
        ]);
    });

    it('ignores where an input says the player is until the client has handled a teleport', async () => {
        // A client goes on sending its old position until it applies the teleport. Taking it
        // would move the player back on the server while the client stands at the target.
        const scene = fake({ awaitingTeleport: true });
        const { session } = scene;

        await handle(scene, input());
        expect(session.setPlayerPosition).not.toHaveBeenCalled();

        await handle(
            scene,
            input((packet) => packet.inputData.add(PlayerAuthInputData.HANDLED_TELEPORT))
        );
        expect(session.setPlayerPosition).toHaveBeenCalledOnce();
    });

    it('drops the whole input while a dimension change is pending, after recording its tick', async () => {
        const scene = fake({ changingDimension: true });
        const { calls, session } = scene;

        await handle(
            scene,
            input((packet) => {
                packet.tick = 12n;
                breaking(packet);
            })
        );

        expect(session.recordInputTick).toHaveBeenCalledWith(12n);
        expect(session.setPlayerPosition).not.toHaveBeenCalled();
        expect(calls).toEqual([]);
    });

    it('does nothing for a player who has not finished joining', async () => {
        const scene = fake();
        const { calls, leave } = scene;
        leave();

        await handle(scene, input());

        expect(calls).toEqual([]);
    });

    it('records the input tick before anything else, so later packets can echo it', async () => {
        const scene = fake();
        const { session } = scene;

        await handle(
            scene,
            input((packet) => {
                packet.tick = 4242n;
            })
        );

        expect(session.recordInputTick).toHaveBeenCalledWith(4242n);
    });

    it('records the tick of an input from a player who has not finished joining', async () => {
        const scene = fake();
        const { leave, session } = scene;
        leave();

        await handle(
            scene,
            input((packet) => {
                packet.tick = 7n;
            })
        );

        expect(session.recordInputTick).toHaveBeenCalledWith(7n);
    });

    it('accepts every mode the docs define, including the ones the 1.26.51 page left out', async () => {
        const scene = fake();
        const { calls } = scene;

        await handle(
            scene,
            input((packet) => {
                packet.inputMode = InputMode.MotionController_Deprecated;
                packet.playMode = ClientPlayMode.ExitLevel;
                packet.interactionModel = NewInteractionModel.Touch;
            })
        );

        expect(calls[0]).toBe('move 3,70,-4');
    });

    describe('drops, without throwing, an input that', () => {
        const dropped = async (configure: (input: ServerPlayerAuthInput) => void, reason: string) => {
            const scene = fake();
            const { calls, logged, session } = scene;

            await handle(scene, input(configure));

            expect(calls).toEqual([]);
            expect(session.recordInputTick).not.toHaveBeenCalled();
            expect(logged).toEqual([`Dropped an input from tester: ${reason}`]);
        };

        it('sets a flag that does not exist', async () => {
            // 2 is the gap the 1.26.51 docs page papers over: a reader that numbers the
            // members consecutively would take it for JumpDown.
            await dropped((packet) => packet.inputData.add(2), 'input flag 2 does not exist');
        });

        it('names an input mode at or past Count', async () => {
            await dropped((packet) => {
                packet.inputMode = InputMode.Count;
            }, 'input mode 5 is out of range');
        });

        it('names a play mode at or past NumModes', async () => {
            await dropped((packet) => {
                packet.playMode = ClientPlayMode.NumModes;
            }, 'play mode 9 is out of range');
        });

        it('names a negative interaction model', async () => {
            await dropped((packet) => {
                packet.interactionModel = -1;
            }, 'interaction model -1 is out of range');
        });

        it('reports a position that is not a number', async () => {
            await dropped((packet) => {
                packet.position = new Vector3(Number.NaN, 70, -4);
            }, 'the position is not finite');
        });

        it('reports an infinite rotation', async () => {
            await dropped((packet) => {
                packet.yaw = Number.POSITIVE_INFINITY;
            }, 'the rotation is not finite');
        });

        it('reports a non-finite interaction rotation', async () => {
            await dropped((packet) => {
                packet.inputData.add(PlayerAuthInputData.PERFORM_ITEM_INTERACTION);
                packet.itemUseTransaction = blockPlacement();
                packet.interactRotation.y = Number.NaN;
            }, 'the interaction rotation is not finite');
        });

        it('carries a block action the field may not hold', async () => {
            await dropped((packet) => {
                packet.inputData.add(PlayerAuthInputData.PERFORM_BLOCK_ACTIONS);
                packet.blockActions = [
                    { action: PlayerActionType.Respawn, position: new BlockPosition(0, 0, 0), face: 0 }
                ];
            }, `block action ${PlayerActionType.Respawn} is not one the input may carry`);
        });
    });

    it('finds nothing wrong with the six block actions the docs list', () => {
        for (const action of [
            PlayerActionType.StartDestroyBlock,
            PlayerActionType.AbortDestroyBlock,
            PlayerActionType.StopDestroyBlock,
            PlayerActionType.CrackBlock,
            PlayerActionType.PredictDestroyBlock,
            PlayerActionType.ContinueDestroyBlock
        ]) {
            const packet = input((packet) => {
                packet.blockActions = [{ action, position: new BlockPosition(0, 0, 0), face: 0 }];
            });

            const packetData = packet.getPacketData();
            if (packetData === null) throw new Error('PlayerAuthInput test packet has no data');
            expect(rejectionReason(playerAuthInputFromProtocol(packetData, Codec2193.context))).toBeNull();
        }
    });
});
