import type { CommandSource } from '@jsprismarine/commands';
import { CommandRegistry, createCommandSource, testCommandHost } from '@jsprismarine/commands';
import { CommandPermissionLevel } from '@jsprismarine/minecraft';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type Server from '../Server';
import type SessionManager from '../SessionManager';
import type BanManager from '../ban/BanManager';
import type { Config, ScriptDebuggerConfig } from '../config/Config';
import type { LevelScripts } from '../scripting/LevelScripts';
import type { ScriptDebugger, ScriptDebuggerReply } from '../scripting/ScriptDebugger';
import type PlayerSession from '../player/PlayerSession';
import { identityNamed } from '../testing/sessionIdentity.test.helper';
import { stub } from '../testing/stub.test.helper';
import { collectAsyncCommands } from './deferred';
import { kernelWithUpdates } from '../modules/updates.test-utils';
import { registerJsprismarineCommands } from './jsprismarineCommands';
import type { ProtocolProvider } from '../protocolProviders';
import { bedrockProtocolProvider, describeProtocolProviders } from '../protocolProviders';

/** The script debugger's settings as a fresh config has them, with `changes` on top. */
const debuggerSettings = (changes: Partial<ScriptDebuggerConfig>): ScriptDebuggerConfig => ({
    allowInbound: false,
    allowOutbound: false,
    listenPort: 19_144,
    portForced: false,
    listenAddress: '127.0.0.1',
    autoAttach: 'disabled',
    autoAttachConnectAddress: '',
    autoAttachTimeout: 0,
    passcode: '',
    ...changes
});

/** A kernel whose update checks have not run yet, which `/version` reads. */
const updatesKernel = await kernelWithUpdates();

