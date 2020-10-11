
class CommandParameter {

    /** @type {String} */
    name
    /** @type {number} */
    type // See: https://github.com/pmmp/PocketMine-MP/blob/456d9a722a3b8c488cc21796587bc17dbb405b32/src/pocketmine/network/mcpe/protocol/AvailableCommandsPacket.php#L51
    /** @type {boolean} */
    optional

    constructor(data) {
        const { name = 'args', type = 0x100000 | 0x22, optional = true } = data || {};

        this.name = name;
        this.type = type;
        this.optional = optional;
    }
}
module.exports = CommandParameter;
