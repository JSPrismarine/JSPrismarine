import { NBTTagCompound, NBTWriter } from '@jsprismarine/nbt';

import BinaryStream from '@jsprismarine/jsbinaryutils';
import DataPacket from './DataPacket.js';
import GameruleManager from '../../world/GameruleManager.js';
import Identifiers from '../Identifiers.js';
import McpeUtil from '../NetworkUtil.js';
import UUID from '../../utils/UUID.js';
import Vector3 from '../../math/Vector3.js';
import pkg from '@jsprismarine/bedrock-data';

const { items_list } = pkg;

export default class StartGamePacket extends DataPacket {
    public static NetID = Identifiers.StartGamePacket;

    public entityId!: bigint;
    public runtimeEntityId!: bigint;
    public gamemode!: number;
    public defaultGamemode!: number;

    public playerPos!: Vector3;
    public pitch!: number;
    public yaw!: number;

    public levelId!: string;
    public worldName!: string;
    public seed!: number;

    public worldSpawnPos!: Vector3;

    public gamerules!: GameruleManager;

    // Cache item IDs mappings
    public static cachedItemIds: Buffer | null = null;

    public encodePayload() {
        this.writeVarLong(this.entityId);
        this.writeUnsignedVarLong(this.runtimeEntityId);

        this.writeVarInt(this.gamemode);

        this.playerPos.networkSerialize(this);

        // TODO: is resulting null... fixme...
        this.writeFloatLE(this.pitch ?? 0);
        // TODO: is resulting undefined... fixme...
        this.writeFloatLE(this.yaw ?? 0);

        this.writeLongLE(0n); // Seed

        this.writeUnsignedShortLE(0x00); // Default spawn biome type
        McpeUtil.writeString(this, 'plains'); // User defined biome name

        this.writeVarInt(0); // Dimension

        this.writeVarInt(/*1*/2); // Generator
        this.writeVarInt(this.defaultGamemode ?? 0); // Default Gamemode
        this.writeVarInt(0); // Difficulty

        // world spawn vector 3
        this.writeVarInt(this.worldSpawnPos.getX());
        this.writeUnsignedVarInt(this.worldSpawnPos.getY());
        this.writeVarInt(this.worldSpawnPos.getZ());

        // Recently found that may crash the client
        // waiting for more info about it
        this.writeBoolean(true); // Achievement disabled

        this.writeBoolean(false); // Is editor mode?

        this.writeVarInt(0); // Day cycle / time
        this.writeVarInt(0); // Edu edition offer
        this.writeBoolean(false); // Edu features
        McpeUtil.writeString(this, ''); // Edu product id

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
        McpeUtil.writeString(this, '*');

        this.writeUnsignedIntLE(0); // Limited world height
        this.writeUnsignedIntLE(0); // Limited world length

        this.writeBoolean(false); // Has new nether

        // TODOs
        McpeUtil.writeString(this, '');
        McpeUtil.writeString(this, '');

        this.writeBoolean(false); // Experimental gameplay

        this.writeByte(0); // Chat restriction level
        this.writeByte(0); // Disable player interactions

        McpeUtil.writeString(this, this.levelId);
        McpeUtil.writeString(this, this.worldName);
        McpeUtil.writeString(this, '00000000-0000-0000-0000-000000000000'); // Template content identity

        this.writeByte(0); // Is trial

        this.writeUnsignedVarInt(0); // Server auth movement
        this.writeVarInt(0); // Rewind History Size
        this.writeBoolean(false); // Is Server Authoritative Block Breaking

        this.writeLongLE(0n); // World ticks (for time)

        this.writeVarInt(0); // Enchantment seed

        this.writeUnsignedVarInt(0); // Blocks palette

        // Item palette
        if (StartGamePacket.cachedItemIds) {
            this.write(StartGamePacket.cachedItemIds);
        } else {
            const palette = this.generateItemPalette();
            StartGamePacket.cachedItemIds = palette;
            this.write(palette);
        }
        // this.writeUnsignedVarInt(0)

        McpeUtil.writeString(this, '');
        this.writeBoolean(true); // New inventory system

        McpeUtil.writeString(this, Identifiers.MinecraftVersion);

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
    }

    private generateItemPalette(): Buffer {
        const stream = new BinaryStream();
        const itemMappings = Object.entries(items_list);
        stream.writeUnsignedVarInt(itemMappings.length);
        for (const [name, data] of itemMappings) {
            McpeUtil.writeString(stream, name);
            stream.writeShortLE((data as any).runtime_id as number);
            stream.writeByte(0); // unknown
        }
        return stream.getBuffer();
    }
}
