<<<<<<< HEAD:src/network/handler/resource-pack-response-handler.js
const Identifiers = require('../Identifiers').default;
const ResourcePackResponsePacket = require('../packet/resource-pack-response');
=======
import Chat from "../../chat/Chat";
import ChatEvent from "../../events/chat/ChatEvent";
import PlayerSpawnEvent from "../../events/player/PlayerSpawnEvent";
import type Player from "../../player";
import type Prismarine from "../../Prismarine";
import type ResourcePackResponsePacket from "../packet/resource-pack-response";

const Identifiers = require('../Identifiers').default;
>>>>>>> dd22f1420a92b9577274b6fd1afbed531180b90e:src/network/handler/ResourcePackResponseHandler.ts
const ResourcePackStatus = require('../type/resource-pack-status');
const BiomeDefinitionListPacket = require('../packet/biome-definition-list');
const AvailableActorIdentifiersPacket = require('../packet/available-actor-identifiers');
const ResourcePackStackPacket = require('../packet/resource-pack-stack');
const StartGamePacket = require('../packet/start-game');
<<<<<<< HEAD:src/network/handler/resource-pack-response-handler.js
const Player = require('../../player/Player').default;
const Prismarine = require('../../Prismarine');
const Gamemode = require('../../world/Gamemode').default;
=======
const Gamemode = require('../../world/gamemode');
>>>>>>> dd22f1420a92b9577274b6fd1afbed531180b90e:src/network/handler/ResourcePackResponseHandler.ts
// const Item = require('../../item')


export default class ResourcePackResponseHandler {
    static NetID = Identifiers.ResourcePackResponsePacket

    static async handle(packet: ResourcePackResponsePacket, server: Prismarine, player: Player) {
        let pk;
        if (packet.status === ResourcePackStatus.HaveAllPacks) {
            pk = new ResourcePackStackPacket();
            player.sendDataPacket(pk);
        } else if (packet.status === ResourcePackStatus.Completed) {
            // Emit playerSpawn event
            const spawnEvent = new PlayerSpawnEvent(player);
            await server.getEventManager().post(['playerSpawn', spawnEvent]);
            if (spawnEvent.cancelled)
                return;

            pk = new StartGamePacket();
            pk.entityId = player.runtimeId;
            pk.runtimeEntityId = player.runtimeId;
            pk.gamemode = player.gamemode;

            const world = player.getWorld();
            const worldSpawnPos = await world.getSpawnPosition();
            pk.worldSpawnX = worldSpawnPos.getX();
            pk.worldSpawnY = worldSpawnPos.getY();
            pk.worldSpawnZ = worldSpawnPos.getZ();

            // TODO: replace with actual data soon
            pk.playerX = worldSpawnPos.getX();
            pk.playerY = worldSpawnPos.getY();
            pk.playerZ = worldSpawnPos.getZ();

            pk.levelId = world.getUniqueId();
            pk.worldName = world.getName();
            pk.gamerules = world.getGameruleManager().getGamerules();
            player.sendDataPacket(pk);

            player.sendTime(world.getTicks());

            player.sendDataPacket(new AvailableActorIdentifiersPacket());
            player.sendDataPacket(new BiomeDefinitionListPacket());

            player.sendAttributes(player.attributes.getDefaults());

            server.getLogger().info(
                `§b${player.getUsername()}§f is attempting to join with id §b${player.runtimeId}§f from ${player.getAddress().address}:${player.getAddress().port}`
            );

            player.setNameTag(player.getUsername());
            // TODO: always visible nametag
            player.sendMetadata();

            player.sendAvailableCommands();

            player.sendInventory();

            if (player.gamemode === Gamemode.Creative) {
                player.sendCreativeContents();
            }

            // First add
            player.addToPlayerList();
            // Then retrive other players
            if (server.getOnlinePlayers().length > 1) {
                player.sendPlayerList();
            }

            // Announce connection
            const chatSpawnEvent = new ChatEvent(new Chat(server.getConsole(), `§e${player.getUsername()} joined the game`));
            server.getEventManager().emit('chat', chatSpawnEvent);
        }
    }
}
