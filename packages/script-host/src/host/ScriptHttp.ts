import type { ScriptHttpChannel, ScriptHttpRequest, ScriptHttpResult } from './world';

/** What settles one request's promise, in the pack that sent it. */
export interface HttpSettlement {
    /** Settles the promise with how the request ended. */
    readonly respond: (result: ScriptHttpResult) => void;
    /** Rejects the promise as `cancelAll` does, with a plain `Error` of the reason. */
    readonly cancel: (reason: string) => void;
    /** Frees the promise's handles, once it is settled or will never be. */
    readonly release: () => void;
}

/** A request in flight, with the pack whose script sent it. */
interface PendingRequest<Owner> {
    readonly id: number;
    readonly owner: Owner;
    readonly settlement: HttpSettlement;
}

/**
 * Runs `settle` with the pack's context current, so the promise jobs it queues are the pack's, and
 * reports what it throws as the runtime reports any error of the pack's.
 */
export type SettleRequestInPack<Owner> = (owner: Owner, settle: () => void) => void;

/** The error code a request ends with when the world has no network to send it over: `E_FAIL`. */
export const HTTP_FAILURE_CODE = -2147467259;

/**
 * The `@minecraft/server-net` requests every pack of one runtime has in flight, and what settles
 * them. The network answers off the tick, and its result enters the world as an input
 * ([ADR 0009](../../../../docs/adr/0009-external-inputs-enter-once-per-tick.md),
 * [ADR 0021](../../../../docs/adr/0021-the-script-watchdog-counts-steps.md)) that settles its
 * request in the next script flush. A replay admits the recorded results instead, so the same
 * requests settle in the same ticks with the same responses.
 *
 * @typeParam Owner - What the runtime knows a pack by.
 */
export class ScriptHttp<Owner> {
    private pending: PendingRequest<Owner>[] = [];
    /** Results that never reached the network, settled in the next flush as the network's are. */
    private local: ScriptHttpResult[] = [];
    /** Request ids count from 1 for the runtime's life, and a reload keeps counting. */
    private nextId = 1;

    /** The requests in flight, for tests that count them. */
    public get pendingCount(): number {
        return this.pending.length;
    }

    /**
     * Sends a request over the world's channel. A world without one fails it in the next flush,
     * as a network that cannot connect does.
     */
    public send(
        channel: ScriptHttpChannel | undefined,
        owner: Owner,
        request: ScriptHttpRequest,
        settlement: HttpSettlement
    ): void {
        const id = this.nextId++;
        this.pending.push({ id, owner, settlement });
        if (channel === undefined) this.local.push({ id, errorCode: HTTP_FAILURE_CODE });
        else channel.send(id, request);
    }

    /**
     * Rejects every request one pack has in flight with `reason`, at once, in the order it sent
     * them, and abandons them on the network.
     */
    public cancelAll(channel: ScriptHttpChannel | undefined, owner: Owner, reason: string): void {
        const canceled = this.pending.filter((each) => each.owner === owner);
        this.pending = this.pending.filter((each) => each.owner !== owner);
        for (const request of canceled) {
            channel?.cancel(request.id);
            try {
                request.settlement.cancel(reason);
            } finally {
                request.settlement.release();
            }
        }
    }

    /** Settles each request whose result the input step admitted, in the order it admitted them. */
    public update(results: readonly ScriptHttpResult[], settle: SettleRequestInPack<Owner>): void {
        for (const result of [...this.local.splice(0), ...results]) {
            const at = this.pending.findIndex((each) => each.id === result.id);
            const request = this.pending[at];
            // A result for a request a pack canceled, or one a reload dropped.
            if (request === undefined) continue;
            this.pending.splice(at, 1);
            settle(request.owner, () => request.settlement.respond(result));
            request.settlement.release();
        }
    }

    /**
     * Forgets every request in flight without settling it, as a reload or a shutdown does, abandons
     * it on the network, and frees its handles.
     */
    public clear(channel: ScriptHttpChannel | undefined): void {
        this.local = [];
        for (const request of this.pending.splice(0)) {
            channel?.cancel(request.id);
            request.settlement.release();
        }
    }
}
