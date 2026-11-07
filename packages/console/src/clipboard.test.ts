import { describe, expect, it, vi } from 'vitest';

import { createConsoleClipboard } from './clipboard';

const boundary = (copied: boolean) => ({
    capabilities: { remote: true, osc52_support: 'supported' } as const,
    copyToClipboardOSC52: vi.fn(() => copied),
    clearClipboardOSC52: vi.fn(() => true)
});

describe('createConsoleClipboard over SSH', () => {
    const env = { SSH_CONNECTION: '10.0.0.2 5000 10.0.0.1 22' };

    it('copies through the terminal only', async () => {
        const renderer = boundary(true);
        const clipboard = createConsoleClipboard(renderer, env);

        await expect(clipboard.copy('hello')).resolves.toBe(true);

        expect(renderer.copyToClipboardOSC52).toHaveBeenCalledOnce();
        expect(renderer.copyToClipboardOSC52.mock.calls[0]?.[0]).toBe('hello');
        await clipboard.dispose();
    });

    it('reports a failed copy when the terminal refuses', async () => {
        const clipboard = createConsoleClipboard(boundary(false), env);

        await expect(clipboard.copy('hello')).resolves.toBe(false);
        await clipboard.dispose();
    });

    it('does not read the clipboard of the machine running the server', async () => {
        const clipboard = createConsoleClipboard(boundary(true), { SSH_TTY: '/dev/pts/1' });

        await expect(clipboard.read()).resolves.toBeUndefined();
        await clipboard.dispose();
    });

    it('treats an empty copy as a failure instead of throwing', async () => {
        const clipboard = createConsoleClipboard(boundary(true), env);

        await expect(clipboard.copy('')).resolves.toBe(false);
        await clipboard.dispose();
    });
});
