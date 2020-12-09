import Chat from '../../chat/Chat';
import ChatEvent from '../../events/chat/ChatEvent';
import PlayerSpawnEvent from '../../events/player/PlayerSpawnEvent';
import type Player from '../../player/Player';
import type Prismarine from '../../Prismarine';
import Gamemode from '../../world/Gamemode';
import Identifiers from '../Identifiers';
import AvailableActorIdentifiersPacket from '../packet/AvailableActorIdentifiersPacket';
import BiomeDefinitionListPacket from '../packet/BiomeDefinitionListPacket';
import ItemComponentPacket from '../packet/ItemComponentPacket';
import type ResourcePackResponsePacket from '../packet/ResourcePackResponsePacket';
import ResourcePackStackPacket from '../packet/ResourcePackStackPacket';
import StartGamePacket from '../packet/StartGamePacket';

const ResourcePackStatus = require('../type/resource-pack-status');
// const Item = require('../../item/Item')

export default class ResourcePackResponseHandler {
    static NetID = Identifiers.ResourcePackResponsePacket;

    static async handle(
        packet: ResourcePackResponsePacket,
        server: Prismarine,
        player: Player
    ) {
        if (packet.status === ResourcePackStatus.HaveAllPacks) {
            const pk = new ResourcePackStackPacket();
            pk.experimentsAlreadyEnabled = false;
            player.getConnection().sendDataPacket(pk);
        } else if (packet.status === ResourcePackStatus.Completed) {
            // Emit playerSpawn event
            const spawnEvent = new PlayerSpawnEvent(player);
            await server.getEventManager().post(['playerSpawn', spawnEvent]);
            if (spawnEvent.cancelled) return;

            const pk = new StartGamePacket();
            pk.entityId = player.runtimeId;
            pk.runtimeEntityId = player.runtimeId;
            pk.gamemode = player.gamemode;

            const world = player.getWorld();
            const worldSpawnPos = await world.getSpawnPosition();
            pk.worldSpawnPos = worldSpawnPos;

            // TODO: replace with actual data soon
            pk.playerPos = worldSpawnPos;

            pk.levelId = world.getUniqueId();
            pk.worldName = world.getName();
            pk.gamerules = world.getGameruleManager().getGamerules();
            player.getConnection().sendDataPacket(pk);

            player.getConnection().sendTime(world.getTicks());

            player
                .getConnection()
                .sendDataPacket(new AvailableActorIdentifiersPacket());

            player
                .getConnection()
                .sendDataPacket(new BiomeDefinitionListPacket());

            player
                .getConnection()
                .sendAttributes(player.getAttributeManager().getDefaults());

            server
                .getLogger()
                .info(
                    `§b${player.getUsername()}§f is attempting to join with id §b${
                        player.runtimeId
                    }§f from ${player.getAddress().address}:${
                        player.getAddress().port
                    }`
                );

            player.setNameTag(player.getUsername());
            // TODO: always visible nametag
            player.getConnection().sendMetadata();
            player.getConnection().sendAvailableCommands();
            player.getConnection().sendInventory();

            if (player.gamemode == Gamemode.Creative) {
                player.getConnection().sendCreativeContents();
            } else {
                player.getConnection().sendCreativeContents(true);
            }

            // First add
            player.getConnection().addToPlayerList();
            // Then retrive other players
            if (server.getOnlinePlayers().length > 1) {
                player.getConnection().sendPlayerList();
            }

            // Announce connection
            const chatSpawnEvent = new ChatEvent(
                new Chat(
                    server.getConsole(),
                    `§e${player.getUsername()} joined the game`
                )
            );
            server.getEventManager().emit('chat', chatSpawnEvent);
        }
    }
}
