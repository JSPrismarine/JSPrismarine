import type Player from '../../player/Player';
import type Prismarine from '../../Prismarine';
import type PlayerActionPacket from '../packet/PlayerActionPacket';
import PlayerAction from '../type/player-action';
import WorldEventPacket from '../packet/WorldEventPacket';
import LevelEventType from '../type/level-event-type';
import PacketHandler from './PacketHandler';

export default class PlayerActionHandler
    implements PacketHandler<PlayerActionPacket> {
    public handle(
        packet: PlayerActionPacket,
        server: Prismarine,
        player: Player
    ): void {
        switch (packet.action) {
            case PlayerAction.StartBreak: {
                (async () => {
                    const chunk = await player
                        .getWorld()
                        .getChunkAt(packet.x as number, packet.z as number);

                    const blockId = chunk.getBlockId(
                        (packet.x as number) % 16,
                        packet.y as number,
                        (packet.z as number) % 16
                    );
                    const block = server
                        .getBlockManager()
                        .getBlockById(blockId);
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

                    Promise.all(
                        player
                            .getPlayersInChunk()
                            .map((nearbyPlayer) =>
                                nearbyPlayer.getConnection().sendDataPacket(pk)
                            )
                    );
                })();

                break;
            }
            case PlayerAction.AbortBreak: {
                // Gets called when player didn't finished
                // to break the block
                const pk = new WorldEventPacket();
                pk.eventId = LevelEventType.BlockStopBreak;
                pk.x = packet.x;
                pk.y = packet.y;
                pk.z = packet.z;
                pk.data = 0;

                Promise.all(
                    player
                        .getPlayersInChunk()
                        .map((nearbyPlayer) =>
                            nearbyPlayer.getConnection().sendDataPacket(pk)
                        )
                );
                break;
            }
            case PlayerAction.StopBreak: {
                // Handled in InventoryTransactionHandler
                break;
            }
            case PlayerAction.ContinueBreak: {
                // This fires twice in creative.. wtf Mojang?
                (async () => {
                    const chunk = await player
                        .getWorld()
                        .getChunkAt(packet.x as number, packet.z as number);

                    const blockId = chunk.getBlockId(
                        (packet.x as number) % 16,
                        packet.y as number,
                        (packet.z as number) % 16
                    );

                    const blockMeta = chunk.getBlockMetadata(
                        (packet.x as number) % 16,
                        packet.y as number,
                        (packet.z as number) % 16
                    );

                    const pk = new WorldEventPacket();
                    pk.eventId = LevelEventType.ParticlePunchBlock;
                    pk.x = packet.x;
                    pk.y = packet.y;
                    pk.z = packet.z;
                    pk.data = server
                        .getBlockManager()
                        .getRuntimeWithMeta(blockId, blockMeta);

                    Promise.all(
                        player
                            .getPlayersInChunk()
                            .map((nearbyPlayer) =>
                                nearbyPlayer.getConnection().sendDataPacket(pk)
                            )
                    );
                })();
                break;
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
