import { describe, expect, it, vi } from 'vitest';

import { formatPong, onInterrupt } from './commands';

describe('formatPong', () => {
    it('prints the MOTD without the terminal escapes the server put in it', () => {
        // Escape sequences in the MOTD and version fields. None holds a semicolon, which would
        // split the field before it reached the terminal.
        const lines = formatPong('MCPE;\u001B]2owned\u0007Hello\u001B[2J;\u001B[31m1;1.0\r;0;10', 1);

        expect(lines).toEqual(['Hello', '  version   1.0 (protocol 1)', '  players   0/10', '  rtt       1.0 ms']);
    });
});

describe('onInterrupt', () => {
    const signals = ['SIGINT', 'SIGTERM'] as const;
    /** The listeners `onInterrupt` added, found by difference so the test runner's own stay put. */
    const added = (before: Record<string, Function[]>) =>
        signals.flatMap((signal) =>
            process.listeners(signal).filter((listener) => !before[signal]!.includes(listener))
        );
    const snapshot = () => Object.fromEntries(signals.map((signal) => [signal, process.listeners(signal)]));

    it('stops once on a signal and then hands later signals back to the process', () => {
        const before = snapshot();
        const stop = vi.fn();
        onInterrupt(stop);

        const [listener] = added(before);
        listener!('SIGINT');

        expect(stop).toHaveBeenCalledOnce();
        expect(added(before)).toEqual([]);
    });

    it('removes its listeners when released without a signal', () => {
        const before = snapshot();
        const stop = vi.fn();
        const release = onInterrupt(stop);
        expect(added(before)).toHaveLength(2);

        release();

        expect(added(before)).toEqual([]);
        expect(stop).not.toHaveBeenCalled();
    });
});
