import * as Packets from './Protocol';

import AdventureSettingsHandler from './handler/AdventureSettingsHandler';
import AnimateHandler from './handler/AnimateHandler';
import AvailableCommandsPacket from './packet/AvailableCommandsPacket';
import BiomeDefinitionListPacket from './packet/BiomeDefinitionListPacket';
import ChangeDimensionPacket from './packet/ChangeDimensionPacket';
import ChunkRadiusUpdatedPacket from './packet/ChunkRadiusUpdatedPacket';
import ClientCacheStatusHandler from './handler/ClientCacheStatusHandler';
import ClientCacheStatusPacket from './packet/ClientCacheStatusPacket';
import CommandBlockUpdatePacket from './packet/CommandBlockUpdatePacket';
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
import MobEquipmentHandler from './handler/MobEquipmentHandler';
import MobEquipmentPacket from './packet/MobEquipmentPacket';
import ModalFormResponseHandler from './handler/ModalFormResponseHandler';
import ModalFormResponsePacket from './packet/ModalFormResponsePacket';
import MoveActorAbsolutePacket from './packet/MoveActorAbsolutePacket';
import MovePlayerHandler from './handler/MovePlayerHandler';
import MovePlayerPacket from './packet/MovePlayerPacket';
import NetworkChunkPublisherUpdatePacket from './packet/NetworkChunkPublisherUpdatePacket';
import OnScreenTextureAnimationPacket from './packet/OnScreenTextureAnimationPacket';
import PacketHandler from './handler/PacketHandler';
import PacketViolationWarningHandler from './handler/PacketViolationWarningHandler';
import PacketViolationWarningPacket from './packet/PacketViolationWarningPacket';
import PlayStatusPacket from './packet/PlayStatusPacket';
import Player from '../player/Player';
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
import ServerSettingsRequestHandler from './handler/ServerSettingsRequestHandler';
import ServerSettingsRequestPacket from './packet/ServerSettingsRequestPacket';
import SetActorDataPacket from './packet/SetActorDataPacket';
import SetDefaultGameTypeHandler from './handler/SetDefaultGameTypeHandler';
import SetDefaultGameTypePacket from './packet/SetDefaultGameTypePacket';
import SetDisplayObjectivePacket from './packet/SetDisplayObjectivePacket';
import SetLocalPlayerAsInitializedHandler from './handler/SetLocalPlayerAsInitializedHandler';
import SetLocalPlayerAsInitializedPacket from './packet/SetLocalPlayerAsInitializedPacket';
import SetPlayerGameTypeHandler from './handler/SetPlayerGameTypeHandler';
import SetPlayerGameTypePacket from './packet/SetPlayerGameTypePacket';
import SetScorePacket from './packet/SetScorePacket';
import SetScoreboardIdentityPacket from './packet/SetScoreboardIdentityPacket';
import SetTimePacket from './packet/SetTimePacket';
import SetTitlePacket from './packet/SetTitlePacket';
import ShowCreditsPacket from './packet/ShowCreditsPacket';
import ShowProfilePacket from './packet/ShowProfilePacket';
import ShowStoreOfferPacket from './packet/ShowStoreOfferPacket';
import SpawnParticleEffectPacket from './packet/SpawnParticleEffectPacket';
import StartGamePacket from './packet/StartGamePacket';
import TextHandler from './handler/TextHandler';
import TickSyncHandler from './handler/TickSyncHandler';
import Timer from '../utils/Timer';
import TransferPacket from './packet/TransferPacket';
import UpdateAttributesPacket from './packet/UpdateAttributesPacket';
import UpdateBlockPacket from './packet/UpdateBlockPacket';
import WorldEventPacket from './packet/WorldEventPacket';

export default class PacketRegistry {
    private readonly logger: LoggerBuilder;
    private readonly packets: Map<number, Packets.DataPacket> = new Map();
    private readonly handlers: Map<number, PacketHandler<any>> = new Map();

    public constructor(server: Server) {
        this.logger = server.getLogger();
    }

    public async onEnable() {
        await this.loadPackets();
        await this.loadHandlers();
    }

    public async onDisable() {
        this.handlers.clear();
        this.packets.clear();
    }

    public registerPacket(packet: any): void {
        if (this.packets.has(packet.NetID))
            throw new Error(
                `Packet ${packet.name} is trying to use id ${packet.NetID.toString(16)} which already exists!`
            );

        this.packets.set(packet.NetID, packet);
        this.logger.silly(`Packet with id §b${packet.name}§r registered`, 'PacketRegistry/registerPacket');
    }

    public getPacket(id: number): any {
        if (!this.packets.has(id)) throw new Error(`Invalid packet with id ${id}!`);

        return this.packets.get(id)!;
    }

    public removePacket(id: number): void {
        this.packets.delete(id);
    }

    public registerHandler(id: number, handler: PacketHandler<any>): void {
        if (this.handlers.has(id)) throw new Error(`Handler with id ${id} already exists!`);

        this.handlers.set(id, handler);
        this.logger.silly(
            `Handler with id §b${handler.constructor.name}§r registered`,
            'PacketRegistry/registerHandler'
        );
    }

