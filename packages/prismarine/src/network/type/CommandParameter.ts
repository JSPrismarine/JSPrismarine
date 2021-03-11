export enum CommandParameterType {
    Int = 0x100000 | 0x01,
    Float = 0x100000 | 0x03,
    Value = 0x100000 | 0x04,
    Operator = 0x100000 | 0x06,
    Target = 0x100000 | 0x07,
    String = 0x100000 | 0x20,
    Position = 0x100000 | 0x29,
    Message = 0x100000 | 0x2c,
    RawText = 0x100000 | 0x2e,
    Json = 0x100000 | 0x32,
    Command = 0x100000 | 0x3f,
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
