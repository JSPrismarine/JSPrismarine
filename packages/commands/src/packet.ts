/**
 * Builds the `AvailableCommandsPacket` payload from a command registry.
 *
 * The payload is the packet's eight fields as values, not bytes. This package
 * does not depend on the protocol or server packages, so it produces the data
 * and the network layer writes it. The field names, order and widths follow
 * Mojang's own `AvailableCommandsPacket.html` schema at protocol 2193 and this
 * repository's `packages/protocol/src/packet/AvailableCommandsPacket.ts`,
 * which implements that schema field for field.
 *
 * Wire order, each list a varuint count then its items:
 *
 * | # | Field | Type |
 * | --- | --- | --- |
 * | 0 | Enum Values | `array<string>` |
 * | 1 | Chained Subcommand Values | `array<string>` |
 * | 2 | Post Fixes | `array<string>` |
 * | 3 | Enum Data | `array<{Name: string, Values: array<uint32>}>` |
 * | 4 | Chained Subcommand Data | `array<{Name: string, values: array<{first: varuint32, second: varuint32}>}>` |
 * | 5 | Commands | `array<CommandData>` |
 * | 6 | Soft Enums | `array<{Name: string, Options: array<string>}>` |
 * | 7 | Constraints | `array<{Enum Value Symbol: uint32, Enum Symbol: uint32, Constraint Indices: array<uint8>}>` |
 *
 * Hard and soft enums are numbered in separate tables, and a value that two
 * enums share is written into `Enum Values` once.
 */
import type { FlattenNote, FlattenOptions, FlattenResult, FlattenedParameter } from './flatten';
import { flattenCommandTree, literalEnumName } from './flatten';
import {
    ParameterOption,
    basicParseSymbol,
    chainedParseSymbol,
    enumParseSymbol,
    postfixParseSymbol,
    softEnumParseSymbol
} from './parameterTypes';
import type { CommandRegistry } from './tree';

/** One parameter of one overload, as the packet writes it. */
export interface AvailableCommandParameter {
    /** The name the client shows, written as a string. */
    readonly name: string;
    /** The 32 bit `Parse Symbol` word. */
    readonly parseSymbol: number;
    /** The `Is Optional?` boolean. */
    readonly optional: boolean;
    /** The `Options` byte, a `CommandParameterOption` mask. */
    readonly options: number;
}

/** One overload of one command, as the packet writes it. */
export interface AvailableCommandOverload {
    /**
     * The `isChaining` boolean, true when a chain can continue into the
     * overload: it starts with a chained keyword or ends in a chained subcommand.
     */
    readonly isChaining: boolean;
    readonly parameters: readonly AvailableCommandParameter[];
}

/** One command, as the packet writes it. */
export interface AvailableCommandData {
    readonly name: string;
    readonly description: string;
    /** `Flags`, a uint16. */
    readonly flags: number;
    /** `Permission Level`, a `CommandPermissionLevel` from 0 to 5. */
    readonly permissionLevel: number;
    /** `Alias Enum`, an int32 index into `Enum Data`, or -1 when the command has no aliases. */
    readonly aliasEnum: number;
    /** `CommandData Chained Subcommand Indexes`, uint32 indices into `Chained Subcommand Data`. */
    readonly chainedSubcommandIndexes: readonly number[];
    readonly overloads: readonly AvailableCommandOverload[];
}

/** One entry of `Enum Data`: a name and the indices of its values in `Enum Values`. */
export interface AvailableCommandEnum {
    readonly name: string;
    readonly valueIndexes: readonly number[];
}

/** One entry of `Chained Subcommand Data`. */
export interface AvailableChainedSubcommand {
    readonly name: string;
    /**
     * The value pairs, one per keyword.
     *
     * `first` is the keyword's index in `Chained Subcommand Values` and
     * `second` is the index in `Enum Data` of the enum that holds the keyword,
     * which for `/execute` is the enum leading the keyword's own overload
     * (`Option_As`, `Option_If_Unless`). That is what a Bedrock Dedicated
     * Server sends in `bedrock-data/src/jsp/v2193/wire/0x4c.bin`.
     */
    readonly values: readonly { readonly first: number; readonly second: number }[];
}

