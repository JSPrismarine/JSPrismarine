import { block_definitions } from '@jsprismarine/bedrock-data';
import BinaryStream from '@jsprismarine/binaryutils';
import { Vector3 } from '@jsprismarine/math';
import { Difficulty, Dimension, Generator } from '@jsprismarine/minecraft';
import { ByteOrder, NBTReader, NBTTagCompound, NBTWriter } from '@jsprismarine/nbt';
import { BlockStateSchemas } from '../../block/state/BlockStateSchema';
import { NetworkUtil } from '../../network/NetworkUtil';
import UUID from '../../utils/UUID';
import GameRuleManager from '../../world/GameRuleManager';
import { minecraftVersions } from '../codec/v2193';
import DataPacket from './DataPacket';
import { readGameRule, writeGameRule } from '../type/GameRule';

import type { BlockProperty } from '@jsprismarine/protocol';
import type { GameRule } from '../type/GameRule';

/**
 * Tells a joining client who it is, where it is, and what world it is in.
 *
 * **Bound To:** Client
 *
 * Protocol 2193 (Minecraft 1.26.50) layout, in wire order. Field names are the ones Mojang's
 * documentation uses. The same layout is decoded by `@jsprismarine/protocol`'s
 * `StartGamePacket`, which round-trips a packet captured from a Bedrock Dedicated Server 1.26.51.
 *
 * | Name | Type | Notes |
 * | ---- |:----:|:-----:|
 * | Entity ID | VarLong | `entityId` |
 * | Runtime ID | UnsignedVarLong | `runtimeEntityId` |
 * | Game Type | VarInt | `gamemode` |
 * | Position | Vec3 (LFloat) | `playerPos` |
 * | Rotation | Vec2 (LFloat) | `pitch`, `yaw` |
 * | Settings | LevelSettings | See below |
 * | Level ID | String | `levelId` |
 * | Level Name | String | `worldName` |
 * | Template Content Identity | String | Nil UUID string |
 * | Is Trial | Boolean | false |
 * | Movement Settings | SyncedPlayerMovementSettings | Rewind History Size (VarInt), Server Authoritative Block Breaking (Boolean `serverAuthoritativeBlockBreaking`) |
 * | Level Current Time | LUnsignedLong | `ticks` |
 * | Enchantment Seed | VarInt | 0 |
 * | Block Properties | UnsignedVarInt count, then Block Name (String) + Block Definition (network NBT) | Data driven vanilla blocks, then plugin blocks |
 * | Multiplayer Correlation Id | String | Empty |
 * | Enable Item Stack Net Manager | Boolean | true |
 * | Server Version | String | The newest game version of this packet's protocol |
 * | Player Property Data | Network NBT compound | Empty |
 * | Server Block Type Registry Checksum | LUnsignedLong | 0 |
 * | World Template ID | UUID | Nil |
 * | Server Enabled ClientSide Generation | Boolean | false |
 * | BlockNetworkIds Are Hashes | Boolean | true |
 * | NetworkPermissions | Server Auth Sound Enabled (Boolean) | false |
 * | Server Configuration Join Info | Optional | Present and empty: true, then false for each of gathering, clientStoreEntryPoint, presence |
 * | Server Telemetry Data | Server Id, Scenario Id, World Id, Owner Id (String) | `serverIdentifier`, `scenarioIdentifier`, `worldIdentifier`, empty |
 *
 * LevelSettings, in wire order: Seed (LUnsignedLong), Spawn Settings (Spawn Biome Type LShort,
 * User Defined Biome Name String, Dimension VarInt `dimension`), Generator Type (VarInt
 * `generator`), Game Type (VarInt `defaultGamemode`),
 * Is Hardcore, Game Difficulty (VarInt), Default Spawn Block Position (three VarInt), Achievements
 * Disabled, Editor World Type (VarInt), Is Created In Editor, Is Exported From Editor, Day Cycle
 * Stop Time (VarInt), Education Edition Offer (UnsignedVarInt), Education Features Enabled,
 * Education Product ID (String), Rain Level (LFloat), Lightning Level (LFloat), Has Confirmed
 * Platform Locked Content, Multiplayer Game Intent, LAN Broadcast Intent, Xbox Live Broadcast
 * Setting (VarInt), Platform Broadcast Setting (VarInt), Commands Enabled, Texture Packs Required,
 * Rule Data (game rules), Experiments (LUnsignedInt count, toggles, ExperimentsEverToggled), Has
 * Bonus Chest Enabled, Start With Map Enabled, Player Permissions (Byte), Server Chunk Tick Range
 * (LInt), Has Locked Behavior Pack, Has Locked Resource Pack, Is From Locked Template, Use Msa
 * Gamertags Only, Is From World Template, Is World Template Option Locked, Only Spawn V1
 * Villagers, Persona Disabled, Custom Skins Disabled, Emote Chat Muted, Base Game Version
 * (String), Limited World Width (LInt), Limited World Depth (LInt), Nether Type, Edu Shared Uri
 * Resource (Button Name String, Link Uri String), Override Force Experimental Gameplay (Optional
 * Boolean), Chat Restriction Level (Byte), Disable Player Interactions, Server Editor Connection
 * Policy (VarInt), Allow Anonymous Block Drops In Editor Worlds. Unlabeled types are Boolean.
 */
