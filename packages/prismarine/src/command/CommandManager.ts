import type { ParseResults, RootCommandNode } from '@jsprismarine/brigadier';
import { ArgumentCommandNode, CommandSyntaxException } from '@jsprismarine/brigadier';
import type {
    ArgumentWords,
    CommandHost,
    CommandRegistry,
    CommandRegistryOptions,
    CommandSource,
    FlattenedCommand
} from '@jsprismarine/commands';
import { argumentWords, bedrockCommand, createCommandSource, flattenCommandTree } from '@jsprismarine/commands';
import { bedrockSyntaxError } from '@jsprismarine/commands/syntaxError';
import { select } from '@jsprismarine/commands/commands/support';
import type { EntityRef } from '@jsprismarine/commands/host';
import { parseSelector } from '@jsprismarine/commands/selector';
import { SelectorSyntaxError } from '@jsprismarine/errors/commands';
import { MinecraftErrors } from '@jsprismarine/errors/minecraft';
import { PrismarineServerErrors } from '@jsprismarine/errors/prismarine/server';
import { TICK_FUNCTION_TAG } from '@jsprismarine/mcfunction';
import { CommandPermissionLevel } from '@jsprismarine/minecraft';

import type Server from '../Server';
import type { Service } from '../utils/Service';
import { collectAsyncCommands, deferCommandWork } from './deferred';
import { COMMAND_BLOCKS_WORK, gameRuleValue } from '../content/world/gameRules';
import type { ContentPosition } from '../content/world/adapter';
import type { World } from '../world/World';
import type { CommandRun } from '@jsprismarine/block-behaviors';
import Timer from '../utils/Timer';
import type { CommandExecutor, CommandTarget } from './CommandExecutor';
import { isCommandExecutor } from './CommandExecutor';
import { markConsoleSource } from './consoleSource';
import type { FunctionContent } from './function/load';
import { readBehaviorPackFunctions, withBehaviorPackFunctions } from './function/behaviorPackFunctions';
import { FunctionRuntime } from './function/runtime';
import { functionContentOf, loadServerFunctions } from './function/load';
import { commandLevelOf, dimensionIdOf, entityRefOf, playerSessionOf, splitCommandDimension } from './host/support';
import type { ReferencedEntity } from './host/support';
import type { Level } from '../world/Level';
import { serverCommandHost } from './host/serverCommandHost';
import { RandomSequences } from './host/randomSequences';
import type { RandomSequencesState } from './host/randomSequences';
import type { ScriptCommandSet } from '@jsprismarine/script-host/host/world';

import { JSPRISMARINE_COMMAND_PERMISSIONS, registerJsprismarineCommands } from './jsprismarineCommands';
import { consoleFirstNodeOf, namesNode } from './updateCommands';
import type { ScriptCommandsOf } from './scriptCommands';
import { registerScriptCommands, SCRIPT_COMMAND_FAILED } from './scriptCommands';
import { buildVanillaCommands, contentRegistryIds, UNWIRED_COMMANDS } from './vanillaCommands';

/**
 * A player who sent a command, as the dispatch reads one: the entity a vanilla command runs as,
 * and the operator status and permissions it is gated by.
 */
export interface PlayerCommandSender extends CommandExecutor, ReferencedEntity {
    isOp(): boolean;
    /** Whether the sender holds a node after resolution. */
    hasPermission(node: string): boolean;
    /** Every node that applies to the sender, as the permission entries name them. */
    getPermissions(): string[];
    /** The level the sender runs commands at: the `level` meta, or 4 for an operator. */
    getCommandLevel(): CommandPermissionLevel;
}

/**
 * What a sender is told about a syntax exception: BDS's wording when it points into the command
 * line, and the exception's own message when a command's body threw it.
 */
/**
 * A dispatched line's result, how many contexts it ran in and how many of them succeeded. A forked
 * `execute as @e` reports one result per context, which is exactly what `maxCommandForks` counts.
 * A context that returned a number succeeded, whatever the number: `/time query` succeeds with the
 * time, and a query of a rule that is off succeeds with 0.
 */
const summed = (results: readonly unknown[]): { result: number; forks: number; successes: number } => ({
    result: results.reduce<number>((sum, value) => sum + (typeof value === 'number' ? value : 0), 0),
    forks: results.length,
    successes: results.filter((value) => typeof value === 'number').length
});

const syntaxErrorMessage = (error: CommandSyntaxException): string => bedrockSyntaxError(error) ?? error.getMessage();

/**
 * Whether a sender is a player rather than the console. A sender standing at a runtime id is a
 * player: no other executor is an entity.
 */
const isPlayerSender = (sender: CommandExecutor): sender is PlayerCommandSender => 'getRuntimeId' in sender;

type VanillaCommandTreeNode = NonNullable<ReturnType<RootCommandNode<CommandSource>['getChild']>>;

const HELP_PAGE_SIZE = 7;
const MAX_HELP_SYNTAX_LINES = 18;

/** One command as {@link CommandManager.commandReference} describes it. */
export interface CommandReference {
    name: string;
    description?: string;
    aliases: readonly string[];
    /** The forms the command takes, from its name, such as `teleport <targets> <position>`. */
    usage: readonly string[];
    /**
     * For each form in `usage`, how many typed words each part after the name reads: three for
     * a position, `rest` for a message. A console counts words to find the argument being typed.
     */
    usageWords: readonly (readonly ArgumentWords[])[];
    /** True when the command takes more forms than `usage` lists, which `/help` caps too. */
    moreUsage?: boolean;
}
const MAX_FUNCTION_PARSE_CACHE_ENTRIES = 8192;

/** Whether `/help` lists a node for the source that asked; see {@link CommandManager.usageLines}. */
type Usable = (node: VanillaCommandTreeNode) => boolean;

/**
 * The permission node a command is gated by.
 *
 * The command layer carries a `CommandPermissionLevel`; this server gates on
 * named nodes. A vanilla command's node is `minecraft.command.<name>`, so a
 * `permissions.json` that granted `minecraft.command.me` still grants it, and
 * this server's own commands keep the nodes in
 * `JSPRISMARINE_COMMAND_PERMISSIONS`.
 */
