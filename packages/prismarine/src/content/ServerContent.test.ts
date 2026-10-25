import { PackLoadError } from '@jsprismarine/packs';
import { describe, expect, it } from 'vitest';

import { buildServerContent } from './ServerContent';
import { definitionOf, definitionsOf, emptyDefinitions } from './ContentOptions';
import { FIXTURE_BLOCKS, fixtureBlockPalette, fixtureContentOptions, fixtureDefinitions } from './testing';

describe('buildServerContent', () => {
    it('populates every registry from one pack stack', () => {
        const content = buildServerContent(fixtureContentOptions());

        expect([...content.blocks.types.keys()].sort()).toEqual([...FIXTURE_BLOCKS].sort());
        expect(content.items.registry.size).toBe(3);
        expect(content.entities.registry.keys()).toContain('minecraft:cow');
        expect(content.recipes.recipes.map((recipe) => recipe.id)).toEqual(['minecraft:torch']);
        expect(content.loot.ids).toEqual(['minecraft:blocks/stone']);
        expect(content.advancements.get('minecraft:story/root')).toBeDefined();
        expect(content.enchantments.ids).toEqual(['minecraft:fortune']);
        expect(content.spawnRules.map((rule) => rule.identifier)).toEqual(['minecraft:cow']);
        expect([...content.tradeTables.keys()]).toEqual(['trading/economy_trades/farmer_trades.json']);
        expect(content.biomes.keys()).toEqual(['minecraft:plains']);
        expect(content.features.keys()).toEqual(['minecraft:single_stone_feature']);
        expect(content.tags.members('block', 'minecraft:mineable/pickaxe')).toEqual([...FIXTURE_BLOCKS]);
    });

    it('leaves the registries nothing sources empty rather than absent', () => {
        const content = buildServerContent(
            fixtureContentOptions({ load: () => ({ definitions: emptyDefinitions(), diagnostics: [] }) })
        );

        expect(content.structures.size).toBe(0);
        expect(content.featureRules.size).toBe(0);
        expect(content.tags.registries).toEqual([]);
    });

    it('attaches the vanilla block behavior families to the blocks they cover', () => {
        const content = buildServerContent(fixtureContentOptions());

        expect(content.blocks.behaviors.names()).toHaveLength(49);
        expect(
            content.blocks.types
                .get('minecraft:redstone_lamp')
                ?.state()
                .content.behaviors.map((bound) => bound.name)
        ).toEqual(['jsprismarine:redstone']);
        expect(
            content.blocks.types
                .get('minecraft:stone')
                ?.state()
                .content.behaviors.map((bound) => bound.name)
        ).toEqual(['jsprismarine:plain_block']);
    });

    it('attaches the vanilla item behavior families to the items they cover', () => {
        const content = buildServerContent(fixtureContentOptions());

        expect(content.items.behaviors.names().length).toBeGreaterThan(0);
        expect(
            content.items.registry.get('minecraft:diamond_pickaxe')?.behaviors.map((bound) => bound.name)
        ).not.toHaveLength(0);
    });

    it('registers all 170 goals ahead of the reference entity components', () => {
        const content = buildServerContent(fixtureContentOptions());

        expect(content.entities.components.has('minecraft:behavior.float')).toBe(true);
        expect(content.entities.brains.size).toBe(20);
    });

    it('flattens the hot block columns so a runtime id indexes them', () => {
        const content = buildServerContent(fixtureContentOptions());
        const palette = content.blocks.palette;

        expect(content.blocks.table.hardness.length).toBe(palette.stateCount);
        expect(content.blocks.table.hardness[palette.runtimeId('minecraft:stone')]).toBeCloseTo(1.5);
        expect(content.blocks.table.lightEmission[palette.runtimeId('minecraft:redstone_lamp', { lit: true })]).toBe(
            15
        );
        expect(content.blocks.table.friction[palette.runtimeId('minecraft:stone')]).toBeCloseTo(0.6);
    });

    it('flattens the hot item columns so a registry id indexes them', () => {
        const content = buildServerContent(fixtureContentOptions());
        const pickaxe = content.items.registry.idOf('minecraft:diamond_pickaxe')!;

        expect(content.items.facts.maxStackSize.length).toBe(content.items.registry.size);
        expect(content.items.facts.maxStackSize[pickaxe]).toBe(1);
        expect(content.items.facts.maxDamage[pickaxe]).toBe(1561);
    });

    it('fails on a bad pack in strict mode and loads short without it', () => {
        const broken = definitionsOf({
            blocks: new Map([['minecraft:stone', definitionOf('blocks', 'minecraft:stone', { nonsense: true })]])
        });
        const load = (_stack: unknown, options: { strict?: boolean }) => {
            const diagnostics = [
                { severity: 'error' as const, code: 'definition.invalid-json', pack: 'bad', message: 'unexpected {' }
            ];
            if (options.strict) throw new PackLoadError(diagnostics);
            return { definitions: broken, diagnostics };
        };

        expect(() =>
            buildServerContent({ load, strict: true, blockPalette: fixtureBlockPalette(), itemDefinitions: [] })
        ).toThrow(PackLoadError);

        const content = buildServerContent({ load, blockPalette: fixtureBlockPalette(), itemDefinitions: [] });
        expect(content.diagnostics.some((diagnostic) => diagnostic.code === 'definition.invalid-json')).toBe(true);
    });

    it('keeps the loaded definitions reachable for the subsystems still reading them directly', () => {
        const content = buildServerContent(fixtureContentOptions());

        expect(content.definitions.blocks.size).toBe(fixtureDefinitions().blocks.size);
    });
});
