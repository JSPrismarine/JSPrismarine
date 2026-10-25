import { existsSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildServerContent } from './ServerContent';
import { PACK_STACK_ENV, overlayPackPath, resolvePackStack } from './packStack';

afterEach(() => vi.unstubAllEnvs());

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
});

/**
 * The whole vanilla stack, which needs Mojang's two fetched halves.
 *
 * Off unless `JSP_CONTENT_VANILLA` is set, because CI has no BDS zip and no
 * Java data generator output. Run
 * `pnpm --filter @jsprismarine/bedrock-data run fetch:sources` first.
 */
describe.skipIf(!process.env.JSP_CONTENT_VANILLA)('the vanilla content build', () => {
    it('resolves every palette block from the overlay', () => {
        const content = buildServerContent();

        expect(content.blocks.types.size).toBeGreaterThan(1400);
        expect(content.blocks.table.hardness.length).toBe(content.blocks.palette.stateCount);
        expect(content.items.registry.size).toBeGreaterThan(1600);
    });
});
