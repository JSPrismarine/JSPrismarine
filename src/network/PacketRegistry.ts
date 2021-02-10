import ActorFallPacket from './packet/ActorFallPacket';
import AddActorPacket from './packet/AddActorPacket';
import AddPlayerPacket from './packet/AddPlayerPacket';
import AdventureSettingsHandler from './handler/AdventureSettingsHandler';
import AdventureSettingsPacket from './packet/AdventureSettingsPacket';
import AnimateHandler from './handler/AnimateHandler';
import AnimatePacket from './packet/AnimatePacket';
import AvailableActorIdentifiersPacket from './packet/AvailableActorIdentifiersPacket';
import AvailableCommandsPacket from './packet/AvailableCommandsPacket';
import BiomeDefinitionListPacket from './packet/BiomeDefinitionListPacket';
import ChangeDimensionPacket from './packet/ChangeDimensionPacket';
import ChunkRadiusUpdatedPacket from './packet/ChunkRadiusUpdatedPacket';
import ClientCacheStatusHandler from './handler/ClientCacheStatusHandler';
import ClientCacheStatusPacket from './packet/ClientCacheStatusPacket';
import CommandRequestHandler from './handler/CommandRequestHandler';
import CommandRequestPacket from './packet/CommandRequestPacket';
import ContainerCloseHandler from './handler/ContainerCloseHandler';
import ContainerClosePacket from './packet/ContainerClosePacket';
import ContainerOpenPacket from './packet/ContainerOpenPacket';
import CreativeContentPacket from './packet/CreativeContentPacket';
import DisconnectPacket from './packet/DisconnectPacket';
import EmoteListPacket from './packet/EmoteListPacket';
import Identifiers from './Identifiers';
import InteractHandler from './handler/InteractHandler';
import InteractPacket from './packet/InteractPacket';
import InventoryContentPacket from './packet/InventoryContentPacket';
import InventoryTransactionHandler from './handler/InventoryTransactionHandler';
import InventoryTransactionPacket from './packet/InventoryTransactionPacket';
import ItemStackRequestPacket from './packet/ItemStackRequestPacket';
import ItemStackResponsePacket from './packet/ItemStackResponsePacket';
import LevelChunkPacket from './packet/LevelChunkPacket';
import LevelSoundEventHandler from './handler/LevelSoundEventHandler';
import LevelSoundEventPacket from './packet/LevelSoundEventPacket';
import LoggerBuilder from '../utils/Logger';
import LoginHandler from './handler/LoginHandler';
import LoginPacket from './packet/LoginPacket';
import MobEquipmentHandler from './handler/MobEquipmentHandler';
import MobEquipmentPacket from './packet/MobEquipmentPacket';
import ModalFormResponseHandler from './handler/ModalFormResponseHandler';
import ModalFormResponsePacket from './packet/ModalFormResponsePacket';
import MoveActorAbsolutePacket from './packet/MoveActorAbsolutePacket';
import MovePlayerHandler from './handler/MovePlayerHandler';
import MovePlayerPacket from './packet/MovePlayerPacket';
import NetworkChunkPublisherUpdatePacket from './packet/NetworkChunkPublisherUpdatePacket';
import PacketViolationWarningHandler from './handler/PacketViolationWarningHandler';
import PacketViolationWarningPacket from './packet/PacketViolationWarningPacket';
import PlayStatusPacket from './packet/PlayStatusPacket';
import PlayerActionHandler from './handler/PlayerActionHandler';
import PlayerActionPacket from './packet/PlayerActionPacket';
import PlayerListPacket from './packet/PlayerListPacket';
import PlayerSkinPacket from './packet/PlayerSkinPacket';
import RemoveActorPacket from './packet/RemoveActorPacket';
import RemoveObjectivePacket from './packet/RemoveObjectivePacket';
import RequestChunkRadiusHandler from './handler/RequestChunkRadiusHandler';
import RequestChunkRadiusPacket from './packet/RequestChunkRadiusPacket';
import ResourcePackResponseHandler from './handler/ResourcePackResponseHandler';
import ResourcePackResponsePacket from './packet/ResourcePackResponsePacket';
import ResourcePackStackPacket from './packet/ResourcePackStackPacket';
import ResourcePacksInfoPacket from './packet/ResourcePacksInfoPacket';
import type Server from '../Server';
import ServerSettingsRequestPacket from './packet/ServerSettingsRequestPacket';
import SetActorDataPacket from './packet/SetActorDataPacket';
import SetDefaultGameTypeHandler from './handler/SetDefaultGameTypeHandler';
import SetDefaultGameTypePacket from './packet/SetDefaultGameTypePacket';
import SetDisplayObjectivePacket from './packet/SetDisplayObjectivePacket';
import SetGamemodePacket from './packet/SetGamemodePacket';
import SetLocalPlayerAsInitializedHandler from './handler/SetLocalPlayerAsInitializedHandler';
import SetLocalPlayerAsInitializedPacket from './packet/SetLocalPlayerAsInitializedPacket';
import SetPlayerGameTypeHandler from './handler/SetPlayerGameTypeHandler';
import SetPlayerGameTypePacket from './packet/SetPlayerGameTypePacket';
import SetScorePacket from './packet/SetScorePacket';
import SetScoreboardIdentityPacket from './packet/SetScoreboardIdentityPacket';
import SetTimePacket from './packet/SetTimePacket';
import SetTitlePacket from './packet/SetTitlePacket';
import StartGamePacket from './packet/StartGamePacket';
import TextHandler from './handler/TextHandler';
import TextPacket from './packet/TextPacket';
import TickSyncHandler from './handler/TickSyncHandler';
import TickSyncPacket from './packet/TickSyncPacket';
import TransferPacket from './packet/TransferPacket';
import UpdateAttributesPacket from './packet/UpdateAttributesPacket';
import UpdateBlockPacket from './packet/UpdateBlockPacket';
import WorldEventPacket from './packet/WorldEventPacket';

