import type { CommandChainedSubcommand } from './CommandChainedSubcommand';
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
 *
 * The ids are a second copy of `BedrockParameterTypeId` in
 * `packages/commands/src/parameterTypes.ts`, which is the verified table: it is keyed by the
 * name Mojang's own command metadata spells, and the generator joins the two halves on that
 * key. This package does not depend on `@jsprismarine/commands`, so the numbers are repeated
 * here and `CommandParameter.test.ts` reads that file to prove the copies agree. The names
 * below are the common library spelling, which is what the rest of this package reads.
 */
export enum CommandArgumentType {
    /** `INT`. */
    Int = 1,
    /** `VAL`. */
    Float = 3,
    /** `RVAL`, a value that may be relative. */
    Value = 4,
    /** `WILDCARDINT`. */
    WildcardInt = 5,
    /** `OPERATOR`. */
    Operator = 6,
    /** `COMPAREOPERATOR`. */
    CompareOperator = 7,
    /** `SELECTION`, a target selector. */
    Target = 8,
    /** `WILDCARDSELECTION`, a target selector that accepts `*`. */
    WildcardSelection = 10,
    /** `PATHCOMMAND`, the file path `/function` takes. */
    PathCommand = 17,
    /** `FULLINTEGERRANGE`, the range `execute if score ... matches` takes. */
    FullIntegerRange = 23,
    /** `EQUIPMENTSLOTENUM`. */
    EquipmentSlot = 47,
    /** `ID`, a plain string. */
    String = 56,
    /** `POSITION`, a block position. */
    BlockPosition = 64,
    /** `POSITION_FLOAT`. */
    Position = 65,
    /**
     * An inner grammar rule, not a type Mojang's own command set uses. `MessageRoot` is the
     * one that appears in the 1.26.50.4 metadata.
     */
    Message = 67,
    /** `MESSAGE_ROOT`. */
    MessageRoot = 68,
    /** `RAWTEXT`. */
    RawText = 70,
    /** `JSON_OBJECT`. */
    Json = 74,
    /** `BLOCK_STATE_ARRAY`, Bedrock's `stone_stairs["facing"="north"]`. */
    BlockStateArray = 84,
    /** `CLOCK_TIMEMARKER_NAME`. */
    ClockTimeMarker = 86,
    /** `POI_TAG`, new in 1.26.50. */
    PoiTag = 87,
    /** `POI_TYPE`, new in 1.26.50. */
    PoiType = 88,
    /** `CODEBUILDERARGS`, the command `/execute run` takes. */
    CodeBuilderArgs = 92
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
    WildcardSelection: CommandParameterTypeFlag.Valid | CommandArgumentType.WildcardSelection,
    PathCommand: CommandParameterTypeFlag.Valid | CommandArgumentType.PathCommand,
    FullIntegerRange: CommandParameterTypeFlag.Valid | CommandArgumentType.FullIntegerRange,
    EquipmentSlot: CommandParameterTypeFlag.Valid | CommandArgumentType.EquipmentSlot,
    String: CommandParameterTypeFlag.Valid | CommandArgumentType.String,
    BlockPosition: CommandParameterTypeFlag.Valid | CommandArgumentType.BlockPosition,
    Position: CommandParameterTypeFlag.Valid | CommandArgumentType.Position,
    Message: CommandParameterTypeFlag.Valid | CommandArgumentType.Message,
    MessageRoot: CommandParameterTypeFlag.Valid | CommandArgumentType.MessageRoot,
    RawText: CommandParameterTypeFlag.Valid | CommandArgumentType.RawText,
    Json: CommandParameterTypeFlag.Valid | CommandArgumentType.Json,
    BlockStateArray: CommandParameterTypeFlag.Valid | CommandArgumentType.BlockStateArray,
    ClockTimeMarker: CommandParameterTypeFlag.Valid | CommandArgumentType.ClockTimeMarker,
    PoiTag: CommandParameterTypeFlag.Valid | CommandArgumentType.PoiTag,
    PoiType: CommandParameterTypeFlag.Valid | CommandArgumentType.PoiType,
    CodeBuilderArgs: CommandParameterTypeFlag.Valid | CommandArgumentType.CodeBuilderArgs,
    Enum: CommandParameterTypeFlag.Enum
} as const;

/**
 * A command parameter's type word, one of the values of {@link CommandParameterType}.
 */
export type CommandParameterType = (typeof CommandParameterType)[keyof typeof CommandParameterType];

/**
 * The options byte of a command parameter (`ParamOption*` in gophertunnel's `command.go`,
 * `CommandParameterOption` in Mojang's own naming).
 */
export enum CommandParameterFlags {
    NONE = 0,
    FORCE_COLLAPSE_ENUM = 0x1,
    FLAG_HAS_ENUM_CONSTRAINT = 0x2,
    /**
     * Marks the trailing "and then another subcommand" parameter of a chained `/execute`
     * overload. The packet sets this itself for a parameter with a `chainedSubcommand`, so a
     * caller never has to.
     */
    ENUM_AS_CHAINED_COMMAND = 0x4
}

/**
 * One parameter of a command overload as the `AvailableCommandsPacket` sends it.
 *
 * A parameter is a basic type (`paramType`), an enum (`enum`), or the tail of a chained
 * `/execute` overload (`chainedSubcommand`). When either of the last two is set the packet
 * ignores `paramType` and writes the table's index instead.
 */
export default class CommandParameter {
    public paramName: string;
    public paramType: CommandParameterType;
    public isOptional: boolean;
    public flags: CommandParameterFlags;
    public enum: CommandEnum | null;
    public postfix: string | null;
    public chainedSubcommand: CommandChainedSubcommand | null;

    public constructor(data?: {
        paramName?: string;
        paramType?: CommandParameterType;
        isOptional?: boolean;
        flags?: CommandParameterFlags;
        enum?: CommandEnum | null;
        postfix?: string | null;
        chainedSubcommand?: CommandChainedSubcommand | null;
    }) {
        this.paramName = data?.paramName ?? 'paramName';
        this.paramType = data?.paramType ?? CommandParameterType.Value;
        this.isOptional = data?.isOptional ?? false;
        this.flags = data?.flags ?? CommandParameterFlags.NONE;
        this.enum = data?.enum ?? null;
        this.postfix = data?.postfix ?? null;
        this.chainedSubcommand = data?.chainedSubcommand ?? null;
    }
}
