import * as inspector from 'node:inspector';

/** A running Node inspector endpoint and its Chrome DevTools frontend URL. */
export interface DevToolsSession {
    /** The URL to open in Chrome or Edge. */
    readonly frontendUrl: string;
    /** Closes the inspector only when this module opened it. */
    close(): void;
}

/**
 * Opens the Node inspector on loopback and builds the matching Chrome DevTools URL.
 *
 * Node's V8 inspector implements the debugger, runtime, CPU profiler, and heap profiler CDP
 * domains. Keeping the socket on loopback prevents this opt-in endpoint from being reachable
 * on the server's public interface.
 *
 * @returns The inspector endpoint and matching frontend URL.
 */
export const openDevTools = (): DevToolsSession => {
    const existingUrl = inspector.url();
    const handle = existingUrl === undefined ? inspector.open(0, '127.0.0.1') : undefined;
    const endpoint = inspector.url();
    if (endpoint === undefined) throw new Error('Node inspector did not provide a WebSocket URL');

    const socket = new URL(endpoint);
    const frontend = new URL('devtools://devtools/bundled/js_app.html');
    frontend.searchParams.set('experiments', 'true');
    frontend.searchParams.set('v8only', 'true');
    frontend.searchParams.set('ws', `${socket.host}${socket.pathname}`);

    return {
        frontendUrl: frontend.href,
        close: () => handle?.[Symbol.dispose]()
    };
};
