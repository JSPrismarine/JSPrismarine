import { TitleType } from '@jsprismarine/minecraft';
import {
    AddActorPacket,
    AddItemActorPacket,
    AddPlayerPacket,
    ChangeDimensionPacket,
    CommandOutputPacket,
    ContainerClosePacket,
    ContainerOpenPacket,
    DisconnectPacket,
    InventoryContentPacket,
    InventorySlotPacket,
    LevelChunkPacket,
    ModalFormRequestPacket,
    MoveActorAbsolutePacket,
    MoveActorDeltaPacket,
    MovePlayerPacket,
    NetworkChunkPublisherUpdatePacket,
    PositionMode,
    RemoveActorPacket,
    RespawnPacket,
    SetHealthPacket,
    SetPlayerGameTypePacket,
    SetTitlePacket,
    TextPacket,
    UpdateAttributesPacket,
    UpdateBlockPacket
} from '@jsprismarine/protocol';

import type { Attribute, ItemStackDescriptorData, NetworkPacket, Text } from '@jsprismarine/protocol';
import type Client from './Client';
import type { DecodedPacket, PacketConstructor } from './net/ClientPacketRegistry';

/** What the server answered one of the player's commands with. */
export type WorldCommandOutput = NonNullable<ReturnType<CommandOutputPacket['getPacketData']>>;

/** A position in the world, in blocks. */
export interface WorldPosition {
    readonly x: number;
    readonly y: number;
    readonly z: number;
}

/** One actor the server has shown this client and not yet removed. */
export interface WorldActor {
    readonly runtimeId: bigint;
    readonly uniqueId: bigint;
    /** The actor's identifier, such as `minecraft:pig`; `minecraft:player` and `minecraft:item` for those packets. */
    readonly type: string;
    /** The player's name, for an actor `AddPlayer` introduced. */
    readonly name?: string;
    /** The stack, for an item actor. */
    readonly item?: ItemStackDescriptorData;
    position: WorldPosition;
    /** Attribute values by name, as the actor's `AddActor` and later `UpdateAttributes` gave them. */
    readonly attributes: Map<string, number>;
}

/** A title, subtitle or action bar line the server put on the HUD. */
export interface WorldTitles {
    title?: string;
    subtitle?: string;
    actionbar?: string;
}

/** A container screen the server opened. */
export interface WorldContainer {
    readonly windowId: number;
    readonly type: number;
    readonly position: WorldPosition;
}

/**
 * What a client knows about the world from the packets the server sent it: where its player
 * is, the chunks it holds, the actors it can see, its health and inventory, the chat and titles
 * it was shown, and the screens the server opened.
 *
 * A retail client draws these; this one keeps them where a test, a bot or a tool can read them.
 * It only listens: nothing here answers the server or changes what the client sends. The
 * client decodes only the packets something registered, so attaching a world registers the
 * ones it reads that the client does not already decode, and a client that never attaches one
 * spends nothing on them.
 *
 * Positions are the server's: the player's moves when the server teleports or corrects it, and
 * when the caller reports a move of its own through {@link ClientWorld.setPosition}.
 *
 * @example
 * ```typescript
 * const client = new Client({ host: '127.0.0.1' });
 * const world = new ClientWorld(client);
 * await client.connect();
 * console.log(world.health(), world.actorsOfType('minecraft:pig').length);
 * ```
 */
export default class ClientWorld {
    /** The packets this world reads, registered on the client's registry when it lacks them. */
    public static readonly PACKETS: readonly PacketConstructor[] = [
        AddActorPacket,
        AddItemActorPacket,
        AddPlayerPacket,
        ChangeDimensionPacket,
        CommandOutputPacket,
        ContainerClosePacket,
        ContainerOpenPacket,
        DisconnectPacket,
        InventoryContentPacket,
        InventorySlotPacket,
        LevelChunkPacket,
        ModalFormRequestPacket,
        MoveActorAbsolutePacket,
        MoveActorDeltaPacket,
        MovePlayerPacket,
        NetworkChunkPublisherUpdatePacket,
        RemoveActorPacket,
        RespawnPacket,
        SetHealthPacket,
        SetPlayerGameTypePacket,
        SetTitlePacket,
        TextPacket,
        UpdateAttributesPacket,
        UpdateBlockPacket
    ];

