/**
 * Drives the cinnabar client through its MCP controller.
 *
 * Wraps the `cinnabar-mcp` stdio server with the launch policy the harness guarantees: a headless
 * window, an isolated `CINNABAR_USER_ROOT` so no real account or saved state leaks into a run,
 * and an offline display name. Every tool reply is the JSON the controller printed; a reply
 * carrying `isError` or an `error` key becomes a thrown error.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import fs from 'node:fs';
import path from 'node:path';

/** One `wait_for` condition, as the controller's `condition` schema spells them. */
export type WaitCondition =
    | 'in_world'
    | 'camera_finished'
    | { chunks_loaded: { radius: number } }
    | { screen: { name: string } }
    | { entity: { matches: string; radius: number } };

/** A connected MCP session controlling one cinnabar client process. */
export class CinnabarClient {
    private readonly session: Client;
    /** The cinnabar checkout the controller runs in; relative capture paths land under it. */
    public readonly checkout: string;

    private constructor(session: Client, checkout: string) {
        this.session = session;
        this.checkout = checkout;
    }

    /** Spawns `cinnabar-mcp --repo <checkout>` and finishes the MCP handshake. */
    static async start(checkout: string, mcpBinary: string): Promise<CinnabarClient> {
        const transport = new StdioClientTransport({
            command: mcpBinary,
            args: ['--repo', checkout],
            cwd: checkout
        });
        const session = new Client({ name: 'jsprismarine-client-e2e', version: '0.0.0' });
        await session.connect(transport);
        return new CinnabarClient(session, checkout);
    }

    /** Calls one controller tool and returns its parsed JSON reply. */
    async call(name: string, args: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
        const reply = await this.session.callTool({ name, arguments: args }, undefined, {
            // Launches compile shaders and connects wait on world spawn; give every call headroom.
            timeout: 240_000
        });
        const content = Array.isArray(reply.content) ? reply.content : [];
        const text = content.find((part): part is { type: 'text'; text: string } => part?.type === 'text');
        const parsed: unknown = text ? JSON.parse(text.text) : {};
        const value = typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
        if (reply.isError || typeof value.error === 'string') {
            throw new Error(`${name} failed: ${typeof value.error === 'string' ? value.error : text?.text}`);
        }
        return value;
    }

    /**
     * Launches a hidden client with an isolated user root and an offline display name.
     *
     * @param options.userRoot - Absolute directory for `CINNABAR_USER_ROOT`; created when missing.
     * @param options.muteAudio - Mute the client through its saved master volume before launch.
     */
    async launch(options: {
        userRoot: string;
        muteAudio: boolean;
        displayName?: string;
        size?: [number, number];
    }): Promise<void> {
        fs.mkdirSync(options.userRoot, { recursive: true });
        if (options.muteAudio) {
            const settings = path.join(options.userRoot, 'config', 'settings.json');
            fs.mkdirSync(path.dirname(settings), { recursive: true });
            fs.writeFileSync(settings, `${JSON.stringify({ schema: 2, values: { main_volume: 0 } }, null, 4)}\n`);
        }
        await this.call('launch_client', {
            headless: true,
            size: options.size ?? [1280, 720],
            args: ['--display-name', options.displayName ?? 'jsp-e2e'],
            env: { CINNABAR_USER_ROOT: path.resolve(options.userRoot) }
        });
    }

    /** Joins a loopback server. The controller refuses non-loopback addresses by design. */
    async connect(port: number): Promise<void> {
        await this.call('connect', { address: `127.0.0.1:${port}` });
    }

    /** Blocks until the condition holds, or throws after `timeoutMs` (controller default 60 s). */
    async waitFor(condition: WaitCondition, timeoutMs?: number): Promise<void> {
        await this.call('wait_for', { condition, ...(timeoutMs === undefined ? {} : { timeout_ms: timeoutMs }) });
    }

    /** One client state snapshot: position, health, chunks, screens, motion, and the rest. */
    state(): Promise<Record<string, unknown>> {
        return this.call('state');
    }

    /**
     * Polls `state` until the named screen leaves the scene stack.
     *
     * The world is playable only once the `Loading` screen is gone; before that the scene owns
     * input and gameplay keys go nowhere.
     */
    async waitForScreenAbsent(name: string, timeoutMs = 60_000): Promise<void> {
        const deadline = Date.now() + timeoutMs;
        for (;;) {
            const { screens } = await this.state();
            if (!Array.isArray(screens) || !screens.includes(name)) return;
            if (Date.now() > deadline) throw new Error(`the ${name} screen never left; stack: ${screens.join(', ')}`);
            await new Promise((resolve) => setTimeout(resolve, 500));
        }
    }

    /** Sends synthetic input; see the `input` tool schema for the accepted fields. */
    async input(args: Record<string, unknown>): Promise<void> {
        await this.call('input', args);
    }

    /** Sends a chat line as the player; a leading `/` runs a command. */
    async chat(text: string): Promise<void> {
        await this.call('chat', { text });
    }

    /** Saves the next rendered frame as a PNG at an absolute path, skipping the inline copy. */
    async screenshot(file: string): Promise<void> {
        await this.call('screenshot', { path: path.resolve(file), inline: false });
    }

    /** Starts a wall-clock MP4 recording. JSPrismarine keeps real time, so no fixed clock. */
    async recordStart(file: string, options: { fps?: number } = {}): Promise<void> {
        await this.call('record_start', {
            path: path.resolve(file),
            fixed_clock: false,
            fps: options.fps ?? 60
        });
    }

    /** Stops the recording and waits for the encode; returns the controller's summary. */
    recordStop(): Promise<Record<string, unknown>> {
        return this.call('record_stop');
    }

    /** Asks the client to exit and releases the controller session. */
    async close(): Promise<void> {
        try {
            await this.call('quit');
        } catch {
            // The client may already be gone; closing the transport is what matters.
        }
        await this.session.close();
    }
}
