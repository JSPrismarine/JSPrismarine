// Import PacketBinaryStream from '../PacketBinaryStream';
import DataPacket from './DataPacket';
import Identifiers from '../Identifiers';
import Vector3 from '../../math/Vector3';

export default class StartGamePacket extends DataPacket {
    public static NetID = Identifiers.StartGamePacket;

    public entityId!: bigint;
    public runtimeEntityId!: bigint;
    public gamemode!: number;
    public defaultGamemode!: number;

    public playerPos!: Vector3;
    public pith!: number;
    public yaw!: number;

    public levelId!: string;
    public worldName!: string;
    public seed!: number;

    public worldSpawnPos!: Vector3;

    public gamerules: Map<string, any> = new Map();

    //    Private cachedItemPalette!: Buffer;

    public encodePayload() {
        this.writeVarLong(this.entityId);
        this.writeUnsignedVarLong(this.runtimeEntityId);

        this.writeVarInt(this.gamemode);

        this.writeVector3(this.playerPos);
        this.writeLFloat(this.pith);
        this.writeLFloat(this.yaw);

        this.writeVarInt(0); // Seed

        this.writeLShort(0x00); // Default spawn biome type
        this.writeString('plains'); // User defined biome name

        this.writeVarInt(0); // Dimension

        this.writeVarInt(1); // Generator
        this.writeVarInt(this.defaultGamemode ?? 0); // Default Gamemode
        this.writeVarInt(0); // Difficulty

        // world spawn vector 3
        this.writeVarInt(this.worldSpawnPos.getX());
        this.writeUnsignedVarInt(this.worldSpawnPos.getY());
        this.writeVarInt(this.worldSpawnPos.getZ());

        this.writeBool(false); // Achievement disabled

        this.writeVarInt(0); // Day cycle / time
        this.writeVarInt(0); // Edu edition offer
        this.writeBool(false); // Edu features
        this.writeString(''); // Edu product id

        this.writeLFloat(0); // Rain lvl
        this.writeLFloat(0); // Lightning lvl

        this.writeByte(0); // Confirmed platform locked
        this.writeByte(1); // Multi player game
        this.writeByte(1); // Broadcast to lan

        this.writeVarInt(4); // Xbl broadcast mode
        this.writeVarInt(4); // Platform broadcast mode

        this.writeByte(1); // Commands enabled
        this.writeByte(0); // Texture required

        this.writeGamerules(this.gamerules);

        this.writeLInt(0); // Experiment count
        this.writeBool(false); // Experiments previously toggled?

        this.writeByte(0); // Bonus chest
        this.writeByte(0); // Start with map

        this.writeVarInt(1); // Player perms

        this.writeLInt(0); // Chunk tick range

        this.writeByte(0); // Locked behavior
        this.writeByte(0); // Locked texture
        this.writeByte(0); // From locked template
        this.writeByte(0); // Msa gamer tags only
        this.writeByte(0); // From world template
        this.writeByte(0); // World template option locked
        this.writeByte(0); // Only spawn v1 villagers
        this.writeString(Identifiers.MinecraftVersion);

        this.writeLInt(0); // Limited world height
        this.writeLInt(0); // Limited world length

        this.writeBool(false); // Has new nether
        this.writeBool(false); // Experimental gameplay

        this.writeString(this.levelId);
        this.writeString(this.worldName);
        this.writeString(''); // Template content identity

        this.writeByte(0); // Is trial

        this.writeUnsignedVarInt(0); // Server auth movement
        this.writeVarInt(0); // Rewind History Size
        this.writeBool(false); // Is Server Authoritative Block Breaking

        this.writeLLong(BigInt(0)); // World ticks (for time)

        this.writeVarInt(0); // Enchantment seed

        this.writeUnsignedVarInt(0); // Custom blocks

        this.writeUnsignedVarInt(0); // Item palette

        this.writeString('');
        this.writeBool(false); // New inventory system
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
