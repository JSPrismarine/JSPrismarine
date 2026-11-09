/**
 * Chooses where generation runs: in a host process when one can be started and the caller allows
 * it, and in this process otherwise.
 */
import { GenerationPool } from './GenerationPool';
import type { HostedGenerationPoolOptions } from './HostedGenerationPool';
import { HostedGenerationPool } from './HostedGenerationPool';
import type { GenerationTransport } from './GenerationTransport';

/** Where a transport's workers run. */
export type GenerationHostMode = 'process' | 'in-process';

/** How {@link createGenerationTransport} chooses. */
export interface GenerationTransportOptions extends HostedGenerationPoolOptions {
    /** `process` asks for a host and falls back when one cannot start; `in-process` never forks. */
    readonly host: GenerationHostMode;
}

/** What was built, and why when it is not what was asked for. */
export interface BuiltGenerationTransport {
    readonly transport: GenerationTransport;
    readonly mode: GenerationHostMode;
    /** Why the host was not used, when the caller asked for it. */
    readonly reason?: string;
}

/**
 * Builds the transport for a generation pool.
 *
 * @returns The transport and the mode it runs in. A host that starts and later cannot be kept
 * alive is replaced by an in-process pool inside the transport, which reports it through
 * `options.onFallback`.
 */
export const createGenerationTransport = (options: GenerationTransportOptions): BuiltGenerationTransport => {
    const { host, hostPriority: _p, maxRestarts: _m, hostEntry: _e, onFallback: _f, ...pool } = options;
    if (host === 'in-process') return { transport: new GenerationPool(pool), mode: 'in-process' };

    const reason = HostedGenerationPool.unavailable(options);
    if (reason !== undefined) {
        options.onFallback?.(reason);
        return { transport: new GenerationPool(pool), mode: 'in-process', reason };
    }

    return { transport: new HostedGenerationPool(options), mode: 'process' };
};