export default class StartGamePacket extends DataPacket {
    public entityId!: bigint;
    public runtimeEntityId!: bigint;
    public gamemode!: number;
    public defaultGamemode: number = 0;

    /** Game Difficulty, which the client shows on its own pause screen. */
    public difficulty: Difficulty = Difficulty.NORMAL;

    /**
     * Generator Type of the world. A dedicated server sends `Flat` for a flat world and
     * `Overworld` for a generated one; the client reads it for its horizon and fog.
     */
    public generator: Generator = Generator.OVERWORLD;

    /** Dimension the player spawns in, from the world's own definition. */
    public dimension: Dimension = Dimension.OVERWORLD;

    public playerPos: Vector3 = new Vector3(0, 5, 0);
    public pitch: number = 0;
    public yaw: number = 0;

    public serverIdentifier!: string;
    public worldIdentifier!: string;
    public scenarioIdentifier!: string;
    public levelId!: string;
    public worldName!: string;
    /** The world seed, which the wire carries as a uint64 and the client shows as it is. */
    public seed!: bigint;
    public time: number = 0;
    public ticks: number = 0;

    /**
     * `Server Authoritative Block Breaking`: whether the server times block breaking. On, as a
     * Bedrock Dedicated Server sends it, the client reports a break it predicts as
     * `PREDICT_DESTROY_BLOCK` inside `PlayerAuthInput` and the server animates the cracks. Off,
     * the client breaks the block itself and reports it with an `InventoryTransaction`.
     */
    public serverAuthoritativeBlockBreaking = true;

    public worldSpawnPos!: Vector3;

    /**
     * `Rule Data`: the world's rules when the server builds the packet, the rules as the wire
     * carried them when the packet was decoded, or null to send none.
     */
    public gameRules: GameRuleManager | readonly GameRule[] | null = null;

    /**
     * `Block Properties`, or null to send the captured vanilla definitions
     * plus whatever schemas plugins registered.
     *
     * Set from the content registries when the content build is on, which is
     * the only way a block that build invented reaches the client: with
     * hashed runtime ids a block the client was never told about has a
     * number it cannot resolve.
     */
    public blockProperties: readonly BlockProperty[] | null = null;

