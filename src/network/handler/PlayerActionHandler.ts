import type Player from '../../player/Player';
import type Server from '../../Server';
import type PlayerActionPacket from '../packet/PlayerActionPacket';
import PlayerActionType from '../type/PlayerActionType';
import WorldEventPacket from '../packet/WorldEventPacket';
import LevelEventType from '../type/LevelEventType';
import PacketHandler from './PacketHandler';

export default class PlayerActionHandler
    implements PacketHandler<PlayerActionPacket> {
    public async handle(
        packet: PlayerActionPacket,
        server: Server,
        player: Player
    ): Promise<void> {
        switch (packet.action) {
            case PlayerActionType.StartBreak: {
                const chunk = await player
                    .getWorld()
                    .getChunkAt(packet.x, packet.z);

                const blockId = chunk.getBlockId(
                    packet.x % 16,
                    packet.y,
                    packet.z % 16
                );
                const block = server.getBlockManager().getBlockById(blockId);
                if (!block)
                    return server
                        .getLogger()
                        .warn(
                            `Block at ${packet.x} ${packet.y} ${packet.z} is undefined!`
                        );

                const breakTime = Math.ceil(
                    block.getBreakTime(null, server) * 20
                ); // TODO: calculate with item in hand

                // TODO: world.sendEvent(type, position(Vector3), data) (?)
                const pk = new WorldEventPacket();
                pk.eventId = LevelEventType.BlockStartBreak;
                pk.x = packet.x;
                pk.y = packet.y;
                pk.z = packet.z;
                pk.data = 65535 / breakTime;

                await Promise.all(
                    player
                        .getPlayersInChunk()
                        .map(async (nearbyPlayer) =>
                            nearbyPlayer.getConnection().sendDataPacket(pk)
                        )
                );

                break;
            }

            case PlayerActionType.AbortBreak: {
                // Gets called when player didn't finished
                // to break the block
                const pk = new WorldEventPacket();
                pk.eventId = LevelEventType.BlockStopBreak;
                pk.x = packet.x;
                pk.y = packet.y;
                pk.z = packet.z;
                pk.data = 0;

                await Promise.all(
                    player
                        .getPlayersInChunk()
                        .map(async (nearbyPlayer) =>
                            nearbyPlayer.getConnection().sendDataPacket(pk)
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
                (async () => {
                    const chunk = await player
                        .getWorld()
                        .getChunkAt(packet.x, packet.z);

                    const blockId = chunk.getBlockId(
                        packet.x % 16,
                        packet.y,
                        packet.z % 16
                    );

                    const blockMeta = chunk.getBlockMetadata(
                        packet.x % 16,
                        packet.y,
                        packet.z % 16
                    );

                    const pk = new WorldEventPacket();
                    pk.eventId = LevelEventType.ParticlePunchBlock;
                    pk.x = packet.x;
                    pk.y = packet.y;
                    pk.z = packet.z;
                    pk.data = server
                        .getBlockManager()
                        .getRuntimeWithMeta(blockId, blockMeta);

                    await Promise.all(
                        player
                            .getPlayersInChunk()
                            .map(async (nearbyPlayer) =>
                                nearbyPlayer.getConnection().sendDataPacket(pk)
                            )
                    );
                })();

                break;
            }

            case PlayerActionType.StartSprint: {
                player.isSprinting = true;
            }

            case PlayerActionType.StopSprint: {
                player.isSprinting = false;
            }

            default: {
                // This will get triggered even if an action is simply not handled
                server
                    .getLogger()
                    .debug(`Unhandled player action: ${packet.action}`);
            }
        }
    }
}
