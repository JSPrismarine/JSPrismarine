import Chat, { ChatType } from '../../chat/Chat';
import ChatEvent from '../../events/chat/ChatEvent';
import Identifiers from '../Identifiers';
import type PacketHandler from './PacketHandler';
import type { PlayerSession, Server } from '../../';
import Vector3 from '../../math/Vector3';
import {
    Difficulty,
    Dimension,
    Gamemode,
    ResourcePackResponse,
    ServerAuthMovementMode,
    SpawnBiome
} from '@jsprismarine/minecraft';
import {
    Experiments,
    LevelSettings,
    PacketData,
    PlayStatus,
    SpawnSettings,
    SyncedPlayerMovementSettings,
    Vec2
} from '@jsprismarine/protocol';
import { PlayerPermissionLevel } from '@jsprismarine/minecraft';
import { StartGamePacket, ResourcePackStackPacket } from '@jsprismarine/protocol';
import { NBTTagCompound } from '@jsprismarine/nbt';
import { UUID } from '../../utils/UUID';

export default class ResourcePackResponseHandler implements PacketHandler<PacketData.ResourcePackClientResponse> {
    public static NetID = Identifiers.ResourcePackResponsePacket;

    public async handle(
        data: PacketData.ResourcePackClientResponse,
        server: Server,
        session: PlayerSession
    ): Promise<void> {
        if (data.response === ResourcePackResponse.DOWNLOADING_FINISHED) {
            session.getConnection().sendNetworkPacket(
                new ResourcePackStackPacket({
                    baseGameVersion: Identifiers.MinecraftVersions[0] ?? '1.20.70', // TODO: get a single target versions, and then compatible ones as array
                    texturePackRequired: false,
                    texturePackList: [],
                    addonList: [],
                    experiments: new Experiments()
                })
            );
        } else if (data.response === ResourcePackResponse.RESOURCE_PACK_STACK_FINISHED) {
            session.addToPlayerList();

            const world = session.getPlayer().getWorld();

            session.sendTime(world.getTicks());

            session.getConnection().sendNetworkPacket(
                new StartGamePacket({
                    targetActorRuntimeId: session.getPlayer().getRuntimeId(),
                    targetActorUniqueId: session.getPlayer().getRuntimeId(),
                    gamemode: Gamemode.Gametype.WORLD_DEFAULT,
                    position: new Vector3(
                        session.getPlayer().getX(),
                        session.getPlayer().getY(),
                        session.getPlayer().getZ()
                    ),
                    rotation: new Vec2(session.getPlayer().bodyYaw, session.getPlayer().pitch),
                    levelSettings: new LevelSettings(
                        BigInt(session.getPlayer().getWorld().getSeed()),
                        new SpawnSettings(SpawnBiome.DEFAULT, 'plains', Dimension.OVERWORLD),
                        Difficulty.NORMAL,
                        await session.getPlayer().getWorld().getSpawnPosition(),
                        session.getPlayer().getWorld().getTicks(),
                        0,
                        0,
                        true,
                        new Set(),
                        PlayerPermissionLevel.MEMBER
                    ),
                    levelId: session.getPlayer().getWorld().getUniqueId(),
                    levelName: session.getPlayer().getWorld().getName(),
                    movementSettings: new SyncedPlayerMovementSettings(
                        ServerAuthMovementMode.CLIENT_AUTHORITATIVE,
                        0,
                        false
                    ),
                    currentLevelTime: BigInt(session.getPlayer().getWorld().getTicks()),
                    serverVersion: server.getVersion(),
                    playerPropertyData: new NBTTagCompound(),
                    serverBlockTypeRegistryChecksum: 0n,
                    serverEnableClientSideGeneration: false,
                    templateContentIdentity: '',
                    isTrial: false,
                    enchantmentSeed: 0,
                    blockProperties: [],
                    itemList: [],
                    multiplayerCorrelationId: '',
                    enableItemStackNetManager: false,
                    worldTemplateId: UUID.fromRandom(),
                    blockNetworkIdsAreHashes: false,
                    serverAuthSoundEnabled: false
                })
            );

            // const itemComponent = new ItemComponentPacket();
            // await session.getConnection().sendDataPacket(itemComponent);

            // const setSpawPos = new SetSpawnPositionPacket();
            // setSpawPos.dimension = 3; // TODO: enum
            // setSpawPos.position = new Vector3(-2147483648, -2147483648, -2147483648);
            // setSpawPos.blockPosition = setSpawPos.position;
            // setSpawPos.type = SpawnType.PLAYER_SPAWN;
            // await session.getConnection().sendDataPacket(setSpawPos);

            session.sendTime(world.getTicks());

            // TODO: set difficulty packet
            // TODO: set commands enabled packet

            // await session.sendSettings();
            // await session.sendAbilities();

            // TODO: game rules changed packet

            session.sendPlayerList();

            // await session.getConnection().sendDataPacket(new BiomeDefinitionListPacket());
            // await session.getConnection().sendDataPacket(new AvailableActorIdentifiersPacket());

            // TODO: player fog packet

            // await session.sendAttributes(player.getAttributeManager().getDefaults());

            // await session.sendMetadata();

            // await session.sendCreativeContents();

            // Some packets...

            // TODO: inventory crafting data

            // TODO: available commands

            /* const respawnPacket = new RespawnPacket();
            respawnPacket.state = RespawnState.SERVER_SEARCHING_FOR_SPAWN;
            respawnPacket.position = await world.getSpawnPosition();
            respawnPacket.runtimeEntityId = player.getRuntimeId();
            await session.getConnection().sendDataPacket(respawnPacket);

            respawnPacket.state = RespawnState.SERVER_READY_TO_SPAWN;
            await session.getConnection().sendDataPacket(respawnPacket);
            await session.getConnection().sendDataPacket(respawnPacket); */

            /// TODO: general handler refactor ///

            // Sent to let know the client saved chunks
            session
                .getPlayer()
                .sendInitialSpawnChunks()
                .then(() => session.getConnection().getPlayerSession()?.sendPlayStatus(PlayStatus.PLAYER_SPAWN));
            // TODO
            /* session
                .getPlayer()
                .sendInitialSpawnChunks()
                .then(
                    async () => {
                        // todo: set health packet
                        await session.sendPlayStatus(PlayStatusType.PlayerSpawn);
                    },
                    () =>
                        server
                            .getLogger()
                            ?.error(
                                `Failed to spawn player[${session.getConnection().getRakNetSession().getAddress()}]`
                            )
                )
                .finally(async () => {
                    // Summon player(s) & entities
                    await Promise.all([
                        server
                            .getSessionManager()
                            .getAllPlayers()
                            .filter((p) => p !== player)
                            .map(async (p) => {
                                await p.getNetworkSession().sendSpawn(player);
                                await session.sendSpawn(p);
                            }),
                        player
                            .getWorld()
                            .getEntities()
                            .filter((e) => !e.isPlayer())
                            .map(async (entity) => entity.sendSpawn(player))
                    ]);
                }); */

            const player = session.getPlayer();

            server
                .getLogger()
                ?.info(
                    `§b${player.getName()}§f is attempting to join with id §b${player.getRuntimeId()}§f from ${player
                        .getAddress()
                        .getAddress()}:${player.getAddress().getPort()}`,
                    'Handler/ResourcePackResponseHandler'
                );

            player.setNameTag(player.getName()); // TODO: why tf is this here... should be in entity creation :facepalm:
            // TODO: always visible nametag

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
