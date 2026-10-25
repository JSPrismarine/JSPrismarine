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
 * A command tree plus the metadata the Bedrock packet needs.
 *
 * The dispatcher is the Brigadier port's, unchanged, so Java fork and redirect
 * semantics run server-side exactly as upstream defines them.
 */
export class CommandRegistry<S> {
    private readonly dispatcher = new CommandDispatcher<S>();
    private readonly metadata = new Map<string, CommandMetadata>();
    private readonly aliasOwners = new Map<string, string>();

    /**
     * Registers one command and every alias it answers to.
     *
     * Each alias becomes a literal that redirects to the real root and shares
     * its executor, so `/tp` and `/teleport` parse the same arguments and run
     * the same code.
     *
     * @param builder - The command's root literal, already built up.
     * @returns The registered root node.
     * @throws {Error} When the name or one of its aliases is already taken.
     */
    public register(builder: LiteralArgumentBuilder<S>, metadata: CommandMetadataInput = {}): LiteralCommandNode<S> {
        const name = builder.getLiteral();
        if (this.metadata.has(name) || this.aliasOwners.has(name)) {
            throw new Error(`The command '${name}' is already registered`);
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
     * The command an alias stands for.
     *
     * @returns The owning command's name, or undefined when the name is not an alias.
     */
    public getAliasOwner(name: string): string | undefined {
        return this.aliasOwners.get(name);
    }
}
