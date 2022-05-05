import Chat, { ChatType } from '../../chat/Chat';
import RespawnPacket, { RespawnState } from '../packet/RespawnPacket';
import SetSpawnPositionPacket, { SpawnType } from '../packet/SetSpawnPositionPacket';

import BiomeDefinitionListPacket from '../packet/BiomeDefinitionListPacket';
import ChatEvent from '../../events/chat/ChatEvent';
import Gamemode from '../../world/Gamemode';
import Identifiers from '../Identifiers';
import { ItemComponentPacket } from '../Packets';
import PacketHandler from './PacketHandler';
import { PlayerConnection } from '../../Prismarine';
import PlayerSpawnEvent from '../../events/player/PlayerSpawnEvent';
import type ResourcePackResponsePacket from '../packet/ResourcePackResponsePacket';
import ResourcePackStackPacket from '../packet/ResourcePackStackPacket';
import ResourcePackStatusType from '../type/ResourcePackStatusType';
import type Server from '../../Server';
import StartGamePacket from '../packet/StartGamePacket';
import Vector3 from '../../math/Vector3';

export default class ResourcePackResponseHandler implements PacketHandler<ResourcePackResponsePacket> {
    public static NetID = Identifiers.ResourcePackResponsePacket;

    public async handle(
        packet: ResourcePackResponsePacket,
        server: Server,
        connection: PlayerConnection
    ): Promise<void> {
        if (packet.status === ResourcePackStatusType.HaveAllPacks) {
            const resourcePackStack = new ResourcePackStackPacket();
            resourcePackStack.mustAccept = false;
            resourcePackStack.experimentsAlreadyEnabled = false;
            await connection.sendDataPacket(resourcePackStack);
        } else if (packet.status === ResourcePackStatusType.Completed) {
            const player = connection.getPlayer();
            // Emit playerSpawn event
            const spawnEvent = new PlayerSpawnEvent(player);
            server.getEventManager().post(['playerSpawn', spawnEvent]);
            if (spawnEvent.cancelled) return;

            // TODO: send inventory slots

            await connection.addToPlayerList();

            const world = player.getWorld();

            await connection.sendTime(world.getTicks());

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
            await connection.sendDataPacket(startGame);

            const itemComponent = new ItemComponentPacket();
            await connection.sendDataPacket(itemComponent);

            const setSpawPos = new SetSpawnPositionPacket();
            setSpawPos.dimension = 3; // TODO: enum
            setSpawPos.position = new Vector3(-2147483648, -2147483648, -2147483648);
            setSpawPos.blockPosition = setSpawPos.position;
            setSpawPos.type = SpawnType.PLAYER_SPAWN;
            await connection.sendDataPacket(setSpawPos);

            await connection.sendTime(world.getTicks());

            // TODO: set difficulty packet
            // TODO: set commands enabled packet

            await connection.sendSettings();

            // TODO: game rules changed packet

            await connection.sendPlayerList();

            await connection.sendDataPacket(new BiomeDefinitionListPacket());

            // TODO: available entity identifiers

            // TODO: player fog packet

            await connection.sendAttributes(player.getAttributeManager().getDefaults());

            await connection.sendCreativeContents(true);

            // Some packets...

            // TODO: inventory crafting data

            // TODO: available commands

            const respawnPacket = new RespawnPacket();
            respawnPacket.state = RespawnState.SERVER_SEARCHING_FOR_SPAWN;
            respawnPacket.position = await world.getSpawnPosition();
            respawnPacket.runtimeEntityId = player.getRuntimeId();
            await connection.sendDataPacket(respawnPacket);

            respawnPacket.state = RespawnState.SERVER_READY_TO_SPAWN;
            await connection.sendDataPacket(respawnPacket);

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
            await connection.sendMetadata();

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
