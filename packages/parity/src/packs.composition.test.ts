import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, sep } from 'node:path';
import { afterAll, expect, it } from 'vitest';

import { load, REGISTRY_IDS, routeForPath, isPathAddressedRegistry } from '@jsprismarine/packs';
import type { Definition, PackStack } from '@jsprismarine/packs';

import { FAMILIES } from './families.ts';
import { describeFamily } from './measure.ts';
import { REFERENCES } from './references.ts';

const temporaryDirs: string[] = [];
const temporaryDir = (): string => {
    const dir = mkdtempSync(join(tmpdir(), 'jsp-pack-parity-'));
    temporaryDirs.push(dir);
    return dir;
};

afterAll(() => {
    for (const dir of temporaryDirs) rmSync(dir, { recursive: true, force: true });
});

describeFamily(FAMILIES.packsComposition, [REFERENCES.bedrockBehaviorPack], () => {
    it('matches loading each vanilla layer in order, including path and recipe collisions', () => {
        const checkout = REFERENCES.bedrockBehaviorPack.locate();
        if (checkout === undefined) throw new Error('the vanilla behavior pack is not in the fetch cache');

        const vanilla = join(checkout, 'behavior_pack');
        const pathAddressedFile = readdirSync(vanilla, { recursive: true, withFileTypes: true })
            .filter((entry) => entry.isFile())
            .map((entry) => relative(vanilla, join(entry.parentPath, entry.name)).split(sep).join('/'))
            .find((path) => {
                const registry = routeForPath(path);
                return registry !== undefined && isPathAddressedRegistry(registry);
            });
        if (pathAddressedFile === undefined)
            throw new Error('the vanilla behavior pack has no path-addressed definitions');
        const pathAddressedRegistry = routeForPath(pathAddressedFile);
        if (pathAddressedRegistry === undefined || !isPathAddressedRegistry(pathAddressedRegistry)) {
            throw new Error(`the selected vanilla file is not path-addressed: ${pathAddressedFile}`);
        }

        const manifest = readFileSync(join(vanilla, 'manifest.json'));
        const lowerOverlay = temporaryDir();
        const upperOverlay = temporaryDir();
        const writeOverlay = (root: string, recipeId: string): void => {
            writeFileSync(join(root, 'manifest.json'), manifest);
            const addressedPath = join(root, ...pathAddressedFile.split('/'));
            const recipePath = join(root, 'recipes', 'barrel.json');
            mkdirSync(dirname(addressedPath), { recursive: true });
            mkdirSync(dirname(recipePath), { recursive: true });
            writeFileSync(addressedPath, JSON.stringify({ parity_override: recipeId }));
            writeFileSync(
                recipePath,
                JSON.stringify({
                    format_version: '1.26.0',
                    'minecraft:recipe_shaped': { description: { identifier: recipeId } }
                })
            );
        };

        writeOverlay(lowerOverlay, 'parity:lower_layer');
        writeOverlay(upperOverlay, 'parity:upper_layer');

        const stack: PackStack = [
            { kind: 'directory', path: vanilla },
            { kind: 'directory', path: lowerOverlay },
            { kind: 'directory', path: upperOverlay }
        ];
        const options = { validator: () => [] };
        const composed = load(stack, options).definitions;
        const individualLayers = stack.map((source) => load([source], options).definitions);

        for (const registry of REGISTRY_IDS) {
            const expected = new Map<string, Definition>();
            for (const layer of individualLayers) {
                for (const [identifier, definition] of layer[registry]) expected.set(identifier, definition);
            }
            const entries = (definitions: ReadonlyMap<string, Definition>) =>
                [...definitions].sort(([left], [right]) => left.localeCompare(right));
            expect(entries(composed[registry])).toEqual(entries(expected));
        }

        expect(composed.recipes.has('parity:lower_layer')).toBe(true);
        expect(composed.recipes.has('parity:upper_layer')).toBe(true);
        expect(composed[pathAddressedRegistry].has(pathAddressedFile)).toBe(true);
    });
});
