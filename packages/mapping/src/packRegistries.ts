/**
 * What each Java registry a datapack references needs from this runtime.
 *
 * Plan section 5 lets the loader refuse to start when a Java identifier has
 * no mapping and no allow-list entry. Totality needs the registries sorted
 * first, because they do not all want the same thing. Items, blocks, entity
 * types, biomes, enchantments, mob effects and potions become Bedrock
 * identifiers, so the mapping tables answer them. Three registries reach the
 * Bedrock client with no table behind them yet; those are the reviewed
 * {@link import('./lossList').UNTRANSLATED_REGISTRIES}. The rest are listed
 * here: the server evaluates them in Java's own shape and no identifier ever
 * crosses the wire, so the only honest check is that the identifier is a real
 * entry of the pinned Java 26.3 registry.
 */

/** A registry the server evaluates in Java's own shape. */
export interface ServerSideRegistry {
    /** The registry as a datapack reference names it, such as `game_event` or `worldgen/structure`. */
    readonly registry: string;
    /** Why no Bedrock identifier is needed. */
    readonly reason: string;
}

/**
 * The registries whose identifiers stay inside the server.
 *
 * Each is checked against the generated Java 26.3 census rather than against
 * a Bedrock table, so a typo still fails the load: the identifier has to be
 * an entry Mojang's own data publishes.
 */
export const SERVER_SIDE_REGISTRIES = [
    {
        registry: 'fluid',
        reason: 'A predicate asks what fluid a position holds; the server answers from its own world, and the Bedrock client reads water and lava as blocks, which the block table already maps.'
    },
    {
        registry: 'game_event',
        reason: 'Vibrations and sculk listening are decided entirely by the server; Bedrock sends no game event identifier to a client.'
    },
    {
        registry: 'point_of_interest_type',
        reason: 'Job sites, beds and the village point-of-interest graph are server-side AI state.'
    },
    {
        registry: 'timeline',
        reason: "26.3's scheduling registry drives server-side timers; the client is told the resulting state, never the timeline."
    },
    {
        registry: 'villager_trade',
        reason: "A trade id names one of Java's trade definitions. The server compiles the trades it picks into Bedrock's trade table format, so the Java id never leaves the server."
    },
    {
        registry: 'worldgen/feature',
        reason: 'World generation runs on the server and ships finished chunks; a feature id never reaches a client.'
    },
    {
        registry: 'worldgen/flat_level_generator_preset',
        reason: 'A superflat preset configures the generator before the world exists.'
    },
    {
        registry: 'worldgen/structure',
        reason: 'Structure placement is server-side. Explorer maps and structure locating are Phase 4 work and will carry Bedrock structure feature names, not these ids.'
    },
    {
        registry: 'worldgen/world_preset',
        reason: 'A world preset chooses dimensions and generators at world creation.'
    }
] as const satisfies readonly ServerSideRegistry[];

/** One of {@link SERVER_SIDE_REGISTRIES}. */
export type ServerSideRegistryId = (typeof SERVER_SIDE_REGISTRIES)[number]['registry'];
