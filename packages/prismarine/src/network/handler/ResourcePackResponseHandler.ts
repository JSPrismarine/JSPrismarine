import Chat, { ChatType } from '../../chat/Chat';

import BiomeDefinitionListPacket from '../packet/BiomeDefinitionListPacket';
import ChatEvent from '../../events/chat/ChatEvent';
import Gamemode from '../../world/Gamemode';
import Identifiers from '../Identifiers';
import PacketHandler from './PacketHandler';
import type Player from '../../player/Player';
import PlayerSpawnEvent from '../../events/player/PlayerSpawnEvent';
import type ResourcePackResponsePacket from '../packet/ResourcePackResponsePacket';
import ResourcePackStackPacket from '../packet/ResourcePackStackPacket';
import ResourcePackStatusType from '../type/ResourcePackStatusType';
import type Server from '../../Server';
import StartGamePacket from '../packet/StartGamePacket';
import UpdateSoftEnumPacket from '../packet/UpdateSoftEnumPacket';
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

            const world = player.getWorld();

            // 4x inventory slot packet (index from 0 to 4)

            // First add
            await player.getConnection().addToPlayerList();
            // Then retrieve other players
            if (server.getPlayerManager().getOnlinePlayers().length > 1) {
                await player.getConnection().sendPlayerList();
            }

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

            await player.getConnection().sendCreativeContents(true);

            await player.getConnection().sendDataPacket(new BiomeDefinitionListPacket());

            await player.getConnection().sendAttributes(player.getAttributeManager().getDefaults());

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
            await player.getConnection().sendAvailableCommands();
            // TODO: fix await player.getConnection().sendInventory();

            // Announce connection
            const chatSpawnEvent = new ChatEvent(
                new Chat(
                    server.getConsole(),
                    `§e${player.getName()} joined the game`,
                    '*.everyone',
                    ChatType.Announcement
                )
            );
            await server.getEventManager().emit('chat', chatSpawnEvent);

            // Update soft commandenums
            /*
            TODO: not sure about this one, but for sure who implemented it
            forgot to change "pk" to "packet" on sendDataPacket, so he was
            basically sending twice a StartGame packet... poor client :)...

            const packet = new UpdateSoftEnumPacket();
            packet.enumName = 'Player';
            packet.values = server
                .getPlayerManager()
                .getOnlinePlayers()
                .map((player) => player.getName());
            packet.type = packet.TYPE_SET;

            server
                .getPlayerManager()
                .getOnlinePlayers()
                .forEach(async (player) => player.getConnection().sendDataPacket(packet));
            */
        }
    }
}
