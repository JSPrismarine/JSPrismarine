import dgram from 'node:dgram';

/** What a simulated network path does to each UDP datagram this process sends. */
export interface LinkConditions {
    /** How long each datagram waits before it leaves, in milliseconds. The round trip grows by as much. */
    readonly latencyMs?: number;
    /** The share of datagrams dropped, from 0 to 1. */
    readonly loss?: number;
    /** Picks the datagrams to drop. A seeded one makes a run repeatable; `Math.random` by default. */
    readonly random?: () => number;
}

/** A conditioned path, with what it did so far. */
export interface ConditionedLink {
    /** Datagrams the process sent, dropped ones included. */
    readonly sent: number;
    /** Datagrams dropped. */
    readonly dropped: number;
    /** Sends directly again. Datagrams already waiting still leave. */
    restore(): void;
}

let active: ConditionedLink | undefined;

/** Whether the socket has an address yet; `address()` throws until it is bound. */
const isBound = (socket: dgram.Socket): boolean => {
    try {
        socket.address();
        return true;
    } catch {
        return false;
    }
};

/**
 * Makes every UDP socket in this process send as if over a longer, lossier path: RakNet's and
 * the ones WebRTC opens for NetherNet alike.
 *
 * A server on the same machine answers in microseconds and never loses a datagram, which hides
 * whatever a transport does on a path across an ocean. A NetherNet join over 300 ms with some
 * loss took tens of seconds and could stall for good on werift 0.24.4; this is how such a path
 * is reproduced on one machine.
 *
 * Applied to the process, not to one socket, because WebRTC opens its sockets out of reach.
 * In a process that runs both ends, both are conditioned, so the round trip grows by twice the
 * latency.
 * @throws {RangeError} When the latency is negative or the loss is outside 0 to 1.
 * @throws {Error} When the process is already conditioned.
 */
export const conditionLink = ({ latencyMs = 0, loss = 0, random = Math.random }: LinkConditions): ConditionedLink => {
    if (!(latencyMs >= 0)) throw new RangeError(`Link latency must be at least 0 ms, got ${latencyMs}`);
    if (!(loss >= 0 && loss <= 1)) throw new RangeError(`Link loss must be from 0 to 1, got ${loss}`);
    if (active !== undefined) throw new Error('This process is already sending over a conditioned link');

    const send = dgram.Socket.prototype.send;
    let sent = 0;
    let dropped = 0;

    // The overloads all end in an optional callback, the only argument this needs to know.
    const conditioned = function (this: dgram.Socket, ...args: unknown[]): void {
        // A socket's first send binds it and then calls `send` again; condition that second
        // call only, or the datagram would wait twice and risk being dropped twice.
        if (!isBound(this)) {
            Reflect.apply(send, this, args);
            return;
        }

        sent++;
        const callback = args.at(-1);
        if (random() < loss) {
            dropped++;
            // A dropped datagram is not an error to the sender: UDP never says.
            if (typeof callback === 'function') process.nextTick(callback, null, 0);
            return;
        }

        setTimeout(() => {
            try {
                Reflect.apply(send, this, args);
            } catch {
                // The socket closed while the datagram was on its way, as a datagram is lost
                // when a host goes away.
            }
        }, latencyMs);
    };
    // Assigned through `Reflect` because the method's overloads have no single signature to
    // write the replacement against; every overload passes through `args` unchanged.
    Reflect.set(dgram.Socket.prototype, 'send', conditioned);

    const link: ConditionedLink = {
        get sent() {
            return sent;
        },
        get dropped() {
            return dropped;
        },
        restore() {
            if (active !== link) return;
            dgram.Socket.prototype.send = send;
            active = undefined;
        }
    };
    active = link;
    return link;
};
