import AvailableActorIdentifiersPacket from '../packet/AvailableActorIdentifiersPacket';
import BiomeDefinitionListPacket from '../packet/BiomeDefinitionListPacket';
import Chat from '../../chat/Chat';
import ChatEvent from '../../events/chat/ChatEvent';
import Gamemode from '../../world/Gamemode';
import type Player from '../../player/Player';
import PlayerSpawnEvent from '../../events/player/PlayerSpawnEvent';
import type ResourcePackResponsePacket from '../packet/ResourcePackResponsePacket';
import ResourcePackStackPacket from '../packet/ResourcePackStackPacket';
import type Server from '../../Server';
import StartGamePacket from '../packet/StartGamePacket';
import ResourcePackStatusType from '../type/ResourcePackStatusType';
import PacketHandler from './PacketHandler';

export default class ResourcePackResponseHandler
    implements PacketHandler<ResourcePackResponsePacket> {
    public async handle(
        packet: ResourcePackResponsePacket,
        server: Server,
        player: Player
    ): Promise<void> {
        if (packet.status === ResourcePackStatusType.HaveAllPacks) {
            const pk = new ResourcePackStackPacket();
            pk.experimentsAlreadyEnabled = false;
            await player.getConnection().sendDataPacket(pk);
        } else if (packet.status === ResourcePackStatusType.Completed) {
            // Emit playerSpawn event
            const spawnEvent = new PlayerSpawnEvent(player);
            server.getEventManager().post(['playerSpawn', spawnEvent]);
            if (spawnEvent.cancelled) return;

            const world = player.getWorld();

            const pk = new StartGamePacket();
            pk.entityId = player.runtimeId;
            pk.runtimeEntityId = player.runtimeId;
            pk.gamemode = player.gamemode;

            const worldSpawnPos = await world.getSpawnPosition();
            pk.worldSpawnPos = worldSpawnPos;

            // TODO: replace with actual data soon
            pk.playerPos = worldSpawnPos;

            pk.levelId = world.getUniqueId();
            pk.worldName = world.getName();
            pk.gamerules = world.getGameruleManager().getGamerules();
            await player.getConnection().sendDataPacket(pk);
            await player.getConnection().sendTime(world.getTicks());
            await player
                .getConnection()
                .sendDataPacket(new AvailableActorIdentifiersPacket());

            await player
                .getConnection()
                .sendDataPacket(new BiomeDefinitionListPacket());

            await player
                .getConnection()
                .sendAttributes(player.getAttributeManager().getDefaults());

            server
                .getLogger()
                .info(
                    `§b${player.getUsername()}§f is attempting to join with id §b${
                        player.runtimeId
                    }§f from ${player
                        .getAddress()
                        .getAddress()}:${player.getAddress().getPort()}`
                );

            player.setNameTag(player.getUsername());
            // TODO: always visible nametag
            await player.getConnection().sendMetadata();
            await player.getConnection().sendAvailableCommands();
            await player.getConnection().sendInventory();

            await player
                .getConnection()
                .sendCreativeContents(player.gamemode !== Gamemode.Creative);

            // First add
            await player.getConnection().addToPlayerList();
            // Then retrive other players
            if (server.getOnlinePlayers().length > 1) {
                await player.getConnection().sendPlayerList();
            }

            // Announce connection
            const chatSpawnEvent = new ChatEvent(
                new Chat(
                    server.getConsole(),
                    `§e${player.getUsername()} joined the game`
                )
            );
            await server.getEventManager().emit('chat', chatSpawnEvent);
        }
    }
}