export default class PacketRegistry {
    private readonly logger: LoggerBuilder;
    private readonly packets: Map<number, any> = new Map();
    private readonly handlers: Map<number, any> = new Map();

    public constructor(server: Server) {
        this.logger = server.getLogger();
    }

    public async onEnable() {
        this.loadPackets();
        this.loadHandlers();
    }

    public async onDisable() {
        this.handlers.clear();
        this.packets.clear();
    }

    private registerPacket(packet: any): void {
        this.packets.set(packet.NetID, packet);
        this.logger.silly(
            `Packet with id §b${packet.name}§r registered`,
            'PacketRegistry/registerPacket'
        );
    }

    private registerHandler(id: number, handler: object): void {
        this.handlers.set(id, handler);
        this.logger.silly(
            `Handler with id §b${handler.constructor.name}§r registered`,
            'PacketRegistry/registerHandler'
        );
    }

    private loadPackets(): void {
        const time = Date.now();

        this.registerPacket(ActorFallPacket);
        this.registerPacket(AddActorPacket);
        this.registerPacket(AddPlayerPacket);
        this.registerPacket(AdventureSettingsPacket);
        this.registerPacket(AnimatePacket);
        this.registerPacket(AvailableActorIdentifiersPacket);
        this.registerPacket(AvailableCommandsPacket);
        this.registerPacket(BiomeDefinitionListPacket);
        this.registerPacket(ChangeDimensionPacket);
        this.registerPacket(ChunkRadiusUpdatedPacket);
        this.registerPacket(ClientCacheStatusPacket);
        this.registerPacket(CommandRequestPacket);
        this.registerPacket(ContainerClosePacket);
        this.registerPacket(ContainerOpenPacket);
        this.registerPacket(CreativeContentPacket);
        this.registerPacket(DisconnectPacket);
        this.registerPacket(EmoteListPacket);
        this.registerPacket(InteractPacket);
        this.registerPacket(InventoryContentPacket);
        this.registerPacket(InventoryTransactionPacket);
        this.registerPacket(ItemStackRequestPacket);
        this.registerPacket(ItemStackResponsePacket);
        this.registerPacket(LevelChunkPacket);
        this.registerPacket(LevelSoundEventPacket);
        this.registerPacket(LoginPacket);
        this.registerPacket(MobEquipmentPacket);
        this.registerPacket(MovePlayerPacket);
        this.registerPacket(MoveActorAbsolutePacket);
        this.registerPacket(NetworkChunkPublisherUpdatePacket);
        this.registerPacket(PacketViolationWarningPacket);
        this.registerPacket(PlayerActionPacket);
        this.registerPacket(PlayerListPacket);
        this.registerPacket(PlayerSkinPacket);
        this.registerPacket(PlayStatusPacket);
        this.registerPacket(RemoveActorPacket);
        this.registerPacket(RemoveObjectivePacket);
        this.registerPacket(RequestChunkRadiusPacket);
        this.registerPacket(ResourcePackResponsePacket);
        this.registerPacket(ResourcePacksInfoPacket);
        this.registerPacket(ResourcePackStackPacket);
        this.registerPacket(ServerSettingsRequestPacket);
        this.registerPacket(SetActorDataPacket);
        this.registerPacket(SetDefaultGameTypePacket);
        this.registerPacket(SetDisplayObjectivePacket);
        this.registerPacket(SetGamemodePacket);
        this.registerPacket(SetLocalPlayerAsInitializedPacket);
        this.registerPacket(SetPlayerGameTypePacket);
        this.registerPacket(SetScorePacket);
        this.registerPacket(SetScoreboardIdentityPacket);
        this.registerPacket(SetTimePacket);
        this.registerPacket(SetTitlePacket);
        this.registerPacket(StartGamePacket);
        this.registerPacket(TextPacket);
        this.registerPacket(TickSyncPacket);
        this.registerPacket(TransferPacket);
        this.registerPacket(UpdateAttributesPacket);
        this.registerPacket(UpdateBlockPacket);
        this.registerPacket(WorldEventPacket);
        this.registerPacket(ModalFormResponsePacket);

        this.logger.debug(
            `Registered §b${this.packets.size}§r of §b${
                Array.from(Object.keys(Identifiers)).length - 2
            }§r packet(s) (took ${Date.now() - time} ms)!`,
            'PacketRegistry/loadPackets'
        );
    }

