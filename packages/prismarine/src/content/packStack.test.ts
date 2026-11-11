import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

import { VANILLA_BEHAVIOR_PACK_UUID } from '@jsprismarine/packs';

import { reportProgress } from '../../../../.test/reportProgress';

import { buildServerContent } from './ServerContent';
import {
    entityOverlayPackPath,
    fingerprintPackDirectories,
    PACK_STACK_ENV,
    overlayPackPath,
    resolvePackStack
} from './packStack';

afterEach(() => vi.unstubAllEnvs());

const temporaryDirs: string[] = [];
afterAll(() => {
    for (const dir of temporaryDirs) rmSync(dir, { recursive: true, force: true });
});

describe('resolvePackStack', () => {
    it('puts the overlay after the vanilla Bedrock pack and before the world packs', () => {
        vi.stubEnv(PACK_STACK_ENV.vanillaBedrockPack, overlayPackPath());
        vi.stubEnv(PACK_STACK_ENV.vanillaDatapack, '');

        const { stack, cache } = resolvePackStack({
            javaVanilla: false,
            worldPacks: [{ kind: 'directory', path: '/worlds/one' }],
            pluginPacks: [{ kind: 'datapack', path: '/plugins/two' }]
        });

        expect(stack.map((source) => source.path)).toEqual([
            overlayPackPath(),
            overlayPackPath(),
            entityOverlayPackPath(),
            '/worlds/one',
            '/plugins/two'
        ]);
        expect(cache).toMatchObject({ prefixLength: 3, validatorKey: 'structural-validator-v1' });
    });

    it('reports a member that is not on disk instead of throwing', () => {
        vi.stubEnv(PACK_STACK_ENV.vanillaBedrockPack, '/nowhere/bedrock');
        vi.stubEnv(PACK_STACK_ENV.vanillaDatapack, '/nowhere/java');

        const { stack, diagnostics } = resolvePackStack();

        expect(diagnostics.map((diagnostic) => diagnostic.code)).toEqual(['pack.missing', 'pack.missing']);
        expect(diagnostics.every((diagnostic) => diagnostic.severity === 'warning')).toBe(true);
        expect(stack).toHaveLength(2);
    });

    it('always finds the overlay, which ships with @jsprismarine/blocks', () => {
        expect(existsSync(overlayPackPath())).toBe(true);
    });

    it('always finds the entity overlay, which ships with @jsprismarine/entities', () => {
        expect(existsSync(entityOverlayPackPath())).toBe(true);
    });

    it('reads a path with a manifest at its root as one composed pack', () => {
        // The overlay is a loose pack folder, which is also the shape
        // `bedrock-samples` publishes and the shape somebody unpacking a pack
        // by hand points the override at.
        vi.stubEnv(PACK_STACK_ENV.vanillaBedrockPack, overlayPackPath());

        const { stack } = resolvePackStack({ overlay: false, javaVanilla: false });

        expect(stack).toEqual([{ kind: 'directory', path: overlayPackPath() }]);
    });

    describe('over a folder of BDS layers', () => {
        /** A folder of layer folders, which is what a path with no root manifest is. */
        const layers = (): string => {
            const folder = mkdtempSync(join(tmpdir(), 'jsp-pack-stack-'));
            temporaryDirs.push(folder);
            return folder;
        };

        it('composes the vanilla behavior pack alone', () => {
            const folder = layers();
            vi.stubEnv(PACK_STACK_ENV.vanillaBedrockPack, folder);

            const { stack } = resolvePackStack({ overlay: false, javaVanilla: false });

            expect(stack).toEqual([{ kind: 'brarchiveLayers', path: folder, uuids: [VANILLA_BEHAVIOR_PACK_UUID] }]);
        });

        it('composes the packs a caller names instead', () => {
            const folder = layers();
            const chemistry = '6baf8b62-8948-4c99-bb1e-a0cb35dc4579';
            vi.stubEnv(PACK_STACK_ENV.vanillaBedrockPack, folder);

            const { stack } = resolvePackStack({
                overlay: false,
                javaVanilla: false,
                bedrockPacks: [VANILLA_BEHAVIOR_PACK_UUID, chemistry]
            });

            expect(stack).toEqual([
                { kind: 'brarchiveLayers', path: folder, uuids: [VANILLA_BEHAVIOR_PACK_UUID, chemistry] }
            ]);
        });

        it("composes every pack in the folder for a caller that asks for 'all'", () => {
            const folder = layers();
            vi.stubEnv(PACK_STACK_ENV.vanillaBedrockPack, folder);

            const { stack } = resolvePackStack({ overlay: false, javaVanilla: false, bedrockPacks: 'all' });

            expect(stack).toEqual([{ kind: 'brarchiveLayers', path: folder, uuids: undefined }]);
        });
    });
});

/**
 * Items and the eye of ender have no entity file in Mojang's pack, so the entity overlay ships the
 * built-in definitions ADR 0008 asks for. A pack later in the stack replaces either one.
 */
