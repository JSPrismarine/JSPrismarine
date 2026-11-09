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

import { controllerEnvironment } from './controllerEnvironment.mts';

/** One `wait_for` condition, as the controller's `condition` schema spells them. */
export type WaitCondition =
    | 'in_world'
    | 'camera_finished'
    | { chunks_loaded: { radius: number } }
    | { screen: { name: string } }
    | { entity: { matches: string; radius: number } };

/**
 * Saved settings for a client nobody watches, keyed by cinnabar's `settings.json` names. Toggles
 * and dropdowns save their choice's index. The frame cap stays above the 20 Hz game tick, and
 * the render distance is cinnabar's lowest, still past the radius-2 chunks scenarios wait for.
 */
const lightweightSettings = {
    main_volume: 0,
    max_framerate: 30,
    render_distance: 5,
    render_resolution: 50,
    render_scale_sharpen: 0,
    msaa: 1,
    smaa: 0,
    graphics_mode: 0,
    smooth_lighting: 0,
    fancy_skies: 0,
    render_clouds: 0,
    transparent_leaves: 0,
    screen_animations: 0,
    auto_update_enabled: 0,
    mod_update_checks: 0,
    mod_auto_update: 0,
    discord_presence: 0
};

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
            cwd: checkout,
            env: controllerEnvironment()
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
     * A client that is not recorded saves cheap video settings before launch, so it competes as
     * little as it can with the server for the machine: muted, capped at 30 frames a second, at
     * a short render distance, with the expensive effects off and the world drawn at half
     * resolution. Scenarios assert on the client's state, not on its pixels. A recorded client
     * keeps full quality, audio and an uncapped frame rate, because the recorder steps game time
     * by one frame of the video per rendered frame.
     *
     * @param options.userRoot - Absolute directory for `CINNABAR_USER_ROOT`; created when missing.
     * @param options.clientBinary - Protocol-specific client executable from the external Cargo cache.
     * @param options.recorded - Whether a recording of this client will be made.
     */
    async launch(options: {
        userRoot: string;
        clientBinary: string;
        recorded: boolean;
        displayName?: string;
        size?: [number, number];
    }): Promise<void> {
        fs.mkdirSync(options.userRoot, { recursive: true });
        if (!options.recorded) {
            const settings = path.join(options.userRoot, 'config', 'settings.json');
            fs.mkdirSync(path.dirname(settings), { recursive: true });
            fs.writeFileSync(settings, `${JSON.stringify({ schema: 2, values: lightweightSettings }, null, 4)}\n`);
        }
        const launched = await this.call('launch_client', {
            binary: options.clientBinary,
            headless: true,
            size: options.size ?? [1280, 720],
            args: ['--display-name', options.displayName ?? 'jsp-e2e'],
            env: { CINNABAR_USER_ROOT: path.resolve(options.userRoot) }
        });
        // `JSP_E2E_CLIENT_LOG=world=debug` makes the client log what a dimension change waits for;
        // the runner keeps the client's logs with the suite's artifacts.
        if (typeof launched.log === 'string') this.logFile = launched.log;
        const logFilter = process.env.JSP_E2E_CLIENT_LOG;
        if (logFilter !== undefined && logFilter !== '') await this.call('log_filter_set', { spec: logFilter });
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

    /**
     * Waits until the client has rendered `frames` more frames.
     *
     * Input is applied a frame at a time, so this is how long the client needs to have seen it,
     * however slowly a loaded host renders: a fixed sleep is a different number of frames on every run.
     */
    async waitFrames(frames: number, timeoutMs = 60_000): Promise<void> {
        const count = async (): Promise<number> => {
            const { frame_count } = await this.state();
            if (typeof frame_count !== 'number') throw new Error('state.frame_count is not a number');
            return frame_count;
        };
        const target = (await count()) + frames;
        const deadline = Date.now() + timeoutMs;
        while ((await count()) < target) {
            if (Date.now() > deadline) throw new Error(`the client did not render ${frames} frames in ${timeoutMs} ms`);
            await new Promise((resolve) => setTimeout(resolve, 20));
        }
    }

    /**
     * Gives the client gameplay input, which a loaded window can lose.
     *
     * The first click after a focus change is the one that captures the pointer, and it does nothing
     * else, so a scenario's own first click was the one that went nowhere. Tap once at the sky with
     * an empty hand, where it is harmless, and wait for the client to have drawn the frames after it.
     */
    async armInput(): Promise<void> {
        await this.input({ release_all: true });
        await this.input({ look: { yaw: 0, pitch: -60, frames: 0 } });
        await this.input({ press: ['MouseLeft'], press_frames: 3 });
        await this.waitFrames(15);
        await this.input({ release_all: true });
        await this.input({ look: { yaw: 0, pitch: 0, frames: 0 } });
    }

    /**
     * Left-clicks a point on screen, counting the client's frames rather than milliseconds.
     *
     * A screen reacts to a click on the frame after the pointer reaches it, once it has drawn the
     * hover, and a press needs a few frames to register. A fixed sleep is a different number of
     * frames on every run, and on a loaded host it is sometimes none, which sent the click to
     * wherever the pointer had been.
     *
     * @param pointer - Window coordinates to click.
     * @param options.hold - Keys held through the click, such as `ShiftLeft`.
     */
    async clickAt(pointer: [number, number], options: { hold?: string[] } = {}): Promise<void> {
        await this.input({ pointer, ...(options.hold === undefined ? {} : { hold: options.hold }) });
        await this.waitFrames(6);
        await this.input({ press: ['MouseLeft'], press_frames: 3 });
        await this.waitFrames(8);
        await this.input({ release: ['MouseLeft', ...(options.hold ?? [])] });
        await this.waitFrames(4);
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

    /** Where the controller writes the launched client's output, once a client has launched. */
    private logFile: string | undefined;

    /** Copies the client's log to `destination`, so it outlives the controller's directory. */
    keepLog(destination: string): void {
        if (this.logFile === undefined || !fs.existsSync(this.logFile)) return;
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        fs.copyFileSync(this.logFile, destination);
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
