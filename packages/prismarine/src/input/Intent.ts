/**
 * The intents a player's packets decode into
 * ([ADR 0027](../../../../docs/adr/0027-player-inputs-are-decoded-into-intents.md)).
 *
 * An intent is plain data with a `kind`, in the sense [ADR 0013](../../../../docs/adr/0013-vetoable-actions-are-staged.md)
 * uses the word: what a player asked to do, before anything has validated it against the world.
 * A decoder of one edition turns a packet into intents, and one handler per kind runs for both
 * editions. This table is the one place an intent's shape and lane are declared: the union
 * type, the handler registry and the decoders all derive from it.
 *
 * The table lives under `input/` and not `network/` because a script, a command block or a
 * replay can produce an intent with no packet behind it.
 */
import type { Lane } from '@jsprismarine/protocol/handler/Lane';
import { strictestLane } from '@jsprismarine/protocol/handler/Lane';

/**
 * The animations a player plays on itself and asks the server to show everyone else, by name.
 * Each edition's decoder maps its own codes onto these.
 */
export const PLAYER_ANIMATIONS = ['swing', 'wakeUp', 'criticalHit', 'magicCriticalHit'] as const;

/** One of {@link PLAYER_ANIMATIONS}. */
export type PlayerAnimation = (typeof PLAYER_ANIMATIONS)[number];

/**
 * The steps of mining a block, which each edition's decoder maps its own actions onto.
 *
 * - `start`: mining began on the block.
 * - `continue`: the player dragged onto another block without letting go, which starts it anew.
 * - `abort`: the player let go before the block broke.
 * - `stop`: the player let go after it broke, which changes nothing.
 * - `swing`: another punch while mining, heard by the players near.
 * - `finish`: the client says the block gave way. When the server times breaks it checks this
 *   against how long the block was mined; when the client times them, the block breaks.
 * - `instant`: a creative break, at once.
 */
export const MINING_STEPS = ['start', 'continue', 'abort', 'stop', 'swing', 'finish', 'instant'] as const;

/** One of {@link MINING_STEPS}. */
export type MiningStep = (typeof MINING_STEPS)[number];

/** The recipe books a player keeps settings for, one per screen that shows one. */
export const RECIPE_BOOKS = ['crafting', 'furnace', 'blastFurnace', 'smoker'] as const;

/** One of {@link RECIPE_BOOKS}. */
export type RecipeBook = (typeof RECIPE_BOOKS)[number];

/**
 * What each intent carries beside its `kind`. Every field is plain data
 * ([ADR 0011](../../../../docs/adr/0011-a-world-exchanges-only-plain-data.md)), so an intent can
 * be recorded, replayed and compared.
 */