export const commandPermissionOf = (name: string): string =>
    JSPRISMARINE_COMMAND_PERMISSIONS[name] ?? `minecraft.command.${name}`;

/**
 * Builds the one registry this server dispatches: the vanilla set, this
 * server's own commands, and the custom commands behavior pack scripts registered.
 *
 * @param canUse - The gate the dispatcher asks for each command a line reaches; see
 *   {@link CommandManager.mayUse}.
 */
const buildCommands = (
    server: Server,
    canUse: CommandRegistryOptions<CommandSource>['canUse'],
    content?: Parameters<typeof buildVanillaCommands>[0],
    scripts?: ScriptCommandSet,
    scriptsFor?: ScriptCommandsOf
) => {
    const registry = buildVanillaCommands(content, canUse);
    registerJsprismarineCommands(registry, server);
    if (scripts !== undefined) registerScriptCommands(registry, scripts, scriptsFor);
    return registry;
};

/**
 * The custom commands of every level's scripts as one set, for the server's one tree. Every level
 * loads the same packs, so the levels register the same commands; one a level registers on its
 * own is in the tree too. A command keeps the first level's definition, in load order.
 */
const allScriptCommands = (sets: readonly ScriptCommandSet[]): ScriptCommandSet | undefined => {
    const [first] = sets;
    if (first === undefined) return undefined;
    const firstByName = <T extends { readonly name: string }>(entries: readonly T[]): T[] => {
        const byName = new Map<string, T>();
        for (const entry of entries) if (!byName.has(entry.name)) byName.set(entry.name, entry);
        return [...byName.values()];
    };
    return {
        commands: firstByName(sets.flatMap((set) => set.commands)),
        enums: firstByName(sets.flatMap((set) => set.enums)),
        run: first.run
    };
};

export class CommandManager implements Service {
    private readonly server: Server;
    private readonly onStopCommandComplete: ((stopped: boolean) => void) | undefined;
    /** The shutdown the last `stop` started, which the stop notice waits for. */
    private requestedShutdown: Promise<void> | undefined;

    /** What `@jsprismarine/commands` calls into - see {@link import('./host').serverCommandHost}. */
    private readonly host: CommandHost;
    /** The hosts of the levels other than the entry level, made on first use and gone with their level. */
    private readonly levelHosts = new WeakMap<Level, CommandHost>();
    private readonly randomSequences: RandomSequences;

    /**
     * Every command this server runs, as a Java-shaped Brigadier tree: the
     * vanilla set from `@jsprismarine/commands` and this server's own, from
     * `jsprismarineCommands.ts`.
     */
    private vanilla: CommandRegistry<CommandSource> | undefined;

    /** One flattened view per immutable vanilla tree, shared by every session. */
    private flattenedVanillaCommands: readonly FlattenedCommand[] | undefined;

    /** Recently parsed function lines for the active vanilla command tree. */
    private readonly functionParseCache = new Map<string, ParseResults<CommandSource>>();

    /**
     * The mcfunction runtime, built on first use.
     *
     * Lazily rather than in the constructor because the functions come from
     * the pack stack and the manager is constructed before the content build
     * runs. {@link CommandManager.setFunctionContent} drops it, so a content
     * reload drops the compiled functions with the packs they came from.
     */
    private functions: FunctionRuntime | undefined;

    /** A function source other than the server's content; see {@link CommandManager.setFunctionContent}. */
    private functionContent: FunctionContent | undefined;

    /** The registry ids the tree validates against, from the content build. */
    private contentIds: Parameters<typeof buildVanillaCommands>[0];

    /**
     * The custom commands each level's behavior pack scripts registered, by level name, and the
     * default level's under `undefined`, the level a command's dimension leaves unnamed.
     */
    private readonly levelScriptCommands = new Map<string | undefined, ScriptCommandSet>();

    /** Every level's custom commands, which the tree holds as well. */
    private scriptCommands: ScriptCommandSet | undefined;

    /** The custom commands of the level a command runs in, which it runs in. */
    private readonly scriptCommandsOf: ScriptCommandsOf = (from) =>
        this.levelScriptCommands.get(splitCommandDimension(from.dimension).level);

    public constructor(server: Server, onStopCommandComplete?: (stopped: boolean) => void) {
        this.server = server;
        this.onStopCommandComplete = onStopCommandComplete;
        this.randomSequences = new RandomSequences(() => server.getWorldManager().getEntryWorld().getSeed());
        this.host = serverCommandHost(
            server,
            (shutdown) => {
                this.requestedShutdown = shutdown;
            },
            this.randomSequences
        );
    }

    /**
     * The host a command's verbs read and write the server through: the one of the level it runs
     * in, whose scoreboard and command storage it keeps score and data in.
     * @param level - The level; left out, the entry level, which the console and functions run in.
     */
    public getHost(level?: Level): CommandHost {
        if (level === undefined || level === this.server.getWorldManager().getEntryLevel()) return this.host;
        let host = this.levelHosts.get(level);
        if (host === undefined) {
            host = serverCommandHost(
                this.server,
                (shutdown) => {
                    this.requestedShutdown = shutdown;
                },
                this.randomSequences,
                () => level
            );
            this.levelHosts.set(level, host);
        }
        return host;
    }

    /** The host of the level a command source runs in: an entity's, or the one its dimension names. */
    private hostOf(source: { readonly entity: ReferencedEntity } | { readonly dimension: string }): CommandHost {
        return this.getHost(
            'entity' in source ? source.entity.getWorld().getLevel() : commandLevelOf(this.server, source.dimension)
        );
    }

    /** Captures the persistent command random streams for a replay baseline. */
    public saveRandomSequenceState(): RandomSequencesState {
        return this.randomSequences.saveState();
    }

    /** Restores command random streams for the same default world. */
    public restoreRandomSequenceState(state: unknown): void {
        this.randomSequences.restoreState(state);
    }

    /** Keeps the pre-enable API available without building a throwaway tree at startup. */
    private vanillaRegistry(): CommandRegistry<CommandSource> {
        this.vanilla ??= buildCommands(this.server, this.mayUse);
        return this.vanilla;
    }

