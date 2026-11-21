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
}

/** What the table declares about one intent. */
export interface IntentDefinition {
    /** When the intent's handler runs; see {@link Lane}. */
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
    chat: { lane: 'input' }
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
