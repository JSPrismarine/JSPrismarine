import Vector3 from '../../math/Vector3';
import Identifiers from '../Identifiers';
import PacketBinaryStream from '../PacketBinaryStream';
import DataPacket from './DataPacket';

const ItemTable = require('@jsprismarine/bedrock-data').item_id_map;
const RequiredBlockStates = require('@jsprismarine/bedrock-data')
    .required_block_states;

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

    private cachedItemPalette!: Buffer;

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

        this.writeLShort(0); // default biome type
        this.writeString(''); // biome name
        this.writeVarInt(0); // dimension

        this.writeVarInt(1); // generator
        this.writeVarInt(0);
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

        this.writeByte(0); // bonus chest
        this.writeByte(0); // start with chest

        this.writeVarInt(1); // player perms

        this.writeInt(32); // chunk tick range
        this.writeByte(0); // locked behavior
        this.writeByte(0); // locked texture
        this.writeByte(0); // from locked template
        this.writeByte(0); // msa gamer tags only
        this.writeByte(0); // from world template
        this.writeByte(0); // world template option locked
        this.writeByte(1); // only spawn v1 villagers
        this.writeString(Identifiers.MinecraftVersion);
        this.writeLInt(0); // limited world height
        this.writeLInt(0); // limited world length
        this.writeBool(false); // has new nether
        this.writeBool(false); // experimental gameplay

        this.writeString(this.levelId);
        this.writeString(this.worldName);
        this.writeString(''); // template content identity

        this.writeByte(0); // is trial
        this.writeByte(0); // server auth movement
        this.writeLLong(BigInt(0)); // world time

        this.writeVarInt(0); // enchantment seed

        // PMMP states
        this.append(RequiredBlockStates);

        this.append(this.serializeItemTable(ItemTable));

        this.writeString('');
        this.writeBool(false); // new inventory system
    }

    serializeItemTable(table: any): Buffer {
        if (this.cachedItemPalette == null) {
            let stream = new PacketBinaryStream();
            stream.writeUnsignedVarInt(Object.entries(table).length);
            for (const [name, legacyId] of Object.entries(table)) {
                stream.writeString(name);
                stream.writeLShort(legacyId as number);
            }
            this.cachedItemPalette = stream.getBuffer();
        }

        return this.cachedItemPalette as Buffer;
    }
}