export interface IntentPayloads {
    /** The player pressed the inventory button. */
    readonly openInventory: Record<never, never>;
    /** The player opened an NPC's dialogue, naming the actor by runtime id. */
    readonly openNpc: { readonly target: bigint };
    /**
     * The player animated itself. `data` is what the animation carries, zero for the ones that
     * carry nothing, and `swingSource` names what caused a swing, or is null.
     */
    readonly animate: {
        readonly animation: PlayerAnimation;
        readonly data: number;
        readonly swingSource: string | null;
    };
    /** The player asked about a boss bar it has on screen, naming the bar's actor by unique id. */
    readonly queryBossBar: { readonly actor: bigint };
    /** The player started eating. `item` is the item's network id, as the Bedrock client reports it. */
    readonly eat: { readonly item: number };
    /**
     * The player played an emote, by the emote piece's uuid, for `lengthTicks`. `platformId` and
     * `flags` are what the client sent; the handler adds the server's own account id and flag.
     */
    readonly emote: {
        readonly emote: string;
        readonly lengthTicks: number;
        readonly platformId: string;
        readonly flags: number;
    };
    /**
     * The player made a sound at a point, which the server relays to the players near it. The
     * fields are the sound as the Bedrock client reports it: `sound` is the level sound id,
     * `type` the actor identifier it attributes the sound to, and `actor` its unique id or -1.
     */
    readonly playSound: {
        readonly x: number;
        readonly y: number;
        readonly z: number;
        readonly sound: number;
        readonly data: number;
        readonly type: string;
        readonly baby: boolean;
        readonly global: boolean;
        readonly actor: bigint;
        readonly firedAt: { readonly x: number; readonly y: number; readonly z: number } | null;
    };
    /** The player typed a chat message, already cut to what a chat box could have produced. */
    readonly chat: { readonly message: string };
    /**
     * The player asked for a view distance in chunks. `maxRadius` is the most its client can
     * render, or zero when it stated none.
     */
    readonly setViewDistance: { readonly radius: number; readonly maxRadius: number };
    /** The player picked a game mode for itself, as a `Gametype` id or any number a client sent. */
    readonly changeGameMode: { readonly gamemode: number };
    /**
     * The player asked to change one of its own abilities, by the ability's name and the value
     * it sent: a boolean, a number, or null when the request carried none.
     */
    readonly requestAbility: { readonly ability: string; readonly value: boolean | number | null };
    /** The player reported the end credits finished. */
    readonly finishCredits: Record<never, never>;
    /** The player picked a default game mode for the server, as a `Gametype` id or any number a client sent. */
    readonly setDefaultGameMode: { readonly gamemode: number };
    /**
     * The player asked to set another player's permission level. `level` is a
     * `PlayerPermissionLevel`, and `customFlags` the flag set a custom level carries.
     */
    readonly setPlayerPermission: { readonly target: bigint; readonly level: number; readonly customFlags: number };
    /** The player issued a command line, with or without its leading slash. */
    readonly runCommand: { readonly command: string };
    /** The client's scripts sent the server's scripts a message. */
    readonly scriptMessage: { readonly id: string; readonly value: string };
    /**
     * A dead player's client is ready to spawn and asks where it will come back, which Bedrock's
     * death screen does before it offers the respawn button.
     */
    readonly respawn: Record<never, never>;
    /** A dead player pressed the respawn button on its death screen. */
    readonly pressRespawn: Record<never, never>;
    /** The client finished spawning and has a player to show. */
    readonly playerInitialized: Record<never, never>;
    /**
     * The player closed a container screen, by window id. `containerType` is the Bedrock
     * container type the client sent, which the reply echoes until the presenter owns the reply.
     */
    readonly closeContainer: { readonly window: number; readonly containerType: number };
    /** The player moved its hand to a hotbar slot, 0 to 8. */
    readonly selectHotbarSlot: { readonly slot: number };
    /**
     * The player mined a block, one step at a time. `face` is the face struck, 0 to 5 for down,
     * up, north, south, west and east, which both editions number alike.
     *
     * `serverTimed` says the server times the break and checks the client's `finish` against it,
     * as it does for every Java client and for a Bedrock one under
     * `server-authoritative-block-breaking`; otherwise the client times it and reports the break
     * another way. `breaksIfInstant` is set for a client that starts mining a block that gives
     * way at once and sends nothing more for it, as Java's does; Bedrock's reports it as a `finish`.
     */
    readonly mineBlock: {
        readonly step: MiningStep;
        readonly position: { readonly x: number; readonly y: number; readonly z: number };
        readonly face: number;
        readonly serverTimed: boolean;
        readonly breaksIfInstant: boolean;
    };
    /**
     * The player used the item in hand on a block: `face` the face clicked, 0 to 5 as both
     * editions number them, and `faceLocation` where on it, each coordinate from 0 to 1.
     */
    readonly useItemOnBlock: {
        readonly position: { readonly x: number; readonly y: number; readonly z: number };
        readonly face: number;
        readonly faceLocation: { readonly x: number; readonly y: number; readonly z: number };
        /**
         * Which way the player faced when it clicked, as a Bedrock client reports it with the
         * tick's input; absent, the player's own rotation, which a Java client's moves keep.
         */
        readonly rotation?: { readonly pitch: number; readonly yaw: number };
    };
    /**
     * The player used the item in hand at nothing. `held` says the client reports a button held
     * down since an earlier tick rather than a new click, as Bedrock's does each tick of a draw.
     */
    readonly useItem: { readonly held: boolean };
    /** The player hit an actor, by runtime id, with the item in hand. */
    readonly attackEntity: { readonly target: bigint };
    /** The player used the item in hand on an actor, by runtime id, which is how a spawn egg or a lead works. */
    readonly interactEntity: { readonly target: bigint };
    /**
     * The player let go of the item it was using: `release` for a bow's arrow leaving or a meal
     * cut short, `consume` for a client saying the use ran its course.
     */
    readonly releaseItem: { readonly action: 'release' | 'consume' };
    /** The player's anvil screen asked for the anvil it worked at to wear down. */
    readonly damageAnvil: { readonly position: { readonly x: number; readonly y: number; readonly z: number } };
    /** The player turned one of a crafter's nine slots off, or on again, by index from 0. */
    readonly toggleCrafterSlot: {
        readonly position: { readonly x: number; readonly y: number; readonly z: number };
        readonly slot: number;
        readonly disabled: boolean;
    };
    /** An Education Edition player worked a lab table; `action` names the step, as the client does. */
    readonly useLabTable: {
        readonly position: { readonly x: number; readonly y: number; readonly z: number };
        readonly action: string;
    };
    /**
     * The player changed a recipe book's settings: whether the book is open, or null when the
     * client does not say, and whether it shows only the recipes the player can make.
     */
    readonly setRecipeBook: { readonly book: RecipeBook; readonly open: boolean | null; readonly filtering: boolean };
    /**
     * The player pressed the drop key: one item of the stack in its hand, or with `all` the whole
     * stack, which it throws ahead of itself.
     */
    readonly dropHeldItem: { readonly all: boolean };
    /**
     * A creative player put a stack in a slot of its own inventory, or emptied it, as a Java
     * client says outright. `container` is the inventory's 36 slots (the hotbar's 9 first),
     * `armor` (head first) or `offhand`; `item` names the stack by its Bedrock identifier.
     */
    readonly setCreativeSlot: {
        readonly container: 'inventory' | 'armor' | 'offhand';
        readonly slot: number;
        readonly item: { readonly name: string; readonly count: number } | null;
    };
    /**
     * Where the client says its player is and which way it faces. The server does not simulate
     * movement, so it takes the client's word, through the `playerMove` event.
     */
    readonly move: {
        /** The player's eyes, as every client reports them. */
        readonly position: { readonly x: number; readonly y: number; readonly z: number };
        readonly pitch: number;
        readonly yaw: number;
        readonly headYaw: number;
        readonly onGround: boolean;
        /** Whether the client says it handled the last teleport, so the move is from after it. */
        readonly handledTeleport: boolean;
    };
    /** The player jumped. */
    readonly jump: Record<never, never>;
    /** The player started or stopped sprinting. */
    readonly setSprinting: { readonly sprinting: boolean };
    /** The player started or stopped sneaking. */
    readonly setSneaking: { readonly sneaking: boolean };
    /** The player started or stopped flying, which the server allows or refuses. */
    readonly setFlying: { readonly flying: boolean };
    /** The player lay down in a bed or got out of one. */
    readonly setSleeping: { readonly sleeping: boolean };
    /** Which of the buttons scripts hear of the player holds: the jump and sneak buttons. */
    readonly holdButtons: { readonly jump: boolean; readonly sneak: boolean };
    /**
     * The player middle-clicked a block to take its item into the hand, and with `withData` asked
     * for the block's data on the item too.
     */
    readonly pickBlock: {
        readonly position: { readonly x: number; readonly y: number; readonly z: number };
        readonly withData: boolean;
    };
    /**
     * The player middle-clicked an actor, by runtime id, to take its spawn egg into the hand, and
     * with `withData` asked for the actor's data on the egg too.
     */
    readonly pickEntity: { readonly target: bigint; readonly withData: boolean };
    /** The player turned the book on a lectern to `page`, of the book's `totalPages`. */
    readonly turnLecternPage: {
        readonly position: { readonly x: number; readonly y: number; readonly z: number };
        readonly page: number;
        readonly totalPages: number;
    };
}

