import type { KernelLogger } from '@jsprismarine/kernel';
import { settle } from '../testing/manualTransport.test.helper';
import type { StatsTimer } from './StatsProvider';

/** A logger that records each line with its level, as `info: message`. */
export const recordingLogger = (): { lines: string[]; logger: KernelLogger } => {
    const lines: string[] = [];
    const record = (level: string) => (message: string) => void lines.push(`${level}: ${message}`);
    const logger: KernelLogger = {
        debug: record('debug'),
        info: record('info'),
        warn: record('warn'),
        error: record('error')
    };
    return { lines, logger };
};

/** A one-shot timer on a clock that moves only when the test advances it. */
export const manualTimer = () => {
    let now = 0;
    const pending = new Set<{ at: number; callback: () => void }>();
    const delays: number[] = [];
    const setTimer: StatsTimer = (callback, delayMs) => {
        delays.push(delayMs);
        const timer = { at: now + delayMs, callback };
        pending.add(timer);
        return () => void pending.delete(timer);
    };
    /** Fires every timer due within `ms`, in order, letting each one's promises settle. */
    const advance = async (ms: number) => {
        const until = now + ms;
        for (;;) {
            const due = [...pending].filter((timer) => timer.at <= until).sort((a, b) => a.at - b.at)[0];
            if (!due) break;
            pending.delete(due);
            now = due.at;
            due.callback();
            await settle();
        }
        now = until;
        await settle();
    };
    return { setTimer, advance, delays, pending, now: () => now };
};

/** One request a {@link stubFetch} received. */
export interface SentRequest {
    readonly url: string;
    readonly init: RequestInit | undefined;
}

/** A `fetch` that records each request and answers it with `answer`, 202 by default. */
export const stubFetch = (
    answer: (init: RequestInit | undefined) => Promise<Response> = async () => new Response(null, { status: 202 })
) => {
    const requests: SentRequest[] = [];
    const fetch: typeof globalThis.fetch = (input, init) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        requests.push({ url, init });
        return answer(init);
    };
    return { fetch, requests };
};
