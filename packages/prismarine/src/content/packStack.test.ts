import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

import { VANILLA_BEHAVIOR_PACK_UUID } from '@jsprismarine/packs';

import { buildServerContent } from './ServerContent';
import { PACK_STACK_ENV, overlayPackPath, resolvePackStack } from './packStack';

afterEach(() => vi.unstubAllEnvs());

const temporaryDirs: string[] = [];
afterAll(() => {
    for (const dir of temporaryDirs) rmSync(dir, { recursive: true, force: true });
});

describe('resolvePackStack', () => {
    it('puts the overlay after the vanilla Bedrock pack and before the world packs', () => {
        vi.stubEnv(PACK_STACK_ENV.vanillaBedrockPack, overlayPackPath());
        vi.stubEnv(PACK_STACK_ENV.vanillaDatapack, '');

        const { stack } = resolvePackStack({
            javaVanilla: false,
            worldPacks: [{ kind: 'directory', path: '/worlds/one' }],
            pluginPacks: [{ kind: 'datapack', path: '/plugins/two' }]
        });

        expect(stack.map((source) => source.path)).toEqual([
            overlayPackPath(),
            overlayPackPath(),
            '/worlds/one',
            '/plugins/two'
        ]);
    });

    it('reports a member that is not on disk instead of throwing', () => {
        vi.stubEnv(PACK_STACK_ENV.vanillaBedrockPack, '/nowhere/bedrock');
        vi.stubEnv(PACK_STACK_ENV.vanillaDatapack, '/nowhere/java');

        const { stack, diagnostics } = resolvePackStack();

        expect(diagnostics.map((diagnostic) => diagnostic.code)).toEqual(['pack.missing', 'pack.missing']);
        expect(diagnostics.every((diagnostic) => diagnostic.severity === 'warning')).toBe(true);
        expect(stack).toHaveLength(1);
    });

    it('always finds the overlay, which ships with @jsprismarine/blocks', () => {
        expect(existsSync(overlayPackPath())).toBe(true);
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
 * The whole vanilla stack, which needs Mojang's two fetched halves.
 *
 * Off unless `JSP_CONTENT_VANILLA` is set, because CI has no BDS zip and no
 * Java data generator output. Run
 * `pnpm --filter @jsprismarine/bedrock-data run fetch:sources` first.
 */
describe.skipIf(!process.env.JSP_CONTENT_VANILLA)('the vanilla content build', () => {
    // Reading, validating and resolving Mojang's two halves takes seconds,
    // which is well past Vitest's five second default.
    it('resolves every palette block from the overlay', { timeout: 180_000 }, () => {
        const content = buildServerContent();

        expect(content.blocks.types.size).toBeGreaterThan(1400);
        expect(content.blocks.table.hardness.length).toBe(content.blocks.palette.stateCount);
        expect(content.items.registry.size).toBeGreaterThan(1600);
    });
});
