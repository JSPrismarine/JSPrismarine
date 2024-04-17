import { WorldEvent } from '../packet/WorldEventPacket';

import type { PlayerSession } from '../../';
import type Server from '../../Server';
import { BlockMappings } from '../../block/BlockMappings';
import Identifiers from '../Identifiers';
import type PlayerActionPacket from '../packet/PlayerActionPacket';
import { PlayerAction } from '../packet/PlayerActionPacket';
import type PacketHandler from './PacketHandler';

export default class PlayerActionHandler implements PacketHandler<PlayerActionPacket> {
    public static NetID = Identifiers.PlayerActionPacket;

    public async handle(packet: PlayerActionPacket, server: Server, session: PlayerSession): Promise<void> {
        const player = session.getPlayer();
        const world = player.getWorld();

        const block = await world.getBlock(
            packet.blockPosition.getX(),
            packet.blockPosition.getY(),
            packet.blockPosition.getZ()
        );

        switch (packet.action) {
            case PlayerAction.START_BREAK: {
                const breakTime = Math.ceil(block.getBreakTime(null, server) * 20); // TODO: calculate with item in hand

                await world.sendWorldEvent(packet.blockPosition, WorldEvent.BLOCK_START_BREAK, 65535 / breakTime);
                return;
            }

            case PlayerAction.ABORT_BREAK: {
                await world.sendWorldEvent(packet.blockPosition, WorldEvent.BLOCK_STOP_BREAK, 0);
                return;
            }

            case PlayerAction.STOP_BREAK: {
                // Handled in InventoryTransactionHandler
                return;
            }

            case PlayerAction.CONTINUE_DESTROY_BLOCK:
            case PlayerAction.CREATIVE_PLAYER_DESTROY_BLOCK: {
                await world.sendWorldEvent(
                    packet.blockPosition,
                    WorldEvent.PARTICLE_DESTROY_BLOCK,
                    BlockMappings.getRuntimeId(block.getName())
                );
                return;
            }

            case PlayerAction.CRACK_BLOCK: {
                // TODO: Handle this.
                return;
            }

            case PlayerAction.RESPAWN: {
                return;
            }

            case PlayerAction.JUMP: {
                return;
            }

            case PlayerAction.START_SPRINT: {
                await player.setSprinting(true);
                return;
            }
            case PlayerAction.STOP_SPRINT: {
                await player.setSprinting(false);
                return;
            }

            case PlayerAction.START_SNEAK: {
                await player.setSneaking(true);
                return;
            }
            case PlayerAction.STOP_SNEAK: {
                await player.setSneaking(false);
                return;
            }

            default: {
                server.getLogger().verbose(`Unhandled player action: ${packet.action}`);
                break;
            }
        }
    }
}