    public getHandler(id: number): PacketHandler<any> {
        if (!this.handlers.has(id)) throw new Error(`Invalid handler with id ${id.toString(16)}!`);

        return this.handlers.get(id)!;
    }

    /**
     * Merge two handlers.
     * This is useful if you want to extend a handler without actually replacing it.
     *
     * @param handler the first handler, executed first
     * @param handler2 the second handler
     */
    public appendHandler(handler: PacketHandler<any>, handler2: PacketHandler<any>): PacketHandler<any> {
        const res = new (class Handler {
            public async handle(packet: any, server: Server, player: Player) {
                await handler.handle(packet, server, player);
                await handler2.handle(packet, server, player);
            }
        })();

        return res as PacketHandler<any>;
    }

    /**
     * Remove a handler from the registry
     * @param id the handler id
     */
    public removeHandler(id: number): void {
        this.handlers.delete(id);
    }

    private async loadPackets(): Promise<void> {
        const timer = new Timer();

        // Dynamically register packets
        // We need to manually ignore DataPacket & BatchPacket
        Object.entries(Packets).map(
            ([, value]) => value.name !== 'DataPacket' && value.name !== 'BatchPacket' && this.registerPacket(value)
        );

        // TODO: remove these
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
        this.registerPacket(MobEquipmentPacket);
        this.registerPacket(MovePlayerPacket);
        this.registerPacket(MoveActorAbsolutePacket);
        this.registerPacket(NetworkChunkPublisherUpdatePacket);
        this.registerPacket(OnScreenTextureAnimationPacket);
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
        this.registerPacket(SetLocalPlayerAsInitializedPacket);
        this.registerPacket(SetPlayerGameTypePacket);
        this.registerPacket(SetScorePacket);
        this.registerPacket(SetScoreboardIdentityPacket);
        this.registerPacket(SetTimePacket);
        this.registerPacket(SetTitlePacket);
        this.registerPacket(ShowCreditsPacket);
        this.registerPacket(ShowProfilePacket);
        this.registerPacket(ShowStoreOfferPacket);
        this.registerPacket(SpawnParticleEffectPacket);
        this.registerPacket(TransferPacket);
        this.registerPacket(UpdateAttributesPacket);
        this.registerPacket(UpdateBlockPacket);
        this.registerPacket(WorldEventPacket);
        this.registerPacket(ModalFormResponsePacket);

        this.logger.debug(
            `Registered §b${this.packets.size}§r of §b${
                Array.from(Object.keys(Identifiers)).length - 2
            }§r packet(s) (took ${timer.stop()} ms)!`,
            'PacketRegistry/loadPackets'
        );
    }

    private async loadHandlers(): Promise<void> {
        const timer = new Timer();

        this.registerHandler(Identifiers.AdventureSettingsPacket, new AdventureSettingsHandler());
        this.registerHandler(Identifiers.AnimatePacket, new AnimateHandler());
        this.registerHandler(Identifiers.ClientCacheStatusPacket, new ClientCacheStatusHandler());
        this.registerHandler(Identifiers.ContainerClosePacket, new ContainerCloseHandler());
        this.registerHandler(Identifiers.CommandRequestPacket, new CommandRequestHandler());
        this.registerHandler(Identifiers.InteractPacket, new InteractHandler());
        this.registerHandler(Identifiers.InventoryTransactionPacket, new InventoryTransactionHandler());
        this.registerHandler(Identifiers.LevelSoundEventPacket, new LevelSoundEventHandler());
        this.registerHandler(Identifiers.LoginPacket, new LoginHandler());
        this.registerHandler(Identifiers.MobEquipmentPacket, new MobEquipmentHandler());
        this.registerHandler(Identifiers.MovePlayerPacket, new MovePlayerHandler());
        this.registerHandler(Identifiers.PacketViolationWarningPacket, new PacketViolationWarningHandler());
        this.registerHandler(Identifiers.PlayerActionPacket, new PlayerActionHandler());
        this.registerHandler(Identifiers.RequestChunkRadiusPacket, new RequestChunkRadiusHandler());
        this.registerHandler(Identifiers.ResourcePackResponsePacket, new ResourcePackResponseHandler());
        this.registerHandler(Identifiers.ServerSettingsRequestPacket, new ServerSettingsRequestHandler());
        this.registerHandler(Identifiers.SetDefaultGameTypePacket, new SetDefaultGameTypeHandler());
        this.registerHandler(Identifiers.SetLocalPlayerAsInitializedPacket, new SetLocalPlayerAsInitializedHandler());
        this.registerHandler(Identifiers.SetPlayerGameTypePacket, new SetPlayerGameTypeHandler());
        this.registerHandler(Identifiers.TextPacket, new TextHandler());
        this.registerHandler(Identifiers.TickSyncPacket, new TickSyncHandler());
        this.registerHandler(Identifiers.ModalFormResponsePacket, new ModalFormResponseHandler());

        this.logger.debug(
            `Registered §b${this.handlers.size}§r packet handler(s) (took ${timer.stop()} ms)!`,
            'PacketRegistry/loadHandlers'
        );
    }

    public getPackets(): Map<number, any> {
        return this.packets;
    }
}