    /**
     * Whether the player who typed a line may use a command it reaches, asked by the dispatcher
     * for the command typed and for every command nested in it through `execute ... run` or a
     * function. The typed command is also checked up front, with a message; this gate is what
     * stops a nested one from running on the typed command's node alone, or above the player's
     * level. The console, a script and a function the server runs type nothing and pass; so does
     * a script's custom command, whose pack decides who runs it.
     */
    private readonly mayUse = (name: string, source: CommandSource): boolean => {
        if (source.caller === undefined || this.isScriptCommand(name)) return true;
        const level = this.vanillaRegistry().getMetadata(name)?.permissionLevel ?? CommandPermissionLevel.ANY;
        if (level > source.permissionLevel) return false;
        const session = playerSessionOf(this.server, source.caller);
        return (
            session !== undefined && this.server.getPermissionManager().can(session).execute(commandPermissionOf(name))
        );
    };

    /**
     * The mcfunction runtime this server's `/function` and `/schedule` run
     * through.
     *
     * @returns {FunctionRuntime} The runtime, holding whatever functions the
     * loaded datapacks declared - which is none when the stack has no datapack
     * in it.
     */
    public getFunctionRuntime(): FunctionRuntime {
        this.functions ??= new FunctionRuntime({
            loaded: loadServerFunctions(this.functionContent ?? this.serverFunctionContent()),
            dispatch: (commandLine, source) => this.runFunctionLine(commandLine, source),
            report: (diagnostic) => {
                const where = diagnostic.functionId
                    ? ` (${diagnostic.functionId}${diagnostic.line === undefined ? '' : `:${diagnostic.line}`})`
                    : '';
                const message = `${diagnostic.message}${where}`;
                if (diagnostic.severity === 'error') this.server.getLogger().warn(`§cfunction:§r ${message}`);
                else this.server.getLogger().debug(message);
            }
        });
        return this.functions;
    }

    /**
     * The functions the server runs on its own: the content build's datapack functions, then the
     * world's behavior packs' `functions` folders, read from disk.
     */
    private serverFunctionContent(): FunctionContent {
        const packs = readBehaviorPackFunctions(this.server.getWorldPackDirectories());
        for (const problem of packs.problems) this.server.getLogger().warn(`§cfunction:§r ${problem}`);
        return withBehaviorPackFunctions(functionContentOf(this.server.getContent()), packs);
    }

    /**
     * Compiles the functions again from their files, as Bedrock's `/reload` does: an edited
     * behavior pack function runs as edited from then on. What `/schedule` put off is dropped with
     * the functions it named.
     */
    public reloadFunctions(): void {
        this.functions = undefined;
        this.getFunctionRuntime();
    }

    /**
     * Replaces the functions this server runs and drops the compiled ones.
     *
     * @param {FunctionContent} [content] - Where to compile functions from.
     * Undefined goes back to the server's own content, which is what a reload
     * wants; a caller that loaded a datapack itself passes its registries.
     */
    public setFunctionContent(content?: FunctionContent): void {
        this.functionContent = content;
        this.functions = undefined;
    }

    /**
     * Runs one line of a function through the vanilla dispatcher.
     *
     * No `collectAsyncCommands` here: a function line is dispatched from
     * inside a command body, which is already inside the collection
     * `dispatchCommand` opened, so the work a host verb parks reaches that
     * same queue and is awaited with the rest of the line that called the
     * function. {@link CommandManager.tickFunctions} is the one entry point
     * that opens its own.
     */
    private runFunctionLine(
        commandLine: string,
        source: CommandSource
    ): { result?: number; forks?: number; successes?: number } {
        const dispatcher = this.vanillaRegistry().getDispatcher();
        // A parse holds the permission gate's answers for the source it was built for, and only a
        // source with no caller gets the same answers every time: `mayUse` lets it run everything.
        // A player's line is parsed against what they may run now, so a parse built for the
        // server, or for a player before they were deopped, never runs for them.
        if (source.caller !== undefined) {
            const results = dispatcher.execute(dispatcher.parse(commandLine, source));
            return Array.isArray(results) ? summed(results) : {};
        }
        let parsed = this.functionParseCache.get(commandLine);
        if (parsed === undefined) {
            parsed = dispatcher.parse(commandLine, source);
            this.functionParseCache.set(commandLine, parsed);
            if (this.functionParseCache.size > MAX_FUNCTION_PARSE_CACHE_ENTRIES) {
                const oldest = this.functionParseCache.keys().next().value;
                if (oldest !== undefined) this.functionParseCache.delete(oldest);
            }
        } else {
            this.functionParseCache.delete(commandLine);
            this.functionParseCache.set(commandLine, parsed);
        }

        // Vanilla argument parsers do not read the source; copy the cached context so each
        // execution and redirect modifier sees its current source, not the source from the miss.
        const results = dispatcher.execute(parsed.copyFor(source));
        return Array.isArray(results) ? summed(results) : {};
    }

