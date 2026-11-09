/**
 * The environment `cinnabar-mcp` starts with, and so the environment of every client it launches.
 *
 * The MCP SDK's stdio transport hands a server only a short allowlist (`PATH`, `HOME`, `USER` and
 * a few more) unless it is given an environment. That is enough on macOS, where a window needs no
 * variables, but on Linux the client finds no `DISPLAY` or `WAYLAND_DISPLAY`, cannot open its
 * window and panics before its control endpoint comes up. This adds the display and session
 * variables a Linux window needs, Rust's backtrace switch, and wgpu's adapter overrides, and
 * nothing else from the caller's environment.
 */
import { getDefaultEnvironment } from '@modelcontextprotocol/sdk/client/stdio.js';

/** The caller's variables a launched client reads, beyond the SDK's own allowlist. */
const PASSED_THROUGH = [
    'DISPLAY',
    'WAYLAND_DISPLAY',
    'WAYLAND_SOCKET',
    'XAUTHORITY',
    'XDG_RUNTIME_DIR',
    'XDG_SESSION_TYPE',
    'RUST_BACKTRACE'
];

/** wgpu reads `WGPU_BACKEND`, `WGPU_FORCE_FALLBACK_ADAPTER` and the like to pick its adapter. */
const PASSED_THROUGH_PREFIX = 'WGPU_';

/**
 * The SDK's default environment plus the variables above that are set in `source`.
 *
 * @param source - The environment to take them from; the process's own by default.
 * @returns A fresh object, safe to hand to `StdioClientTransport`.
 */
export const controllerEnvironment = (source: NodeJS.ProcessEnv = process.env): Record<string, string> => {
    const environment = getDefaultEnvironment();
    for (const [name, value] of Object.entries(source)) {
        if (value === undefined) continue;
        if (PASSED_THROUGH.includes(name) || name.startsWith(PASSED_THROUGH_PREFIX)) environment[name] = value;
    }
    return environment;
};