describe("this server's own commands", () => {
    let registry: CommandRegistry<CommandSource>;
    let setBanned: ReturnType<typeof vi.fn<BanManager['setBanned']>>;
    let setUnbanned: ReturnType<typeof vi.fn<BanManager['setUnbanned']>>;
    let kick: ReturnType<typeof vi.fn<PlayerSession['kick']>>;
    let feedback: string[];
    let tpsAverages: number[];

    beforeEach(() => {
        setBanned = vi.fn<BanManager['setBanned']>(async () => true);
        setUnbanned = vi.fn<BanManager['setUnbanned']>(async () => {});
        kick = vi.fn<PlayerSession['kick']>(async () => {});
        feedback = [];
        tpsAverages = [20, 20, 20];

        const target = stub<PlayerSession>({
            identity: identityNamed('testPlayer'),
            getFormattedUsername: () => 'testPlayer',
            kick
        });
        const server = stub<Server>({
            getKernel: () => updatesKernel,
            getBanManager: () => stub<BanManager>({ setBanned, setUnbanned }),
            getSessionManager: () => stub<SessionManager>({ getSessions: () => [target] }),
            getTPSAverages: () => tpsAverages,
            getProtocolProviders: () => [bedrockProtocolProvider, LEGACY]
        });
        registry = new CommandRegistry<CommandSource>();
        registerJsprismarineCommands(registry, server);
    });

    /** Runs one line as the console and waits for the work it parked. */
    const run = async (line: string): Promise<void> => {
        const source = createCommandSource({
            host: testCommandHost(),
            permissionLevel: CommandPermissionLevel.INTERNAL,
            onFeedback: (message) => void feedback.push(message)
        });
        await Promise.all(collectAsyncCommands(() => registry.getDispatcher().execute(line, source)));
    };

    it('bans a player with a reason, kicking them first', async () => {
        await run('ban testPlayer testReason');

        expect(kick).toHaveBeenCalledWith('You have been banned from the server due to: \n\ntestReason!');
        expect(setBanned).toHaveBeenCalledWith(
            { name: 'testPlayer', subject: { kind: 'offline', name: 'testPlayer' } },
            'testReason'
        );
        expect(feedback).toEqual(['Banned testPlayer due to: testReason!']);
    });

    it('bans a player without a reason', async () => {
        await run('ban testPlayer');

        expect(kick).toHaveBeenCalledWith('You have been banned!');
        expect(setBanned).toHaveBeenCalledWith({
            name: 'testPlayer',
            subject: { kind: 'offline', name: 'testPlayer' }
        });
    });

    it('bans a name nobody online holds, without kicking anyone', async () => {
        await run('ban someoneElse');

        expect(kick).not.toHaveBeenCalled();
        // Nobody online says which platform the name is on, so the ban names the name alone.
        expect(setBanned).toHaveBeenCalledWith({ name: 'someoneElse' });
    });

    it('pardons a name', async () => {
        await run('pardon testPlayer');

        expect(setUnbanned).toHaveBeenCalledWith('testPlayer');
        expect(feedback).toEqual(['Unbanned testPlayer']);
    });

    it('reports the 1, 5 and 15 minute TPS averages as Spigot does', async () => {
        await run('tps');

        expect(feedback).toEqual(['§6TPS from last 1m, 5m, 15m: §a20.0, §a20.0, §a20.0']);
    });

    it('colors each average by health, rounds it, and stars and caps one above 20', async () => {
        tpsAverages = [20.456, 17.004, 9.5];
        await run('tps');

        expect(feedback).toEqual(['§6TPS from last 1m, 5m, 15m: §a*20.0, §e17.0, §c9.5']);
    });

    it('reports the version with the same v prefix as the startup log', async () => {
        vi.stubGlobal('BUILD_VERSION', '1.2.3-nightly.1');
        await run('version').finally(() => vi.unstubAllGlobals());

        expect(feedback[0]).toContain('JSPrismarine §ev1.2.3-nightly.1§r');
    });

    it("lists every edition the server's providers speak, an embedder's too", async () => {
        await run('version');

        for (const edition of describeProtocolProviders([bedrockProtocolProvider, LEGACY], true)) {
            expect(feedback[0]).toContain(edition);
        }
    });

    it('answers /about as /version', () => {
        expect(registry.getAliasOwner('about')).toBe('version');
    });

    it('needs an operator for /ban, /pardon and /debug, and nobody for /tps and /version', () => {
        expect(registry.getMetadata('ban')?.permissionLevel).toBe(CommandPermissionLevel.ADMIN);
        expect(registry.getMetadata('pardon')?.permissionLevel).toBe(CommandPermissionLevel.ADMIN);
        expect(registry.getMetadata('debug')?.permissionLevel).toBe(CommandPermissionLevel.OWNER);
        expect(registry.getMetadata('tps')?.permissionLevel).toBe(CommandPermissionLevel.ANY);
        expect(registry.getMetadata('version')?.permissionLevel).toBe(CommandPermissionLevel.ANY);
    });
});

/** An edition an embedder brings. */
const LEGACY: ProtocolProvider = {
    edition: 'Legacy Console Edition',
    protocols: () => [{ protocolVersion: 78, minecraftVersions: ['TU78'], advertised: true, preview: false }]
};

