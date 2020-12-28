// import PacketBinaryStream from '../PacketBinaryStream';
import DataPacket from './DataPacket';
import Identifiers from '../Identifiers';
import Vector3 from '../../math/Vector3';

export default class StartGamePacket extends DataPacket {
    static NetID = Identifiers.StartGamePacket;

    public entityId!: bigint;
    public runtimeEntityId!: bigint;
    public gamemode!: number;

    public playerPos!: Vector3;

    public levelId!: string;
    public worldName!: string;

    public worldSpawnPos!: Vector3;

    public gamerules: Map<string, any> = new Map();

    //    private cachedItemPalette!: Buffer;

    public encodePayload() {
        this.writeVarLong(this.entityId);
        this.writeUnsignedVarLong(this.runtimeEntityId);

        this.writeVarInt(this.gamemode);

        // vector 3
        this.writeLFloat(this.playerPos.getX());
        this.writeLFloat(this.playerPos.getY());
        this.writeLFloat(this.playerPos.getZ());

        this.writeLFloat(0); // pitch
        this.writeLFloat(0); // yaw

        this.writeVarInt(0); //  seed

        this.writeLShort(0x00); // default spawn biome type
        this.writeString('plains'); // user defined biome name

        this.writeVarInt(0); // dimension

        this.writeVarInt(1); // generator
        this.writeVarInt(0); // gamemode
        this.writeVarInt(0); // difficulty

        // world spawn vector 3
        this.writeVarInt(this.worldSpawnPos.getX());
        this.writeUnsignedVarInt(this.worldSpawnPos.getY());
        this.writeVarInt(this.worldSpawnPos.getZ());

        this.writeBool(true); // achievement disabled

        this.writeVarInt(0); // day cycle / time
        this.writeVarInt(0); // edu edition offer
        this.writeBool(false); // edu features
        this.writeString(''); // edu product id

        this.writeLFloat(0); // rain lvl
        this.writeLFloat(0); // lightning lvl

        this.writeByte(0); // confirmed platform locked
        this.writeByte(1); // multi player game
        this.writeByte(1); // broadcast to lan

        this.writeVarInt(4); // xbl broadcast mode
        this.writeVarInt(4); // platform broadcast mode

        this.writeByte(1); // commands enabled
        this.writeByte(0); // texture required

        this.writeGamerules(this.gamerules);

        this.writeLInt(0); // experiment count
        this.writeBool(false); // experiments previously toggled?

        this.writeByte(0); // bonus chest
        this.writeByte(0); // start with map

        this.writeVarInt(1); // player perms

        this.writeLInt(0); // chunk tick range

        this.writeByte(0); // locked behavior
        this.writeByte(0); // locked texture
        this.writeByte(0); // from locked template
        this.writeByte(0); // msa gamer tags only
        this.writeByte(0); // from world template
        this.writeByte(0); // world template option locked
        this.writeByte(0); // only spawn v1 villagers
        this.writeString(Identifiers.MinecraftVersion);

        this.writeLInt(0); // limited world height
        this.writeLInt(0); // limited world length

        this.writeBool(false); // has new nether
        this.writeBool(false); // experimental gameplay

        this.writeString(this.levelId);
        this.writeString(this.worldName);
        this.writeString(''); // template content identity

        this.writeByte(0); // is trial
        this.writeUnsignedVarInt(0); // server auth movement

        this.writeLLong(BigInt(0)); // world ticks (for time)

        this.writeVarInt(0); // enchantment seed

        this.writeUnsignedVarInt(0); // custom blocks

        this.writeUnsignedVarInt(0); // item palette

        this.writeString('');
        this.writeBool(false); // new inventory system
    }

    /*
    TODO
    public serializeItemTable(table: object): Buffer {
        if (this.cachedItemPalette == null) {
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
