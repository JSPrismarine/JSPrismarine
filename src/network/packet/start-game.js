const fs = require('fs');

const DataPacket = require('./packet');
const ItemTable = require('@jsprismarine/bedrock-data').item_id_map;
const RequiredBlockStates = require('@jsprismarine/bedrock-data').required_block_states;
const PacketBinaryStream = require('../PacketBinaryStream');
const Identifiers = require('../Identifiers').default;

class StartGamePacket extends DataPacket {
    static NetID = Identifiers.StartGamePacket

    // Entity properties

    /** @type {number} */
    entityId
    /** @type {number} */
    runtimeEntityId
    /** @type {number} */
    gamemode 

    /** @type {number} */
    playerX
    /** @type {number} */
    playerY
    /** @type {number} */
    playerZ

    /** @type {string} */
    levelId
    /** @type {string} */
    worldName

    /** @type {number} */
    worldSpawnX 
    /** @type {number} */
    worldSpawnY
    /** @type {number} */
    worldSpawnZ

    /** @type {Map<String, any>} */
    gamerules 

    /** @type {Buffer|null} */
    cachedItemPalette = null

    encodePayload() {
        this.writeVarLong(this.entityId);
        this.writeUnsignedVarLong(this.runtimeEntityId);

        this.writeVarInt(this.gamemode); 

        // vector 3
        this.writeLFloat(this.playerX);
        this.writeLFloat(this.playerY);
        this.writeLFloat(this.playerZ);

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
        this.writeVarInt(this.worldSpawnX);
        this.writeUnsignedVarInt(this.worldSpawnY);
        this.writeVarInt(this.worldSpawnZ);

        this.writeByte(1); // achievement disabled

        this.writeVarInt(0); // day cycle / time
        this.writeVarInt(0); // edu edition offer
        this.writeByte(0); // edu features
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
        this.writeBool(false); 
    }

    serializeItemTable(table) {
        if (this.cachedItemPalette == null) {
            let stream = new PacketBinaryStream();
            stream.writeUnsignedVarInt(Object.entries(table).length);
            for (const [name, legacyId] of Object.entries(table)) {
                stream.writeString(name);
                stream.writeLShort(legacyId);
            }
            this.cachedItemPalette = stream.buffer; 
        }

        return this.cachedItemPalette;
    }

}
module.exports = StartGamePacket;
