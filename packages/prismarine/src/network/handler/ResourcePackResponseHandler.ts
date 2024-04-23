import { Chat, ChatType } from '../../chat/Chat';
import RespawnPacket, { RespawnState } from '../packet/RespawnPacket';
import SetSpawnPositionPacket, { SpawnType } from '../packet/SetSpawnPositionPacket';

import { getGametypeId } from '@jsprismarine/minecraft';
import { type PlayerSession } from '../../';
import type Server from '../../Server';
import ChatEvent from '../../events/chat/ChatEvent';
import PlayerSpawnEvent from '../../events/player/PlayerSpawnEvent';
import Identifiers from '../Identifiers';
import AvailableActorIdentifiersPacket from '../packet/AvailableActorIdentifiersPacket';
import BiomeDefinitionListPacket from '../packet/BiomeDefinitionListPacket';
import ItemComponentPacket from '../packet/ItemComponentPacket';
import type ResourcePackResponsePacket from '../packet/ResourcePackResponsePacket';
import ResourcePackStackPacket from '../packet/ResourcePackStackPacket';
import StartGamePacket from '../packet/StartGamePacket';
import PlayStatusType from '../type/PlayStatusType';
import ResourcePackStatusType from '../type/ResourcePackStatusType';
import type PacketHandler from './PacketHandler';

export default class ResourcePackResponseHandler implements PacketHandler<ResourcePackResponsePacket> {
    public static NetID = Identifiers.ResourcePackResponsePacket;

    public async handle(packet: ResourcePackResponsePacket, server: Server, session: PlayerSession): Promise<void> {
        if (packet.status === ResourcePackStatusType.HaveAllPacks) {
            const resourcePackStack = new ResourcePackStackPacket();
            resourcePackStack.texturePackRequired = false;
            resourcePackStack.experimentsAlreadyEnabled = false;
            await session.getConnection().sendDataPacket(resourcePackStack);
        } else if (packet.status === ResourcePackStatusType.Completed) {
            const player = session.getPlayer();
            server
                .getLogger()
                .info(
                    `§b${player.getName()}§f is attempting to join with id §b${player.getUUID()}§f (§b${player.getRuntimeId()}§f) from ${player
                        .getAddress()
                        .getAddress()}:${player.getAddress().getPort()}`
                );

            // Emit playerSpawn event
            const spawnEvent = new PlayerSpawnEvent(player);
            server.post(['playerSpawn', spawnEvent]);
            if (spawnEvent.isCancelled()) return;

            // TODO: send inventory slots
            const world = player.getWorld();

            await session.addToPlayerList();
            await session.sendTime(world.getTicks());

            const startGame = new StartGamePacket();
            startGame.entityId = player.getRuntimeId();
            startGame.runtimeEntityId = player.getRuntimeId();
            startGame.gamemode = player.gamemode;
            startGame.defaultGamemode = getGametypeId(server.getConfig().getGamemode());

            const worldSpawnPos = await world.getSpawnPosition();
            startGame.worldSpawnPos = worldSpawnPos;

            startGame.playerPos = player.getPosition();
            startGame.pitch = player.pitch;
            startGame.yaw = player.yaw;

            startGame.levelId = world.getUUID();
            startGame.ticks = server.getTick();
            startGame.time = world.getTicks();
            startGame.worldName = world.getName();
            startGame.seed = world.getSeed();
            startGame.gamerules = world.getGameruleManager();
            await session.getConnection().sendDataPacket(startGame);

            const itemComponent = new ItemComponentPacket();
            await session.getConnection().sendDataPacket(itemComponent);

            const setSpawnPos = new SetSpawnPositionPacket();
            setSpawnPos.dimension = 0; // TODO: enum
            setSpawnPos.position = await world.getSpawnPosition();
            setSpawnPos.blockPosition = setSpawnPos.position;
            setSpawnPos.type = SpawnType.PLAYER_SPAWN;
            await session.getConnection().sendDataPacket(setSpawnPos);

            await session.sendTime(world.getTicks());

            // TODO: set difficulty packet
            // TODO: set commands enabled packet

            await session.sendSettings();
            await session.sendAvailableCommands();

            // TODO: game rules changed packet

            await session.sendPlayerList();

            await session.getConnection().sendDataPacket(new BiomeDefinitionListPacket());
            await session.getConnection().sendDataPacket(new AvailableActorIdentifiersPacket());

            // TODO: player fog packet

            await session.sendAttributes();
            await session.sendMetadata();
            await session.sendAbilities();
            await session.sendCreativeContents();

            // Some packets...

            // TODO: inventory crafting data

            // TODO: available commands

            const respawnPacket = new RespawnPacket();
            respawnPacket.state = RespawnState.SERVER_SEARCHING_FOR_SPAWN;
            respawnPacket.position = player.getPosition();
            respawnPacket.runtimeEntityId = player.getRuntimeId();
            await session.getConnection().sendDataPacket(respawnPacket);

            respawnPacket.state = RespawnState.SERVER_READY_TO_SPAWN;
            await session.getConnection().sendDataPacket(respawnPacket);
            respawnPacket.state = RespawnState.CLIENT_READY_TO_SPAWN;
            await session.getConnection().sendDataPacket(respawnPacket);

            // Sent to let know the client saved chunks
            await session.getPlayer().sendSpawn();
            await session.getPlayer().sendInitialSpawnChunks();
            await session.sendPlayStatus(PlayStatusType.PlayerSpawn);

            // Summon player(s) & entities
            await Promise.all([
                server
                    .getSessionManager()
                    .getAllPlayers()
                    .filter((p) => p !== player)
                    .map(async (p) => {
                        await p.getNetworkSession().sendSpawn(player);
                        await session.sendSpawn(p);
                    })
                /* player
                    .getWorld()
                    .getEntities()
                    .filter((e) => !(e instanceof Player))
                    .map(async (entity) => entity.sendSpawn(player)) */
            ]);

            // Announce connection
            const chatSpawnEvent = new ChatEvent(
                new Chat({
                    sender: server.getConsole(),
                    message: `§e%multiplayer.player.joined`,
                    parameters: [player.getName()],
                    needsTranslation: true,
                    type: ChatType.TRANSLATION
                })
            );
            await server.emit('chat', chatSpawnEvent);
        }
    }
}
