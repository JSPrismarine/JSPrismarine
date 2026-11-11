/**
 * The packet handler shape the server and the client share
 * ([ADR 0014](../../../../docs/adr/0014-handlers-share-a-shape-and-run-in-the-input-step.md)).
 *
 * A handler registers under the name of the packet it handles and accepts that packet only in
 * the session phases it lists. Each side supplies its own packet form, its own context and its
 * own phases, and keeps its own execution contract: the server runs a serverbound handler in the
 * lane it declares, and the client, which has no world tick, runs its handlers as packets arrive.
 */
import type { Lane } from './Lane';

/**
 * A handler for one packet, in the shape both sides use.
 *
 * @typeParam P - The packet as the side decodes it: a packet instance on the server, a decoded
 *   payload on the client.
 * @typeParam C - What the side hands the handler beside the packet, in place of the whole
 *   server or client.
 * @typeParam Phase - The session phases of that side.
 */
export interface PacketHandler<P, C, Phase extends string = string> {
    /** The session phases in which the packet is accepted. The side drops it in any other. */
    readonly phases: readonly Phase[];

    /**
     * Handles one packet.
     *
     * @param packet - The decoded packet.
     * @param context - What the side hands the handler.
     */
    handle(packet: P, context: C): void | Promise<void>;
}

/**
 * A handler for a packet the client sends, which declares when the server runs it.
 *
 * @typeParam L - The lane the handler declares; see {@link Lane}.
 */
export interface LaneHandler<P, C, L extends Lane, Phase extends string = string> extends PacketHandler<P, C, Phase> {
    /** When the handler runs relative to the world tick. */
    readonly lane: L;
}

/**
 * An input-lane handler. The server applies it synchronously in the input step of the world
 * its sender is in, so it returns nothing to wait for.
 *
 * Its return type is `undefined` and not `void`: a function that returns a promise can stand in
 * for one that returns `void`, and the input step must never be handed one. An asynchronous
 * method does not satisfy this interface. What the handler sends it hands to its context
 * instead of awaiting.
 */
export interface InputHandler<P, C, Phase extends string = string> extends LaneHandler<P, C, 'input', Phase> {
    /**
     * Applies one input.
     *
     * @param packet - The decoded packet.
     * @param context - What the side hands an input-lane handler.
     */
    handle(packet: P, context: C): undefined;
}

/** The context one side hands the handlers of each lane. */
export type LaneContexts = { readonly [L in Lane]: unknown };

/**
 * Any serverbound handler of one side, its context chosen by the lane it declares.
 *
 * @typeParam Contexts - The side's context for each lane.
 */
export type ServerboundHandler<P, Contexts extends LaneContexts, Phase extends string = string> =
    | LaneHandler<P, Contexts['connection'], 'connection', Phase>
    | LaneHandler<P, Contexts['read'], 'read', Phase>
    | InputHandler<P, Contexts['input'], Phase>;
