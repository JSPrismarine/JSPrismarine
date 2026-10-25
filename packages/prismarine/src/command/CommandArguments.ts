import type {
    ArgumentType,
    CommandContext,
    CommandContextBuilder,
    StringReader,
    SuggestionsBuilder
} from '@jsprismarine/brigadier';
import { Suggestions } from '@jsprismarine/brigadier';
import CommandParameter, { CommandParameterFlags, CommandParameterType } from '../network/type/CommandParameter';

import { Vector3 } from '@jsprismarine/math';
import { getGametypeId, getGametypeName } from '@jsprismarine/minecraft';
import type Server from '../Server';
// Imported straight from its module rather than through the barrel; see `CommandManager.ts`.
import { Entity } from '../entity/Entity';
import { writtenEntities } from '../entity/Entities';
import { CommandEnum } from '../network/type/CommandEnum';
import ParseTargetSelector from '../utils/ParseTargetSelector';
import ParseTildeCaretNotation, { parseAbsoluteCoordinate } from '../utils/ParseTildeCaretNotation';
import type { CommandExecutor } from './CommandExecutor';

/**
 * What an argument may read while the command is still being parsed. The dispatcher hands over
 * its context builder, so only the source is known at this point.
 */
export type CommandParseContext = Pick<CommandContextBuilder<CommandExecutor>, 'getSource'>;

export abstract class CommandArgument {
    public getReadableType(): string {
        return '';
    }
    public getParameters(_server: Server): Set<CommandParameter> | undefined {
        return new Set();
    }
}

/**
 * Anything an argument node can hold: a prismarine argument, which can describe itself to the
 * client, or one of brigadier's built-in types, which cannot.
 */
export type CommandArgumentType = CommandArgument | ArgumentType<unknown>;

/**
 * Whether an argument node holds a prismarine argument rather than a brigadier built-in type.
 */
export const isCommandArgument = (type: CommandArgumentType): type is CommandArgument => 'getParameters' in type;

/**
 * Reads a string argument out of an executed command.
 *
 * @throws Error when the argument parsed to something other than a string.
 */
export const getString = (context: CommandContext<CommandExecutor>, name: string): string => {
    const value: unknown = context.getArgument(name);
    if (typeof value !== 'string') throw new Error(`Argument "${name}" is not a string`);
    return value;
};

export class CommandArgumentGamemode implements CommandArgument {
    private name: string;
    private optional: boolean;
    private flags: CommandParameterFlags;
    private postfix: string | null;

    public constructor(data?: { name?: string; optional?: boolean; flags?: CommandParameterFlags; postfix?: string }) {
        this.name = data?.name ?? 'gameMode';
        this.optional = data?.optional ?? false;
        this.flags = data?.flags ?? CommandParameterFlags.NONE;
        this.postfix = data?.postfix ?? null;
    }

    public parse(reader: StringReader, _context: CommandParseContext) {
        return getGametypeName(getGametypeId(reader.readString()));
    }
    public async listSuggestions<S>(_context: CommandContext<S>, _builder: SuggestionsBuilder) {
        // TODO
        return Suggestions.empty();
    }
    public getExamples() {
        return ['survival', 'creative', 'adventure', 'spectator'];
    }

    public getReadableType(): string {
        return this.name;
    }

    public getParameters(): Set<CommandParameter> {
        const gameModeEnum = new CommandEnum();
        gameModeEnum.name = 'GameMode';

        // TODO: this should be dynamic
        gameModeEnum.values = ['survival', 'creative', 'adventure', 'spectator'];
        return new Set([
            new CommandParameter({
                paramName: this.name,
                isOptional: this.optional,
                flags: this.flags,
                enum: gameModeEnum,
                postfix: this.postfix
            })
        ]);
    }
}

/**
 * Every identifier `/summon` will accept, in registry order with the written classes after it.
 *
 * The registry is the pack stack's own answer and covers every mob. The written classes are
 * the handful of entities no behavior pack declares, so neither list alone is the whole of
 * what the command can build.
 *
 * @param {Server} server - The server whose content was built from the pack stack.
 * @returns {string[]} The namespaced identifiers, without duplicates.
 */
const summonableIdentifiers = (server: Server): string[] => {
    const registry = server.getContent().entities.registry;
    const summonable = registry.keys().filter((identifier) => registry.get(identifier)?.flags.summonable === true);

    return [...new Set([...summonable, ...writtenEntities().keys()])];
};

export class CommandArgumentMob implements CommandArgument {
    private name: string;
    private optional: boolean;
    private flags: CommandParameterFlags;
    private postfix: string | null;

    public constructor(data?: { name?: string; optional?: boolean; flags?: CommandParameterFlags; postfix?: string }) {
        this.name = data?.name ?? 'entityType';
        this.optional = data?.optional ?? false;
        this.flags = data?.flags ?? CommandParameterFlags.NONE;
        this.postfix = data?.postfix ?? null;
    }

