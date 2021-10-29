import Chat, { ChatType } from '../../chat/Chat';
import RespawnPacket, { RespawnState } from '../packet/RespawnPacket';

import BiomeDefinitionListPacket from '../packet/BiomeDefinitionListPacket';
import ChatEvent from '../../events/chat/ChatEvent';
import Gamemode from '../../world/Gamemode';
import Identifiers from '../Identifiers';
import { ItemComponentPacket } from '../Packets';
import PacketHandler from './PacketHandler';
import type Player from '../../player/Player';
import PlayerSpawnEvent from '../../events/player/PlayerSpawnEvent';
import type ResourcePackResponsePacket from '../packet/ResourcePackResponsePacket';
import ResourcePackStackPacket from '../packet/ResourcePackStackPacket';
import ResourcePackStatusType from '../type/ResourcePackStatusType';
import type Server from '../../Server';
import StartGamePacket from '../packet/StartGamePacket';
import Vector3 from '../../math/Vector3';

export default class ResourcePackResponseHandler implements PacketHandler<ResourcePackResponsePacket> {
    public static NetID = Identifiers.ResourcePackResponsePacket;

    public async handle(packet: ResourcePackResponsePacket, server: Server, player: Player): Promise<void> {
        if (packet.status === ResourcePackStatusType.HaveAllPacks) {
            const resourcePackStack = new ResourcePackStackPacket();
            resourcePackStack.experimentsAlreadyEnabled = false;
            resourcePackStack.experimentsAlreadyEnabled = false;
            await player.getConnection().sendDataPacket(resourcePackStack);
        } else if (packet.status === ResourcePackStatusType.Completed) {
            // Emit playerSpawn event
            const spawnEvent = new PlayerSpawnEvent(player);
            server.getEventManager().post(['playerSpawn', spawnEvent]);
            if (spawnEvent.cancelled) return;

            // TODO: send inventory slots

            await player.getConnection().addToPlayerList();

            const world = player.getWorld();

            await player.getConnection().sendTime(world.getTicks());

            const startGame = new StartGamePacket();
            startGame.entityId = player.getRuntimeId();
            startGame.runtimeEntityId = player.getRuntimeId();
            startGame.gamemode = player.gamemode;
            startGame.defaultGamemode = Gamemode.getGamemodeId(server.getConfig().getGamemode());

            const worldSpawnPos = await world.getSpawnPosition();
            startGame.worldSpawnPos = worldSpawnPos;

            startGame.playerPos = new Vector3(player.getX(), player.getY(), player.getZ());
            startGame.pitch = player.pitch;
            startGame.yaw = player.yaw;

            startGame.levelId = world.getUniqueId();
            startGame.worldName = world.getName();
            startGame.seed = world.getSeed();
            startGame.gamerules = world.getGameruleManager();
            await player.getConnection().sendDataPacket(startGame);

            const itemComponent = new ItemComponentPacket();
            await player.getConnection().sendDataPacket(itemComponent);

            // TODO: set player spawn position packet

            await player.getConnection().sendTime(world.getTicks());

            // TODO: set difficulty packet
            // TODO: set commands enabled packet

            await player.getConnection().sendSettings();

            // TODO: game rules changed packet

            await player.getConnection().sendPlayerList();

            await player.getConnection().sendDataPacket(new BiomeDefinitionListPacket());

            // TODO: available entity identifiers

            // TODO: player fog packet

            await player.getConnection().sendAttributes(player.getAttributeManager().getDefaults());

            await player.getConnection().sendCreativeContents(true);

            // Some packets...

            // TODO: inventory crafting data

            // TODO: available commands

            const respawnPacket = new RespawnPacket();
            respawnPacket.state = RespawnState.SERVER_SEARCHING_FOR_SPAWN;
            respawnPacket.position = await world.getSpawnPosition();
            respawnPacket.runtimeEntityId = player.getRuntimeId();
            await player.getConnection().sendDataPacket(respawnPacket);

            respawnPacket.state = RespawnState.SERVER_READY_TO_SPAWN;
            await player.getConnection().sendDataPacket(respawnPacket);

            server
                .getLogger()
                ?.info(
                    `§b${player.getName()}§f is attempting to join with id §b${player.getRuntimeId()}§f from ${player
                        .getAddress()
                        .getAddress()}:${player.getAddress().getPort()}`,
                    'Handler/ResourcePackResponseHandler'
                );

            player.setNameTag(player.getName());
            // TODO: always visible nametag
            await player.getConnection().sendMetadata();

            // TODO: fix await player.getConnection().sendInventory();

            // Announce connection
            const chatSpawnEvent = new ChatEvent(
                new Chat(
                    server.getConsole(),
                    `§e%multiplayer.player.joined`, // TODO: enum of client hardcoded messages
                    [player.getName()],
                    true,
                    '*.everyone',
                    ChatType.TRANSLATION
                )
            );
            await server.getEventManager().emit('chat', chatSpawnEvent);
        }
    }
}