    /**
     * Runs a command block's command, Java's `BaseCommandBlock.performCommand`: from the middle
     * of the block, in its world, with the game director permission a command block has, and
     * answering to nobody. The last line it answered with is what the block keeps as its output.
     *
     * The line is dispatched as a function line is, so the block learns at once how many times
     * it succeeded, which a conditional block behind it and a comparator read. What its verbs
     * park finishes outside the tick, and a failure there is logged.
     *
     * @param name - The name the command speaks as, the block's custom name or Bedrock's `!`.
     * @param entityId - The runtime id of a command block minecart running it, which the command
     *   runs as and from, as Java's `MinecartCommandBase` source has it, so `@s` is the cart.
     * @returns What it reported, or undefined while the `commandblocksenabled` game rule is off.
     * @javaSource BaseCommandBlock.performCommand
     */
    public runCommandBlock(
        world: World,
        at: ContentPosition,
        command: string,
        name: string,
        entityId?: number
    ): CommandRun | undefined {
        if (gameRuleValue(world.getGameRuleManager(), COMMAND_BLOCKS_WORK) === false) return undefined;

        const actor = entityId === undefined ? null : world.getActor(BigInt(entityId));
        const entity = actor === null ? undefined : entityRefOf(actor);
        let output = '';
        const source = createCommandSource({
            host: this.getHost(world.getLevel()),
            name,
            ...(entity === undefined ? { position: { x: at.x + 0.5, y: at.y + 0.5, z: at.z + 0.5 } } : { entity }),
            dimension: dimensionIdOf(world),
            permissionLevel: CommandPermissionLevel.GAME_DIRECTORS,
            onFeedback: (message) => {
                output = message;
            },
            onError: (message) => {
                output = message;
            }
        });
        let successCount = 0;
        const line = command.trimStart().startsWith('/') ? command.trimStart().slice(1) : command;
        try {
            const started = collectAsyncCommands(() => {
                successCount = this.runFunctionLine(line, source).successes ?? 0;
            });
            for (const work of started) void work.catch((error: unknown) => this.server.getLogger().error(error));
        } catch (error: unknown) {
            if (!(error instanceof CommandSyntaxException)) {
                this.server.getLogger().error(error);
                return { successCount: 0, output: error instanceof Error ? error.message : String(error) };
            }
            output = syntaxErrorMessage(error);
        }
        return { successCount, output };
    }

    /**
     * Runs `#minecraft:tick` and whatever `/schedule` put on this tick, as one input of the world
     * the functions run in, the default world: the input step calls this after the messages, and
     * a function that throws undoes what it wrote there.
     *
     * Nothing waits. What the lines park, which is sends and other work outside the simulation,
     * finishes outside the tick, and a failure there is logged. A command that acts in another
     * world writes it in the same input step, when no world is ticking.
     *
     * @returns {number} How many command lines ran.
     */
    public tickFunctions(): number {
        const runtime = this.getFunctionRuntime();
        if (runtime.queued === 0 && !runtime.has(`#${TICK_FUNCTION_TAG}`)) return 0;

        let commands = 0;
        let started: Promise<unknown>[] = [];
        this.server
            .getWorldManager()
            .getEntryWorld()
            .runInputNow(() => {
                started = collectAsyncCommands(() => {
                    commands = runtime.tick(this.internalSource());
                });
            });
        for (const work of started) void work.catch((error: unknown) => this.server.getLogger().error(error));
        return commands;
    }

    /**
     * Runs `#minecraft:load`, which a server does once after its packs load.
     *
     * @returns {Promise<number>} How many command lines ran.
     */
    public async runLoadFunctions(): Promise<number> {
        const runtime = this.getFunctionRuntime();
        let commands = 0;
        const started = collectAsyncCommands(() => {
            commands = runtime.runLoad(this.internalSource());
        });
        await Promise.all(started);
        return commands;
    }

    /**
     * The source `#minecraft:tick` and `#minecraft:load` run with: the server
     * itself, in the default world, with every permission and nobody to talk
     * to. Java's is the same stack the console runs with, silenced.
     */
    private internalSource(): CommandSource {
        return createCommandSource({
            host: this.host,
            dimension: dimensionIdOf(this.server.getWorldManager().getEntryWorld()),
            permissionLevel: CommandPermissionLevel.INTERNAL,
            silent: true,
            onError: (message) => this.server.getLogger().warn(`§cfunction:§r ${message}`)
        });
    }

    /**
     * On enable hook.
     * @group Lifecycle
     */
    public async enable(): Promise<void> {
        const timer = new Timer();

        // Rebuilt here rather than in the constructor, because the content
        // build runs between the two and the registry arguments validate
        // against what it loaded, so a pack's own entity, block, item or
        // enchantment is spellable.
        this.contentIds = contentRegistryIds(this.server.getContent());
        this.vanilla = buildCommands(
            this.server,
            this.mayUse,
            this.contentIds,
            this.scriptCommands,
            this.scriptCommandsOf
        );
        this.flattenedVanillaCommands = undefined;
        this.functionParseCache.clear();

        this.server
            .getLogger()
            .verbose(
                `Registered §b${this.vanillaRegistry().getNames().length}§r command(s) in §e${timer.stop()} ms§r; ` +
                    `§e${Object.keys(UNWIRED_COMMANDS).length}§r vanilla command(s) need a subsystem this server does not have`
            );
    }

    /**
     * On disable hook.
     * @group Lifecycle
     */
    public async disable(): Promise<void> {}

    /**
     * Puts the custom commands a level's behavior pack scripts registered in `startup` into the
     * tree, or takes them out, and sends every player the commands they may run again.
     * @param commands - The commands, or undefined to take the level's last ones out.
     * @param level - The name of the level whose scripts registered them; left out, the default level.
     */
    public setScriptCommands(commands: ScriptCommandSet | undefined, level?: string): void {
        if (commands === undefined) this.levelScriptCommands.delete(level);
        else this.levelScriptCommands.set(level, commands);
        this.scriptCommands = allScriptCommands([...this.levelScriptCommands.values()]);
        this.vanilla = buildCommands(
            this.server,
            this.mayUse,
            this.contentIds,
            this.scriptCommands,
            this.scriptCommandsOf
        );
        this.flattenedVanillaCommands = undefined;
        this.functionParseCache.clear();
        for (const session of this.server.getSessionManager().getSessions()) {
            void session.sendAvailableCommands().catch((error: unknown) => this.server.getLogger().error(error));
        }
    }

    /**
     * Whether a command is one a behavior pack script registered. A custom command is gated by its
     * permission level alone, as on BDS, and has no permission node.
     */
    public isScriptCommand(name: string): boolean {
        return this.scriptCommands?.commands.some((command) => command.name === name) === true;
    }

    /** The vanilla command set, for the session that has to advertise it. */
    public getVanillaCommands(): CommandRegistry<CommandSource> {
        return this.vanillaRegistry();
    }

