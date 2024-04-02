import WorldEventPacket, { WorldEvent } from '../packet/WorldEventPacket';

import { BlockMappings } from '../../block/BlockMappings';
import Identifiers from '../Identifiers';
import type PacketHandler from './PacketHandler';
import { PlayerAction } from '../packet/PlayerActionPacket';
import type PlayerActionPacket from '../packet/PlayerActionPacket';
import type { PlayerSession } from '../../';
import type Server from '../../Server';

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

                // TODO: world.sendEvent(type, position(Vector3), data) (?)
                const pk = new WorldEventPacket();
                pk.eventId = WorldEvent.BLOCK_START_BREAK;
                pk.position = packet.blockPosition;
                pk.data = 65535 / breakTime;

                await Promise.all(
                    player
                        .getPlayersInChunk()
                        .map(async (nearbyPlayer) =>
                            nearbyPlayer.getNetworkSession().getConnection().sendDataPacket(pk)
                        )
                );

                break;
            }

            case PlayerAction.ABORT_BREAK: {
                // Gets called when player didn't finished
                // to break the block
                const pk = new WorldEventPacket();
                pk.eventId = WorldEvent.BLOCK_STOP_BREAK;
                pk.position = packet.blockPosition;
                pk.data = 0;

                await Promise.all(
                    player
                        .getPlayersInChunk()
                        .map(async (nearbyPlayer) =>
                            nearbyPlayer.getNetworkSession().getConnection().sendDataPacket(pk)
                        )
                );
                break;
            }

            case PlayerAction.STOP_BREAK: {
                // Handled in InventoryTransactionHandler
                break;
            }

            case PlayerAction.CONTINUE_DESTROY_BLOCK: {
                // This fires twice in creative.. wtf Mojang?
                const chunk = await player
                    .getWorld()
                    .getChunkAt(packet.blockPosition.getX(), packet.blockPosition.getZ());

                const blockId = chunk.getBlock(
                    packet.blockPosition.getX(),
                    packet.blockPosition.getY(),
                    packet.blockPosition.getZ()
                );

                // TODO
                const pk = new WorldEventPacket();
                pk.eventId = WorldEvent.PARTICLE_DESTROY_BLOCK;
                pk.position = packet.blockPosition;
                pk.data = BlockMappings.getRuntimeId(
                    server.getBlockManager().getBlockByIdAndMeta(blockId.id, blockId.meta).getName()
                );

                await Promise.all(
                    player
                        .getPlayersInChunk()
                        .map(async (nearbyPlayer) =>
                            nearbyPlayer.getNetworkSession().getConnection().sendDataPacket(pk)
                        )
                );

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
                server.getLogger()?.verbose(`Unhandled player action: ${packet.action}`, 'PlayerActionHandler/handle');
            }
        }
    }
}
