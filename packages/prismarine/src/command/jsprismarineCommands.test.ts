import type { CommandSource } from '@jsprismarine/commands';
import { CommandRegistry, createCommandSource, testCommandHost } from '@jsprismarine/commands';
import { CommandPermissionLevel } from '@jsprismarine/minecraft';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type Player from '../Player';
import type Server from '../Server';
import type SessionManager from '../SessionManager';
import type BanManager from '../ban/BanManager';
import { stub } from '../testing/stub.test.helper';
import { collectAsyncCommands } from './deferred';
import { registerJsprismarineCommands } from './jsprismarineCommands';

describe("this server's own commands", () => {
    let registry: CommandRegistry<CommandSource>;
    let setBanned: ReturnType<typeof vi.fn<BanManager['setBanned']>>;
    let setUnbanned: ReturnType<typeof vi.fn<BanManager['setUnbanned']>>;
    let kick: ReturnType<typeof vi.fn<Player['kick']>>;
    let feedback: string[];

    beforeEach(() => {
        setBanned = vi.fn<BanManager['setBanned']>(async () => true);
        setUnbanned = vi.fn<BanManager['setUnbanned']>(async () => {});
        kick = vi.fn<Player['kick']>(async () => {});
        feedback = [];

        const target = stub<Player>({
            getName: () => 'testPlayer',
            getFormattedUsername: () => 'testPlayer',
            kick
        });
        const server = stub<Server>({
            getBanManager: () => stub<BanManager>({ setBanned, setUnbanned }),
            getSessionManager: () => stub<SessionManager>({ getAllPlayers: () => [target] }),
            getTPS: () => 18.5,
            getTick: () => 42,
            getVersion: () => '1.2.3-nightly.1'
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
        expect(setBanned).toHaveBeenCalledWith('testPlayer', 'testReason');
        expect(feedback).toEqual(['Banned testPlayer due to: testReason!']);
    });

    it('bans a player without a reason', async () => {
        await run('ban testPlayer');

        expect(kick).toHaveBeenCalledWith('You have been banned!');
        expect(setBanned).toHaveBeenCalledWith('testPlayer');
    });

    it('bans a name nobody online holds, without kicking anyone', async () => {
        await run('ban someoneElse');

        expect(kick).not.toHaveBeenCalled();
        expect(setBanned).toHaveBeenCalledWith('someoneElse');
    });

    it('pardons a name', async () => {
        await run('pardon testPlayer');

        expect(setUnbanned).toHaveBeenCalledWith('testPlayer');
        expect(feedback).toEqual(['Unbanned testPlayer']);
    });

    it('reports the tick rate and the tick', async () => {
        await run('tps');

        expect(feedback).toEqual(['TPS: §e18.50§r (Tick: 42)']);
    });

    it('reports the version with the same v prefix as the startup log', async () => {
        await run('version');

        expect(feedback[0]).toContain('JSPrismarine §ev1.2.3-nightly.1§r');
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