    private position: WorldPosition | undefined;
    private dimensionId: number | undefined;
    private gamemodeId: number | undefined;
    private readonly attributes = new Map<string, number>();
    private readonly actorsByRuntimeId = new Map<bigint, WorldActor>();
    /** The runtime id each unique id names, since `RemoveActor` names actors by unique id. */
    private readonly runtimeIds = new Map<bigint, bigint>();
    private publisher: { x: number; z: number; radius: number } | undefined;
    private readonly chunks = new Set<string>();
    private readonly blocks = new Map<string, number>();
    private readonly inventories = new Map<number, ItemStackDescriptorData[]>();
    private openContainer: WorldContainer | undefined;
    private readonly chatLines: Text[] = [];
    private readonly commandOutputs: WorldCommandOutput[] = [];
    private readonly titleLines: WorldTitles = {};
    private readonly formRequests: { readonly id: number; readonly json: string }[] = [];
    private disconnectReason: string | undefined;
    private respawnState: number | undefined;
    private teleports = 0;

    /**
     * Starts listening to a client's packets, for the life of the client.
     * @param client - The client whose packets this world reads. Attach before `connect` to see the join.
     */
    public constructor(private readonly client: Client) {
        const registry = client.getRegistry();
        for (const packet of ClientWorld.PACKETS) {
            if (!registry.has(new packet().getId())) registry.register(packet);
        }
        // The `packet` event carries every decoded packet, field-based ones included, whose
        // payload is the packet's own fields rather than a payload object.
        client.on('packet', ({ packet }: DecodedPacket) => this.read(packet));
        client.on('spawn', () => {
            const startGame = client.getStartGame();
            if (startGame === null) return;
            this.position ??= { ...startGame.position };
            this.dimensionId ??= startGame.dimension;
            this.gamemodeId ??= startGame.gamemode;
        });
    }

    /** The player's position, or `undefined` before the server placed it. */
    public getPosition(): WorldPosition | undefined {
        return this.position;
    }

    /** Records a move the caller made itself, such as one it reported in its input. */
    public setPosition(position: WorldPosition): void {
        this.position = { ...position };
    }

    /**
     * How many teleports of the player the server has sent. A client's next input after one
     * says it handled it, and an input that does not is still taken as from the old position.
     */
    public getTeleportCount(): number {
        return this.teleports;
    }

    /** The numeric id of the dimension the player is in, or `undefined` before the join. */
    public getDimension(): number | undefined {
        return this.dimensionId;
    }

    /** The player's game type, as `StartGame` and `SetPlayerGameType` numbered it. */
    public getGamemode(): number | undefined {
        return this.gamemodeId;
    }

    /** The value of one of the player's attributes, such as `minecraft:health`. */
    public attribute(name: string): number | undefined {
        return this.attributes.get(name);
    }

    /** The player's health, or `undefined` before the server sent it. */
    public health(): number | undefined {
        return this.attributes.get('minecraft:health');
    }

    /** The `state` of the last `Respawn` the server sent, or `undefined` when none came. */
    public getRespawnState(): number | undefined {
        return this.respawnState;
    }

    /** Every actor the client can see. */
    public actors(): WorldActor[] {
        return [...this.actorsByRuntimeId.values()];
    }

    /** The actors of one identifier the client can see. */
    public actorsOfType(type: string): WorldActor[] {
        return this.actors().filter((actor) => actor.type === type);
    }

    /** One actor by runtime id. */
    public actor(runtimeId: bigint): WorldActor | undefined {
        return this.actorsByRuntimeId.get(runtimeId);
    }

    /** Whether the client holds the chunk column at these chunk coordinates. */
    public hasChunk(chunkX: number, chunkZ: number): boolean {
        return this.chunks.has(`${chunkX},${chunkZ}`);
    }

    /** The chunk columns the client holds, as `x,z` keys. */
    public loadedChunks(): string[] {
        return [...this.chunks];
    }

    /**
     * Whether the client holds every column within `radius` chunks of the player.
     * @param radius - The radius in chunks, counted as a square around the player's column.
     */
    public chunksLoadedAround(radius: number): boolean {
        if (this.position === undefined) return false;
        const centerX = Math.floor(this.position.x) >> 4;
        const centerZ = Math.floor(this.position.z) >> 4;
        for (let x = centerX - radius; x <= centerX + radius; x++) {
            for (let z = centerZ - radius; z <= centerZ + radius; z++) {
                if (!this.chunks.has(`${x},${z}`)) return false;
            }
        }
        return true;
    }

    /** The runtime id of the block an `UpdateBlock` last set at this position, on the normal layer. */
    public blockAt(x: number, y: number, z: number): number | undefined {
        return this.blocks.get(`${x},${y},${z}`);
    }

    /** The contents of one window, as the last `InventoryContent` and the `InventorySlot`s after it left it. */
    public inventory(windowId: number): readonly ItemStackDescriptorData[] {
        return this.inventories.get(windowId) ?? [];
    }

