import { block_definitions } from '@jsprismarine/bedrock-data';
import BinaryStream from '@jsprismarine/binaryutils';
import { Vector3 } from '@jsprismarine/math';
import { Difficulty } from '@jsprismarine/minecraft';
import { ByteOrder, NBTTagCompound, NBTWriter } from '@jsprismarine/nbt';
import { NetworkUtil } from '../../network/NetworkUtil';
import UUID from '../../utils/UUID';
import type GameRuleManager from '../../world/GameRuleManager';
import { BlockStateSchemas } from '../../block/state/BlockStateSchema';
import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

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
 * | Movement Settings | SyncedPlayerMovementSettings | Rewind History Size (VarInt), Server Authoritative Block Breaking (Boolean) |
 * | Level Current Time | LUnsignedLong | `ticks` |
 * | Enchantment Seed | VarInt | 0 |
 * | Block Properties | UnsignedVarInt count, then Block Name (String) + Block Definition (network NBT) | Data driven vanilla blocks, then plugin blocks |
 * | Multiplayer Correlation Id | String | Empty |
 * | Enable Item Stack Net Manager | Boolean | true |
 * | Server Version | String | First entry of `Identifiers.MinecraftVersions` |
 * | Player Property Data | Network NBT compound | Empty |
 * | Server Block Type Registry Checksum | LUnsignedLong | 0 |
 * | World Template ID | UUID | Nil |
 * | Server Enabled ClientSide Generation | Boolean | false |
 * | BlockNetworkIds Are Hashes | Boolean | true |
 * | NetworkPermissions | Server Auth Sound Enabled (Boolean) | false |
 * | Server Configuration Join Info | Optional | Absent, a single false byte |
 * | Server Telemetry Data | Server Id, Scenario Id, World Id, Owner Id (String) | `serverIdentifier`, `scenarioIdentifier`, `worldIdentifier`, empty |
 *
 * LevelSettings, in wire order: Seed (LUnsignedLong), Spawn Settings (Spawn Biome Type LShort,
 * User Defined Biome Name String, Dimension VarInt), Generator Type (VarInt), Game Type (VarInt),
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
    public static NetID = Identifiers.StartGamePacket;

    public entityId!: bigint;
    public runtimeEntityId!: bigint;
    public gamemode!: number;
    public defaultGamemode: number = 0;

    /** Game Difficulty, which the client shows on its own pause screen. */
    public difficulty: Difficulty = Difficulty.NORMAL;

    public playerPos: Vector3 = new Vector3(0, 5, 0);
    public pitch: number = 0;
    public yaw: number = 0;

    public serverIdentifier!: string;
    public worldIdentifier!: string;
    public scenarioIdentifier!: string;
    public levelId!: string;
    public worldName!: string;
    public seed!: number;
    public time: number = 0;
    public ticks: number = 0;

    public worldSpawnPos!: Vector3;

    public gameRules!: GameRuleManager;

    public encodePayload(): void {
        this.writeVarLong(this.entityId); // Entity ID
        this.writeUnsignedVarLong(this.runtimeEntityId); // Runtime ID

        this.writeVarInt(this.gamemode); // Game Type

        NetworkUtil.writeVector3(this, this.playerPos); // Position
        this.writeFloatLE(this.pitch); // Rotation X
        this.writeFloatLE(this.yaw); // Rotation Y

        // LevelSettings.
        // Seed is a uint64. A negative seed goes out as its two's complement bytes.
        this.writeUnsignedLongLE(BigInt.asUintN(64, BigInt(this.seed)));

        this.writeUnsignedShortLE(0x00); // Spawn Biome Type: Default
        NetworkUtil.writeString(this, 'plains'); // User Defined Biome Name
        this.writeVarInt(0); // Dimension: Overworld

        this.writeVarInt(1); // Generator Type: Overworld
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

        this.gameRules.networkSerialize(this); // Rule Data

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

        this.writeUnsignedIntLE(0); // Limited World Width
        this.writeUnsignedIntLE(0); // Limited World Depth

        this.writeBoolean(true); // Nether Type: the new nether

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
        this.writeBoolean(false); // Server Authoritative Block Breaking

        this.writeUnsignedLongLE(BigInt(this.ticks)); // Level Current Time

        this.writeVarInt(0); // Enchantment Seed

        // Block Properties: every block the client does not have built in. That is a plugin's
        // blocks, and since 1.26.50 also the vanilla blocks defined in data (the wool stairs
        // and slabs, the concrete slabs), which go out as a Bedrock Dedicated Server sends
        // them. Other vanilla blocks are left out on purpose: the client has them, and with
        // hashed runtime ids nothing depends on the order or size of this list.
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

        // The item table is not part of this packet since 1.21.60; `ItemRegistryPacket`
        // carries it.
        NetworkUtil.writeString(this, ''); // Multiplayer Correlation Id
        this.writeBoolean(true); // Enable Item Stack Net Manager

        NetworkUtil.writeString(this, Identifiers.MinecraftVersions[0] ?? ''); // Server Version

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

        this.writeBoolean(false); // Server Configuration Join Info: absent

        // Server Telemetry Data.
        NetworkUtil.writeString(this, this.serverIdentifier); // Server Id
        NetworkUtil.writeString(this, this.scenarioIdentifier); // Scenario Id
        NetworkUtil.writeString(this, this.worldIdentifier); // World Id
        NetworkUtil.writeString(this, ''); // Owner Id
    }
}