    public parse(reader: StringReader, _context: CommandParseContext) {
        let str = '';
        while (reader.canRead()) {
            const pos = reader.getCursor();
            const char = reader.read();
            if (char === ' ') {
                reader.setCursor(pos);
                break;
            }

            str += char;
        }

        return str;
    }
    public async listSuggestions<S>(_context: CommandContext<S>, _builder: SuggestionsBuilder) {
        // TODO
        return Suggestions.empty();
    }
    public getExamples() {
        return [];
    }

    public getReadableType(): string {
        return this.name;
    }

    /**
     * The `EntityType` enum lists what `/summon` can build: every type the pack stack declares
     * summonable, plus the written classes no pack describes. The `minecraft:` namespace is
     * dropped the way the command's own parser adds it back, so the client offers `zombie`, not
     * `minecraft:zombie`. An empty enum here left the client with nothing to complete.
     *
     * Read from the registry rather than from a list in this repository, so a pack that adds a
     * mob gets it completed too, and a pack that removes one stops offering it.
     * @param {Server} server - The server whose pack stack declares the types.
     * @returns {Set<CommandParameter>} The one parameter, carrying the enum.
     */
    public getParameters(server: Server): Set<CommandParameter> {
        const entityTypeEnum = new CommandEnum();
        entityTypeEnum.name = 'EntityType';
        entityTypeEnum.values = summonableIdentifiers(server).map((identifier) =>
            identifier.replace(/^minecraft:/, '')
        );
        return new Set([
            new CommandParameter({
                paramName: this.name,
                isOptional: this.optional,
                flags: this.flags,
                enum: entityTypeEnum,
                postfix: this.postfix
            })
        ]);
    }
}

export class CommandArgumentEntity implements CommandArgument {
    private name: string;
    private optional: boolean;
    private flags: CommandParameterFlags;
    private postfix: string | null;

    public constructor(data?: { name?: string; optional?: boolean; flags?: CommandParameterFlags; postfix?: string }) {
        this.name = data?.name ?? 'target';
        this.optional = data?.optional ?? false;
        this.flags = data?.flags ?? CommandParameterFlags.NONE;
        this.postfix = data?.postfix ?? null;
    }

    /**
     * Reads the entities a parsed entity argument matched.
     *
     * @throws Error when the argument holds anything other than entities.
     */
    public static getEntities(context: CommandContext<CommandExecutor>, name: string): Entity[] {
        const value: unknown = context.getArgument(name);
        if (!Array.isArray(value) || !value.every((entity) => entity instanceof Entity))
            throw new Error(`Argument "${name}" is not a list of entities`);
        return value;
    }

    /**
     * @returns The matched entities. An exact player name that is not online, or a selector
     * that matches nothing, gives an empty list.
     * @throws Error when a selector is used from the console, which stands in no world.
     */
    public parse(reader: StringReader, context: CommandParseContext): Entity[] {
        let player = '';
        while (reader.canRead()) {
            const pos = reader.getCursor();
            const char = reader.read();
            if (char === ' ') {
                reader.setCursor(pos);
                break;
            }

            player += char;
        }

        const source = context.getSource();
        if (player.startsWith('@')) {
            if (!(source instanceof Entity)) throw new Error(`Target selectors need a player as the source`);
            try {
                return ParseTargetSelector({
                    input: player,
                    source,
                    entities: source.getWorld().getEntities()
                });
            } catch (error: unknown) {
                if (!(error instanceof Error && error.message.includes('no results'))) throw error;
                return [];
            }
        }

        const match = source.getServer().getSessionManager().getPlayerByExactName(player); // TODO: by name not exact
        return match ? [match] : [];
    }

    public getReadableType(): string {
        return this.name;
    }

    public getParameters(): Set<CommandParameter> {
        return new Set([
            new CommandParameter({
                paramName: this.name,
                paramType: CommandParameterType.Target,
                isOptional: this.optional,
                flags: this.flags,
                postfix: this.postfix
            })
        ]);
    }
}

/**
 * The `x y z` argument of a command.
 *
 * Describes the argument; it is not itself a position. It used to extend `Vector3` and have
 * `parse` write the parsed coordinates into `this` before returning it - but the instance is
 * built once, when the command is registered, and shared by every execution of it. Two
 * players teleporting at the same time therefore parsed into the same object and one of them
 * traveled to the other's destination.
 */
export class CommandArgumentPosition implements CommandArgument {
    private name: string;
    private optional: boolean;
    private flags: CommandParameterFlags;
    private postfix: string | null;

    public constructor(data?: { name?: string; optional?: boolean; flags?: CommandParameterFlags; postfix?: string }) {
        this.name = data?.name ?? 'position';
        this.optional = data?.optional ?? false;
        this.flags = data?.flags ?? CommandParameterFlags.NONE;
        this.postfix = data?.postfix ?? null;
    }

    /**
     * Reads the position a parsed position argument holds.
     *
     * @throws Error when the argument holds anything other than a position.
     */
    public static getPosition(context: CommandContext<CommandExecutor>, name: string): Vector3 {
        const value: unknown = context.getArgument(name);
        if (!(value instanceof Vector3)) throw new Error(`Argument "${name}" is not a position`);
        return value;
    }