    public encodePayload(): void {
        this.writeVarLong(this.entityId); // Entity ID
        this.writeUnsignedVarLong(this.runtimeEntityId); // Runtime ID

        this.writeVarInt(this.gamemode); // Game Type

        NetworkUtil.writeVector3(this, this.playerPos); // Position
        this.writeFloatLE(this.pitch); // Rotation X
        this.writeFloatLE(this.yaw); // Rotation Y

        // LevelSettings.
        // Seed is a uint64. A negative seed goes out as its two's complement bytes.
        this.writeUnsignedLongLE(BigInt.asUintN(64, this.seed));

        this.writeShortLE(0); // Spawn Biome Type: Default
        NetworkUtil.writeString(this, 'minecraft:plains'); // User Defined Biome Name
        this.writeVarInt(this.dimension); // Dimension

        this.writeVarInt(this.generator); // Generator Type
        this.writeVarInt(this.defaultGamemode); // Game Type, the world default

        this.writeBoolean(false); // Is Hardcore

        this.writeVarInt(this.difficulty); // Game Difficulty

        // Default Spawn Block Position, three signed varints. Y included: an unsigned Y is
        // wrong for a spawn below zero.
        this.writeVarInt(this.worldSpawnPos.getX());
        this.writeVarInt(this.worldSpawnPos.getY());
        this.writeVarInt(this.worldSpawnPos.getZ());

        this.writeBoolean(true); // Achievements Disabled

        this.writeVarInt(0); // Editor World Type: NonEditor
        this.writeBoolean(false); // Is Created In Editor
        this.writeBoolean(false); // Is Exported From Editor

        this.encodeEditorLevelMigrationVersion();

        this.writeVarInt(this.time); // Day Cycle Stop Time
        this.writeUnsignedVarInt(0); // Education Edition Offer: None
        this.writeBoolean(false); // Education Features Enabled
        NetworkUtil.writeString(this, ''); // Education Product ID

        this.writeFloatLE(0); // Rain Level
        this.writeFloatLE(0); // Lightning Level

        this.writeByte(0); // Has Confirmed Platform Locked Content
        this.writeByte(1); // Multiplayer Game Intent
        this.writeByte(1); // LAN Broadcast Intent

        this.writeVarInt(4); // Xbox Live Broadcast Setting: Public
        this.writeVarInt(4); // Platform Broadcast Setting: Public

        this.writeByte(1); // Commands Enabled
        this.writeByte(0); // Texture Packs Required

        // Rule Data: a varuint32 count, then each rule.
        if (this.gameRules instanceof GameRuleManager) this.gameRules.networkSerialize(this);
        else {
            const rules = this.gameRules ?? [];
            this.writeUnsignedVarInt(rules.length);
            for (const rule of rules) writeGameRule(this, rule);
        }

        // Experiments. The toggle count is the one list in the packet counted by a fixed
        // 32 bit integer.
        this.writeUnsignedIntLE(0);
        this.writeBoolean(false); // ExperimentsEverToggled

        this.writeByte(0); // Has Bonus Chest Enabled
        this.writeByte(0); // Start With Map Enabled

        this.writeByte(1); // Player Permissions: Member. One plain byte, not a varint.

        this.writeUnsignedIntLE(4); // Server Chunk Tick Range

        this.writeByte(0); // Has Locked Behavior Pack
        this.writeByte(0); // Has Locked Resource Pack
        this.writeByte(0); // Is From Locked Template
        this.writeByte(0); // Use Msa Gamertags Only
        this.writeByte(0); // Is From World Template
        this.writeByte(0); // Is World Template Option Locked
        this.writeByte(0); // Only Spawn V1 Villagers
        this.writeByte(0); // Persona Disabled
        this.writeByte(0); // Custom Skins Disabled
        this.writeByte(0); // Emote Chat Muted
        NetworkUtil.writeString(this, '*'); // Base Game Version

        // Limited World Width and Depth only mean something to the Legacy generator, but a
        // dedicated server sends 16 and 16 for every world.
        this.writeIntLE(16);
        this.writeIntLE(16);

        this.writeBoolean(false); // Nether Type: false, as a dedicated server sends it

        NetworkUtil.writeString(this, ''); // Edu Shared Uri Resource: Button Name
        NetworkUtil.writeString(this, ''); // Edu Shared Uri Resource: Link Uri

        this.writeBoolean(false); // Override Force Experimental Gameplay: absent

        this.writeByte(0); // Chat Restriction Level: None
        this.writeByte(0); // Disable Player Interactions

        this.writeVarInt(0); // Server Editor Connection Policy: MatchWorldType
        this.writeBoolean(false); // Allow Anonymous Block Drops In Editor Worlds
        // End of LevelSettings.

        NetworkUtil.writeString(this, this.levelId); // Level ID
        NetworkUtil.writeString(this, this.worldName); // Level Name
        NetworkUtil.writeString(this, '00000000-0000-0000-0000-000000000000'); // Template Content Identity

        this.writeByte(0); // Is Trial

        // Movement Settings: a rewind history size and a block breaking flag, nothing in
        // front of them. The movement mode byte that used to lead them left with 1.21.90;
        // writing it puts every later field one byte out.
        this.writeVarInt(0); // Rewind History Size
        this.writeBoolean(this.serverAuthoritativeBlockBreaking); // Server Authoritative Block Breaking

        this.writeUnsignedLongLE(BigInt(this.ticks)); // Level Current Time

        this.writeVarInt(0); // Enchantment Seed

        // Block Properties: every block the client does not have built in. That is a plugin's
        // blocks, and since 1.26.50 also the vanilla blocks defined in data (the wool stairs
        // and slabs, the concrete slabs), which go out as a Bedrock Dedicated Server sends
        // them. Other vanilla blocks are left out on purpose: the client has them, and with
        // hashed runtime ids nothing depends on the order or size of this list.
        if (this.blockProperties === null) this.writeManagerBlockProperties();
        else {
            this.writeUnsignedVarInt(this.blockProperties.length);
            for (const block of this.blockProperties) {
                NetworkUtil.writeString(this, block.name); // Block Name
                this.write(block.definition); // Block Definition
            }
        }

        // The item table is not part of this packet since 1.21.60; `ItemRegistryPacket`
        // carries it.
        NetworkUtil.writeString(this, ''); // Multiplayer Correlation Id
        this.writeBoolean(true); // Enable Item Stack Net Manager

        // Server Version: the newest game version of this packet's protocol, for Mojang's
        // telemetry. Read from the version module, not the codec registry, because the
        // registry's codecs reach this class back through their packet tables.
        NetworkUtil.writeString(this, this.gameVersion());

        // Player Property Data: an empty network NBT compound.
        const properties = new BinaryStream();
        const nbt = new NBTWriter(properties, ByteOrder.LITTLE_ENDIAN);
        nbt.setUseVarint(true);
        nbt.writeCompound(new NBTTagCompound());
        this.write(properties.getBuffer());

        this.writeUnsignedLongLE(0n); // Server Block Type Registry Checksum

        // World Template ID. The nil UUID says the world was not made from a template, which
        // is what a Bedrock Dedicated Server sends.
        new UUID(0, 0, 0, 0).networkSerialize(this);

        // Server Enabled ClientSide Generation. When this is on, the client generates vanilla
        // terrain from the seed for any chunk missing from the saved-chunks list in
        // NetworkChunkPublisherUpdate, which the server always sends empty. Our generators
        // are not vanilla, so keep it off, as a Bedrock Dedicated Server does.
        this.writeBoolean(false);

        // BlockNetworkIds Are Hashes. Block runtime ids are hashes of each block's name and
        // state rather than positions in the client's palette, which is what lets the server
        // compute them from its own definitions.
        this.writeByte(1);

        this.writeByte(0); // NetworkPermissions: Server Auth Sound Enabled

        // Server Configuration Join Info: present, with none of its three optional parts. A
        // dedicated server with no gathering, store entry point or presence sends exactly this.
        this.writeBoolean(true);
        this.writeBoolean(false); // gathering
        this.writeBoolean(false); // clientStoreEntryPoint
        this.writeBoolean(false); // presence

        // Server Telemetry Data.
        NetworkUtil.writeString(this, this.serverIdentifier); // Server Id
        NetworkUtil.writeString(this, this.scenarioIdentifier); // Scenario Id
        NetworkUtil.writeString(this, this.worldIdentifier); // World Id
        NetworkUtil.writeString(this, ''); // Owner Id
    }