/** What the table declares about one intent. */
export interface IntentDefinition {
    /** When the intent's handler runs; see `Lane`. */
    readonly lane: Lane;
}

/**
 * Every intent and its lane. Adding an intent means adding its payload to {@link IntentPayloads}
 * and its row here; the `satisfies` fails the build when the two disagree.
 */
export const Intents = {
    openInventory: { lane: 'input' },
    // Reading the actor's position is a world read, and the handler records the open.
    openNpc: { lane: 'input' },
    // Logs an occurrence that replication relays to the players that see the sender.
    animate: { lane: 'input' },
    // Reads the bar the player already has and answers only the asking player.
    queryBossBar: { lane: 'read' },
    // Relays to the players that see the sender, so it is an input though it writes nothing.
    eat: { lane: 'input' },
    // Logs an occurrence that replication relays to the players that see the sender.
    emote: { lane: 'input' },
    // Logs an occurrence that replication relays to the players near the sound.
    playSound: { lane: 'input' },
    // The chat event calls the plugins' listeners in the input's unit.
    chat: { lane: 'input' },
    // Sets the player's view distance, which decides the chunks the world keeps loaded.
    setViewDistance: { lane: 'input' },
    changeGameMode: { lane: 'input' },
    requestAbility: { lane: 'input' },
    // Completes a held world change.
    finishCredits: { lane: 'input' },
    setDefaultGameMode: { lane: 'input' },
    setPlayerPermission: { lane: 'input' },
    runCommand: { lane: 'input' },
    // Raised on the input lane so the scripts hear it in the tick it arrived in.
    scriptMessage: { lane: 'input' },
    respawn: { lane: 'input' },
    // Brings the player back once the respawn search answers.
    pressRespawn: { lane: 'input' },
    // Puts the player into its world.
    playerInitialized: { lane: 'input' },
    // Writes the inventory and may drop items into the world.
    closeContainer: { lane: 'input' },
    // Writes the hand slot, which replication shows the players that see the sender.
    selectHotbarSlot: { lane: 'input' },
    // Breaks blocks and times the mining in the world.
    mineBlock: { lane: 'input' },
    // Writes the inventory, which replication shows the players that see the sender.
    setCreativeSlot: { lane: 'input' },
    // Writes the inventory and drops an item into the world.
    dropHeldItem: { lane: 'input' },
    // Places blocks and runs the block's and the item's behaviors in the world.
    useItemOnBlock: { lane: 'input' },
    // Runs the item's behavior, which may throw it, start a draw or begin a meal.
    useItem: { lane: 'input' },
    // Lands a blow, which writes the target's health and the attacker's hunger.
    attackEntity: { lane: 'input' },
    // Runs the content's behaviors for the actor and the item, which may write the world.
    interactEntity: { lane: 'input' },
    // Ends a draw, which looses an arrow into the world.
    releaseItem: { lane: 'input' },
    // The screens' requests read the block they name; none of them is stored yet.
    damageAnvil: { lane: 'read' },
    toggleCrafterSlot: { lane: 'read' },
    useLabTable: { lane: 'read' },
    // A preference the server does not keep yet, which a decoded packet cannot run on the connection lane.
    setRecipeBook: { lane: 'read' },
    // Moves the player, which replication shows the players that see it.
    move: { lane: 'input' },
    // Tires the player.
    jump: { lane: 'input' },
    setSprinting: { lane: 'input' },
    setSneaking: { lane: 'input' },
    setFlying: { lane: 'input' },
    setSleeping: { lane: 'input' },
    // Raised on the input lane so the scripts hear it in the tick it arrived in.
    holdButtons: { lane: 'input' },
    // A pick reads the block or the actor picked. Picking is not implemented, so the handlers
    // only log, and the entity pick checks the player was shown the actor.
    pickBlock: { lane: 'read' },
    pickEntity: { lane: 'read' },
    // Reads the block at the lectern's position; the page is not stored.
    turnLecternPage: { lane: 'read' }
} as const satisfies { readonly [K in keyof IntentPayloads]: IntentDefinition };

