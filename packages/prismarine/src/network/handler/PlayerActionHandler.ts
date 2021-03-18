import BlockMappings from '../../block/BlockMappings';
import Identifiers from '../Identifiers';
import LevelEventType from '../type/LevelEventType';
import PacketHandler from './PacketHandler';
import type Player from '../../player/Player';
import type PlayerActionPacket from '../packet/PlayerActionPacket';
import PlayerActionType from '../type/PlayerActionType';
import type Server from '../../Server';
import WorldEventPacket from '../packet/WorldEventPacket';

export default class PlayerActionHandler implements PacketHandler<PlayerActionPacket> {
    public static NetID = Identifiers.PlayerActionPacket;

    public async handle(packet: PlayerActionPacket, server: Server, player: Player): Promise<void> {
        switch (packet.action) {
            case PlayerActionType.StartBreak: {
                const block = await player
                    .getWorld()
                    .getBlock(packet.position.getX(), packet.position.getY(), packet.position.getZ());

                const breakTime = Math.ceil(block.getBreakTime(null, server) * 20); // TODO: calculate with item in hand

                // TODO: world.sendEvent(type, position(Vector3), data) (?)
                const pk = new WorldEventPacket();
                pk.eventId = LevelEventType.BlockStartBreak;
                pk.x = packet.position.getX();
                pk.y = packet.position.getY();
                pk.z = packet.position.getZ();
                pk.data = 65535 / breakTime;

                await Promise.all(
                    player
                        .getPlayersInChunk()
                        .map(async (nearbyPlayer) => nearbyPlayer.getConnection().sendDataPacket(pk))
                );

                break;
            }

            case PlayerActionType.AbortBreak: {
                // Gets called when player didn't finished
                // to break the block
                const pk = new WorldEventPacket();
                pk.eventId = LevelEventType.BlockStopBreak;
                pk.x = packet.position.getX();
                pk.y = packet.position.getY();
                pk.z = packet.position.getZ();
                pk.data = 0;

                await Promise.all(
                    player
                        .getPlayersInChunk()
                        .map(async (nearbyPlayer) => nearbyPlayer.getConnection().sendDataPacket(pk))
                );
                break;
            }

            case PlayerActionType.StopBreak: {
                // Handled in InventoryTransactionHandler
                break;
            }

            case PlayerActionType.ContinueBreak: {
                // This fires twice in creative.. wtf Mojang?
                const chunk = await player.getWorld().getChunkAt(packet.position.getX(), packet.position.getZ());

                const blockId = chunk.getBlock(packet.position.getX(), packet.position.getY(), packet.position.getZ());

                const pk = new WorldEventPacket();
                pk.eventId = LevelEventType.ParticlePunchBlock;
                pk.x = packet.position.getX();
                pk.y = packet.position.getY();
                pk.z = packet.position.getZ();
                pk.data = BlockMappings.getRuntimeId(blockId.id, blockId.meta);

                await Promise.all(
                    player
                        .getPlayersInChunk()
                        .map(async (nearbyPlayer) => nearbyPlayer.getConnection().sendDataPacket(pk))
                );

                break;
            }

            case PlayerActionType.Jump: {
                break;
            }

            case PlayerActionType.StartSprint: {
                await player.setSprinting(true);
                break;
            }

            case PlayerActionType.StopSprint: {
                await player.setSprinting(false);
                break;
            }

            case PlayerActionType.StartSneak: {
                await player.setSneaking(true);
                break;
            }

            case PlayerActionType.StopSneak: {
                await player.setSneaking(false);
                break;
            }

            case PlayerActionType.CreativeDestroyBlock: {
                // Handled in InventoryTransactionHandler
                break;
            }

            default: {
                // This will get triggered even if an action is simply not handled
                server.getLogger().debug(`Unhandled player action: ${packet.action}`, 'PlayerActionHandler/handle');
            }
        }
    }
}
