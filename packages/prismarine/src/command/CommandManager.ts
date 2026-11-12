import type { ParseResults, RootCommandNode } from '@jsprismarine/brigadier';
import { CommandSyntaxException } from '@jsprismarine/brigadier';
import type { CommandHost, CommandRegistry, CommandSource, FlattenedCommand } from '@jsprismarine/commands';
import { bedrockCommand, createCommandSource, flattenCommandTree } from '@jsprismarine/commands';
import { Error } from '@jsprismarine/errors';
import { TICK_FUNCTION_TAG } from '@jsprismarine/mcfunction';
import { CommandPermissionLevel } from '@jsprismarine/minecraft';

import type Server from '../Server';
import type { Service } from '../utils/Service';
import { collectAsyncCommands, deferCommandWork } from './deferred';
import Timer from '../utils/Timer';
import type { CommandExecutor, CommandTarget } from './CommandExecutor';
import { isCommandExecutor } from './CommandExecutor';
import type { FunctionContent } from './function/load';
import { FunctionRuntime } from './function/runtime';
import { functionContentOf, loadServerFunctions } from './function/load';
import { dimensionIdOf, entityRefOf } from './host/support';
import type { ReferencedEntity } from './host/support';
import { serverCommandHost } from './host/serverCommandHost';
import { RandomSequences } from './host/randomSequences';
import type { RandomSequencesState } from './host/randomSequences';
import { JSPRISMARINE_COMMAND_PERMISSIONS, registerJsprismarineCommands } from './jsprismarineCommands';
import { buildVanillaCommands, contentRegistryIds, UNWIRED_COMMANDS } from './vanillaCommands';

/**
 * A player who sent a command, as the dispatch reads one: the entity a vanilla command runs as,
 * and the operator status and permissions it is gated by.
 */
export interface PlayerCommandSender extends CommandExecutor, ReferencedEntity {
    isOp(): boolean;
    getPermissions(): string[];
}

/**
 * Whether a sender is a player rather than the console. A sender standing at a runtime id is a
 * player: no other executor is an entity.
 */
const isPlayerSender = (sender: CommandExecutor): sender is PlayerCommandSender => 'getRuntimeId' in sender;

type VanillaCommandTreeNode = NonNullable<ReturnType<RootCommandNode<CommandSource>['getChild']>>;

const HELP_PAGE_SIZE = 7;
const MAX_HELP_SYNTAX_LINES = 18;
const MAX_FUNCTION_PARSE_CACHE_ENTRIES = 8192;

/**
 * The permission node a command is gated by.
 *
 * The command layer carries a `CommandPermissionLevel`; this server gates on
 * named nodes. A vanilla command's node is `minecraft.command.<name>`, so a
 * `permissions.json` that granted `minecraft.command.me` still grants it, and
 * this server's own commands keep the nodes in
 * {@link JSPRISMARINE_COMMAND_PERMISSIONS}.
 */
export const commandPermissionOf = (name: string): string =>
    JSPRISMARINE_COMMAND_PERMISSIONS[name] ?? `minecraft.command.${name}`;

/**
 * Builds the one registry this server dispatches: the vanilla set plus this
 * server's own commands.
 */
const buildCommands = (server: Server, content?: Parameters<typeof buildVanillaCommands>[0]) => {
    const registry = buildVanillaCommands(content);
    registerJsprismarineCommands(registry, server);
    return registry;
};

export class CommandManager implements Service {
    private readonly server: Server;
    private readonly onStopCommandComplete: (() => void) | undefined;
    private stopCommandRequests = 0;

    /** What `@jsprismarine/commands` calls into - see {@link import('./host').serverCommandHost}. */
    private readonly host: CommandHost;
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