    /** The container screen the server has open, or `undefined` when none is. */
    public getOpenContainer(): WorldContainer | undefined {
        return this.openContainer;
    }

    /** Every chat, system and translated line the server sent, oldest first. */
    public chat(): readonly Text[] {
        return this.chatLines;
    }

    /** What the server answered each of the player's commands with, oldest first. */
    public commandOutput(): readonly WorldCommandOutput[] {
        return this.commandOutputs;
    }

    /** The HUD's title, subtitle and action bar as the server last set them. */
    public titles(): Readonly<WorldTitles> {
        return this.titleLines;
    }

    /** Every form the server asked the player to fill in, oldest first. */
    public forms(): readonly { readonly id: number; readonly json: string }[] {
        return this.formRequests;
    }

    /** The reason the server gave when it disconnected the client, or `undefined` while it has not. */
    public getDisconnectReason(): string | undefined {
        return this.disconnectReason;
    }

    private ownRuntimeId(): bigint | undefined {
        return this.client.getStartGame()?.runtimeEntityId;
    }

    private read(packet: NetworkPacket): void {
        if (packet instanceof MovePlayerPacket) {
            const move = packet.getPacketData();
            if (move === null) return;
            if (move.runtimeEntityId !== this.ownRuntimeId()) {
                this.moveActor(move.runtimeEntityId, vector(move.position));
                return;
            }
            this.setPosition(vector(move.position));
            if (move.mode === PositionMode.Teleport) this.teleports++;
        } else if (packet instanceof ChangeDimensionPacket) {
            const change = packet.getPacketData();
            if (change === null) return;
            this.dimensionId = change.dimension;
            this.position = vector(change.position);
            // A new dimension starts with nothing loaded and nothing in sight.
            this.chunks.clear();
            this.blocks.clear();
            this.actorsByRuntimeId.clear();
            this.runtimeIds.clear();
            this.publisher = undefined;
        } else if (packet instanceof RespawnPacket) {
            const respawn = packet.getPacketData();
            if (respawn === null) return;
            this.respawnState = respawn.state;
            this.position = { ...respawn.position };
        } else if (packet instanceof SetPlayerGameTypePacket) {
            const gametype = packet.getPacketData()?.gametype;
            if (gametype !== undefined) this.gamemodeId = gametype;
        } else if (packet instanceof SetHealthPacket) {
            const health = packet.getPacketData()?.health;
            if (health !== undefined) this.attributes.set('minecraft:health', health);
        } else if (packet instanceof UpdateAttributesPacket) {
            const values =
                packet.runtimeEntityId === this.ownRuntimeId()
                    ? this.attributes
                    : this.actor(packet.runtimeEntityId)?.attributes;
            if (values !== undefined) setAttributes(values, packet.attributes);
        } else if (packet instanceof AddActorPacket) {
            this.addActor({
                runtimeId: packet.runtimeEntityId,
                uniqueId: packet.uniqueEntityId === 0n ? packet.runtimeEntityId : packet.uniqueEntityId,
                type: packet.type,
                position: vector(packet.position),
                attributes: setAttributes(new Map(), packet.attributes)
            });
        } else if (packet instanceof AddPlayerPacket) {
            const player = packet.getPacketData();
            if (player === null) return;
            this.addActor({
                runtimeId: player.runtimeEntityId,
                uniqueId: player.runtimeEntityId,
                type: 'minecraft:player',
                name: player.name,
                position: vector(player.position),
                attributes: new Map()
            });
        } else if (packet instanceof AddItemActorPacket) {
            const item = packet.getPacketData();
            if (item === null) return;
            this.addActor({
                runtimeId: item.runtimeEntityId,
                uniqueId: item.targetActorId === 0n ? item.runtimeEntityId : item.targetActorId,
                type: 'minecraft:item',
                item: item.item,
                position: vector(item.position),
                attributes: new Map()
            });
        } else if (packet instanceof RemoveActorPacket) {
            const runtimeId = this.runtimeIds.get(packet.uniqueEntityId) ?? packet.uniqueEntityId;
            this.actorsByRuntimeId.delete(runtimeId);
            this.runtimeIds.delete(packet.uniqueEntityId);
        } else if (packet instanceof MoveActorAbsolutePacket) {
            this.moveActor(packet.runtimeEntityId, vector(packet.position));
        } else if (packet instanceof MoveActorDeltaPacket) {
            const actor = this.actor(packet.runtimeEntityId);
            if (actor === undefined) return;
            actor.position = {
                x: packet.positionX ?? actor.position.x,
                y: packet.positionY ?? actor.position.y,
                z: packet.positionZ ?? actor.position.z
            };
        } else if (packet instanceof NetworkChunkPublisherUpdatePacket) {
            const update = packet.getPacketData();
            if (update === null) return;
            this.publisher = { x: update.position.x >> 4, z: update.position.z >> 4, radius: update.radius >> 4 };
            // A Bedrock client drops the columns that left the publisher's radius.
            for (const key of [...this.chunks]) {
                const [x, z] = key.split(',').map(Number);
                if (!this.inView(x!, z!)) this.chunks.delete(key);
            }
        } else if (packet instanceof LevelChunkPacket) {
            const chunk = packet.getPacketData();
            if (chunk !== null && this.inView(chunk.chunkX, chunk.chunkZ))
                this.chunks.add(`${chunk.chunkX},${chunk.chunkZ}`);
        } else if (packet instanceof UpdateBlockPacket) {
            if (packet.layer === 0) this.blocks.set(`${packet.x},${packet.y},${packet.z}`, packet.blockRuntimeId);
        } else if (packet instanceof InventoryContentPacket) {
            this.inventories.set(packet.windowId, [...packet.items]);
        } else if (packet instanceof InventorySlotPacket) {
            const items = this.inventories.get(packet.windowId) ?? [];
            if (packet.item !== null) items[packet.inventorySlot] = packet.item;
            this.inventories.set(packet.windowId, items);
        } else if (packet instanceof ContainerOpenPacket) {
            this.openContainer = {
                windowId: packet.windowId,
                type: packet.containerType,
                position: vector(packet.containerPos)
            };
        } else if (packet instanceof ContainerClosePacket) {
            if (this.openContainer?.windowId === packet.containerId) this.openContainer = undefined;
        } else if (packet instanceof TextPacket) {
            const text = packet.getPacketData();
            if (text !== null) this.chatLines.push(text);
        } else if (packet instanceof CommandOutputPacket) {
            const output = packet.getPacketData();
            if (output !== null) this.commandOutputs.push(output);
        } else if (packet instanceof SetTitlePacket) {
            this.setTitle(packet);
        } else if (packet instanceof ModalFormRequestPacket) {
            this.formRequests.push({ id: packet.formId, json: packet.formUiJson });
        } else if (packet instanceof DisconnectPacket) {
            this.disconnectReason = packet.getPacketData()?.messages.message ?? '';
        }
    }

