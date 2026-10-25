/**
 * The command tree, Java-shaped, with the metadata a Bedrock client needs.
 *
 * The tree itself is the Brigadier port's own: literals, arguments, redirects
 * and forks, dispatched by `CommandDispatcher.execute`. What Brigadier has no
 * place for is the per-command data `AvailableCommandsPacket` carries, so the
 * registry keeps a description, an alias list, a permission level and a flags
 * word beside each root literal.
 *
 * Aliases are registered as literals that redirect to the real root, so one
 * definition answers to every spelling, and the flattener folds them back into
 * the packet's alias enum instead of listing them as separate commands.
 */
import type { LiteralArgumentBuilder, LiteralCommandNode, RootCommandNode } from '@jsprismarine/brigadier';
import { CommandDispatcher, literal } from '@jsprismarine/brigadier';
import { CommandPermissionLevel } from '@jsprismarine/minecraft';

/** The per-command data `AvailableCommandsPacket` carries and Brigadier does not. */
export interface CommandMetadata {
    /** The one-line description the Bedrock client shows next to the name. */
    readonly description: string;
    /** Other names the command answers to. */
    readonly aliases: readonly string[];
    /** The `CommandPermissionLevel` the command needs. */
    readonly permissionLevel: CommandPermissionLevel;
    /**
     * The `CommandData.Flags` word.
     *
     * Mojang documents the field as a `uint16` and never enumerates the bits,
     * so 0 is the only safe default and the one this package writes.
     */
    readonly flags: number;
    /** Whether the world must have cheats on, as Mojang's own metadata records it. */
    readonly requiresCheats: boolean;
}

/** What {@link CommandRegistry.register} needs; everything but the name has a default. */
export type CommandMetadataInput = Partial<CommandMetadata>;

/**
 * The ids the host's own registries hold, for the arguments that validate
 * against live content instead of against Mojang's frozen list.
 *
 * Only the four registries a host resolves an id against and a content pack
 * can extend are here. `minecraft:damage_type` and `minecraft:mob_effect`
 * stay pinned to Mojang's published enum: no host here keeps a registry for
 * either, so the published list is the only list there is.
 * `minecraft:attribute`, `minecraft:particle_type` and
 * `minecraft:worldgen/biome` are absent for a different reason, which is that
 * Bedrock publishes no enum for them and they already degrade to an
 * unvalidated string.
 *
 * A list left out keeps Mojang's published enum on its own, which is what a
 * caller with no content build wants.
 */
export interface ContentRegistryIds {
    /** Every entity identifier the host can spawn, `/summon`'s argument. */
    readonly entityTypes?: readonly string[];
    /** Every block identifier the host can place, for `/setblock` and `/fill`. */
    readonly blocks?: readonly string[];
    /** Every item identifier the host can give. */
    readonly items?: readonly string[];
    /** Every enchantment id the host can apply. */
    readonly enchantments?: readonly string[];
}

/** How a registry decides what it will hold. */
export interface CommandRegistryOptions {
    /**
     * What the host's own registries hold. Omit it and every registry
     * argument validates against Mojang's published enum alone, which is
     * right for a host with no content build behind it.
     */
    readonly content?: ContentRegistryIds;
    /**
     * Which command names this registry accepts. A name this answers `false`
     * for is built and handed back, but never reaches the dispatcher or the
     * metadata table, so nothing can parse it and the flattener never sees it.
     *
     * The point is a host that cannot answer every verb a command set calls.
     * A command whose body would run against a subsystem the server has not
     * built is worse than an absent one: the client offers it, the player
     * types it, and nothing happens. Omit the option to hold everything.
     */
    readonly include?: (name: string) => boolean;
}

/**
 * A command tree plus the metadata the Bedrock packet needs.
 *
 * The dispatcher is the Brigadier port's, unchanged, so Java fork and redirect
 * semantics run server-side exactly as upstream defines them.
 */