    /**
     * The seam for the `Editor Level Migration Version` int8 protocol 2225 inserts between
     * `Is Exported From Editor` and `Day Cycle Stop Time`. 2193 has no such field, so this
     * writes nothing; the 2225 subclass overrides it.
     */
    protected encodeEditorLevelMigrationVersion(): void {}

    /** The read half of the {@link encodeEditorLevelMigrationVersion} seam; nothing at 2193. */
    protected decodeEditorLevelMigrationVersion(): void {}

    /** The `Server Version` string: the newest game version of this packet's protocol. */
    protected gameVersion(): string {
        return minecraftVersions.at(-1) ?? '';
    }

    /**
     * Reads the packet in wire order, as {@link StartGamePacket.encodePayload} writes it.
     *
     * The fields the encoder writes as fixed values are read and not kept. The parts it never
     * writes (experiments, a forced experimental gameplay flag, the parts of the join
     * information) are read past when present, so the fields after them still line up.
     */
    public decodePayload(): void {
        this.entityId = this.readVarLong(); // Entity ID
        this.runtimeEntityId = this.readUnsignedVarLong(); // Runtime ID
        this.gamemode = this.readVarInt(); // Game Type

        this.playerPos = NetworkUtil.readVector3(this); // Position
        this.pitch = this.readFloatLE(); // Rotation X
        this.yaw = this.readFloatLE(); // Rotation Y

        // LevelSettings.
        // A uint64 on the wire, and a signed 64-bit seed here, as the encoder takes it.
        this.seed = BigInt.asIntN(64, this.readUnsignedLongLE());

        this.readShortLE(); // Spawn Biome Type
        NetworkUtil.readString(this); // User Defined Biome Name
        this.dimension = this.readVarInt(); // Dimension

        this.generator = this.readVarInt(); // Generator Type
        this.defaultGamemode = this.readVarInt(); // Game Type, the world default

        this.readBoolean(); // Is Hardcore

        this.difficulty = this.readVarInt(); // Game Difficulty

        // Default Spawn Block Position, three signed varints.
        this.worldSpawnPos = new Vector3(this.readVarInt(), this.readVarInt(), this.readVarInt());

        this.readBoolean(); // Achievements Disabled

        this.readVarInt(); // Editor World Type
        this.readBoolean(); // Is Created In Editor
        this.readBoolean(); // Is Exported From Editor

        this.decodeEditorLevelMigrationVersion();

        this.time = this.readVarInt(); // Day Cycle Stop Time
        this.readUnsignedVarInt(); // Education Edition Offer
        this.readBoolean(); // Education Features Enabled
        NetworkUtil.readString(this); // Education Product ID

        this.readFloatLE(); // Rain Level
        this.readFloatLE(); // Lightning Level

        this.readByte(); // Has Confirmed Platform Locked Content
        this.readByte(); // Multiplayer Game Intent
        this.readByte(); // LAN Broadcast Intent

        this.readVarInt(); // Xbox Live Broadcast Setting
        this.readVarInt(); // Platform Broadcast Setting

        this.readByte(); // Commands Enabled
        this.readByte(); // Texture Packs Required

        // Rule Data, kept as the wire carried it: there is no world here to hold a manager.
        const rules: GameRule[] = [];
        for (let count = this.readUnsignedVarInt(); count > 0; count--) rules.push(readGameRule(this));
        this.gameRules = rules;

        // Experiments, counted by a fixed 32 bit integer: a name and an enabled flag each.
        for (let count = this.readUnsignedIntLE(); count > 0; count--) {
            NetworkUtil.readString(this);
            this.readBoolean();
        }
        this.readBoolean(); // ExperimentsEverToggled

        this.readByte(); // Has Bonus Chest Enabled
        this.readByte(); // Start With Map Enabled

        this.readByte(); // Player Permissions

        this.readUnsignedIntLE(); // Server Chunk Tick Range

        this.readByte(); // Has Locked Behavior Pack
        this.readByte(); // Has Locked Resource Pack
        this.readByte(); // Is From Locked Template
        this.readByte(); // Use Msa Gamertags Only
        this.readByte(); // Is From World Template
        this.readByte(); // Is World Template Option Locked
        this.readByte(); // Only Spawn V1 Villagers
        this.readByte(); // Persona Disabled
        this.readByte(); // Custom Skins Disabled
        this.readByte(); // Emote Chat Muted
        NetworkUtil.readString(this); // Base Game Version

        this.readIntLE(); // Limited World Width
        this.readIntLE(); // Limited World Depth

        this.readBoolean(); // Nether Type

        NetworkUtil.readString(this); // Edu Shared Uri Resource: Button Name
        NetworkUtil.readString(this); // Edu Shared Uri Resource: Link Uri

        if (this.readBoolean()) this.readBoolean(); // Override Force Experimental Gameplay

        this.readByte(); // Chat Restriction Level
        this.readByte(); // Disable Player Interactions

        this.readVarInt(); // Server Editor Connection Policy
        this.readBoolean(); // Allow Anonymous Block Drops In Editor Worlds
        // End of LevelSettings.

        this.levelId = NetworkUtil.readString(this); // Level ID
        this.worldName = NetworkUtil.readString(this); // Level Name
        NetworkUtil.readString(this); // Template Content Identity

        this.readByte(); // Is Trial

        this.readVarInt(); // Rewind History Size
        this.serverAuthoritativeBlockBreaking = this.readBoolean(); // Server Authoritative Block Breaking

        this.ticks = Number(this.readUnsignedLongLE()); // Level Current Time

        this.readVarInt(); // Enchantment Seed

        // Block Properties, kept whatever list they came from, so the packet writes them back
        // as they arrived.
        const blockProperties: BlockProperty[] = [];
        for (let count = this.readUnsignedVarInt(); count > 0; count--) {
            blockProperties.push({ name: NetworkUtil.readString(this), definition: this.readNetworkCompound() });
        }
        this.blockProperties = blockProperties;

        NetworkUtil.readString(this); // Multiplayer Correlation Id
        this.readBoolean(); // Enable Item Stack Net Manager
        NetworkUtil.readString(this); // Server Version
        this.readNetworkCompound(); // Player Property Data
        this.readUnsignedLongLE(); // Server Block Type Registry Checksum
        UUID.networkDeserialize(this); // World Template ID
        this.readBoolean(); // Server Enabled ClientSide Generation
        this.readByte(); // BlockNetworkIds Are Hashes
        this.readByte(); // NetworkPermissions: Server Auth Sound Enabled

        if (this.readBoolean()) this.readJoinInformation(); // Server Configuration Join Info

        // Server Telemetry Data.
        this.serverIdentifier = NetworkUtil.readString(this); // Server Id
        this.scenarioIdentifier = NetworkUtil.readString(this); // Scenario Id
        this.worldIdentifier = NetworkUtil.readString(this); // World Id
        NetworkUtil.readString(this); // Owner Id
    }