    /** Whether a column is inside the publisher's radius, or anywhere before the first update. */
    private inView(chunkX: number, chunkZ: number): boolean {
        if (this.publisher === undefined) return true;
        const { x, z, radius } = this.publisher;
        return Math.max(Math.abs(chunkX - x), Math.abs(chunkZ - z)) <= radius;
    }

    private addActor(actor: WorldActor): void {
        this.actorsByRuntimeId.set(actor.runtimeId, actor);
        this.runtimeIds.set(actor.uniqueId, actor.runtimeId);
    }

    private moveActor(runtimeId: bigint, position: WorldPosition): void {
        const actor = this.actor(runtimeId);
        if (actor !== undefined) actor.position = position;
    }

    private setTitle(packet: SetTitlePacket): void {
        switch (packet.titleType) {
            case TitleType.CLEAR:
            case TitleType.RESET:
                delete this.titleLines.title;
                delete this.titleLines.subtitle;
                delete this.titleLines.actionbar;
                return;
            case TitleType.TITLE:
            case TitleType.TITLE_TEXT_OBJECT:
                this.titleLines.title = packet.titleText;
                return;
            case TitleType.SUBTITLE:
            case TitleType.SUBTITLE_TEXT_OBJECT:
                this.titleLines.subtitle = packet.titleText;
                return;
            case TitleType.ACTIONBAR:
            case TitleType.ACTIONBAR_TEXT_OBJECT:
                this.titleLines.actionbar = packet.titleText;
                return;
            default:
                return;
        }
    }
}

/** Copies a vector, the math package's class or a plain record, into a plain position. */
const vector = (value: { getX(): number; getY(): number; getZ(): number } | WorldPosition): WorldPosition =>
    'getX' in value ? { x: value.getX(), y: value.getY(), z: value.getZ() } : { x: value.x, y: value.y, z: value.z };

/** Writes attribute values into a map by name, and returns the map. */
const setAttributes = (into: Map<string, number>, attributes: readonly Attribute[]): Map<string, number> => {
    for (const attribute of attributes) into.set(attribute.getName(), attribute.getValue());
    return into;
};
