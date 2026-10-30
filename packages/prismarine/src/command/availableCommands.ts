/**
 * Turning `@jsprismarine/commands`'s flattened tree into the packet's types.
 *
 * The package stops at values: `buildAvailableCommands` hands back the eight
 * fields of `AvailableCommandsPacket` already indexed, because it does not
 * depend on the protocol. This server's packet builds those indexes itself
 * from `CommandData`, `CommandEnum` and `CommandChainedSubcommand` objects, so
 * the join happens one step earlier, at {@link flattenCommandTree}'s output,
 * where a parameter still names its enum rather than pointing at a table.
 */
import type { BedrockParameterTypeName, FlattenedCommand, FlattenedParameter } from '@jsprismarine/commands';

import { CommandChainedSubcommand } from '@jsprismarine/protocol/wire/structures/CommandChainedSubcommand';
import CommandData from '@jsprismarine/protocol/wire/structures/CommandData';
import { CommandEnum } from '@jsprismarine/protocol/wire/structures/CommandEnum';
import type { CommandParameterType } from '@jsprismarine/protocol/wire/structures/CommandParameter';
import CommandParameter, {
    CommandParameterFlags,
    CommandParameterType as ParameterType
} from '@jsprismarine/protocol/wire/structures/CommandParameter';

/**
 * The type word each of the package's basic parameter types is written as.
 *
 * Both halves are the same 21 protocol-2193 ids - `CommandParameter.test.ts`
 * already proves the numbers agree - so this is a name-to-name join rather
 * than a third copy of the table. `Record<BedrockParameterTypeName, …>` makes
 * it exhaustive, so a type the package adds fails the build here instead of
 * silently going out as a float.
 */
export const PARAMETER_TYPES = {
    INT: ParameterType.Int,
    VAL: ParameterType.Float,
    RVAL: ParameterType.Value,
    WILDCARDINT: ParameterType.WildcardInt,
    OPERATOR: ParameterType.Operator,
    COMPAREOPERATOR: ParameterType.CompareOperator,
    SELECTION: ParameterType.Target,
    WILDCARDSELECTION: ParameterType.WildcardSelection,
    PATHCOMMAND: ParameterType.PathCommand,
    FULLINTEGERRANGE: ParameterType.FullIntegerRange,
    ID: ParameterType.String,
    POSITION: ParameterType.BlockPosition,
    POSITION_FLOAT: ParameterType.Position,
    MESSAGE_ROOT: ParameterType.MessageRoot,
    RAWTEXT: ParameterType.RawText,
    JSON_OBJECT: ParameterType.Json,
    BLOCK_STATE_ARRAY: ParameterType.BlockStateArray,
    CLOCK_TIMEMARKER_NAME: ParameterType.ClockTimeMarker,
    POI_TAG: ParameterType.PoiTag,
    POI_TYPE: ParameterType.PoiType,
    CODEBUILDERARGS: ParameterType.CodeBuilderArgs
} as const satisfies Record<BedrockParameterTypeName, CommandParameterType>;

const enumOf = (name: string, values: readonly string[], soft = false): CommandEnum => {
    const built = new CommandEnum();
    built.name = name;
    built.values = [...values];
    built.soft = soft;
    return built;
};

/** One flattened parameter as the packet writes it. */
const parameterOf = (parameter: FlattenedParameter): CommandParameter => {
    const { shape } = parameter;
    switch (shape.kind) {
        case 'basic':
            return new CommandParameter({
                paramName: parameter.name,
                paramType: PARAMETER_TYPES[shape.type],
                isOptional: parameter.optional
            });
        case 'enum':
            return new CommandParameter({
                paramName: parameter.name,
                enum: enumOf(shape.name, shape.values),
                isOptional: parameter.optional,
                // A one-value enum is a subcommand keyword, which the client
                // shows as the word itself rather than as a named parameter.
                flags:
                    shape.values.length === 1 ? CommandParameterFlags.FORCE_COLLAPSE_ENUM : CommandParameterFlags.NONE
            });
        case 'softEnum':
            return new CommandParameter({
                paramName: parameter.name,
                enum: enumOf(shape.name, [], true),
                isOptional: parameter.optional
            });
        case 'postfix':
            return new CommandParameter({
                paramName: parameter.name,
                postfix: shape.postfix,
                isOptional: parameter.optional
            });
        case 'chained': {
            const table = new CommandChainedSubcommand();
            table.name = shape.name;
            table.values = [];
            return new CommandParameter({
                paramName: parameter.name,
                chainedSubcommand: table,
                isOptional: parameter.optional
            });
        }
    }
};

/**
 * One flattened command as the packet writes it.
 *
 * @param command - What the flattener produced for one root literal.
 * @param permission - The level to send, which is the lower of what the
 *   command needs and what the recipient has; see
 *   `PlayerSession.sendAvailableCommands`.
 */
export const commandDataOf = (command: FlattenedCommand, permission: number): CommandData => {
    const data = new CommandData();
    data.commandName = command.name;
    data.commandDescription = command.description;
    data.flags = command.flags;
    data.permission = permission;

    if (command.aliases.length > 0) {
        // Mojang's own commands list the command's own name first, so a client
        // resolving an alias finds the canonical spelling.
        data.aliases = enumOf(`${command.name}Aliases`, [command.name, ...command.aliases]);
    }

    data.chainedSubcommands = command.chainedSubcommands.map((table) => {
        const built = new CommandChainedSubcommand();
        built.name = table.name;
        built.values = [...table.values];
        return built;
    });

    // The tables the command declares carry the keywords; the parameter that
    // points at one carries only the name, and the packet resolves both to the
    // same index by name.
    const keywords = new Map(data.chainedSubcommands.map((table) => [table.name, table] as const));
    data.overloads = command.overloads.map((overload) =>
        overload.parameters.map((parameter) => {
            const built = parameterOf(parameter);
            if (built.chainedSubcommand !== null) {
                built.chainedSubcommand = keywords.get(built.chainedSubcommand.name) ?? built.chainedSubcommand;
            }
            return built;
        })
    );

    return data;
};
