/**
 * The server's own name for one accepted connection, whichever transport carried it.
 *
 * Transports identify peers by what their wire offers: RakNet by the client's address and
 * port, NetherNet by a connection ID the client picks. Neither is unique across transports,
 * and an address is reused the moment a client reconnects from the same port. So the server
 * never keys anything on them: the session registry, the per-connection frame queues, and
 * packet traces and their replay all key on this number instead.
 */
export type ConnectionId = number;

/**
 * Hands out {@link ConnectionId}s: 1, 2, 3 and so on in the order connections are accepted,
 * never reusing one. One allocator serves every transport of a server, which is what makes an
 * ID unique across them; a fresh server numbers its connections the same way, which is what lets
 * a packet trace from one run replay against another.
 */
export class ConnectionIds {
    private next: ConnectionId = 1;

    /** The ID for the next accepted connection. */
    public allocate(): ConnectionId {
        const id = this.next;
        this.next += 1;
        return id;
    }
}
