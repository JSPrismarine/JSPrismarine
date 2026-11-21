/**
 * The custom commands behavior pack scripts register in `startup`, as commands of the server's
 * one command tree, so the console, players, functions and scripts run them as they run any
 * other command, and `AvailableCommandsPacket` lists them.
 *
 * Each parameter type parses as the pinned BDS parses it, as the `custom-commands` scenario of
 * the parity suite recorded: an absolute whole-number location names the middle of its block on
 * the x and z axes, and an `Enum` parameter takes any word while the client completes the
 * registered values.
 */
import type { BedrockDescribedType, CoordinateTriple } from '@jsprismarine/commands/argumentTypes';
import {
    entityArgument,
    enumArgument,
    floatArgument,
    integerArgument,
    positionArgument,
    resourceArgument,
    stringArgument
} from '@jsprismarine/commands/argumentTypes';
import type { Context } from '@jsprismarine/commands/commands/support';
import { arg, command, lit, resolvePosition, select, source, value } from '@jsprismarine/commands/commands/support';
import type { CommandSource } from '@jsprismarine/commands/host';
import type { SelectorModel } from '@jsprismarine/commands/selector';
import type { CommandRegistry } from '@jsprismarine/commands/tree';
import type {
    ScriptCommandArgument,
    ScriptCommandOrigin,
    ScriptCommandParameter,
    ScriptCommandSet,
    ScriptCustomCommand
} from '@jsprismarine/script-host/host/world';

/**
 * What a custom command returns when its callback failed or its sender may not run it: not a
 * number, so a script's `runCommand` reads it as no success and no error, as BDS does.
 */
export const SCRIPT_COMMAND_FAILED = Symbol('script command failed');

/** How one parameter type parses, and what the callback gets for what it parsed. */
interface ParameterKind {
    readonly type: BedrockDescribedType<unknown>;
    read(context: Context, name: string): ScriptCommandArgument;
}

/**
 * A coordinate triple as BDS hands a custom command's `Location`: a whole absolute x or z is the
 * middle of its block, and every other coordinate is as written, relative ones from the source.
 */
const locationOf = (triple: CoordinateTriple, from: CommandSource): ScriptCommandArgument => {
    const resolved = resolvePosition(triple, from);
    const [x, , z] = triple;
    const centered = (coordinate: typeof x, at: number): number =>
        coordinate.mode === 'absolute' && Number.isInteger(coordinate.value) ? at + 0.5 : at;
    return {
        kind: 'location',
        location: { x: centered(x, resolved.x), y: resolved.y, z: centered(z, resolved.z) }
    };
};

/** The entities a selector argument matched, players only when `players` says so. */
const entitiesOf = (context: Context, name: string, players: boolean): ScriptCommandArgument => {
    const matched = select(source(context), value<SelectorModel>(context, name));
    return {
        kind: 'entities',
        entities: matched
            .filter((entity) => !players || entity.isPlayer)
            .map((entity) => ({ id: entity.id, typeId: entity.type }))
    };
};

/**
 * The parse of each parameter type.
 * @param registry - The tree the commands join, whose content lists the types a pack added.
 */
const parameterKind = (
    parameter: ScriptCommandParameter,
    enums: ReadonlyMap<string, readonly string[]>,
    registry: CommandRegistry<CommandSource>
): ParameterKind => {
    const content = registry.getContent();
    const plain = (type: BedrockDescribedType<unknown>): ParameterKind => ({
        type,
        read: (context, name) => value<string | number>(context, name)
    });
    switch (parameter.type) {
        case 'String':
            return plain(stringArgument());
        case 'Integer':
            return plain(integerArgument());
        case 'Float':
            return plain(floatArgument());
        case 'Boolean':
            return {
                type: enumArgument('Boolean', ['true', 'false'] as const),
                read: (context, name) => value<string>(context, name) === 'true'
            };
        case 'Location':
            return {
                type: positionArgument(),
                read: (context, name) => locationOf(value<CoordinateTriple>(context, name), source(context))
            };
        case 'EntitySelector':
        case 'PlayerSelector':
            return {
                type: entityArgument({ dialect: 'bedrock' }),
                read: (context, name) => entitiesOf(context, name, parameter.type === 'PlayerSelector')
            };
        case 'EntityType':
            return {
                type: resourceArgument('minecraft:entity_type', content.entityTypes),
                read: (context, name) => ({ kind: 'entityType', id: value<string>(context, name) })
            };
        case 'ItemType':
            return {
                type: resourceArgument('minecraft:item', content.items),
                read: (context, name) => ({ kind: 'itemType', id: value<string>(context, name) })
            };
        case 'BlockType':
            return {
                type: resourceArgument('minecraft:block', content.blocks),
                read: (context, name) => ({ kind: 'blockType', id: value<string>(context, name) })
            };
        case 'Enum': {
            const enumName = parameter.enumName ?? parameter.name;
            const values = enums.get(enumName) ?? [];
            // BDS took a word the enum does not list, so only the client's completion is bound to it.
            const type: BedrockDescribedType<string> = {
                parse: stringArgument().parse,
                describeBedrock: () => ({ kind: 'enum', name: enumName, values })
            };
            return plain(type);
        }
    }
};

