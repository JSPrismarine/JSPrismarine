import CommandEnum from './CommandEnum';

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

export enum CommandParameterFlags {
    NONE = 0,
    FORCE_COLLAPSE_ENUM = 0x1,
    FLAG_HAS_ENUM_CONSTRAINT = 0x2
}

export default class CommandParameter {
    public paramName: string;
    public paramType: CommandParameterType;
    public isOptional: boolean;
    public flags: CommandParameterFlags;
    public enum: CommandEnum | null;
    public postfix: string | null;

    public constructor(
        name: string,
        type: CommandParameterType,
        optional: boolean = false,
        flags: CommandParameterFlags = CommandParameterFlags.NONE,
        paramEnum: CommandEnum | null = null,
        postfix: string | null = null
    ) {
        this.paramName = name;
        this.paramType = type;
        this.isOptional = optional;
        this.flags = flags;
        this.enum = paramEnum;
        this.postfix = postfix;
    }
}
