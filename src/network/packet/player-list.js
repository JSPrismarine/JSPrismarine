const logger = require('../../utils/Logger');

const DataPacket = require('./packet');
const Identifiers = require('../Identifiers').default;
const PlayerListEntry = require('../type/PlayerListEntry');
const PlayerListAction = require('../type/player-list-action');


class PlayerListPacket extends DataPacket {
    static NetID = Identifiers.PlayerListPacket

    /** @type {PlayerListEntry[]} */
    entries = []
    /** @type {number} */
    type

    encodePayload(server) {
        this.writeByte(this.type);
        this.writeUnsignedVarInt(this.entries.length);
        for (let entry of this.entries) {
            if (this.type === PlayerListAction.Add) {
                this.writePlayerListAddEntry(entry);
            } else if (this.type === PlayerListAction.Remove) {
                this.writePlayerListRemoveEntry(entry);
            } else {
                server.getLogger().warn(`Invalid player list action type ${this.type}`);
            }
        }

        if (this.type === PlayerListAction.Add) {
            for (let entry of this.entries) {
                this.writeBool(entry.skin.isTrusted);
            }
        }
    }
}
module.exports = PlayerListPacket;
