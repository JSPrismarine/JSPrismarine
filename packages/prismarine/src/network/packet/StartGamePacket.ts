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

export default class StartGamePacket extends DataPacket {
    public static NetID = Identifiers.StartGamePacket;

    public entityId!: bigint;
    public runtimeEntityId!: bigint;
    public gamemode!: number;
    public defaultGamemode: number = 0;

    /**
     * How dangerous the world is, which the client draws on its own pause screen.
     *
     * Was hardcoded to zero, which is peaceful - so however the server was configured, every
     * client was told monsters could not hurt anybody.
     */
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
        this.writeVarLong(this.entityId);
        this.writeUnsignedVarLong(this.runtimeEntityId);

        this.writeVarInt(this.gamemode);

        NetworkUtil.writeVector3(this, this.playerPos);
        this.writeFloatLE(this.pitch);
        this.writeFloatLE(this.yaw);

        this.writeLongLE(BigInt(this.seed)); // Seed

        this.writeUnsignedShortLE(0x00); // Default spawn biome type
        NetworkUtil.writeString(this, 'plains'); // User defined biome name

        this.writeVarInt(0); // Dimension

        this.writeVarInt(1); // Generator
        this.writeVarInt(this.defaultGamemode); // Default Gamemode

        this.writeBoolean(false); // Is hardcore enabled

        this.writeVarInt(this.difficulty);

        // World spawn, three signed varints. The Y used to go out unsigned, which is the same
        // bytes for a spawn above sea level and the wrong ones for anything below it.
        this.writeVarInt(this.worldSpawnPos.getX());
        this.writeVarInt(this.worldSpawnPos.getY());
        this.writeVarInt(this.worldSpawnPos.getZ());

        // Recently found that may crash the client
        // waiting for more info about it
        this.writeBoolean(true); // Achievement disabled

        this.writeVarInt(0); // Editor world type?
        this.writeBoolean(false); // Created in editor mode?
        this.writeBoolean(false); // Exported from editor mode?

        this.writeVarInt(this.time); // Day cycle / time
        this.writeUnsignedVarInt(0); // Edu edition offer
        this.writeBoolean(false); // Edu features
        NetworkUtil.writeString(this, ''); // Edu product id

        this.writeFloatLE(0); // Rain lvl
        this.writeFloatLE(0); // Lightning lvl

        this.writeByte(0); // Confirmed platform locked
        this.writeByte(1); // Multi player game
        this.writeByte(1); // Broadcast to lan

        this.writeVarInt(4); // Xbl broadcast mode
        this.writeVarInt(4); // Platform broadcast mode

        this.writeByte(1); // Commands enabled
        this.writeByte(0); // Texture required

        this.gameRules.networkSerialize(this);

        this.writeUnsignedIntLE(0); // Experiment count
        this.writeBoolean(false); // Experiments previously toggled?

        this.writeByte(0); // Bonus chest
        this.writeByte(0); // Start with map

        this.writeByte(1); // Player perms, a single byte rather than a varint

        this.writeUnsignedIntLE(4); // Chunk tick range

        this.writeByte(0); // Locked behavior
        this.writeByte(0); // Locked texture
        this.writeByte(0); // From locked template
        this.writeByte(0); // Msa gamer tags only
        this.writeByte(0); // From world template
        this.writeByte(0); // World template option locked
        this.writeByte(0); // Only spawn v1 villagers
        this.writeByte(0); // Disable persona skins
        this.writeByte(0); // Disable custom skins
        this.writeByte(0); // Disable emote
        NetworkUtil.writeString(this, '*');

        this.writeUnsignedIntLE(0); // Limited world height
        this.writeUnsignedIntLE(0); // Limited world length

        this.writeBoolean(true); // Has new nether

        // TODOs
        NetworkUtil.writeString(this, '');
        NetworkUtil.writeString(this, '');

        this.writeBoolean(false); // Experimental gameplay

        this.writeByte(0); // Chat restriction level
        this.writeByte(0); // Disable player interactions

        this.writeVarInt(0); // Server editor connection policy
        this.writeBoolean(false); // Allow anonymous block drops in editor worlds