    public constructor(server: Server, onStopCommandComplete?: () => void) {
        this.server = server;
        this.onStopCommandComplete = onStopCommandComplete;
        this.randomSequences = new RandomSequences(() => server.getWorldManager().getDefaultWorld().getSeed());
        this.host = serverCommandHost(
            server,
            () => {
                this.stopCommandRequests += 1;
            },
            this.randomSequences
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
        this.vanilla ??= buildCommands(this.server);
        return this.vanilla;
    }

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
            loaded: loadServerFunctions(this.functionContent ?? functionContentOf(this.server.getContent())),
            dispatch: (commandLine, source) => this.runFunctionLine(commandLine, source),
            report: (diagnostic) => {
                const where = diagnostic.functionId
                    ? ` (${diagnostic.functionId}${diagnostic.line === undefined ? '' : `:${diagnostic.line}`})`
                    : '';
                const message = `${diagnostic.message}${where}`;
                if (diagnostic.severity === 'error') this.server.getLogger().warn(`§cfunction:§r ${message}`);
                else this.server.getLogger().debug(message, 'CommandManager/functions');
            }
        });
        return this.functions;
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
    private runFunctionLine(commandLine: string, source: CommandSource): { result?: number; forks?: number } {
        const dispatcher = this.vanillaRegistry().getDispatcher();
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
        if (!Array.isArray(results)) return {};

        const result = results.reduce<number>((sum, value) => sum + (typeof value === 'number' ? value : 0), 0);
        // A forked `execute as @e` reports one result per context, which is
        // exactly what `maxCommandForks` counts.
        return { result, forks: results.length };
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
            .getDefaultWorld()
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
            dimension: dimensionIdOf(this.server.getWorldManager().getDefaultWorld()),
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
        this.vanilla = buildCommands(this.server, contentRegistryIds(this.server.getContent()));
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
     * @param target - A page number or command route, or undefined for page 1.
     * @returns Formatted help lines for the requested page or route.
     */
    public usageLines(target?: string): readonly string[] {
        const request = target?.trim();
        if (request === undefined || request.length === 0) return this.helpPage(1);
        if (/^[+-]?\d+$/.test(request)) return this.helpPage(Number(request));

        return this.commandHelp(request);
    }

    private helpPage(page: number): readonly string[] {
        const names = this.vanillaRegistry()
            .getNames()
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
            return [`§6/${name}§r §f- ${description}`, `   §eUsage: §f${this.helpUsage(name)}`];
        });

        const previous = page > 1 ? '§f‹' : '§8■';
        const next = page < pageCount ? '§f›' : '§8■';
        const title = `${previous} §fHelp §b${page}§f/${pageCount} ${next}`;
        const border = this.helpBorder(title, entries);
        return [border, ...entries, border];
    }

    private helpUsage(name: string): string {
        const root = this.vanillaRegistry().getRoot().getChild(name);
        if (root === undefined) return `/${name}`;

        const syntax = this.commandSyntax(root, root, [`/${name}`]);
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

    private commandHelp(request: string): readonly string[] {
        const [typedName, ...requestedRoute] = request.split(/\s+/);
        if (typedName === undefined) return this.helpPage(1);
        const owner = this.vanillaName(typedName.toLowerCase());
        if (owner === undefined) return [`§cNo help found for /${typedName}. Use /help to browse commands.`];

        const commandRoot = this.vanillaRegistry().getRoot().getChild(owner);
        if (commandRoot === undefined) return [`§cNo help found for /${typedName}. Use /help to browse commands.`];

        let node = commandRoot;
        const route: string[] = [];
        let unknownRoute: string | undefined;
        for (const part of requestedRoute) {
            const child = [...node.getChildren()].find(
                (candidate) =>
                    candidate.getNodeType() === 'literal' && candidate.getName().toLowerCase() === part.toLowerCase()
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

        const children = [...node.getChildren()];
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

        const syntax = this.commandSyntax(node, commandRoot, [name]);
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

    private commandSyntax(
        start: VanillaCommandTreeNode,
        commandRoot: VanillaCommandTreeNode,
        prefix: readonly string[]
    ): { lines: readonly string[]; hasMore: boolean } {
        const lines: string[] = [];
        const seen = new Set<string>();
        let hasMore = false;

        const add = (parts: readonly string[]): boolean => {
            const line = parts.join(' ');
            if (seen.has(line)) return false;
            seen.add(line);
            if (lines.length === MAX_HELP_SYNTAX_LINES) {
                hasMore = true;
                return true;
            }
            lines.push(line);
            return false;
        };

        const visit = (
            node: VanillaCommandTreeNode,
            parts: readonly string[],
            ancestors: ReadonlySet<VanillaCommandTreeNode>
        ): void => {
            if (hasMore) return;
            if (node.getCommand() !== null) add(parts);

            const redirect = node.getRedirect();
            if (redirect !== null) {
                if (redirect === commandRoot) add([...parts, '…']);
                else if (redirect.getNodeType() === 'root') add(parts);
                return;
            }

            for (const child of node.getChildren()) {
                if (ancestors.has(child)) continue;
                const childParts = [...parts, child.getUsageText()];
                const nextAncestors = new Set(ancestors);
                nextAncestors.add(child);
                visit(child, childParts, nextAncestors);
                if (hasMore) return;
            }
        };

        visit(start, prefix, new Set([start]));
        return { lines, hasMore };
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
        const operator = player === undefined || player.isOp() || player.getPermissions().includes('*');
        const world = player?.getWorld() ?? this.server.getWorldManager().getDefaultWorld();

        return createCommandSource({
            host: this.host,
            ...(entity === undefined ? {} : { entity }),
            permissionLevel:
                player !== undefined
                    ? operator
                        ? CommandPermissionLevel.OWNER
                        : CommandPermissionLevel.ANY
                    : CommandPermissionLevel.INTERNAL,
            // `sendCommandFeedback` is Java's switch for exactly this: the
            // success message, never the failure.
            silent: world.getGameRuleManager()?.getGameRule('sendCommandFeedback')?.[0] !== true,
            dialect: player === undefined ? 'java' : 'bedrock',
            onFeedback: (message) => deferCommandWork(Promise.resolve(sender.sendMessage(message))),
            onError: (message) => deferCommandWork(Promise.resolve(sender.sendMessage(`§c${message}`)))
        });
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

        if (isPlayerSender(sender)) {
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
     *   settles once what it started has. A failure among those is logged, and `settled` never
     *   rejects.
     */
    public runCommand(
        sender: CommandExecutor,
        target: CommandTarget,
        input = ''
    ): { readonly ran: boolean; readonly settled: Promise<void> } {
        const started: Promise<unknown>[] = [];
        const settle = (after?: () => void): Promise<void> =>
            Promise.all(started).then(after, (error: unknown) => this.server.getLogger().error(error));
        try {
            // Anything else an `@e` selector can match has no way to be answered.
            if (!isCommandExecutor(target)) {
                started.push(Promise.resolve(sender.sendMessage(`§c${target.getName()} cannot execute commands`)));
                return { ran: false, settled: settle() };
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
                            `Entity with §b${sender.getRuntimeId()}§r is dispatching command: ${input} (id: ${vanilla})`,
                            'CommandManager/dispatchCommand'
                        );
                }

                const stopRequestsBefore = this.stopCommandRequests;
                const ran = this.runVanilla(sender, target, vanilla, input, started);
                // `/stop` parks teardown and its confirmation on the vanilla command path.
                // Notify the process entry only after both have settled.
                const stopped = vanilla === 'stop' && this.stopCommandRequests > stopRequestsBefore;
                return { ran, settled: settle(stopped ? () => this.onStopCommandComplete?.() : undefined) };
            }

            started.push(Promise.resolve(sender.sendMessage('§cUnknown command. Type "/help" for help.')));
            return { ran: false, settled: settle() };
        } catch (error: unknown) {
            switch (true) {
                case error instanceof CommandSyntaxException:
                    started.push(Promise.resolve(sender.sendMessage(`§c${error.getMessage()}`)));
                    return { ran: false, settled: settle() };
                case error instanceof Error:
                    started.push(Promise.resolve(sender.sendMessage(`§c${error.message}`)));
                    return { ran: false, settled: settle() };
                default:
                    this.server.getLogger().error(error);
                    break;
            }

            started.push(Promise.resolve(sender.sendMessage(`§c${error}`)));
            this.server
                .getLogger()
                .debug(
                    `Player ${isCommandExecutor(target) ? target.getFormattedUsername() : target.getName()} tried to execute ${input}, but it failed with the error: ${error}`,
                    'CommandManager/dispatchCommand'
                );
            this.server.getLogger().error(error);
            return { ran: false, settled: settle() };
        }
    }

    /**
     * Dispatches a command and executes it, and settles once what it started has.
     *
     * @param sender - the player/console who executed the command
     * @param target - the player, entity or console who should execute the command
     * @param input - the command input including arguments
     * @returns True when the command ran. False when the target cannot run commands, the
     * sender lacks the permission, the command is unknown, or it threw; in each of those
     * cases the sender has been sent the reason.
     */
    public async dispatchCommand(sender: CommandExecutor, target: CommandTarget, input = ''): Promise<boolean> {
        const { ran, settled } = this.runCommand(sender, target, input);
        await settled;
        return ran;
    }
}