export class CommandRegistry<S> {
    private readonly dispatcher = new CommandDispatcher<S>();
    private readonly metadata = new Map<string, CommandMetadata>();
    private readonly aliasOwners = new Map<string, string>();
    private readonly excluded = new Set<string>();
    private readonly include: (name: string) => boolean;

    private readonly content: ContentRegistryIds;

    public constructor(options: CommandRegistryOptions = {}) {
        this.include = options.include ?? (() => true);
        this.content = options.content ?? {};
    }

    /**
     * What the host's own registries hold, for the registry arguments that
     * validate against live content.
     *
     * Read by the command builders rather than passed to each of them: the
     * registry is the one object every builder already has.
     *
     * @returns The lists the caller gave, or an empty set of them.
     */
    public getContent(): ContentRegistryIds {
        return this.content;
    }

    /**
     * Registers one command and every alias it answers to.
     *
     * Each alias becomes a literal that redirects to the real root and shares
     * its executor, so `/tp` and `/teleport` parse the same arguments and run
     * the same code.
     *
     * @param builder - The command's root literal, already built up.
     * @returns The registered root node, or the built but unregistered node
     *   when {@link CommandRegistryOptions.include} excluded the name. A
     *   caller that chains onto the result, as `/execute` does, then builds a
     *   branch nothing can reach, which is the point.
     * @throws {Error} When the name or one of its aliases is already taken.
     */
    public register(builder: LiteralArgumentBuilder<S>, metadata: CommandMetadataInput = {}): LiteralCommandNode<S> {
        const name = builder.getLiteral();
        if (this.metadata.has(name) || this.aliasOwners.has(name) || this.excluded.has(name)) {
            throw new Error(`The command '${name}' is already registered`);
        }

        if (!this.include(name)) {
            this.excluded.add(name);
            return builder.build();
        }

        const resolved: CommandMetadata = {
            description: metadata.description ?? `commands.${name}.description`,
            aliases: metadata.aliases ?? [],
            permissionLevel: metadata.permissionLevel ?? CommandPermissionLevel.ANY,
            flags: metadata.flags ?? 0,
            requiresCheats: metadata.requiresCheats ?? false
        };

        const node = this.dispatcher.register(builder);
        this.metadata.set(name, resolved);

        for (const alias of resolved.aliases) {
            if (this.metadata.has(alias) || this.aliasOwners.has(alias)) {
                throw new Error(`The command alias '${alias}' is already registered`);
            }
            // A bare `/tp` has no further input for the redirect to consume, so
            // the alias carries the same executor as well as the redirect.
            const aliasBuilder = literal<S>(alias).redirect(node);
            const command = node.getCommand();
            if (command !== null) aliasBuilder.executes(command);
            this.dispatcher.register(aliasBuilder);
            this.aliasOwners.set(alias, name);
        }

        return node;
    }

    /** The Brigadier dispatcher the registry builds into. */
    public getDispatcher(): CommandDispatcher<S> {
        return this.dispatcher;
    }

    /** The tree's root node, the one the flattener walks. */
    public getRoot(): RootCommandNode<S> {
        return this.dispatcher.getRoot();
    }

    /**
     * The metadata of one command.
     *
     * @returns The metadata, or undefined for an alias or an unknown name.
     */
    public getMetadata(name: string): CommandMetadata | undefined {
        return this.metadata.get(name);
    }

    /** Every registered command name, aliases excluded, in registration order. */
    public getNames(): string[] {
        return [...this.metadata.keys()];
    }

    /**
     * The names {@link CommandRegistryOptions.include} turned away.
     *
     * Worth reporting rather than hiding: it is the difference between the
     * command set a package implements and the one a particular host can run.
     */
    public getExcludedNames(): string[] {
        return [...this.excluded];
    }

    /**
     * The command an alias stands for.
     *
     * @returns The owning command's name, or undefined when the name is not an alias.
     */
    public getAliasOwner(name: string): string | undefined {
        return this.aliasOwners.get(name);
    }
}