/** One entry of `Soft Enums`, whose values travel as strings rather than indices. */
export interface AvailableSoftEnum {
    readonly name: string;
    readonly values: readonly string[];
}

/** The eight fields of `AvailableCommandsPacket`, as values. */
export interface AvailableCommandsPayload {
    readonly enumValues: readonly string[];
    readonly chainedSubcommandValues: readonly string[];
    readonly postfixes: readonly string[];
    readonly enums: readonly AvailableCommandEnum[];
    readonly chainedSubcommands: readonly AvailableChainedSubcommand[];
    readonly commands: readonly AvailableCommandData[];
    readonly softEnums: readonly AvailableSoftEnum[];
    readonly constraints: readonly {
        readonly enumValueSymbol: number;
        readonly enumSymbol: number;
        readonly constraintIndexes: readonly number[];
    }[];
}

/** A built payload and the cost of flattening the tree into it. */
export interface BuildAvailableCommandsResult {
    readonly payload: AvailableCommandsPayload;
    /** Every node the flattener could not carry across unchanged. */
    readonly notes: readonly FlattenNote[];
}

/** How to build. */
export interface BuildAvailableCommandsOptions<S> extends FlattenOptions<S> {
    /**
     * Values for the soft enums the tree refers to, keyed by enum name. A soft
     * enum with no entry here is sent empty, which is what vanilla does before
     * the first `UpdateSoftEnumPacket`.
     */
    readonly softEnumValues?: Readonly<Record<string, readonly string[]>>;
}

/** An index table that keeps insertion order and never writes a value twice. */
class IndexTable<T> {
    private readonly indexes = new Map<string, number>();
    private readonly items: T[] = [];

    public constructor(private readonly key: (item: T) => string) {}

    public add(item: T): number {
        const key = this.key(item);
        const existing = this.indexes.get(key);
        if (existing !== undefined) return existing;
        const index = this.items.length;
        this.indexes.set(key, index);
        this.items.push(item);
        return index;
    }

    public list(): T[] {
        return this.items;
    }
}

/**
 * Builds the `AvailableCommandsPacket` payload from a command registry.
 *
 * Pass `source` to filter the tree by `CommandNode.canUse` the way Java does,
 * so a player is only told about the commands they may run.
 *
 * @param registry - The tree to send.
 * @returns The payload and the flattener's report. Callers that care about
 *   fidelity should log or assert on the notes; nothing is dropped silently.
 */
export const buildAvailableCommands = <S>(
    registry: CommandRegistry<S>,
    options: BuildAvailableCommandsOptions<S> = {}
): BuildAvailableCommandsResult => {
    const flattened = flattenCommandTree(registry, options);
    return { payload: encode(flattened, options.softEnumValues ?? {}), notes: flattened.notes };
};

/**
 * Builds the payload from an already-flattened tree.
 *
 * Useful when the caller wants to inspect or filter the flattener's report
 * before encoding.
 */
export const encodeAvailableCommands = (
    flattened: FlattenResult,
    softEnumValues: Readonly<Record<string, readonly string[]>> = {}
): AvailableCommandsPayload => encode(flattened, softEnumValues);