    /**
     * The vanilla command set flattened into Bedrock's overload shape.
     *
     * The tree is immutable after build, so every recipient shares this
     * unfiltered flattened view. Recipient-specific permission checks happen
     * after this accessor, while the packet is assembled.
     * @returns {FlattenedCommand[]} One entry per command, aliases folded in.
     */
    public getVanillaCommandList(): readonly FlattenedCommand[] {
        this.flattenedVanillaCommands ??= flattenCommandTree(this.vanillaRegistry()).commands;
        return this.flattenedVanillaCommands;
    }

    /**
     * The command a name or alias belongs to in the vanilla set.
     *
     * @param {string} name - The first word of a command line, without the slash.
     * @returns {string | undefined} The owning command's name, or undefined
     * when the vanilla set does not hold it.
     */
    public vanillaName(name: string): string | undefined {
        const lower = name.toLowerCase();
        const vanilla = this.vanillaRegistry();
        if (vanilla.getMetadata(lower) !== undefined) return lower;
        return vanilla.getAliasOwner(lower);
    }

    /**
     * Builds a help page or describes a command route from the Java-shaped tree.
     *
     * A numeric target selects a list page. Any other target is a command name
     * followed by zero or more literal subcommands, such as `locate structure`.
     * This walks the source tree directly, so recursive routes such as
     * `/execute` do not need to be expanded into Bedrock overloads first.
     *
     * With a source, the help leaves out every command, subcommand and form whose node the
     * source cannot use, the check the dispatcher makes before running it, so a player sees
     * only what they may run, as Java's `/help` does. A command they may not run gets the same
     * answer as one that does not exist.
     *
     * @param target - A page number or command route, or undefined for page 1.
     * @param source - Who asked; left out, the help lists every command.
     * @returns Formatted help lines for the requested page or route.
     */
    public usageLines(target?: string, source?: CommandSource): readonly string[] {
        const usable = (node: VanillaCommandTreeNode): boolean => source === undefined || node.canUse(source);
        const request = target?.trim();
        if (request === undefined || request.length === 0) return this.helpPage(1, usable);
        if (/^[+-]?\d+$/.test(request)) return this.helpPage(Number(request), usable);

        return this.commandHelp(request, usable);
    }

    /**
     * Every vanilla command with its description, aliases and the forms it takes, sorted by
     * name, for a console that lists commands or shows a command's usage while it is typed.
     * Each form starts with the command's name and has no leading slash, as the console
     * takes commands.
     */
    public commandReference(): readonly CommandReference[] {
        const registry = this.vanillaRegistry();
        return registry
            .getNames()
            .sort((left, right) => left.localeCompare(right))
            .map((name) => {
                const root = registry.getRoot().getChild(name);
                const syntax =
                    root === undefined
                        ? { lines: [name], words: [[]], hasMore: false }
                        : this.commandSyntax(root, root, [name]);
                return {
                    name,
                    description: this.helpDescription(name),
                    aliases: registry.getMetadata(name)?.aliases ?? [],
                    usage: syntax.lines,
                    usageWords: syntax.words,
                    ...(syntax.hasMore ? { moreUsage: true } : {})
                };
            });
    }

    private helpPage(page: number, usable: Usable): readonly string[] {
        const root = this.vanillaRegistry().getRoot();
        const names = this.vanillaRegistry()
            .getNames()
            .filter((name) => {
                const node = root.getChild(name);
                return node !== undefined && usable(node);
            })
            .sort((left, right) => left.localeCompare(right));
        const pageCount = Math.max(1, Math.ceil(names.length / HELP_PAGE_SIZE));
        if (!Number.isSafeInteger(page) || page < 1) {
            return ['§cHelp page numbers start at 1. Use /help to open the first page.'];
        }
        if (page > pageCount) {
            return [`§cThere are ${pageCount} help pages. Use /help ${pageCount} for the last page.`];
        }

        const start = (page - 1) * HELP_PAGE_SIZE;
        const entries = names.slice(start, start + HELP_PAGE_SIZE).flatMap((name) => {
            const description = this.helpDescription(name) ?? 'See syntax below.';
            return [`§6/${name}§r §f- ${description}`, `   §eUsage: §f${this.helpUsage(name, usable)}`];
        });

        const previous = page > 1 ? '§f‹' : '§8■';
        const next = page < pageCount ? '§f›' : '§8■';
        const title = `${previous} §fHelp §b${page}§f/${pageCount} ${next}`;
        const border = this.helpBorder(title, entries);
        return [border, ...entries, border];
    }

    private helpUsage(name: string, usable: Usable): string {
        const root = this.vanillaRegistry().getRoot().getChild(name);
        if (root === undefined) return `/${name}`;

        const syntax = this.commandSyntax(root, root, [`/${name}`], usable);
        const primary = syntax.lines[0] ?? `/${name}`;
        return syntax.lines.length > 1 || syntax.hasMore ? `${primary}${primary.endsWith('…') ? '' : ' …'}` : primary;
    }

    private helpBorder(title: string, content: readonly string[]): string {
        const middle = ` §7<<< ${title}§7 >>> §r`;
        const middleWidth = this.visibleTextLength(middle);
        const width = Math.max(middleWidth + 12, ...content.map((line) => this.visibleTextLength(line)));
        const fill = width - middleWidth;
        const left = Math.floor(fill / 2);
        const right = fill - left;
        return `§e${'-'.repeat(left)}${middle}§e${'-'.repeat(right)}§r`;
    }

    private visibleTextLength(text: string): number {
        return Array.from(text.replace(/§./g, '')).length;
    }