describe('/script debugger', () => {
    /** What the command bodies asked of the debugger, and what each run printed. */
    const setUp = (options: { forced?: boolean; scripts?: boolean; reply?: ScriptDebuggerReply } = {}) => {
        const calls: string[] = [];
        const answer = (fallback: ScriptDebuggerReply): ScriptDebuggerReply =>
            'reply' in options ? options.reply : fallback;
        const scriptDebugger = stub<ScriptDebugger>({
            listen: async (port) => {
                calls.push(`listen ${port}`);
                return answer({ ok: true, message: `Debugger listening on port ${port ?? 19_144}` });
            },
            connect: async (host, port) => {
                calls.push(`connect ${host} ${port}`);
                return answer({ ok: true, message: `Debugger connected to host ${host} on port ${port}` });
            },
            close: async () => {
                calls.push('close');
                return answer({ ok: true, message: 'Debugger closed' });
            }
        });
        const server = stub<Server>({
            getKernel: () => updatesKernel,
            getConfig: () =>
                stub<Config>({
                    getScriptDebugger: () =>
                        debuggerSettings(options.forced === true ? { portForced: true, listenPort: 19_200 } : {})
                }),
            getScripts: () => (options.scripts === false ? undefined : stub<LevelScripts>({ debugger: scriptDebugger }))
        });
        const registry = new CommandRegistry<CommandSource>();
        registerJsprismarineCommands(registry, server);
        const feedback: string[] = [];
        const errors: string[] = [];
        const run = async (line: string): Promise<void> => {
            const source = createCommandSource({
                host: testCommandHost(),
                permissionLevel: CommandPermissionLevel.INTERNAL,
                onFeedback: (message) => void feedback.push(message),
                onError: (message) => void errors.push(message)
            });
            await Promise.all(collectAsyncCommands(() => registry.getDispatcher().execute(line, source)));
        };
        return { registry, calls, feedback, errors, run };
    };

    it("listens on the port it names, and prints BDS's line", async () => {
        const { calls, feedback, run } = setUp();

        await run('script debugger listen 19144');

        expect(calls).toEqual(['listen 19144']);
        expect(feedback).toEqual(['Debugger listening on port 19144']);
    });

    it('takes no port once force-inbound-debug-port is set, and needs one until then, as BDS does', async () => {
        const forced = setUp({ forced: true });
        await forced.run('script debugger listen');
        await expect(forced.run('script debugger listen 19144')).rejects.toThrow();
        expect(forced.calls).toEqual(['listen undefined']);
        expect(forced.feedback).toEqual(['Debugger listening on port 19144']);

        const open = setUp();
        await expect(open.run('script debugger listen')).rejects.toThrow();
        expect(open.calls).toEqual([]);
    });

    it('connects with an optional host and port', async () => {
        const { calls, run } = setUp();

        await run('script debugger connect');
        await run('script debugger connect localhost');
        await run('script debugger connect 127.0.0.1 19150');

        expect(calls).toEqual([
            'connect undefined undefined',
            'connect localhost undefined',
            'connect 127.0.0.1 19150'
        ]);
    });

    it('prints a refusal as an error, and nothing when the reply is empty', async () => {
        const refused = setUp({ reply: { ok: false, message: 'Inbound connections are disabled' } });
        await refused.run('script debugger listen 19144');
        expect(refused.errors).toEqual(['Inbound connections are disabled']);
        expect(refused.feedback).toEqual([]);

        // A connection whose handshake BDS refused prints its line in the log, and the command nothing.
        const silent = setUp({ reply: undefined });
        await silent.run('script debugger connect');
        expect([silent.calls, silent.feedback, silent.errors]).toEqual([['connect undefined undefined'], [], []]);
    });

    it('closes on close and on detach', async () => {
        const { calls, feedback, run } = setUp();

        await run('script debugger close');
        await run('script debugger detach');

        expect(calls).toEqual(['close', 'close']);
        expect(feedback).toEqual(['Debugger closed', 'Debugger closed']);
    });

    it('says why it cannot start without behavior pack scripts, and still closes', async () => {
        const { errors, feedback, run } = setUp({ scripts: false });

        await run('script debugger listen 19144');
        await run('script debugger connect');
        await run('script debugger close');

        expect(errors).toEqual([
            'Failed to start debugger: no behavior pack scripts are running',
            'Failed to start debugger: no behavior pack scripts are running'
        ]);
        expect(feedback).toEqual(['Debugger closed']);
    });

    it('needs the permission level BDS gives it', () => {
        expect(setUp().registry.getMetadata('script')?.permissionLevel).toBe(CommandPermissionLevel.ADMIN);
    });
});
