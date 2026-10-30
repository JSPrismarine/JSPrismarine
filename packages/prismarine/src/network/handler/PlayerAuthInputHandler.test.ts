import type { Logger } from '@jsprismarine/logger';
import { Vector3 } from '@jsprismarine/math';
import { Gametype, PlayerAuthInputData } from '@jsprismarine/minecraft';
import { PlayerActionType } from '@jsprismarine/protocol';
import { describe, expect, it, vi } from 'vitest';

import type Player from '../../Player';
import type Server from '../../Server';
import type { Block } from '../../block/Block';
import type { Config } from '../../config/Config';
import type HumanInventory from '../../inventory/HumanInventory';
import { Item } from '../../item/Item';
import { stub } from '../../testing/stub.test.helper';
import BlockPosition from '../../world/BlockPosition';
import { Position } from '../../world/Position';
import type { World } from '../../world/World';
import type PlayerSession from '../PlayerSession';
import Codec2193 from '../codec/Codec2193';
import { HandSlot, ItemUseActionType } from '@jsprismarine/protocol';
import PlayerAuthInputPacket, { ClientPlayMode, InputMode, NewInteractionModel } from '../packet/PlayerAuthInputPacket';
import InventoryTransactionHandler from './InventoryTransactionHandler';
import PlayerAuthInputHandler, { rejectionReason } from './PlayerAuthInputHandler';

/**
 * A session whose player records what is done to it, and a server that posts nothing.
 *
 * Only what the handler touches is faked, and the movement path goes through the real
 * `applyClientMovement`: the point of these tests is that an input packet reaches the same
 * code a `MovePlayerPacket` does, and the same code a `PlayerActionPacket` does.
 */
const fake = ({ serverAuthoritativeBreaking = false } = {}) => {
    const calls: string[] = [];
    const logged: string[] = [];
    const world = stub<World>({
        getPlayers: () => [],
        hitBlock: async (position, face) =>
            void calls.push(`hit ${position.getX()},${position.getY()},${position.getZ()} face ${face}`),
        getBlock: async () => stub<Block>({ getBreakTime: () => 0 }),
        startBlockCracking: async (position, face) => {
            calls.push(`crack ${position.getX()},${position.getY()},${position.getZ()} face ${face}`);
            return null;
        },
        breakBlock: async (position) => {
            calls.push(`break ${position.getX()},${position.getY()},${position.getZ()}`);
            return true;
        }
    });
    const player = stub<Player>({
        isOnline: () => true,
        gamemode: Gametype.SURVIVAL,
        getName: () => 'tester',
        getPosition: () => new Position(0, 64, 0, world),
        setPosition: vi.fn(
            async ({ position }: { position: Vector3 }) =>
                void calls.push(`move ${position.getX()},${position.getY()},${position.getZ()}`)
        ),
        setOnGround: vi.fn(async (onGround: boolean) => void calls.push(`ground ${onGround}`)),
        addJumpExhaustion: () => void calls.push('jump'),
        setSprinting: async (sprinting) => void calls.push(`sprint ${sprinting}`),
        setSneaking: async (sneaking) => void calls.push(`sneak ${sneaking}`),
        getRuntimeId: () => 1n,
        getWorld: () => world,
        // The crack animation reads the held item, so the break time is the
        // tool's rather than a fist's.
        getInventory: () => stub<HumanInventory>({ getItemInHand: () => Item.air() }),
        getMining: () => null,
        setMining: () => {}
    });
    const session = stub<PlayerSession>({
        getPlayer: () => player,
        getConnection: () => stub<ReturnType<PlayerSession['getConnection']>>({ codec: Codec2193 }),
        sendMove: vi.fn(),
        recordInputTick: vi.fn()
    });
    const server = stub<Server>({
        post: () => 0,
        getConfig: () => stub<Config>({ getServerAuthoritativeBlockBreaking: () => serverAuthoritativeBreaking }),
        getLogger: () =>
            stub<Logger>({ verbose: () => {}, debug: (...message) => void logged.push(String(message[0] ?? '')) })
    });

    return { calls, logged, player, session, server };
};

