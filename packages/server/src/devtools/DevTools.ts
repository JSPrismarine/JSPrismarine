import * as inspector from 'node:inspector';
import type { LogLevel, LogRecord, LogTransport } from '@jsprismarine/logger';

const FRONTEND_URL =
    'https://chrome-devtools-frontend.appspot.com/serve_file/@b4907cc5d602ff470740b2eb6344b517edecb7b9/inspector.html';

/** A running Node inspector endpoint and its Chrome DevTools frontend URL. */
export interface DevToolsSession {
    /** The Node inspector WebSocket URL for an external CDP client. */
    readonly endpointUrl: string;
    /** The URL to open in a browser or app webview. */
    readonly frontendUrl: string;
    /** Blocks until a client sends Runtime.runIfWaitingForDebugger. */
    waitForDebugger(): void;
    /** Closes the inspector only when this module opened it. */
    close(): void;
}

/**
 * Creates a frontend URL that can be opened by browsers and app webviews.
 *
 * @param endpointUrl - The loopback Node inspector WebSocket URL.
 * @returns A Chrome DevTools frontend URL connected to that endpoint.
 */
export const createDevToolsFrontendUrl = (endpointUrl: string): string => {
    const socket = new URL(endpointUrl);
    const frontend = new URL(FRONTEND_URL);
    frontend.searchParams.set('experiments', 'true');
    frontend.searchParams.set('v8only', 'true');
    frontend.searchParams.set('ws', `${socket.host}${socket.pathname}`);
    return frontend.href;
};

const consoleMethod = (level: LogLevel): 'debug' | 'error' | 'info' | 'log' | 'warn' => {
    switch (level) {
        case 'error':
            return 'error';
        case 'warn':
            return 'warn';
        case 'info':
            return 'info';
        case 'verbose':
        case 'debug':
        case 'silly':
            return 'debug';
    }
};

/**
 * Sends server logger records to the inspector's Console domain.
 *
 * @returns A logger transport that writes records to connected DevTools frontends.
 */
export const createDevToolsLogTransport = (): LogTransport => ({
    log(record: LogRecord) {
        const namespace = record.namespace ? ` [${record.namespace}]` : '';
        const message = record.message.replaceAll(/§[\da-fk-or]/gi, '');
        try {
            inspector.console[consoleMethod(record.level)](
                `[${record.timestamp}] [${record.level.toUpperCase()}]${namespace}: ${message}`
            );
        } catch {
            // Logging must not change server behavior if the inspector is unavailable.
        }
    }
});

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

    return {
        endpointUrl: endpoint,
        frontendUrl: createDevToolsFrontendUrl(endpoint),
        waitForDebugger: () => inspector.waitForDebugger(),
        close: () => handle?.[Symbol.dispose]()
    };
};