    private commandHelp(request: string, usable: Usable): readonly string[] {
        const [typedName, ...requestedRoute] = request.split(/\s+/);
        if (typedName === undefined) return this.helpPage(1, usable);
        const owner = this.vanillaName(typedName.toLowerCase());
        if (owner === undefined) return [`§cNo help found for /${typedName}. Use /help to browse commands.`];

        // A command the source may not run answers as one that does not exist, as Java's does.
        const commandRoot = this.vanillaRegistry().getRoot().getChild(owner);
        if (commandRoot === undefined || !usable(commandRoot)) {
            return [`§cNo help found for /${typedName}. Use /help to browse commands.`];
        }

        let node = commandRoot;
        const route: string[] = [];
        let unknownRoute: string | undefined;
        for (const part of requestedRoute) {
            const child = [...node.getChildren()].find(
                (candidate) =>
                    candidate.getNodeType() === 'literal' &&
                    candidate.getName().toLowerCase() === part.toLowerCase() &&
                    usable(candidate)
            );
            if (child === undefined) {
                unknownRoute = part;
                break;
            }
            node = child;
            route.push(child.getUsageText());
        }

        const name = `/${owner}${route.length === 0 ? '' : ` ${route.join(' ')}`}`;
        const lines: string[] = [];
        if (unknownRoute !== undefined) {
            lines.push(`§cNo literal route '${unknownRoute}' under ${name}; showing help for ${name}.`);
        }
        lines.push(`§6${name}§r`);
        if (typedName.toLowerCase() !== owner) lines.push(`§7Alias for /${owner}.`);

        const description = this.helpDescription(owner);
        if (description !== undefined) lines.push(`§7${description}`);

        const metadata = this.vanillaRegistry().getMetadata(owner);
        if (metadata !== undefined && metadata.aliases.length > 0 && route.length === 0) {
            lines.push(`§7Aliases: ${metadata.aliases.map((alias) => `/${alias}`).join(', ')}`);
        }

        const children = [...node.getChildren()].filter(usable);
        const subcommands = children
            .filter((child) => child.getNodeType() === 'literal')
            .map((child) => child.getName());
        if (subcommands.length > 0) lines.push(`§eSubcommands: §f${subcommands.join(', ')}`);

        const argumentNames = [
            ...new Set(
                children.filter((child) => child.getNodeType() === 'argument').map((child) => child.getUsageText())
            )
        ];
        if (argumentNames.length > 0) lines.push(`§eArguments: §f${argumentNames.join(', ')}`);

        const syntax = this.commandSyntax(node, commandRoot, [name], usable);
        if (syntax.lines.length > 0) {
            lines.push('§eUsage:');
            for (const line of syntax.lines) lines.push(`§f${line}`);
            if (syntax.hasMore) {
                lines.push(`§7More forms exist. Narrow the route with /help ${name.slice(1)} <subcommand>.`);
            }
        }

        if (lines.length === 1) lines.push('§7No syntax is registered for this route yet.');
        return lines;
    }

    /**
     * The forms a route takes, as `/help` and the console show them, up to
     * {@link MAX_HELP_SYNTAX_LINES}. `words` lists, for each form, how many typed words each
     * part after `prefix` reads: one for a literal, the argument type's count for an argument,
     * and `rest` for a `…` that repeats the command. A child `usable` refuses is left out.
     */
    private commandSyntax(
        start: VanillaCommandTreeNode,
        commandRoot: VanillaCommandTreeNode,
        prefix: readonly string[],
        usable: Usable = () => true
    ): { lines: readonly string[]; words: readonly (readonly ArgumentWords[])[]; hasMore: boolean } {
        const lines: string[] = [];
        const words: (readonly ArgumentWords[])[] = [];
        const seen = new Set<string>();
        let hasMore = false;

        const add = (parts: readonly string[], partWords: readonly ArgumentWords[]): boolean => {
            const line = parts.join(' ');
            if (seen.has(line)) return false;
            seen.add(line);
            if (lines.length === MAX_HELP_SYNTAX_LINES) {
                hasMore = true;
                return true;
            }
            lines.push(line);
            words.push(partWords);
            return false;
        };

        const visit = (
            node: VanillaCommandTreeNode,
            parts: readonly string[],
            partWords: readonly ArgumentWords[],
            ancestors: ReadonlySet<VanillaCommandTreeNode>
        ): void => {
            if (hasMore) return;
            if (node.getCommand() !== null) add(parts, partWords);

            const redirect = node.getRedirect();
            if (redirect !== null) {
                if (redirect === commandRoot) add([...parts, '…'], [...partWords, 'rest']);
                else if (redirect.getNodeType() === 'root') add(parts, partWords);
                return;
            }

            for (const child of node.getChildren()) {
                if (ancestors.has(child) || !usable(child)) continue;
                const childParts = [...parts, child.getUsageText()];
                const childWords = [
                    ...partWords,
                    child instanceof ArgumentCommandNode ? argumentWords(child.getType()) : 1
                ];
                const nextAncestors = new Set(ancestors);
                nextAncestors.add(child);
                visit(child, childParts, childWords, nextAncestors);
                if (hasMore) return;
            }
        };

        visit(start, prefix, [], new Set([start]));
        return { lines, words, hasMore };
    }

    private helpDescription(name: string): string | undefined {
        const description = this.vanillaRegistry().getMetadata(name)?.description;
        if (description !== undefined && !description.startsWith('commands.')) return description;
        return bedrockCommand(name)?.description;
    }

    /**
     * Builds the `CommandSourceStack` a vanilla command runs with.
     *
     * The console is level 5, an operator level 4 and everyone else level 0,
     * which is the only mapping this server's named permission nodes allow:
     * `defaultOperatorPermissions` is `*`, so an operator may run everything
     * and a player may run what `permissions.json` names. The level is what
     * the client is told, and the node is what the dispatch checks.
     *
     * Holding `*` counts as being an operator, not only standing on the ops
     * list. They are two ways of saying the same thing - `*` is what being an
     * operator grants - and reading only the list refused the owner
     * `permissions.json` ships with every command that asks for a level, while
     * `canExecute` was letting the same player through on the node.
     */
    private vanillaSource(sender: CommandExecutor, target: CommandExecutor): CommandSource {
        const entity = isPlayerSender(target) ? entityRefOf(target) : undefined;
        const player = isPlayerSender(sender) ? sender : undefined;
        const operator = player === undefined || player.isOp() || player.hasPermission('*');
        const world = player?.getWorld() ?? this.server.getWorldManager().getEntryWorld();

        const commandSource = createCommandSource({
            host: this.getHost(world.getLevel()),
            ...(entity === undefined ? {} : { entity }),
            // The sender issued the command; `target` is only who it runs as.
            ...(player === undefined ? {} : { caller: entityRefOf(player) }),
            permissionLevel:
                player !== undefined
                    ? operator
                        ? CommandPermissionLevel.OWNER
                        : player.getCommandLevel()
                    : CommandPermissionLevel.INTERNAL,
            // `sendCommandFeedback` is Java's switch for exactly this: the
            // success message, never the failure.
            silent: world.getGameRuleManager()?.getGameRule('sendCommandFeedback')?.[0] !== true,
            dialect: player === undefined ? 'java' : 'bedrock',
            onFeedback: (message) => deferCommandWork(Promise.resolve(sender.sendMessage(message))),
            onError: (message) => deferCommandWork(Promise.resolve(sender.sendMessage(`§c${message}`)))
        });
        // Every sender but a player is the console, typing on the terminal or the remote console.
        return player === undefined ? markConsoleSource(commandSource) : commandSource;
    }