const input = (configure: (packet: PlayerAuthInputPacket) => void = () => {}): PlayerAuthInputPacket => {
    const packet = new PlayerAuthInputPacket();
    packet.position = new Vector3(3, 70, -4);
    packet.pitch = 5;
    packet.yaw = 90;
    packet.headYaw = 85;
    packet.interactRotation = { x: packet.pitch, y: packet.yaw };
    configure(packet);
    return packet;
};

/** Two block actions on one block, with the flag the docs gate them on. */
const breaking = (packet: PlayerAuthInputPacket): void => {
    packet.inputData.add(PlayerAuthInputData.PERFORM_BLOCK_ACTIONS);
    packet.blockActions = [
        { action: PlayerActionType.StartDestroyBlock, position: new BlockPosition(1, 63, 2), face: 1 },
        { action: PlayerActionType.CrackBlock, position: new BlockPosition(1, 63, 2), face: 1 }
    ];
};

/** A block placement carried inside a PlayerAuthInput item-use section. */
const blockPlacement = (): NonNullable<PlayerAuthInputPacket['itemUseTransaction']> => ({
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
        itemInHand: stub(),
        playerPosition: Vector3.ZERO,
        clickPosition: Vector3.ZERO,
        blockRuntimeId: 0,
        clientInteractPrediction: 1,
        clientCooldownState: 0
    }
});

