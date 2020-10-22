import type Player from "../../player";
import type Prismarine from "../../Prismarine";
import type ResourcePackResponsePacket from "../packet/resource-pack-response";

const Identifiers = require('../identifiers');
const ResourcePackStatus = require('../type/resource-pack-status');
const BiomeDefinitionListPacket = require('../packet/biome-definition-list');
const AvailableActorIdentifiersPacket = require('../packet/available-actor-identifiers');
const ResourcePackStackPacket = require('../packet/resource-pack-stack');
const StartGamePacket = require('../packet/start-game');
const Gamemode = require('../../world/gamemode');
// const Item = require('../../item')


export default class ResourcePackResponseHandler {
    static NetID = Identifiers.ResourcePackResponsePacket

    static async handle(packet: ResourcePackResponsePacket, server: Prismarine, player: Player) {
        let pk;
        if (packet.status === ResourcePackStatus.HaveAllPacks) {
            pk = new ResourcePackStackPacket();
            player.sendDataPacket(pk);
        } else if (packet.status === ResourcePackStatus.Completed) {
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
                `§b${player.name}§f is attempting to join with id §b${player.runtimeId}§f from ${player.getAddress().address}:${player.getAddress().port}`
            );

            player.setNameTag(player.name);
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
        }
    }
}