describe('the built-in entity definitions', () => {
    const entityPack = (identifier: string, width: number): string => {
        const directory = mkdtempSync(join(tmpdir(), 'jsp-entity-pack-'));
        temporaryDirs.push(directory);
        mkdirSync(join(directory, 'entities'));
        writeFileSync(
            join(directory, 'manifest.json'),
            JSON.stringify({
                format_version: 2,
                header: { name: 'test', uuid: '0f6f3b55-58d4-4b8f-a0c4-6e2a0a6f9a10', version: [1, 0, 0] },
                modules: [{ type: 'data', uuid: '6c51e1a5-8f0b-4f7a-9c43-0d9a3a2d7f11', version: [1, 0, 0] }]
            })
        );
        writeFileSync(
            join(directory, 'entities', 'replaced.json'),
            JSON.stringify({
                format_version: '1.26.20',
                'minecraft:entity': {
                    description: { identifier, is_spawnable: false, is_summonable: true },
                    components: { 'minecraft:collision_box': { width, height: width } }
                }
            })
        );
        return directory;
    };

    it('declares the dropped item and the eye of ender with their host components', () => {
        const { entities } = buildServerContent({ stack: [{ kind: 'directory', path: entityOverlayPackPath() }] });

        expect(entities.registry.get('minecraft:item')?.declaredComponents).toContain('jsprismarine:item');
        expect(entities.registry.get('minecraft:eye_of_ender_signal')?.declaredComponents).toContain(
            'jsprismarine:eye_of_ender_signal'
        );
    });

    it.each(['minecraft:item', 'minecraft:eye_of_ender_signal'])('lets a later pack replace %s', (identifier) => {
        const { entities } = buildServerContent({
            stack: [
                { kind: 'directory', path: entityOverlayPackPath() },
                { kind: 'directory', path: entityPack(identifier, 0.5) }
            ]
        });

        const type = entities.registry.get(identifier);
        expect(type?.declaredComponents).toEqual(['minecraft:collision_box']);
    });
});

describe('vanilla overlay cache fingerprint', () => {
    it('changes when an overlay file changes at the same path', () => {
        const directory = mkdtempSync(join(tmpdir(), 'jsp-overlay-fingerprint-'));
        temporaryDirs.push(directory);
        mkdirSync(join(directory, 'entities'));
        const definition = join(directory, 'entities', 'robot.json');
        writeFileSync(definition, '{"first":true}');

        const before = fingerprintPackDirectories([directory]);
        writeFileSync(definition, '{"first":false}');

        expect(fingerprintPackDirectories([directory])).not.toBe(before);
    });
});

/**
 * The whole vanilla stack, which needs Mojang's two fetched halves.
 *
 * Off unless `JSP_CONTENT_VANILLA` is set, because CI has no BDS zip and no
 * Java data generator output. Run
 * `pnpm --filter @jsprismarine/bedrock-data run fetch:sources` first.
 */
describe.skipIf(!process.env.JSP_CONTENT_VANILLA)('the vanilla content build', { tags: ['real-data'] }, () => {
    // Reading, validating and resolving Mojang's two halves takes seconds,
    // which is well past Vitest's five second default.
    it('resolves every palette block from the overlay', { timeout: 180_000 }, () => {
        const content = buildServerContent();

        expect(content.blocks.palette.entries.every((entry) => content.blocks.types.has(entry.identifier))).toBe(true);
        expect(content.blocks.table.hardness.length).toBe(content.blocks.palette.stateCount);
        expect(content.items.registry.has('minecraft:stone')).toBe(true);
        expect(content.items.registry.has('minecraft:diamond_pickaxe')).toBe(true);
    });

    it('registers vanilla entities and the internal falling-block definition', { timeout: 180_000 }, () => {
        const content = buildServerContent();

        reportProgress(`The vanilla content build registered ${content.entities.registry.size} entities.`);
        expect(content.entities.registry.size).toBeGreaterThan(0);
        expect(content.entities.registry.has('minecraft:falling_block')).toBe(true);
        // The one exception is the type an actor no pack declares is held under, which never goes
        // on the wire: its actor reports the identifier the actor was saved with.
        expect(content.entities.registry.keys().filter((id) => !id.startsWith('minecraft:'))).toEqual(['jsprismarine:inert_actor']);
    });

    it('starts clean, with every warning left naming something the server does not do', { timeout: 180_000 }, () => {
        const { diagnostics } = buildServerContent();
        const remaining = new Map<string, number>();
        for (const diagnostic of diagnostics) remaining.set(diagnostic.code, (remaining.get(diagnostic.code) ?? 0) + 1);

        expect(diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([]);
        reportProgress(
            `Remaining vanilla build warnings: ${
                Object.entries(Object.fromEntries(remaining))
                    .map(([code, count]) => `${code}=${count}`)
                    .join(', ') || 'none'
            }.`
        );
    });
});