describe('PlayerAuthInputHandler', () => {
    it('moves the player to where the input says they are', async () => {
        const { calls, player, session, server } = fake();

        await new PlayerAuthInputHandler().handle(input(), server, session);

        expect(calls[0]).toBe('move 3,70,-4');
        expect(player.setPosition).toHaveBeenCalledWith(
            { position: new Vector3(3, 70, -4), pitch: 5, yaw: 90, headYaw: 85 },
            false
        );
    });

    it('passes the interaction rotation to the embedded item use without changing movement rotation', async () => {
        const { player, session, server } = fake();
        const handleTransaction = vi.spyOn(InventoryTransactionHandler.prototype, 'handle').mockResolvedValue();

        try {
            await new PlayerAuthInputHandler().handle(
                input((packet) => {
                    packet.inputData.add(PlayerAuthInputData.PERFORM_ITEM_INTERACTION);
                    packet.interactRotation = { x: -25, y: 135 };
                    packet.itemUseTransaction = blockPlacement();
                }),
                server,
                session
            );

            expect(player.setPosition).toHaveBeenCalledWith(
                { position: new Vector3(3, 70, -4), pitch: 5, yaw: 90, headYaw: 85 },
                false
            );
            expect(handleTransaction.mock.calls[0]?.[3]).toEqual({ pitch: -25, yaw: 135 });
        } finally {
            handleTransaction.mockRestore();
        }
    });

    it('takes a vertical collision as standing on the ground', async () => {
        const { calls, session, server } = fake();

        await new PlayerAuthInputHandler().handle(
            input((packet) => packet.inputData.add(PlayerAuthInputData.VERTICAL_COLLISION)),
            server,
            session
        );
        await new PlayerAuthInputHandler().handle(input(), server, session);

        expect(calls.filter((call) => call.startsWith('ground'))).toEqual(['ground true', 'ground false']);
    });

    it('treats the flags that used to be actions as those actions', async () => {
        const { calls, session, server } = fake();

        await new PlayerAuthInputHandler().handle(
            input((packet) => {
                packet.inputData.add(PlayerAuthInputData.START_JUMPING);
                packet.inputData.add(PlayerAuthInputData.START_SPRINTING);
                packet.inputData.add(PlayerAuthInputData.STOP_SNEAKING);
            }),
            server,
            session
        );

        expect(calls).toContain('jump');
        expect(calls).toContain('sprint true');
        expect(calls).toContain('sneak false');
    });

    it('hands each block action to the action handler, block and face intact', async () => {
        const { calls, session, server } = fake();

        await new PlayerAuthInputHandler().handle(input(breaking), server, session);

        // With the client timing breaks, the start swings once and a crack swings again: two
        // hits, both on the block named.
        expect(calls.filter((call) => call.startsWith('hit'))).toEqual(['hit 1,63,2 face 1', 'hit 1,63,2 face 1']);
    });

    it('cracks, swings and breaks in order when the server times breaks', async () => {
        const { calls, session, server } = fake({ serverAuthoritativeBreaking: true });

        await new PlayerAuthInputHandler().handle(
            input((packet) => {
                breaking(packet);
                packet.blockActions?.push({
                    action: PlayerActionType.PredictDestroyBlock,
                    position: new BlockPosition(1, 63, 2),
                    face: 1
                });
            }),
            server,
            session
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
        const { calls, logged, session, server } = fake();

        await new PlayerAuthInputHandler().handle(
            input((packet) => {
                breaking(packet);
                packet.inputData.delete(PlayerAuthInputData.PERFORM_BLOCK_ACTIONS);
            }),
            server,
            session
        );

        expect(calls.filter((call) => call.startsWith('hit'))).toEqual([]);
        expect(calls[0]).toBe('move 3,70,-4');
        expect(logged).toEqual([
            'Ignored the Player Block Actions of an input from tester: the PERFORM_BLOCK_ACTIONS flag is not set'
        ]);
    });

    it('ignores an item use sent without the PerformItemInteraction flag', async () => {
        const { calls, logged, session, server } = fake();

        await new PlayerAuthInputHandler().handle(
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
                        itemInHand: stub(),
                        playerPosition: Vector3.ZERO,
                        clickPosition: Vector3.ZERO,
                        blockRuntimeId: 0,
                        clientInteractPrediction: 1,
                        clientCooldownState: 0
                    }
                };
            }),
            server,
            session
        );

        expect(calls[0]).toBe('move 3,70,-4');
        expect(logged).toEqual([
            'Ignored the Item Use Transaction of an input from tester: the PERFORM_ITEM_INTERACTION flag is not set'
        ]);
    });

    it('does nothing for a player who has not finished joining', async () => {
        const { calls, player, session, server } = fake();
        player.isOnline = () => false;

        await new PlayerAuthInputHandler().handle(input(), server, session);

        expect(calls).toEqual([]);
    });

    it('records the input tick before anything else, so later packets can echo it', async () => {
        const { session, server } = fake();

        await new PlayerAuthInputHandler().handle(
            input((packet) => {
                packet.tick = 4242n;
            }),
            server,
            session
        );

        expect(session.recordInputTick).toHaveBeenCalledWith(4242n);
    });

    it('records the tick of an input from a player who has not finished joining', async () => {
        const { player, session, server } = fake();
        player.isOnline = () => false;

        await new PlayerAuthInputHandler().handle(
            input((packet) => {
                packet.tick = 7n;
            }),
            server,
            session
        );

        expect(session.recordInputTick).toHaveBeenCalledWith(7n);
    });

    it('accepts every mode the docs define, including the ones the 1.26.51 page left out', async () => {
        const { calls, session, server } = fake();

        await new PlayerAuthInputHandler().handle(
            input((packet) => {
                packet.inputMode = InputMode.MotionController_Deprecated;
                packet.playMode = ClientPlayMode.ExitLevel;
                packet.interactionModel = NewInteractionModel.Touch;
            }),
            server,
            session
        );

        expect(calls[0]).toBe('move 3,70,-4');
    });

    describe('drops, without throwing, an input that', () => {
        const dropped = async (configure: (packet: PlayerAuthInputPacket) => void, reason: string) => {
            const { calls, logged, session, server } = fake();

            await new PlayerAuthInputHandler().handle(input(configure), server, session);

            expect(calls).toEqual([]);
            expect(session.recordInputTick).not.toHaveBeenCalled();
            expect(logged).toEqual([`Dropped an input from tester: ${reason}`]);
        };

        it('sets a flag that does not exist', async () => {
            // 2 is the gap the 1.26.51 docs page papers over: a reader that numbers the
            // members consecutively would take it for JumpDown.
            // @ts-expect-error - 2 is not a member, which is exactly what the guard rejects.
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

            expect(rejectionReason(packet)).toBeNull();
        }
    });
});
