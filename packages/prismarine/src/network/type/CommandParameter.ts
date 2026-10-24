import type { CommandEnum } from './CommandEnum';

/**
 * The flag bits of a command parameter's type word.
 *
 * The client reads a parameter's type as one 32 bit word. A basic type is its id ORed with
 * `Valid`. An enum parameter carries `Enum` (or `SoftEnum`) and the enum's index in the packet's
 * enum table instead of a type id, and a postfixed integer carries `Postfix` and the postfix's
 * index. From gophertunnel's `protocol/command.go` at protocol 2193.
 */
export enum CommandParameterTypeFlag {
    Valid = 0x100000,
    Enum = 0x200000,
    Postfix = 0x1000000,
    SoftEnum = 0x4000000
}

/**
 * The basic command argument type ids of protocol 2193 (Minecraft 1.26.50).
 *
 * The numbers are the `CommandArgType*` constants in gophertunnel's `protocol/command.go`.
 * They shift between releases, so a parameter is only ever written through
 * {@link CommandParameterType}, which ORs them with `CommandParameterTypeFlag.Valid`.
 */
export enum CommandArgumentType {
    Int = 1,
    Float = 3,
    Value = 4,
    WildcardInt = 5,
    Operator = 6,
    CompareOperator = 7,
    Target = 8,
    String = 56,
    BlockPosition = 64,
    Position = 65,
    Message = 67,
    RawText = 70,
    Json = 74,
    Command = 87
}

/**
 * The type word of a basic command parameter, ready to be written to the wire.
 *
 * Each entry is a {@link CommandArgumentType} id ORed with `CommandParameterTypeFlag.Valid`, so
 * the two tables cannot disagree. `Enum` is the bare enum flag; a parameter with an enum attached
 * gets its word built by the packet from the enum's index, not from this value.
 */
export const CommandParameterType = {
    Int: CommandParameterTypeFlag.Valid | CommandArgumentType.Int,
    Float: CommandParameterTypeFlag.Valid | CommandArgumentType.Float,
    Value: CommandParameterTypeFlag.Valid | CommandArgumentType.Value,
    WildcardInt: CommandParameterTypeFlag.Valid | CommandArgumentType.WildcardInt,
    Operator: CommandParameterTypeFlag.Valid | CommandArgumentType.Operator,
    CompareOperator: CommandParameterTypeFlag.Valid | CommandArgumentType.CompareOperator,
    Target: CommandParameterTypeFlag.Valid | CommandArgumentType.Target,
    String: CommandParameterTypeFlag.Valid | CommandArgumentType.String,
    BlockPosition: CommandParameterTypeFlag.Valid | CommandArgumentType.BlockPosition,
    Position: CommandParameterTypeFlag.Valid | CommandArgumentType.Position,
    Message: CommandParameterTypeFlag.Valid | CommandArgumentType.Message,
    RawText: CommandParameterTypeFlag.Valid | CommandArgumentType.RawText,
    Json: CommandParameterTypeFlag.Valid | CommandArgumentType.Json,
    Command: CommandParameterTypeFlag.Valid | CommandArgumentType.Command,
    Enum: CommandParameterTypeFlag.Enum
} as const;

/**
 * A command parameter's type word, one of the values of {@link CommandParameterType}.
 */
export type CommandParameterType = (typeof CommandParameterType)[keyof typeof CommandParameterType];

/**
 * The options byte of a command parameter (`ParamOption*` in gophertunnel's `command.go`).
 */
export enum CommandParameterFlags {
    NONE = 0,
    FORCE_COLLAPSE_ENUM = 0x1,
    FLAG_HAS_ENUM_CONSTRAINT = 0x2
}

/**
 * One parameter of a command overload as the `AvailableCommandsPacket` sends it.
 *
 * A parameter is either a basic type (`paramType`) or an enum (`enum`); when `enum` is set the
 * packet ignores `paramType` and writes the enum's index instead.
 */
export default class CommandParameter {
    public paramName: string;
    public paramType: CommandParameterType;
    public isOptional: boolean;
    public flags: CommandParameterFlags;
    public enum: CommandEnum | null;
    public postfix: string | null;

    public constructor(data?: {
        paramName?: string;
        paramType?: CommandParameterType;
        isOptional?: boolean;
        flags?: CommandParameterFlags;
        enum?: CommandEnum | null;
        postfix?: string | null;
    }) {
        this.paramName = data?.paramName ?? 'paramName';
        this.paramType = data?.paramType ?? CommandParameterType.Value;
        this.isOptional = data?.isOptional ?? false;
        this.flags = data?.flags ?? CommandParameterFlags.NONE;
        this.enum = data?.enum ?? null;
        this.postfix = data?.postfix ?? null;
    }
}
