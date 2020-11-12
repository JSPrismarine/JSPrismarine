import type Player from '../../player/Player';
import type Prismarine from '../../Prismarine';
import type PlayerActionPacket from '../packet/PlayerActionPacket';
import Identifiers from '../Identifiers';
import PlayerAction from '../type/player-action';
import WorldEventPacket from '../packet/WorldEventPacket';
import LevelEventType from '../type/level-event-type';

export default class PlayerActionHandler {
    static NetID = Identifiers.PlayerActionPacket;

    static async handle(
        packet: PlayerActionPacket,
        server: Prismarine,
        player: Player
    ) {
        switch (packet.action) {
            case PlayerAction.StartBreak: {
                const chunk = await player
                    .getWorld()
                    .getChunkAt(packet.x as number, packet.z as number);

                const blockId = chunk.getBlockId(
                    (packet.x as number) % 16,
                    packet.y as number,
                    (packet.z as number) % 16
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
                let pk = new WorldEventPacket();
                pk.eventId = LevelEventType.BlockStartBreak;
                pk.x = packet.x;
                pk.y = packet.y;
                pk.z = packet.z;
                pk.data = 65535 / breakTime;
                for (let onlinePlayer of server.getOnlinePlayers()) {
                    onlinePlayer.getConnection().sendDataPacket(pk);
                }
                break;
            }
            case PlayerAction.AbortBreak: {
                // Gets called when player didn't finished
                // to break the block
                let pk = new WorldEventPacket();
                pk.eventId = LevelEventType.BlockStopBreak;
                pk.x = packet.x;
                pk.y = packet.y;
                pk.z = packet.z;
                pk.data = 0;
                for (let onlinePlayer of server.getOnlinePlayers()) {
                    onlinePlayer.getConnection().sendDataPacket(pk);
                }
                break;
            }
            case PlayerAction.StopBreak: {
                // Handled in InventoryTransactionHandler
                break;
            }
            case PlayerAction.ContinueBreak: {
                // This fires twice in creative.. wtf Mojang?

                let pk = new WorldEventPacket();
                pk.eventId = LevelEventType.ParticlePunchBlock;
                pk.x = packet.x;
                pk.y = packet.y;
                pk.z = packet.z;
                pk.data = 7; // TODO: runtime ID

                for (let onlinePlayer of server.getOnlinePlayers()) {
                    onlinePlayer.getConnection().sendDataPacket(pk);
                }
                break;
            }
            default: {
                // This will get triggered even if an action is simply not handled
                server
                    .getLogger()
                    .debug(
                        `Unknown or unhandled PlayerAction: ${packet.action}`
                    );
            }
        }
    }
}
