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

        switch (packet.action) {
            case PlayerAction.START_BREAK: {
                const block = await player
                    .getWorld()
                    .getBlock(packet.blockPosition.getX(), packet.blockPosition.getY(), packet.blockPosition.getZ());

                const breakTime = Math.ceil(block.getBreakTime(null, server) * 20); // TODO: calculate with item in hand
                await player
                    .getWorld()
                    .sendWorldEvent(packet.blockPosition, WorldEvent.BLOCK_START_BREAK, 65535 / breakTime);
                break;
            }

            case PlayerAction.ABORT_BREAK: {
                await player.getWorld().sendWorldEvent(packet.blockPosition, WorldEvent.BLOCK_STOP_BREAK, 0);
                break;
            }

            case PlayerAction.STOP_BREAK: {
                // Handled in InventoryTransactionHandler
                break;
            }

            case PlayerAction.CONTINUE_DESTROY_BLOCK: {
                const chunk = await player
                    .getWorld()
                    .getChunkAt(packet.blockPosition.getX(), packet.blockPosition.getZ());

                const blockId = chunk.getBlock(
                    packet.blockPosition.getX(),
                    packet.blockPosition.getY(),
                    packet.blockPosition.getZ()
                );

                await player.getWorld().sendWorldEvent(
                    packet.blockPosition,
                    WorldEvent.PARTICLE_DESTROY_BLOCK,
                    BlockMappings.getRuntimeId(
                        server.getBlockManager().getBlockByIdAndMeta(blockId.id, blockId.meta)!.getName() // TODO: fix this.
                    )
                );
                break;
            }

            case PlayerAction.CRACK_BLOCK: {
                // TODO: Handle this.
                break;
            }

            case PlayerAction.RESPAWN: {
                break;
            }

            case PlayerAction.JUMP: {
                break;
            }

            case PlayerAction.START_SPRINT: {
                await player.setSprinting(false);
                break;
            }

            case PlayerAction.START_SNEAK: {
                await player.setSneaking(true);
                break;
            }

            case PlayerAction.STOP_SNEAK: {
                await player.setSneaking(false);
                break;
            }

            case PlayerAction.CREATIVE_PLAYER_DESTROY_BLOCK: {
                // Handled in InventoryTransactionHandler
                break;
            }

            default: {
                server.getLogger().verbose(`Unhandled player action: ${packet.action}`);
            }
        }
    }
}
