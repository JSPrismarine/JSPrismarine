import type { Logger } from '@jsprismarine/logger';
import { Vector3 } from '@jsprismarine/math';
import { Gametype, PlayerAuthInputData } from '@jsprismarine/minecraft';
import { describe, expect, it, vi } from 'vitest';

import type Player from '../../Player';
import type Server from '../../Server';
import type { Block } from '../../block/Block';
import { stub } from '../../testing/stub.test.helper';
import BlockPosition from '../../world/BlockPosition';
import { Position } from '../../world/Position';
import type { World } from '../../world/World';
import type PlayerSession from '../PlayerSession';
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
    const world = stub<World>({
        getPlayers: () => [],
        hitBlock: async (position, face) =>
            void calls.push(`hit ${position.getX()},${position.getY()},${position.getZ()} face ${face}`),
        getBlock: async () => stub<Block>({ getBreakTime: () => 0 })
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
        getWorld: () => world
    });
    const session = stub<PlayerSession>({ getPlayer: () => player, sendMove: vi.fn() });
    const server = stub<Server>({ post: () => 0, getLogger: () => stub<Logger>({ verbose: () => {} }) });

    return { calls, player, session, server };
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
        const { calls, player, session, server } = fake();

        await new PlayerAuthInputHandler().handle(input(), server, session);

        expect(calls[0]).toBe('move 3,70,-4');
        expect(player.setPosition).toHaveBeenCalledWith(
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
                    { action: PlayerAction.START_BREAK, position: new BlockPosition(1, 63, 2), face: 1 },
                    { action: PlayerAction.CRACK_BLOCK, position: new BlockPosition(1, 63, 2), face: 1 }
                ];
            }),
            server,
            session
        );

        // The start swings once and a crack swings again: two hits, both on the block named.
        expect(calls.filter((call) => call.startsWith('hit'))).toEqual(['hit 1,63,2 face 1', 'hit 1,63,2 face 1']);
    });

    it('does nothing for a player who has not finished joining', async () => {
        const { calls, player, session, server } = fake();
        player.isOnline = () => false;

        await new PlayerAuthInputHandler().handle(input(), server, session);

        expect(calls).toEqual([]);
    });
});
