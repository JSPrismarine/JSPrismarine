/**
 * The Bedrock command parameter type ids at protocol 2193, and the arithmetic
 * that turns a parameter into the 32 bit `Parse Symbol` the client reads.
 *
 * Mojang names a parameter's type in `mojang-commands.json`; the numbers the
 * client wants are not in that file. The ids below are the ones
 * `docs/research/commands-functions-and-datapack-execution.md` section 5
 * records for protocol 2193, keyed by Mojang's own metadata name so the two
 * halves join on a published key rather than on a guess. `PoiTag` and
 * `PoiType` were inserted at 87 and 88 in 1.26.50, which moved everything
 * above them, so these are version-pinned numbers.
 */
import { bedrockCommandTable } from './bedrockTable';

/**
 * The flag bits of a parameter's type word.
 *
 * A basic type is its id with `Valid` set. An enum parameter carries `Enum`
 * (or `SoftEnum`) with `Valid` and the enum's index in its own table. A
 * postfixed integer carries `Postfix` and the postfix's index, and is the one
 * case with no `Valid` bit.
 */
export const ParameterTypeFlag = {
    Valid: 0x100000,
    Enum: 0x200000,
    Postfix: 0x1000000,
    SoftEnum: 0x4000000
} as const;

/**
 * The `Options` byte of a parameter, `CommandParameterOption` in Mojang's own
 * naming. `EnumAsChainedCommand` marks the trailing parameter of a chained
 * `/execute` overload.
 */
export const ParameterOption = {
    None: 0,
    EnumAutocompleteExpansion: 1,
    HasSemanticConstraint: 2,
    EnumAsChainedCommand: 4
} as const;

/**
 * The basic parameter type ids, keyed by the name Mojang's command metadata
 * spells.
 *
 * Mojang's table declares 26 basic parameter type names and 21 of them are
 * below, which is not a gap. The other five, `EXECUTECHAINEDOPTION_0` and the
 * four `POSTFIX_*` names, carry no id of their own: a chained subcommand
 * indexes the packet's chained-subcommand table and a postfix indexes its
 * postfix table, and {@link BedrockParameterShape} gives each its own kind.
 * 21 + 1 + 4 is the 26.
 */
export const BedrockParameterTypeId = {
    INT: 1,
    VAL: 3,
    RVAL: 4,
    WILDCARDINT: 5,
    OPERATOR: 6,
    COMPAREOPERATOR: 7,
    SELECTION: 8,
    WILDCARDSELECTION: 10,
    PATHCOMMAND: 17,
    FULLINTEGERRANGE: 23,
    ID: 56,
    POSITION: 64,
    POSITION_FLOAT: 65,
    MESSAGE_ROOT: 68,
    RAWTEXT: 70,
    JSON_OBJECT: 74,
    BLOCK_STATE_ARRAY: 84,
    CLOCK_TIMEMARKER_NAME: 86,
    POI_TAG: 87,
    POI_TYPE: 88,
    CODEBUILDERARGS: 92
} as const;

/** A basic parameter type name that has an id of its own. */
export type BedrockParameterTypeName = keyof typeof BedrockParameterTypeId;

/** The postfix a `POSTFIX_*` parameter type writes into the packet's postfix table. */
export const PostfixParameterType = {
    POSTFIX_T: 't',
    POSTFIX_S: 's',
    POSTFIX_D: 'd',
    POSTFIX_L: 'l'
} as const;

/** The metadata name of the chained-subcommand parameter type, Mojang's only one. */
export const CHAINED_SUBCOMMAND_TYPE = 'EXECUTECHAINEDOPTION_0';

/**
 * What a parameter is on the wire. Everything the flattener produces and
 * everything {@link buildAvailableCommands} writes is one of these five.
 */
export type BedrockParameterShape =
    /** A basic type the client parses itself. */
    | { readonly kind: 'basic'; readonly type: BedrockParameterTypeName }
    /** A fixed value list that travels in the packet's enum table. */
    | { readonly kind: 'enum'; readonly name: string; readonly values: readonly string[] }
    /** A value list the server fills later over `UpdateSoftEnumPacket`. */
    | { readonly kind: 'softEnum'; readonly name: string }
    /** An integer with a unit suffix, indexing the packet's postfix table. */
    | { readonly kind: 'postfix'; readonly postfix: string }
    /** The trailing "and then another subcommand" parameter of a chained overload. */
    | { readonly kind: 'chained'; readonly name: string };

/** The string every argument the 26 types cannot express falls back to. */
export const STRING_FALLBACK: BedrockParameterShape = { kind: 'basic', type: 'ID' };

/**
 * Builds the `Parse Symbol` word of a basic parameter.
 *
 * @returns The type id with the `Valid` bit set.
 */
export const basicParseSymbol = (type: BedrockParameterTypeName): number =>
    (ParameterTypeFlag.Valid | BedrockParameterTypeId[type]) >>> 0;

/**
 * Builds the `Parse Symbol` word of a hard enum parameter.
 *
 * @param index - The enum's position in the packet's `Enum Data` list.
 */
export const enumParseSymbol = (index: number): number =>
    (ParameterTypeFlag.Enum | ParameterTypeFlag.Valid | index) >>> 0;

/**
 * Builds the `Parse Symbol` word of a soft enum parameter.
 *
 * @param index - The enum's position in the packet's `Soft Enums` list, which
 *   is numbered separately from the hard enum list.
 */
export const softEnumParseSymbol = (index: number): number =>
    (ParameterTypeFlag.SoftEnum | ParameterTypeFlag.Valid | index) >>> 0;

/**
 * Builds the `Parse Symbol` word of a postfixed integer.
 *
 * A postfix is the one parameter kind with no `Valid` bit.
 *
 * @param index - The postfix's position in the packet's `Post Fixes` list.
 */
export const postfixParseSymbol = (index: number): number => (ParameterTypeFlag.Postfix | index) >>> 0;

/**
 * The 26 basic parameter type names Mojang's own command set uses, read from
 * the generated table rather than repeated here.
 */
export const bedrockBasicTypeNames: readonly string[] = bedrockCommandTable.basicTypes.map((entry) => entry.name);

/**
 * Whether this package can give the named basic parameter type a wire id.
 *
 * False for the five that index a packet table instead of carrying an id:
 * the chained-subcommand type and the four postfix types.
 */
export const hasParameterTypeId = (name: string): name is BedrockParameterTypeName =>
    Object.hasOwn(BedrockParameterTypeId, name);