    /**
     * Runs one vanilla command, parking what its verbs start in `started`.
     *
     * @returns True when the command ran, false when the sender was refused or
     * the command reported a failure; either way the sender has been told.
     */
    private runVanilla(
        sender: CommandExecutor,
        target: CommandExecutor,
        name: string,
        input: string,
        started: Promise<unknown>[]
    ): boolean {
        const vanilla = this.vanillaRegistry();
        const metadata = vanilla.getMetadata(name)!;

        // Asked before the node check, which an operator's `*` passes: these need the node by name.
        const consoleFirst = consoleFirstNodeOf(name);
        if (consoleFirst !== undefined && isPlayerSender(sender) && !namesNode(sender, consoleFirst)) {
            started.push(
                Promise.resolve(
                    sender.sendMessage(
                        `§cOnly the console runs /${name}, unless a permission entry names ${consoleFirst}`
                    )
                )
            );
            return false;
        }

        if (isPlayerSender(sender) && !this.isScriptCommand(name)) {
            if (!this.server.getPermissionManager().can(sender).execute(commandPermissionOf(name))) {
                started.push(
                    Promise.resolve(
                        sender.sendMessage(
                            "§cI'm sorry, but you do not have permission to perform this command. " +
                                'Please contact the server administrators if you believe that this is in error.'
                        )
                    )
                );
                return false;
            }
        }

        const source = this.vanillaSource(sender, target);
        if (metadata.permissionLevel > source.permissionLevel) {
            started.push(Promise.resolve(sender.sendMessage('§cThat command needs a higher permission level')));
            return false;
        }

        // The dispatcher is synchronous and the host verbs park their delivery on one shared
        // queue, so everything one command line started is in `started` when this returns.
        let results: unknown = [];
        started.push(
            ...collectAsyncCommands(() => {
                results = vanilla.getDispatcher().execute(input, source);
            })
        );

        // The port's `execute` answers with one result per executed context, so
        // a forked `execute as @e run ...` reports the whole fan-out's total,
        // which is what upstream Brigadier's `int` return adds up to.
        const total = Array.isArray(results)
            ? results.reduce<number>((sum, value) => sum + (typeof value === 'number' ? value : 0), 0)
            : 0;
        return total > 0;
    }

    /**
     * Runs a command to its end in one call, for code that cannot wait, such as an input-lane
     * handler. Every write the command makes is made, and every packet it sends is queued, before
     * this returns; what its verbs started and did not finish, such as a kick or a file write,
     * is in `settled`.
     *
     * @param sender - the player/console who executed the command
     * @param target - the player, entity or console who should execute the command
     * @param input - the command input including arguments
     * @returns Whether the command ran, as {@link dispatchCommand} answers it, and a promise that
     *   settles once what it started has. A failure among those is logged and told to the sender,
     *   and `settled` never rejects.
     */
    public runCommand(
        sender: CommandExecutor,
        target: CommandTarget,
        input = ''
    ): { readonly ran: boolean; readonly settled: Promise<void> } {
        const { ran, finished } = this.startCommand(sender, target, input);
        return { ran, settled: finished.then(() => undefined) };
    }

    /**
     * Runs a command for a behavior pack script, as `Dimension.runCommand` and
     * `Entity.runCommand` do: synchronously, at the game directors' level, with its feedback
     * dropped, as BDS runs a script's command. Work its verbs start finishes later, as for any
     * command.
     *
     * @param input - The command without its slash.
     * @param source - The entity it runs as, `@s`, or the dimension it runs in.
     * @returns How many times it succeeded, or the message of the error that stopped it.
     */
    /**
     * The entities a target selector matches for a script, read by the Bedrock grammar as a
     * command of `source` would read it.
     * @returns The matched entities, or undefined for a selector that does not parse.
     */
    public selectForScript(
        selector: string,
        source: { readonly entity: ReferencedEntity } | { readonly dimension: string }
    ): readonly EntityRef[] | undefined {
        let parsed: ReturnType<typeof parseSelector>;
        try {
            parsed = parseSelector(selector, 'bedrock');
        } catch (error: unknown) {
            if (error instanceof SelectorSyntaxError) return undefined;
            throw error;
        }
        // The parser stops at the first character it cannot read, so `@a[tag=vip]junk` parses as
        // `@a[tag=vip]`; a selector must be the whole text, trailing whitespace aside.
        if (parsed.length !== selector.trimEnd().length) return undefined;
        const model = parsed.selector;
        const commandSource = createCommandSource({
            host: this.hostOf(source),
            ...('entity' in source ? { entity: entityRefOf(source.entity) } : { dimension: source.dimension }),
            permissionLevel: CommandPermissionLevel.GAME_DIRECTORS,
            silent: true,
            dialect: 'bedrock',
            onError: () => {}
        });
        return select(commandSource, model);
    }

