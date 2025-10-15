import BinaryStream from '@jsprismarine/jsbinaryutils';
import { Vector3 } from '@jsprismarine/math';
import { NBTTagCompound, NBTWriter } from '@jsprismarine/nbt';
import { NetworkUtil } from '../../network/NetworkUtil';
import UUID from '../../utils/UUID';
import type GameruleManager from '../../world/GameruleManager';
import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

export default class StartGamePacket extends DataPacket {
    public static NetID = Identifiers.StartGamePacket;

    public entityId!: bigint;
    public runtimeEntityId!: bigint;
    public gamemode!: number;
    public defaultGamemode: number = 0;

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

    public gamerules!: GameruleManager;

    // Cache item IDs mappings
    public static cachedItemIds: Buffer | null = null;

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

        this.writeVarInt(0); // Difficulty

        // world spawn vector 3
        this.writeVarInt(this.worldSpawnPos.getX());
        this.writeUnsignedVarInt(this.worldSpawnPos.getY());
        this.writeVarInt(this.worldSpawnPos.getZ());

        // Recently found that may crash the client
        // waiting for more info about it
        this.writeBoolean(true); // Achievement disabled

        this.writeVarInt(0); // Editor world type?
        this.writeBoolean(false); // Created in editor mode?
        this.writeBoolean(false); // Exported from editor mode?

        this.writeVarInt(this.time); // Day cycle / time
        this.writeVarInt(0); // Edu edition offer
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

        this.gamerules.networkSerialize(this);

        this.writeUnsignedIntLE(0); // Experiment count
        this.writeBoolean(false); // Experiments previously toggled?

        this.writeByte(0); // Bonus chest
        this.writeByte(0); // Start with map

        this.writeVarInt(1); // Player perms

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

        NetworkUtil.writeString(this, this.serverIdentifier);
        NetworkUtil.writeString(this, this.worldIdentifier);
        NetworkUtil.writeString(this, this.scenarioIdentifier);
        NetworkUtil.writeString(this, this.levelId);
        NetworkUtil.writeString(this, this.worldName);
        NetworkUtil.writeString(this, '00000000-0000-0000-0000-000000000000'); // Template content identity

        this.writeByte(0); // Is trial

        this.writeUnsignedVarInt(0); // Server auth movement
        this.writeVarInt(0); // Rewind History Size
        this.writeBoolean(false); // Is Server Authoritative Block Breaking

        this.writeLongLE(BigInt(this.ticks)); // World ticks (for time)

        this.writeVarInt(0); // Enchantment seed

        this.writeUnsignedVarInt(0); // Blocks palette

        /* Item palette
        if (StartGamePacket.cachedItemIds) {
            this.write(StartGamePacket.cachedItemIds);
        } else {
            const palette = this.generateItemPalette();
            StartGamePacket.cachedItemIds = palette;
            this.write(palette);
        } */
        this.writeUnsignedVarInt(0);

        NetworkUtil.writeString(this, '');
        this.writeBoolean(true); // New inventory system

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
        this.writeByte(0); // Block NET IDs are hashes
        this.writeByte(0); // Disable client audio
    }

    /* private generateItemPalette(): Buffer {
        const stream = new BinaryStream();
        const itemMappings = Object.entries(item_id_map);
        stream.writeUnsignedVarInt(itemMappings.length);
        for (const [name, data] of itemMappings) {
            NetworkUtil.writeString(stream, name);
            stream.writeShortLE((data as any).runtime_id as number);
            stream.writeByte(0); // unknown
        }
        return stream.getBuffer();
    } */
}
