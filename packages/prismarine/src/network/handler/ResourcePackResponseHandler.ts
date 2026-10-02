import { Chat, ChatType } from '../../chat/Chat';
import RespawnPacket, { RespawnState } from '../packet/RespawnPacket';
import SetSpawnPositionPacket, { SpawnType } from '../packet/SetSpawnPositionPacket';

import { getGametypeId } from '@jsprismarine/minecraft';
import type { PlayerSession } from '../../';
import type Server from '../../Server';
import ChatEvent from '../../events/chat/ChatEvent';
import PlayerSpawnEvent from '../../events/player/PlayerSpawnEvent';
import Identifiers from '../Identifiers';
import AvailableActorIdentifiersPacket from '../packet/AvailableActorIdentifiersPacket';
import BiomeDefinitionListPacket from '../packet/BiomeDefinitionListPacket';
import ItemComponentPacket from '../packet/ItemComponentPacket';
import JigsawStructureDataPacket from '../packet/JigsawStructureDataPacket';
import type ResourcePackResponsePacket from '../packet/ResourcePackResponsePacket';
import ResourcePackStackPacket from '../packet/ResourcePackStackPacket';
import StartGamePacket from '../packet/StartGamePacket';
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

            // Before StartGame, not after: a client at 2193 that reaches StartGame without the
            // jigsaw rules disconnects with `MissingStructureData`.
            await session.getConnection().sendDataPacket(new JigsawStructureDataPacket());

            const startGame = new StartGamePacket();
            startGame.entityId = player.getRuntimeId();
            startGame.runtimeEntityId = player.getRuntimeId();
            startGame.gamemode = player.gamemode;
            startGame.defaultGamemode = getGametypeId(server.getConfig().getGamemode());
            startGame.difficulty = server.getConfig().getDifficulty();

            const worldSpawnPos = await world.getSpawnPosition();
            startGame.worldSpawnPos = worldSpawnPos;

            startGame.playerPos = player.getPosition();
            startGame.pitch = player.pitch;
            startGame.yaw = player.yaw;

            startGame.serverIdentifier = 'JSPrismarine';
            startGame.worldIdentifier = world.getName();
            startGame.scenarioIdentifier = 'JSPrismarine';
            startGame.levelId = world.getUUID();
            startGame.ticks = server.getTick();
            startGame.time = world.getTicks();
            startGame.worldName = world.getName();
            startGame.seed = world.getSeed();
            startGame.gameRules = world.getGameRuleManager();
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
            await session.sendCraftingData();
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

            await session.getPlayer().completeSpawn();

            // The spawn chunks and the PlayerSpawn status are NOT sent here. A retail client
            // discards any terrain that arrives before it has requested a chunk radius and been
            // answered, so both wait for that first request - see PlayerSession.setViewDistance.
            // Sent from here, as they were, a real client threw the chunks away and never
            // finished spawning; the server's own client tolerated the wrong order and hid it.

            // The entities are not summoned here either. A Bedrock Dedicated Server sends the
            // entity spawns *after* PlayerSpawn, once the terrain is there to put them on, and a
            // real client sent them beforehand has nowhere to place them. PlayerSession does it
            // from `announceSpawnIfReady`, which also has the view distance the client asked for
            // - this ran with a view distance of zero, before the client had named one.

            // Announce connection
            const chatSpawnEvent = new ChatEvent(
                new Chat({
                    sender: server.getConsole()!,
                    // The bare translation key: a colour code in front of the `%` stops the
                    // client resolving it, and it renders the unresolved string instead.
                    message: `%multiplayer.player.joined`,
                    parameters: [player.getName()],
                    needsTranslation: true,
                    type: ChatType.TRANSLATION
                })
            );
            await server.emit('chat', chatSpawnEvent);
        }
    }
}
