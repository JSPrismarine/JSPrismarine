import DataPacket from './DataPacket';
import GameruleManager from '../../world/GameruleManager';
import Identifiers from '../Identifiers';
import McpeUtil from '../NetworkUtil';
import Vector3 from '../../math/Vector3';

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

    public encodePayload() {
        this.writeVarLong(this.entityId);
        this.writeUnsignedVarLong(this.runtimeEntityId);

        this.writeVarInt(this.gamemode);

        this.playerPos.networkSerialize(this);

        // TODO: is resulting null... fixme...
        this.writeFloatLE(this.pitch ?? 0);
        // TODO: is resulting undefined... fixme...
        this.writeFloatLE(this.yaw ?? 0);

        this.writeVarInt(0); // Seed

        this.writeUnsignedShortLE(0x00); // Default spawn biome type
        McpeUtil.writeString(this, 'plains'); // User defined biome name

        this.writeVarInt(0); // Dimension

        this.writeVarInt(1); // Generator
        this.writeVarInt(this.defaultGamemode ?? 0); // Default Gamemode
        this.writeVarInt(0); // Difficulty

        // world spawn vector 3
        this.writeVarInt(this.worldSpawnPos.getX());
        this.writeUnsignedVarInt(this.worldSpawnPos.getY());
        this.writeVarInt(this.worldSpawnPos.getZ());

        // Recently found that may crash the client
        // waiting for more info about it
        this.writeBoolean(true); // Achievement disabled

        this.writeVarInt(0); // Day cycle / time
        this.writeVarInt(0); // Edu edition offer
        this.writeBoolean(false); // Edu features
        this.writeString(''); // Edu product id

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

        this.writeUnsignedIntLE(0); // Chunk tick range

        this.writeByte(0); // Locked behavior
        this.writeByte(0); // Locked texture
        this.writeByte(0); // From locked template
        this.writeByte(0); // Msa gamer tags only
        this.writeByte(0); // From world template
        this.writeByte(0); // World template option locked
        this.writeByte(0); // Only spawn v1 villagers
        this.writeString(Identifiers.MinecraftVersion);

        this.writeUnsignedIntLE(0); // Limited world height
        this.writeUnsignedIntLE(0); // Limited world length

        this.writeBoolean(false); // Has new nether

        // TODOs
        McpeUtil.writeString(this, '');
        McpeUtil.writeString(this, '');

        this.writeBoolean(false); // Experimental gameplay

        this.writeString(this.levelId);
        this.writeString(this.worldName);
        McpeUtil.writeString(this, '00000000-0000-0000-0000-000000000000'); // Template content identity

        this.writeByte(0); // Is trial

        this.writeUnsignedVarInt(0); // Server auth movement
        this.writeVarInt(0); // Rewind History Size
        this.writeBoolean(false); // Is Server Authoritative Block Breaking

        this.writeLongLE(BigInt(0)); // World ticks (for time)

        this.writeVarInt(0); // Enchantment seed

        this.writeUnsignedVarInt(0); // Custom blocks

        this.writeUnsignedVarInt(0); // Item palette

        McpeUtil.writeString(this, '');
        this.writeBoolean(false); // New inventory system

        McpeUtil.writeString(this, Identifiers.MinecraftVersion);
    }

    /*
    TODO
    public serializeItemTable(table: object): Buffer {
        if (this.cachedItemPalette === null) {
            let stream = new PacketBinaryStream();
            let entries = Object.entries(table);
            stream.writeUnsignedVarInt(entries.length);
            entries.map(([name, id]) => {
                stream.writeString(name);
                stream.writeLShort(id);
                stream.writeByte(0);
            });
            this.cachedItemPalette = stream.getBuffer();
        }

        return this.cachedItemPalette as Buffer;
    }
    */
}
