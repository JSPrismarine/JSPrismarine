import { createClipboard, createHostClipboard, createRendererClipboardAdapter } from '@opentui/core';
import type { ClipboardService, RendererClipboardBoundary } from '@opentui/core';

/** The system clipboard as the console uses it. */
export interface ConsoleClipboard {
    /** Copies `text`. Resolves to false when nothing could reach a clipboard. */
    copy(text: string): Promise<boolean>;
    /** Reads the text on the clipboard, or `undefined` when there is none or it cannot be read. */
    read(): Promise<string | undefined>;
    dispose(): Promise<void>;
}

const isRemote = (env: NodeJS.ProcessEnv): boolean =>
    [env.SSH_CONNECTION, env.SSH_CLIENT, env.SSH_TTY].some((value) => value !== undefined && value !== '');

/**
 * Creates the console's clipboard. On the machine that runs the server, a copy goes to the
 * operating system's clipboard and to the terminal with OSC 52, so it works in terminals that
 * ignore OSC 52. Over SSH the operating system's clipboard is the server's, so a copy goes to the
 * terminal only and a read is not attempted.
 *
 * @param env - Environment used to detect an SSH session.
 */
export function createConsoleClipboard(
    renderer: RendererClipboardBoundary,
    env: NodeJS.ProcessEnv = process.env
): ConsoleClipboard {
    const remote = isRemote(env);
    let service: ClipboardService | undefined;
    // Created on first use so a console nobody copies from never loads the native clipboard.
    const clipboard = (): ClipboardService =>
        (service ??= createClipboard({
            host: createHostClipboard(),
            terminal: createRendererClipboardAdapter(renderer)
        }));

    return {
        async copy(text) {
            try {
                const result = await clipboard().writeText(
                    text,
                    remote ? { destination: 'terminal-only' } : { destination: 'all-available', allowRemoteHost: true }
                );
                return result.host.status === 'written' || result.terminal.status === 'attempted';
            } catch {
                return false;
            }
        },
        async read() {
            if (remote) return undefined;
            try {
                const result = await clipboard().read({ preferredTypes: ['text/plain'] });
                return result.status === 'read' ? new TextDecoder().decode(result.representation.bytes) : undefined;
            } catch {
                return undefined;
            }
        },
        async dispose() {
            await service?.dispose();
        }
    };
}