/** The name of an intent, as its `kind` field carries it. */
export type IntentKind = keyof IntentPayloads;

/**
 * One intent of kind `K`: its payload with the `kind` beside it. Written as a distributive
 * conditional so that `Intent<'a' | 'b'>` is a union of two shapes, and a generic `Intent<K>`
 * is assignable to `Intent` through its constraint.
 */
export type Intent<K extends IntentKind = IntentKind> = K extends IntentKind
    ? { readonly kind: K } & IntentPayloads[K]
    : never;

/** The lane the table declares for intent kind `K`. */
export type IntentLane<K extends IntentKind> = (typeof Intents)[K]['lane'];

/** Every intent kind, in table order. `Object.keys` loses the key type, hence the cast. */
export const INTENT_KINDS = Object.keys(Intents) as readonly IntentKind[];

/**
 * The lane a handler that may produce any of `kinds` has to run in: the strictest of theirs,
 * since running in a stricter lane is always safe and running in a looser one is not.
 *
 * @param kinds - The intent kinds, at least one.
 * @returns The strictest lane among them, or `connection` for none.
 */
export const laneOfIntents = (kinds: readonly IntentKind[]): Lane =>
    kinds.reduce<Lane>((lane, kind) => strictestLane(lane, Intents[kind].lane), 'connection');

/**
 * Whether a `kind` string names an intent in the table.
 *
 * @param kind - Any string, such as one read from a plugin or a trace.
 */
export const isIntentKind = (kind: string): kind is IntentKind => Object.hasOwn(Intents, kind);