/** Who the Script API says ran a command. */
const originOf = (from: CommandSource): ScriptCommandOrigin =>
    from.entity === undefined
        ? { sourceType: 'Server' }
        : { sourceType: 'Entity', sourceEntity: { id: from.entity.id, typeId: from.entity.type } };

/**
 * Registers one custom command: its literal, an alias without its namespace when no other
 * command holds that name, and one branch of arguments whose every node from the last mandatory
 * one on runs it.
 */
const registerOne = (
    registry: CommandRegistry<CommandSource>,
    setFor: ScriptCommandsOf,
    custom: ScriptCustomCommand,
    enums: ReadonlyMap<string, readonly string[]>
): void => {
    const parameters = [...custom.mandatoryParameters, ...custom.optionalParameters];
    const kinds = parameters.map((parameter) => parameterKind(parameter, enums, registry));
    const run = (count: number) =>
        command((context) => {
            const from = source(context);
            if (from.permissionLevel < custom.permissionLevel) return SCRIPT_COMMAND_FAILED as unknown as number;
            const args = parameters
                .slice(0, count)
                .map((parameter, index) => kinds[index]!.read(context, parameter.name));
            const set = setFor(from);
            if (set?.commands.some((each) => each.name === custom.name) !== true) {
                from.sendError(`No behavior pack script in this level registered ${custom.name}`);
                return SCRIPT_COMMAND_FAILED as unknown as number;
            }
            const outcome = set.run(custom.name, originOf(from), args);
            if (outcome.status === 'failure') {
                if (outcome.message !== undefined) from.sendError(outcome.message);
                // Not a number, so a script's runCommand counts no success; see SCRIPT_COMMAND_FAILED.
                return SCRIPT_COMMAND_FAILED as unknown as number;
            }
            if (outcome.message !== undefined) from.sendFeedback(outcome.message);
            return 1;
        });
    const branch = (index: number): ReturnType<typeof arg<unknown>> => {
        const node = arg(parameters[index]!.name, kinds[index]!.type);
        if (index + 1 >= custom.mandatoryParameters.length) node.executes(run(index + 1));
        if (index + 1 < parameters.length) node.then(branch(index + 1));
        return node;
    };
    const root = lit(custom.name);
    if (custom.mandatoryParameters.length === 0) root.executes(run(0));
    if (parameters.length > 0) root.then(branch(0));

    const bare = custom.name.slice(custom.name.indexOf(':') + 1);
    const taken = registry.getMetadata(bare) !== undefined || registry.getAliasOwner(bare) !== undefined;
    registry.register(root, {
        description: custom.description,
        aliases: taken ? [] : [bare],
        permissionLevel: custom.permissionLevel,
        requiresCheats: custom.cheatsRequired
    });
};

/**
 * The scripts a custom command runs in: those of the level the command runs in, which registered
 * their own copy of it, or undefined when that level runs no scripts.
 */
export type ScriptCommandsOf = (from: CommandSource) => ScriptCommandSet | undefined;

/**
 * Adds the scripts' custom commands to a command tree. The tree is the server's, so it holds the
 * commands of every level's scripts; each runs in the scripts of the level it is run in.
 * @param registry - The tree, with every built-in command already in it.
 * @param set - The commands and enums the scripts registered.
 * @param setFor - The scripts a command runs in; left out, `set`'s.
 */
export const registerScriptCommands = (
    registry: CommandRegistry<CommandSource>,
    set: ScriptCommandSet,
    setFor: ScriptCommandsOf = () => set
): void => {
    const enums = new Map(set.enums.map((entry) => [entry.name, entry.values] as const));
    for (const custom of set.commands) registerOne(registry, setFor, custom, enums);
};
