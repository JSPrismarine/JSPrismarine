import Identifiers from '../Identifiers.js';
import LevelEventType from '../type/LevelEventType.js';
import PacketHandler from './PacketHandler.js';
import type PlayerActionPacket from '../packet/PlayerActionPacket.js';
import PlayerActionType from '../type/PlayerActionType.js';
import { PlayerSession } from '../../Prismarine.js';
import type Server from '../../Server.js';
import WorldEventPacket from '../packet/WorldEventPacket.js';

export default class PlayerActionHandler implements PacketHandler<PlayerActionPacket> {
    public static NetID = Identifiers.PlayerActionPacket;

    public async handle(packet: PlayerActionPacket, server: Server, session: PlayerSession): Promise<void> {
        const player = session.getPlayer();
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
                        .map(async (nearbyPlayer) =>
                            nearbyPlayer.getNetworkSession().getConnection().sendDataPacket(pk)
                        )
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
                        .map(async (nearbyPlayer) =>
                            nearbyPlayer.getNetworkSession().getConnection().sendDataPacket(pk)
                        )
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

                // TODO
                /*
                const pk = new WorldEventPacket();
                pk.eventId = LevelEventType.ParticlePunchBlock;
                pk.x = packet.position.getX();
                pk.y = packet.position.getY();
                pk.z = packet.position.getZ();
                pk.data = BlockMappings.getRuntimeId();

                await Promise.all(
                    player
                        .getPlayersInChunk()
                        .map(async (nearbyPlayer) => nearbyPlayer.getConnection().sendDataPacket(pk))
                );
                */

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
                server.getLogger()?.verbose(`Unhandled player action: ${packet.action}`, 'PlayerActionHandler/handle');
            }
        }
    }
}