    /**
     * Runs a command for a script, as `Dimension.runCommand` and `Entity.runCommand` do, with the
     * permission a game director has and without a chat line for its output.
     * @returns How many contexts the command succeeded in, or the first error when it failed.
     */
    public runScriptCommand(
        input: string,
        source: { readonly entity: ReferencedEntity } | { readonly dimension: string }
    ): { readonly successCount: number } | { readonly error: string } {
        const errors: string[] = [];
        const commandSource = createCommandSource({
            host: this.hostOf(source),
            ...('entity' in source ? { entity: entityRefOf(source.entity) } : { dimension: source.dimension }),
            permissionLevel: CommandPermissionLevel.GAME_DIRECTORS,
            silent: true,
            dialect: 'bedrock',
            onError: (message) => errors.push(message)
        });
        try {
            let results: unknown;
            const started = collectAsyncCommands(() => {
                results = this.vanillaRegistry().getDispatcher().execute(input, commandSource);
            });
            for (const work of started) void work.catch((error: unknown) => this.server.getLogger().error(error));
            // Each context the command ran in and returned from is a success, whatever number it
            // returned: `/time query` succeeds once with the time. A command that fails throws.
            const total = Array.isArray(results) ? results.filter((value) => typeof value === 'number').length : 0;
            // A custom command whose callback failed succeeds 0 times on BDS, without an error.
            if (Array.isArray(results) && results.includes(SCRIPT_COMMAND_FAILED)) return { successCount: total };
            const [error] = errors;
            return total === 0 && error !== undefined ? { error } : { successCount: total };
        } catch (error: unknown) {
            if (error instanceof CommandSyntaxException) return { error: error.getMessage() };
            return { error: error instanceof globalThis.Error ? error.message : String(error) };
        }
    }

    /**
     * {@link runCommand}, with `finished` telling whether everything the command started
     * succeeded.
     */
    private startCommand(
        sender: CommandExecutor,
        target: CommandTarget,
        input: string
    ): { readonly ran: boolean; readonly finished: Promise<boolean> } {
        const started: Promise<unknown>[] = [];
        const settle = (shutdown?: Promise<void>): Promise<boolean> =>
            Promise.allSettled(started).then(async (outcomes) => {
                const failures = outcomes.flatMap((outcome) => (outcome.status === 'rejected' ? [outcome.reason] : []));
                for (const failure of failures) this.server.getLogger().error(failure);
                // Work a body started belongs to the command, so its failure reaches the sender as
                // a body that threw does, such as `/debug loadWorld` naming a world the config
                // does not have.
                if (failures.length > 0) await this.tellFailure(sender, failures[0]);
                // Told once the shutdown finished, whatever became of the feedback around it: a
                // player who ran `/stop` is kicked by it, and a send to them can fail. Told when
                // it failed too, so the process entry can exit with a code that says so rather
                // than keep running.
                if (shutdown !== undefined) {
                    const stopped = await shutdown.then(
                        () => true,
                        () => false
                    );
                    this.onStopCommandComplete?.(stopped);
                }
                return failures.length === 0;
            });
        try {
            // Anything else an `@e` selector can match has no way to be answered.
            if (!isCommandExecutor(target)) {
                started.push(Promise.resolve(sender.sendMessage(`§c${target.getName()} cannot execute commands`)));
                return { ran: false, finished: settle() };
            }
            if (input.startsWith('/')) input = input.slice(1);
            input = input.trim();

            const typed = input.split(' ')[0] ?? '';
            const vanilla = this.vanillaName(typed);
            if (vanilla !== undefined) {
                if (isPlayerSender(sender)) {
                    this.server
                        .getLogger()
                        .debug(
                            `Entity with §b${sender.getRuntimeId()}§r is dispatching command: ${input} (id: ${vanilla})`
                        );
                }

                const shutdownBefore = this.requestedShutdown;
                const ran = this.runVanilla(sender, target, vanilla, input, started);
                // `/stop` parks teardown and its confirmation on the vanilla command path.
                // Notify the process entry only after both have settled.
                const shutdown =
                    vanilla === 'stop' && this.requestedShutdown !== shutdownBefore
                        ? this.requestedShutdown
                        : undefined;
                return { ran, finished: settle(shutdown) };
            }

            started.push(Promise.resolve(sender.sendMessage('§cUnknown command. Type "/help" for help.')));
            return { ran: false, finished: settle() };
        } catch (error: unknown) {
            switch (true) {
                case error instanceof CommandSyntaxException:
                    started.push(Promise.resolve(sender.sendMessage(`§c${syntaxErrorMessage(error)}`)));
                    return { ran: false, finished: settle() };
                // A command that names a player or a game mode that does not exist is the sender's mistake,
                // so the sender reads why; anything else is the server's and goes to the log.
                case error instanceof PrismarineServerErrors.PlayerNotFound ||
                    error instanceof MinecraftErrors.GametypeInvalid:
                    started.push(Promise.resolve(sender.sendMessage(`§c${error.message}`)));
                    return { ran: false, finished: settle() };
                default:
                    this.server.getLogger().error(error);
                    break;
            }

            started.push(Promise.resolve(sender.sendMessage(`§c${error}`)));
            this.server
                .getLogger()
                .debug(
                    `Player ${isCommandExecutor(target) ? target.getFormattedUsername() : target.getName()} tried to execute ${input}, but it failed with the error: ${error}`
                );
            this.server.getLogger().error(error);
            return { ran: false, finished: settle() };
        }
    }

    /** Tells the sender why work its command started failed, as a body that threw is told. */
    private async tellFailure(sender: CommandExecutor, error: unknown): Promise<void> {
        // Work a body started rejects with whatever it threw, such as a plain `Error`.
        const message =
            error instanceof CommandSyntaxException
                ? syntaxErrorMessage(error)
                : error instanceof Error
                  ? error.message
                  : String(error);
        try {
            await sender.sendMessage(`§c${message}`);
        } catch (sendError: unknown) {
            this.server.getLogger().error(sendError);
        }
    }

    /**
     * Dispatches a command and executes it, and settles once what it started has.
     *
     * @param sender - the player/console who executed the command
     * @param target - the player, entity or console who should execute the command
     * @param input - the command input including arguments
     * @returns True when the command ran. False when the target cannot run commands, the
     * sender lacks the permission, the command is unknown, or it or the work it started
     * failed; in each of those cases the sender has been sent the reason.
     */
    public async dispatchCommand(sender: CommandExecutor, target: CommandTarget, input = ''): Promise<boolean> {
        const { ran, finished } = this.startCommand(sender, target, input);
        const succeeded = await finished;
        return ran && succeeded;
    }
}
