// See: https://github.com/pmmp/PocketMine-MP/blob/456d9a722a3b8c488cc21796587bc17dbb405b32/src/pocketmine/network/mcpe/protocol/AvailableCommandsPacket.php#L51
export enum CommandParameterType {
    Int = 0x100000 | 0x01,
    Float = 0x100000 | 0x02,
    Value = 0x100000 | 0x03,
    Target = 0x100000 | 0x06,
    String = 0x100000 | 0x1d
}

export default class CommandParameter {
    /** @type {String} */
    name;
    /** @type {number} */
    type;
    /** @type {boolean} */
    optional;

    constructor(data?: {
        name: string;
        type: CommandParameterType;
        optional: boolean;
    }) {
        const {name = 'args', type = 0x100000 | 0x22, optional = true} =
            data || {};

        this.name = name;
        this.type = type;
        this.optional = optional;
    }
}