    /**
     * @returns A fresh vector per invocation, so concurrent executions cannot overwrite
     * each other's coordinates.
     * @throws Error when fewer than three coordinates are given, when one of them is not a
     * number (a player name, say), or when a relative coordinate is used from the console,
     * which stands nowhere.
     */
    public parse(reader: StringReader, context: CommandParseContext): Vector3 {
        const getPos = () => {
            let pos = '';
            while (reader.canRead()) {
                const cursor = reader.getCursor();
                const char = reader.read();
                if (char === ' ') {
                    reader.setCursor(cursor);
                    break;
                }

                pos += char;
            }
            return pos;
        };

        const source = context.getSource();
        const axis = (type: 'x' | 'y' | 'z') => {
            const input = getPos();
            if (source instanceof Entity) return ParseTildeCaretNotation({ input, source, type });
            if (input.startsWith('~') || input.startsWith('^'))
                throw new Error(`Relative coordinate "${input}" needs a player as the source`);
            return parseAbsoluteCoordinate(input);
        };
        const separator = () => {
            if (!reader.canRead()) throw new Error('Expected three coordinates: x y z');
            reader.skip();
        };

        // Read in order: each call consumes from the reader, so the arguments have to be
        // evaluated left to right rather than left to a constructor's argument order.
        const x = axis('x');
        separator();
        const y = axis('y');
        separator();
        const z = axis('z');

        return new Vector3(x, y, z);
    }

    public getReadableType(): string {
        return this.name;
    }

    public getParameters(): Set<CommandParameter> {
        return new Set([
            new CommandParameter({
                paramName: this.name,
                paramType: CommandParameterType.Position,
                isOptional: this.optional,
                flags: this.flags,
                postfix: this.postfix
            })
        ]);
    }
}

export class CommandArgumentCommand implements CommandArgument {
    private name: string;
    private optional: boolean;
    private flags: CommandParameterFlags;
    private postfix: string | null;

    public constructor(data?: { name?: string; optional?: boolean; flags?: CommandParameterFlags; postfix?: string }) {
        this.name = data?.name ?? 'command';
        this.optional = data?.optional ?? false;
        this.flags = data?.flags ?? CommandParameterFlags.NONE;
        this.postfix = data?.postfix ?? null;
    }

    public parse(reader: StringReader, _context: CommandParseContext) {
        const command = reader.readString();

        return command;
    }

    public getReadableType(): string {
        return this.name;
    }

    public getParameters(): Set<CommandParameter> {
        return new Set([
            new CommandParameter({
                paramName: this.name,
                paramType: CommandParameterType.MessageRoot,
                isOptional: this.optional,
                flags: this.flags,
                postfix: this.postfix
            })
        ]);
    }
}

export class BooleanArgumentCommand implements CommandArgument {
    private name: string;
    private optional: boolean;
    private flags: CommandParameterFlags;
    private postfix: string | null;

    public constructor(data?: { name?: string; optional?: boolean; flags?: CommandParameterFlags; postfix?: string }) {
        this.name = data?.name ?? 'boolean';
        this.optional = data?.optional ?? false;
        this.flags = data?.flags ?? CommandParameterFlags.NONE;
        this.postfix = data?.postfix ?? null;
    }

    public parse(reader: StringReader, _context: CommandParseContext) {
        const boolean = reader.readString();

        if (boolean === 'true') return true;

        return false;
    }

    public getReadableType(): string {
        return this.name;
    }

    public getParameters(): Set<CommandParameter> {
        const booleanEnum = new CommandEnum();
        booleanEnum.name = 'Boolean';
        booleanEnum.values = ['true', 'false'];
        return new Set([
            new CommandParameter({
                paramName: this.name,
                isOptional: this.optional,
                enum: booleanEnum,
                flags: this.flags,
                postfix: this.postfix
            })
        ]);
    }
}

export class PlayerArgumentCommand implements CommandArgument {
    private name: string;
    private optional: boolean;
    private flags: CommandParameterFlags;
    private postfix: string | null;

    public constructor(data?: { name?: string; optional?: boolean; flags?: CommandParameterFlags; postfix?: string }) {
        this.name = data?.name ?? 'player';
        this.optional = data?.optional ?? false;
        this.flags = data?.flags ?? CommandParameterFlags.NONE;
        this.postfix = data?.postfix ?? null;
    }

    public parse(reader: StringReader, _context: CommandParseContext) {
        const player = reader.readString();
        return player;
    }

    public getReadableType(): string {
        return this.name;
    }

    public getParameters(server: Server): Set<CommandParameter> {
        const playerEnum = new CommandEnum();
        playerEnum.name = 'Player';
        try {
            playerEnum.values = server
                .getSessionManager()
                .getAllPlayers()
                .map((player) => player.getName());
        } catch {
            playerEnum.values = [];
        }

        return new Set([
            new CommandParameter({
                paramName: this.name,
                isOptional: this.optional,
                enum: playerEnum,
                flags: this.flags,
                postfix: this.postfix
            })
        ]);
    }
}
