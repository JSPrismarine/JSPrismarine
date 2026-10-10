import { Vector3 } from '@jsprismarine/math';
import { PlayerAuthInputData } from '@jsprismarine/minecraft';
import { describe, expect, it, vi } from 'vitest';

import BlockPosition from '../../world/BlockPosition';
import { PlayerAction } from '../packet/PlayerActionPacket';
import PlayerAuthInputPacket from '../packet/PlayerAuthInputPacket';
import PlayerAuthInputHandler from './PlayerAuthInputHandler';

/**
 * A session whose player records what is done to it, and a server that posts nothing.
 *
 * Only what the handler touches is faked, and the movement path goes through the real
 * `applyClientMovement`: the point of these tests is that an input packet reaches the same
 * code a `MovePlayerPacket` does, and the same code a `PlayerActionPacket` does.
 */
const fake = () => {
    const calls: string[] = [];
    const player = {
        isOnline: () => true,
        getPosition: () => new Vector3(0, 64, 0),
        setPosition: vi.fn(
            async ({ position }: { position: Vector3 }) =>
                void calls.push(`move ${position.getX()},${position.getY()},${position.getZ()}`)
        ),
        setOnGround: vi.fn(async (onGround: boolean) => void calls.push(`ground ${onGround}`)),
        addJumpExhaustion: () => calls.push('jump'),
        setSprinting: async (sprinting: boolean) => void calls.push(`sprint ${sprinting}`),
        setSneaking: async (sneaking: boolean) => void calls.push(`sneak ${sneaking}`),
        getRuntimeId: () => 1n,
        getWorld: () => ({
            getPlayers: () => [],
            hitBlock: async (position: BlockPosition, face: number) =>
                void calls.push(`hit ${position.getX()},${position.getY()},${position.getZ()} face ${face}`),
            getBlock: async () => ({ getBreakTime: () => 0 })
        })
    };
    const session = { getPlayer: () => player, sendMove: vi.fn() } as any;
    const server = { post: () => {}, getLogger: () => ({ verbose: () => {} }) } as any;

    return { calls, session, server };
};

const input = (configure: (packet: PlayerAuthInputPacket) => void = () => {}): PlayerAuthInputPacket => {
    const packet = new PlayerAuthInputPacket();
    packet.position = new Vector3(3, 70, -4);
    packet.pitch = 5;
    packet.yaw = 90;
    packet.headYaw = 85;
    configure(packet);
    return packet;
};

describe('PlayerAuthInputHandler', () => {
    it('moves the player to where the input says they are', async () => {
        const { calls, session, server } = fake();

        await new PlayerAuthInputHandler().handle(input(), server, session);

        expect(calls[0]).toBe('move 3,70,-4');
        expect(session.getPlayer().setPosition).toHaveBeenCalledWith(
            { position: new Vector3(3, 70, -4), pitch: 5, yaw: 90, headYaw: 85 },
            false
        );
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

        await new PlayerAuthInputHandler().handle(
            input((packet) => {
                packet.blockActions = [
                    { action: PlayerAction.START_BREAK, position: new BlockPosition(1, -20, 2), face: 1 },
                    { action: PlayerAction.CRACK_BLOCK, position: new BlockPosition(1, -20, 2), face: 1 }
                ];
            }),
            server,
            session
        );

        // The start swings once and a crack swings again: two hits, both on the block named.
        expect(calls.filter((call) => call.startsWith('hit'))).toEqual(['hit 1,-20,2 face 1', 'hit 1,-20,2 face 1']);
    });

    it('does nothing for a player who has not finished joining', async () => {
        const { calls, session, server } = fake();
        session.getPlayer().isOnline = () => false;

        await new PlayerAuthInputHandler().handle(input(), server, session);

        expect(calls).toEqual([]);
    });
});