        // The three telemetry identifiers that used to sit here are written at the very end
        // of the packet from 2168 on; only the level and world names remain in the middle.
        NetworkUtil.writeString(this, this.levelId);
        NetworkUtil.writeString(this, this.worldName);
        NetworkUtil.writeString(this, '00000000-0000-0000-0000-000000000000'); // Template content identity

        this.writeByte(0); // Is trial

        // The movement settings are a rewind history size and a flag, and nothing in front
        // of them. The movement *mode* that used to lead them went with 1.21.90, when client
        // authoritative movement was retired - every client speaks the server authoritative
        // protocol now and sends `PlayerAuthInputPacket` - and a server that still writes it
        // puts every field after it one byte out. Verified against the packet a BDS 1.26.51
        // sends, which decodes to exactly this and not a byte more.
        this.writeVarInt(0); // Rewind History Size
        this.writeBoolean(false); // Is Server Authoritative Block Breaking

        this.writeLongLE(BigInt(this.ticks)); // World ticks (for time)

        this.writeVarInt(0); // Enchantment seed

        // Block properties: the definitions of every block the client does not have built
        // in. That is a plugin's blocks, and since 1.26.50 it is also a slice of vanilla -
        // the wool stairs and slabs, the concrete slabs - which vanilla now defines in data
        // and which a real server declares here, ninety-odd of them. Those go out exactly as
        // a Bedrock Dedicated Server sends them. Every other vanilla block is absent on
        // purpose: the client already has those, and with hashed runtime ids nothing depends
        // on the order or size of this list.
        const customBlocks = BlockStateSchemas.getCustomSchemas();
        this.writeUnsignedVarInt(block_definitions.length + customBlocks.length);
        for (const block of block_definitions) {
            NetworkUtil.writeString(this, block.name);
            this.write(block.definition);
        }
        for (const schema of customBlocks) {
            NetworkUtil.writeString(this, schema.name);

            // Network NBT here - varint lengths - which is *not* the encoding the runtime id
            // is hashed from. Same compound, two encodings, and using the wrong one here
            // would put bytes on the wire the client cannot parse.
            const stream = new BinaryStream();
            const writer = new NBTWriter(stream, ByteOrder.LITTLE_ENDIAN);
            writer.setUseVarint(true);
            writer.writeCompound(schema.getDefaultState().toNBT(schema.getPropertyTypes()));
            this.write(stream.getBuffer());
        }

        // The item table used to be written here. It moved out at 1.21.60, into a packet of
        // its own - `ItemRegistryPacket` - and writing it here now puts seventeen hundred
        // entries where the client expects a correlation id.
        NetworkUtil.writeString(this, ''); // Multiplayer correlation id
        this.writeBoolean(true); // Server authoritative inventory

        NetworkUtil.writeString(this, Identifiers.MinecraftVersions.at(0)!);

        // TODO
        const str = new BinaryStream();
        const nbt = new NBTWriter(str, 1);
        nbt.setUseVarint(true);
        nbt.writeCompound(new NBTTagCompound());
        this.write(str.getBuffer());

        this.writeLongLE(0n); // Block palette checksum

        // TODO: Not sure if a random one will work, but let's try
        UUID.fromRandom().networkSerialize(this);

        this.writeBoolean(true); // Use client side chunk generation
        // Block runtime ids are hashes of each block's own name and state, not positions in
        // the client's canonical palette. That is what lets the server compute them from its
        // own definitions - no copy of the client's ordering, and a plugin's block cannot
        // renumber anyone else's.
        this.writeByte(1); // Block NET IDs are hashes
        this.writeByte(0); // Server authoritative sound

        // Optional, and absent: a single byte saying there is no join information to read.
        this.writeBoolean(false);

        // Telemetry identifiers, which moved to the end of the packet at 2168 from the middle,
        // where `levelId` and `worldName` now sit alone.
        NetworkUtil.writeString(this, this.serverIdentifier);
        NetworkUtil.writeString(this, this.scenarioIdentifier);
        NetworkUtil.writeString(this, this.worldIdentifier);
        NetworkUtil.writeString(this, ''); // Owner id
    }
}
