import type { CommandSource, EntityRef } from '@jsprismarine/commands';
import { CommandRegistry, createCommandSource, testCommandHost } from '@jsprismarine/commands';
import { CommandPermissionLevel } from '@jsprismarine/minecraft';
import { beforeEach, describe, expect, it } from 'vitest';

import type Server from '../Server';
import type { WorldData } from '../config/JsonConfigTypes';
import type SessionManager from '../SessionManager';
import type { StoreActor } from '../entity/data/storeActors';
import type PlayerSession from '../network/PlayerSession';
import type { PermissionManager } from '../permission/PermissionManager';
import { stub } from '../testing/stub.test.helper';
import type { Level } from '../world/Level';
import type { RegisteredLevel } from '../world/LevelRegistry';
import type { World } from '../world/World';
import type WorldManager from '../world/WorldManager';
import { collectAsyncCommands } from './deferred';
import { DEFAULT_CREATED_PRESET, registerWorldCommand, worldSubcommandNode } from './worldCommand';

describe('/world', () => {
    let registry: CommandRegistry<CommandSource>;
    let feedback: string[];
    let errors: string[];
    let created: Array<{ name: string; preset?: string; seed?: string }>;
    let detached: string[];
    /** The nodes Steve, the player entity 7, holds. */
    let granted: Set<string>;

    const steveRef: EntityRef = {
        id: '7',
        type: 'minecraft:player',
        name: 'Steve',
        isPlayer: true,
        position: { x: 0, y: 0, z: 0 },
        rotation: { yaw: 0, pitch: 0 },
        dimension: 'minecraft:overworld'
    };
    /** The entry level's world, where Steve's entity is. */
    let world: World;
    const lobby = stub<Level>({
        name: 'lobby',
        id: '11111111-1111-4111-8111-111111111111',
        worlds: function* () {
            yield world;
        }
    });
    const arena = stub<Level>({ name: 'arena', id: '22222222-2222-4222-8222-222222222222', worlds: function* () {} });
    const stored: RegisteredLevel = {
        id: '33333333-3333-4333-8333-333333333333',
        name: 'archive',
        folder: 'archive',
        state: 'detached',
        world: { seed: 1 }
    };

    beforeEach(() => {
        feedback = [];
        errors = [];
        created = [];
        detached = [];
        granted = new Set();
        const steve = stub<PlayerSession>({
            identity: stub<PlayerSession['identity']>({ name: 'Steve' }),
            getWorld: () => stub<World>({ getLevel: () => lobby })
        });
        world = stub<World>({
            getActor: (runtimeId: bigint): StoreActor | null =>
                runtimeId === 7n ? stub<StoreActor>({ getWorld: () => world, getRuntimeId: () => 7n }) : null,
            viewerOf: (runtimeId: bigint) => (runtimeId === 7n ? steve : undefined)
        });
        const manager = stub<WorldManager>({
            getEntryLevel: () => lobby,
            getLevels: () => [lobby, arena],
            getLevel: (name: string) => [lobby, arena].find((level) => level.name === name),
            getLevelOrigin: (level: Level) => (level === lobby ? 'config' : 'registry'),
            getRegisteredLevels: () => [stored],
            createLevel: async (name: string, world: WorldData) => {
                created.push({ name, preset: world.preset, seed: String(world.seed) });
                return stub<Level>({ name, id: '44444444-4444-4444-8444-444444444444' });
            },
            detachLevel: async (name: string) => void detached.push(name)
        });
        const server = stub<Server>({
            getWorldManager: () => manager,
            getSessionManager: () => stub<SessionManager>({ getSessions: () => [steve] }),
            getPermissionManager: () =>
                stub<PermissionManager>({
                    can: () => {
                        const execute = (node?: string) => node !== undefined && granted.has(node);
                        return { execute, not: () => ({ execute: (node?: string) => !execute(node) }) };
                    }
                })
        });
        registry = new CommandRegistry<CommandSource>();
        registerWorldCommand(registry, server);
    });

    /** Runs one line as the console, or as typed by Steve when `asPlayer` is set. */
    const run = async (line: string, asPlayer = false): Promise<void> => {
        const source = createCommandSource({
            host: testCommandHost({ entities: { select: () => [steveRef] } }),
            ...(asPlayer ? { entity: steveRef, caller: steveRef } : {}),
            permissionLevel: asPlayer ? CommandPermissionLevel.ANY : CommandPermissionLevel.INTERNAL,
            onFeedback: (message) => void feedback.push(message),
            onError: (message) => void errors.push(message)
        });
        await Promise.all(collectAsyncCommands(() => registry.getDispatcher().execute(line, source)));
    };

    it('lists the attached levels with their players and notes, then the detached ones', async () => {
        await run('world list');
        expect(errors).toEqual([]);
        expect(feedback.some((line) => line.includes('lobby (1 online, entry, config)'))).toBe(true);
        expect(feedback.some((line) => line.includes('arena (0 online)'))).toBe(true);
        expect(feedback.some((line) => line.includes(`archive ${stored.id}`))).toBe(true);
    });

    it('creates a level with the default preset and a seed of its own when the command names neither', async () => {
        await run('world create skyblock');
        expect(created).toHaveLength(1);
        expect(created[0]).toMatchObject({ name: 'skyblock', preset: DEFAULT_CREATED_PRESET });
        expect(created[0]?.seed).toMatch(/^-?\d+$/);
    });

    it('passes a named preset and seed through', async () => {
        await run('world create skyblock minecraft:flat 42');
        expect(created).toEqual([{ name: 'skyblock', preset: 'minecraft:flat', seed: '42' }]);
    });

    it("refuses a player who lacks the subcommand's node, and runs it for one who holds it", async () => {
        await run('world detach arena', true);
        expect(detached).toEqual([]);
        expect(errors.join('\n')).toContain(worldSubcommandNode('detach'));

        granted.add(worldSubcommandNode('detach'));
        await run('world detach arena', true);
        expect(detached).toEqual(['arena']);
    });

    it('refuses to move players to a level that is not attached', async () => {
        await run('world tp archive Steve');
        expect(errors).toHaveLength(1);
    });
});
