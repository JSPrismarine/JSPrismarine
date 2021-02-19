export enum CommandParameterType {
    Int = 0x100000 | 0x01,
    Float = 0x100000 | 0x02,
    Value = 0x100000 | 0x03,
    Target = 0x100000 | 0x06,
    String = 0x100000 | 0x1d,
    Position = 0x100000 | 0x25,
    Message = 0x100000 | 0x29,
    RawText = 0x100000 | 0x2b,
    Json = 0x100000 | 0x2f,
    Command = 0x100000 | 0x36,
    Enum = 0x200000
}

export default class CommandParameter {
    public name: string;
    public type: number;
    public optional = true;
    public flags = 0;

    public constructor(data: {
        name: string;
        type: CommandParameterType;
        enumValues?: string[];
        optional: boolean;
        flags?: any;
    }) {
        const { name, type, optional = true } = data;

        this.name = name;
        this.type = type;
        this.optional = optional;
    }
}
