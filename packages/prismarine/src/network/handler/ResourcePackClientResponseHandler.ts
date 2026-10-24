import { Chat, ChatType } from '../../chat/Chat';
import SetSpawnPositionPacket, { SpawnType } from '../packet/SetSpawnPositionPacket';

import { getGametypeId } from '@jsprismarine/minecraft';
import type { PlayerSession } from '../../';
import type Server from '../../Server';
import ChatEvent from '../../events/chat/ChatEvent';
import PlayerSpawnEvent from '../../events/player/PlayerSpawnEvent';
import Identifiers from '../Identifiers';
import AvailableActorIdentifiersPacket from '../packet/AvailableActorIdentifiersPacket';
import BiomeDefinitionListPacket from '../packet/BiomeDefinitionListPacket';
import ItemRegistryPacket from '../packet/ItemRegistryPacket';
import JigsawStructureDataPacket from '../packet/JigsawStructureDataPacket';
import type ResourcePackClientResponsePacket from '../packet/ResourcePackClientResponsePacket';
import ResourcePackStackPacket from '../packet/ResourcePackStackPacket';
import StartGamePacket from '../packet/StartGamePacket';
import ResourcePackStatusType from '../type/ResourcePackStatusType';
import type PacketHandler from './PacketHandler';

export default class ResourcePackClientResponseHandler implements PacketHandler<ResourcePackClientResponsePacket> {
    public static NetID = Identifiers.ResourcePackClientResponsePacket;

    public async handle(
        packet: ResourcePackClientResponsePacket,
        server: Server,
        session: PlayerSession
    ): Promise<void> {
        if (packet.status === ResourcePackStatusType.HaveAllPacks) {
            const resourcePackStack = new ResourcePackStackPacket();
            resourcePackStack.texturePackRequired = false;
            resourcePackStack.experimentsAlreadyEnabled = false;
            await session.getConnection().sendDataPacket(resourcePackStack);
        } else if (packet.status === ResourcePackStatusType.Completed) {
            await this.sendJoinBurst(server, session);
        }
    }

    /**
     * Everything a client is sent between agreeing on resource packs and asking for a chunk
     * radius, in the order a Bedrock Dedicated Server sends it. Protocol 2193.
     *
     * 1. `JigsawStructureData`. The one exception to "StartGame first": a client that reaches
     *    StartGame without the jigsaw rules disconnects with `MissingStructureData`.
     * 2. `StartGame`. Nothing game-related may precede it. A client still in its login state
     *    treats game packets as malformed and drops with `InitialConnection-90`.
     * 3. `ItemRegistry` (our `ItemRegistryPacket`), `AvailableActorIdentifiers`,
     *    `BiomeDefinitionList`, `CreativeContent`, `CraftingData`, `AvailableCommands`. The
     *    registries the client builds its world from; it needs them before anything that
     *    references an item, an actor type or a biome.
     * 4. `PlayerList`. Added to everyone's list and sent the whole list. The client keys the
     *    list on uuids it only has after StartGame.
     * 5. `SetTime`, `SetSpawnPosition`. World state, once there is a world to apply it to.
     * 6. `SetPlayerGameType`, `UpdateAdventureSettings`, `UpdateAbilities`, `UpdateAttributes`,
     *    `SetActorData`. The local player, which the client creates when it handles StartGame.
     * 7. `InventoryContent`. Needs the item registry from step 3 and a player from step 6.
     * 8. The join message, as the last thing so it lands on a client that can show it.
     *
     * Not sent here, on purpose:
     * - `Respawn`. This sent three of them, including `CLIENT_READY_TO_SPAWN`, which only a
     *   client sends. No vanilla server sends a Respawn at login; see `PlayerSession.sendRespawn`.
     * - `LevelChunk` and `PlayStatus(PlayerSpawn)`. The client discards terrain that arrives
     *   before it has asked for a radius and been answered - see `PlayerSession.setViewDistance`.
     * - The entity spawns. They follow PlayerSpawn, from `announceSpawnIfReady`.
     * - A second round of settings and inventory. `Player.completeSpawn` runs once, from
     *   `SetLocalPlayerAsInitializedHandler`, because the client rebuilds its local player while
     *   spawning and throws away what step 6 told it.
     */
    private async sendJoinBurst(server: Server, session: PlayerSession): Promise<void> {
        const player = session.getPlayer();
        server
            .getLogger()
            .info(
                `§b${player.getName()}§f is attempting to join with id §b${player.getUUID()}§f (§b${player.getRuntimeId()}§f) from ${player
                    .getAddress()
                    .getAddress()}:${player.getAddress().getPort()}`
            );

        const spawnEvent = new PlayerSpawnEvent(player);
        server.post(['playerSpawn', spawnEvent]);
        if (spawnEvent.isCanceled()) return;

        const world = player.getWorld();
        const connection = session.getConnection();

        await connection.sendDataPacket(new JigsawStructureDataPacket());

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
        await connection.sendDataPacket(startGame);

        await connection.sendDataPacket(new ItemRegistryPacket());
        await connection.sendDataPacket(new AvailableActorIdentifiersPacket());
        await connection.sendDataPacket(new BiomeDefinitionListPacket());
        await session.sendCreativeContents();
        await session.sendCraftingData();
        await session.sendAvailableCommands();

        await session.addToPlayerList();
        await session.sendPlayerList();

        await session.sendTime(world.getTicks());

        const setSpawnPos = new SetSpawnPositionPacket();
        setSpawnPos.dimension = world.getDimension().id;
        setSpawnPos.position = worldSpawnPos;
        setSpawnPos.blockPosition = setSpawnPos.position;
        setSpawnPos.type = SpawnType.PLAYER_SPAWN;
        await connection.sendDataPacket(setSpawnPos);

        await player.sendSettings();
        await session.sendAttributes();
        await session.sendMetadata();

        await session.sendInventory();

        const chatSpawnEvent = new ChatEvent(
            new Chat({
                sender: server.getConsole()!,
                // The bare translation key: a color code in front of the `%` stops the
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