    private loadHandlers(): void {
        const time = Date.now();

        this.registerHandler(Identifiers.AdventureSettingsPacket, new AdventureSettingsHandler());
        this.registerHandler(Identifiers.AnimatePacket, new AnimateHandler());
        this.registerHandler(Identifiers.ClientCacheStatusPacket, new ClientCacheStatusHandler());
        this.registerHandler(Identifiers.ContainerClosePacket, new ContainerCloseHandler());
        this.registerHandler(Identifiers.CommandRequestPacket, new CommandRequestHandler());
        this.registerHandler(Identifiers.InteractPacket, new InteractHandler());
        this.registerHandler(
            Identifiers.InventoryTransactionPacket,
            new InventoryTransactionHandler()
        );
        this.registerHandler(Identifiers.LevelSoundEventPacket, new LevelSoundEventHandler());
        this.registerHandler(Identifiers.LoginPacket, new LoginHandler());
        this.registerHandler(Identifiers.MobEquipmentPacket, new MobEquipmentHandler());
        this.registerHandler(Identifiers.MovePlayerPacket, new MovePlayerHandler());
        this.registerHandler(
            Identifiers.PacketViolationWarningPacket,
            new PacketViolationWarningHandler()
        );
        this.registerHandler(Identifiers.PlayerActionPacket, new PlayerActionHandler());
        this.registerHandler(Identifiers.RequestChunkRadiusPacket, new RequestChunkRadiusHandler());
        this.registerHandler(
            Identifiers.ResourcePackResponsePacket,
            new ResourcePackResponseHandler()
        );
        this.registerHandler(Identifiers.SetDefaultGameTypePacket, new SetDefaultGameTypeHandler());
        this.registerHandler(
            Identifiers.SetLocalPlayerAsInitializedPacket,
            new SetLocalPlayerAsInitializedHandler()
        );
        this.registerHandler(Identifiers.SetPlayerGameTypePacket, new SetPlayerGameTypeHandler());
        this.registerHandler(Identifiers.TextPacket, new TextHandler());
        this.registerHandler(Identifiers.TickSyncPacket, new TickSyncHandler());
        this.registerHandler(Identifiers.ModalFormResponsePacket, new ModalFormResponseHandler());

        this.logger.debug(
            `Registered §b${this.handlers.size}§r packet handler(s) (took ${
                Date.now() - time
            } ms)!`,
            'PacketRegistry/loadHandlers'
        );
    }

    public getPackets(): Map<number, any> {
        return this.packets;
    }

    public getPacketHandler(id: number): object {
        if (this.handlers.has(id)) return this.handlers.get(id);

        throw new Error(`Missing handler for packet 0x${id.toString(16)}`);
    }
}