const encode = (
    flattened: FlattenResult,
    softEnumValues: Readonly<Record<string, readonly string[]>>
): AvailableCommandsPayload => {
    const enumValues = new IndexTable<string>((value) => value);
    const chainedValues = new IndexTable<string>((value) => value);
    const postfixes = new IndexTable<string>((value) => value);
    const enums = new IndexTable<AvailableCommandEnum>((entry) => entry.name);
    const softEnums = new IndexTable<AvailableSoftEnum>((entry) => entry.name);
    // Each table's keywords, filled into value pairs once every enum has its index.
    const chainedSubcommands = new IndexTable<{ name: string; keywords: readonly string[] }>((entry) => entry.name);
    // The `Enum Data` index of each table's keywords, keyed by table name.
    const keywordEnums = new Map<string, Map<string, number>>();

    const addEnum = (name: string, values: readonly string[]): number =>
        enums.add({ name, valueIndexes: values.map((value) => enumValues.add(value)) });

    // The chained-subcommand tables are numbered before any parameter refers to
    // one, so a command's index and a parameter's index agree.
    const chainedIndexes = flattened.commands.map((command) =>
        command.chainedSubcommands.map((table) => chainedSubcommands.add({ name: table.name, keywords: table.values }))
    );

    const parameterOf = (parameter: FlattenedParameter): AvailableCommandParameter => {
        const { shape } = parameter;
        switch (shape.kind) {
            case 'basic':
                return {
                    name: parameter.name,
                    parseSymbol: basicParseSymbol(shape.type),
                    optional: parameter.optional,
                    options: ParameterOption.None
                };
            case 'enum':
                return {
                    name: parameter.name,
                    parseSymbol: enumParseSymbol(addEnum(shape.name, shape.values)),
                    optional: parameter.optional,
                    options: ParameterOption.None
                };
            case 'softEnum':
                return {
                    name: parameter.name,
                    parseSymbol: softEnumParseSymbol(
                        softEnums.add({ name: shape.name, values: softEnumValues[shape.name] ?? [] })
                    ),
                    optional: parameter.optional,
                    options: ParameterOption.None
                };
            case 'postfix':
                return {
                    name: parameter.name,
                    // A postfixed parameter is the one kind with no `Valid` bit.
                    parseSymbol: postfixParseSymbol(postfixes.add(shape.postfix)),
                    optional: parameter.optional,
                    options: ParameterOption.None
                };
            case 'chained':
                return {
                    name: parameter.name,
                    parseSymbol: chainedParseSymbol(chainedSubcommands.add({ name: shape.name, keywords: [] })),
                    optional: parameter.optional,
                    options: ParameterOption.EnumAsChainedCommand
                };
        }
    };

    const commands = flattened.commands.map((command, position): AvailableCommandData => {
        // Mojang's own commands list the command's own name first in its alias
        // enum, so a client resolving an alias finds the canonical spelling.
        const aliasEnum =
            command.aliases.length === 0 ? -1 : addEnum(`${command.name}Aliases`, [command.name, ...command.aliases]);

        const overloads = command.overloads.map((overload) => ({
            isChaining: overload.chaining,
            parameters: overload.parameters.map(parameterOf)
        }));

        // A keyword's enum is the hard enum leading an overload of this command
        // that lists it, the way `Option_If_Unless` leads `/execute if`.
        const leading = new Map<string, number>();
        for (const overload of command.overloads) {
            const shape = overload.parameters[0]?.shape;
            if (shape?.kind !== 'enum') continue;
            // `parameterOf` already added this enum, so this only reads its index.
            const index = addEnum(shape.name, shape.values);
            for (const value of shape.values) {
                if (!leading.has(value)) leading.set(value, index);
            }
        }
        for (const table of command.chainedSubcommands) {
            const resolved = new Map<string, number>();
            for (const keyword of table.values) {
                // A keyword no overload leads with, such as one the overload
                // limit cut, gets an enum of its own so the pair still names one.
                resolved.set(keyword, leading.get(keyword) ?? addEnum(literalEnumName([keyword]), [keyword]));
            }
            keywordEnums.set(table.name, resolved);
        }

        return {
            name: command.name,
            description: command.description,
            flags: command.flags,
            permissionLevel: command.permissionLevel,
            aliasEnum,
            chainedSubcommandIndexes: chainedIndexes[position] ?? [],
            overloads
        };
    });

    return {
        enumValues: enumValues.list(),
        chainedSubcommandValues: chainedValues.list(),
        postfixes: postfixes.list(),
        enums: enums.list(),
        chainedSubcommands: chainedSubcommands.list().map(({ name, keywords }) => ({
            name,
            values: keywords.map((keyword) => ({
                first: chainedValues.add(keyword),
                second: keywordEnums.get(name)?.get(keyword) ?? 0
            }))
        })),
        commands,
        softEnums: softEnums.list(),
        constraints: []
    };
};