    /**
     * Reads past the three optional parts of `Server Configuration Join Info`, none of which
     * this server sends.
     */
    private readJoinInformation(): void {
        const optional = (read: () => unknown): void => {
            if (this.readBoolean()) read();
        };
        const uuid = () => UUID.networkDeserialize(this);
        const string = () => NetworkUtil.readString(this);

        // Gathering: Experience Id, Experience Name, World Id, World Name, Creator Id,
        // Target Id, Scenario Id and Server Id, each optional.
        optional(() => {
            for (const read of [uuid, string, uuid, string, string, uuid, string, string]) optional(read);
        });

        // Client Store Entry Point: Store Id and Store Name.
        optional(() => {
            string();
            string();
        });

        // Presence: an optional Rich Presence Id.
        optional(() => optional(string));
    }

    /**
     * One network NBT compound, as the bytes it takes up.
     *
     * NBT has no length in front, so the compound is parsed to find where it ends. The bytes
     * are copied out rather than sliced, so they outlive the buffer the packet was read from.
     */
    private readNetworkCompound(): Buffer {
        const start = this.getReadIndex();

        const reader = new NBTReader(this, ByteOrder.LITTLE_ENDIAN);
        reader.setUseVarint(true);
        reader.parse();

        return Buffer.from(this.getReadBuffer()!.subarray(start, this.getReadIndex()));
    }

    /**
     * `Block Properties` from the managers, which is what a server with the
     * content build off sends: the captured vanilla data-driven definitions,
     * then every schema a plugin registered through `BlockStateSchemas`.
     */
    private writeManagerBlockProperties(): void {
        const customBlocks = BlockStateSchemas.getCustomSchemas();

        this.writeUnsignedVarInt(block_definitions.length + customBlocks.length);
        for (const block of block_definitions) {
            NetworkUtil.writeString(this, block.name); // Block Name
            this.write(block.definition); // Block Definition
        }

        for (const schema of customBlocks) {
            NetworkUtil.writeString(this, schema.name);

            // Network NBT, with varint lengths. This is not the encoding the runtime id is
            // hashed from; the other one puts bytes on the wire the client cannot parse.
            const stream = new BinaryStream();
            const writer = new NBTWriter(stream, ByteOrder.LITTLE_ENDIAN);
            writer.setUseVarint(true);
            writer.writeCompound(schema.getDefaultState().toNBT(schema.getPropertyTypes()));
            this.write(stream.getBuffer());
        }
    }
}
