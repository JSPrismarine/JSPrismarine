/**
 * The lanes a serverbound packet handler can declare, from the one with the fewest
 * constraints to the one with the most. {@link Lane} is derived from this list, and
 * {@link strictestLane} reads its order.
 */
export const LANES = ['connection', 'read', 'input'] as const;

/**
 * When a serverbound packet handler runs, declared by the handler
 * ([ADR 0009](../../../../../docs/adr/0009-external-inputs-enter-once-per-tick.md)). Decide it
 * from everything the handler does, including what the methods it calls do, and not only from
 * its direct calls:
 *
 * - `connection`: the handler touches only its own network session, such as network settings,
 *   cache status, latency, resource pack transfer, or login and authentication before the
 *   player is in a world. It runs when the packet arrives and never enters a world.
 * - `read`: the handler reads authoritative state, writes none, and replies only to the
 *   connection that asked, such as a sub-chunk request. It runs when the packet arrives,
 *   between ticks, against the state the last tick closed with. Its replies are not recorded.
 * - `input`: the handler writes authoritative state or produces anything other players see.
 *   A handler that only relays a packet to the players who can see the sender is an input too.
 *   Input-lane packets are the inputs a world applies in its input step and records.
 *
 * A packet waits behind an input the same client sent before it, whatever its own lane: a
 * connection-lane or read-lane packet that follows a held input runs once the input step that
 * applies that input is over, while the client's later inputs are still held for that step. A
 * client that moves and then asks for something the move changed gets the answer the move leads
 * to, or a newer one. Packets from other clients do not wait.
 *
 * When a handler fits more than one lane, or its effects cannot be traced, declare `input`:
 * running a handler in the input step is always safe, and running it outside is not. A
 * handler that starts writing state, or starts sending to other players, moves to `input`.
 */
export type Lane = (typeof LANES)[number];

/**
 * The lane that satisfies both handlers' rules, for a handler that runs two others in turn.
 *
 * @returns Whichever of the two comes later in {@link LANES}.
 */
export const strictestLane = (first: Lane, second: Lane): Lane =>
    LANES.indexOf(first) >= LANES.indexOf(second) ? first : second;
