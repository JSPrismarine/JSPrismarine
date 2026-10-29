/**
 * Chunker's five property tests, adopted per
 * docs/research/hybrid-format-prior-art.md section 10 and run one way:
 *
 * 1. every Java palette entry maps;
 * 2. every output carries exactly the declared Bedrock state set;
 * 3. the mapping composed with the reverse index is identity, except for
 *    entries on the reviewed loss list, which must all occur;
 * 4. every output identifier exists in the real Bedrock palette for the
 *    pinned version;
 * 5. every output state value is in that state's real domain.
 *
 * The Bedrock side of truth is this repository's own BDS 1.26.51.1 captures:
 * the block palette snapshot under packages/minecraft/datagen/, and the item
 * table and actor identifier list from @jsprismarine/bedrock-data. The loss
 * lists fail in both directions, as Chunker's do: an unlisted loss fails, and
 * a listed loss that stops occurring fails too.
 */
import { readFileSync } from 'node:fs';

import { entity_identifiers, item_table } from '@jsprismarine/bedrock-data';
import { blockPaletteSnapshotPath } from '@jsprismarine/minecraft/datagen/paths';
import { describe, expect, it } from 'vitest';

import { javaBlockStateToBedrock } from './blockMapping';
import { bedrockBlockStates, javaBlockStates } from './blockStates';
import {
    BEDROCK_BIOME_LOSSES,
    BLOCK_LOSSES,
    BLOCK_STATE_LOSSES,
    BLOCK_MERGES,
    DROPPED_BLOCK_PROPERTIES,
    ENTITY_LOSSES,
    ENTITY_MERGES,
    ITEM_LOSSES,
    ITEM_MERGES,
    PARTIAL_BLOCK_PROPERTY_COLLAPSES,
    REGISTRY_LOSSES,
    UNTRANSLATED_REGISTRIES
} from './lossList';
import { createPackIdentifierResolver } from './packIdentifierResolver';
import { SERVER_SIDE_REGISTRIES } from './packRegistries';
import { MAPPED_REGISTRIES, bedrockBiomeToJava, javaIdentifierToBedrock } from './registryMapping';
import {
    blockStatesTable,
    blocksTable,
    entitiesTable,
    itemsTable,
    javaIdentifiersTable,
    registriesTable
} from './tables';

interface PaletteFile {
    states: Record<string, Record<string, string | number>>;
    domains: Record<string, Record<string, { values: (string | number | boolean)[] }>>;
}
// The repository's own BDS capture is parsed JSON.
const bedrockPalette = JSON.parse(readFileSync(blockPaletteSnapshotPath(), 'utf8')) as PaletteFile;

const normalize = (value: string | number | boolean): string | number =>
    typeof value === 'boolean' ? Number(value) : value;

// Flatten the table's grouped palette into [name, states] targets.
const paletteTargets = blocksTable.statePalette.flatMap(([name, keys, tuples]) =>
    tuples.map((values) => ({
        name: `minecraft:${name}`,
        states: Object.fromEntries(keys.map((key, axis) => [key, values[axis] ?? '']))
    }))
);

// Expand each block's run-length encoded targets into flat palette indices.
const flatTargets = new Map<string, number[]>();
for (const [javaId, entry] of Object.entries(blocksTable.blocks)) {
    const flat: number[] = [];
    for (const run of entry.targets) {
        if (typeof run === 'number') flat.push(run);
        else for (let count = 0; count < run[1]; count++) flat.push(run[0]);
    }
    flatTargets.set(javaId, flat);
}

/** The Java property combination at one in-block state index, in axis order. */
const javaStateAt = (axes: [string, string[]][], index: number): Record<string, string> => {
    const properties: Record<string, string> = {};
    let remainder = index;
    for (let axis = axes.length - 1; axis >= 0; axis--) {
        const [property, values] = axes[axis] ?? ['', []];
        properties[property] = values[remainder % values.length] ?? '';
        remainder = Math.floor(remainder / values.length);
    }
    return properties;
};

describe('property 1: every Java palette entry maps', () => {
    it('maps every state in the generated Java block table or declares its loss', () => {
        for (const [javaId, entry] of Object.entries(blocksTable.blocks)) {
            const axes = Object.entries(entry.properties ?? {});
            const stateCount = axes.reduce((product, [, values]) => product * values.length, 1);
            expect(flatTargets.get(javaId)).toHaveLength(stateCount);
            for (let index = 0; index < stateCount; index++) {
                const result = javaBlockStateToBedrock(javaId, javaStateAt(axes, index));
                if (result.kind === 'loss') {
                    expect(
                        BLOCK_LOSSES.some((loss) => loss.javaId === javaId),
                        javaId
                    ).toBe(true);
                } else expect(result.kind).toBe('mapped');
            }
        }
    });

    it('maps every generated item, entity type, biome and enchantment entry', () => {
        const enchantmentLosses = REGISTRY_LOSSES.filter((loss) => loss.registry === 'enchantment');
        // The loss list never shadows a table entry.
        for (const loss of ENTITY_LOSSES) expect(entitiesTable.entities).not.toHaveProperty(loss.javaId);
        for (const loss of enchantmentLosses) expect(registriesTable.enchantment).not.toHaveProperty(loss.javaId);
    });

    it('keeps reviewed mob effect and potion losses out of generated tables', () => {
        for (const registry of ['mob_effect', 'potion'] as const) {
            const losses = REGISTRY_LOSSES.filter((loss) => loss.registry === registry);
            for (const loss of losses) expect(registriesTable[registry], loss.javaId).not.toHaveProperty(loss.javaId);
        }
    });

    it('round-trips every generated Bedrock biome by id and by identifier', () => {
        const losses: string[] = [];
        for (const [identifier, entry] of Object.entries(registriesTable.bedrockBiomes)) {
            for (const biome of [entry.id, identifier]) {
                const result = bedrockBiomeToJava(biome);
                expect(result.kind, identifier).not.toBe('unknown');
                if (result.kind === 'unknown') continue;
                expect(result.bedrock, identifier).toEqual({ id: entry.id, identifier });
            }
            if (bedrockBiomeToJava(identifier).kind === 'loss') losses.push(identifier);
        }
        // Both directions, as the other loss lists do: every listed loss occurs, and nothing else does.
        expect(losses.sort()).toEqual(BEDROCK_BIOME_LOSSES.map((loss) => loss.bedrockId).sort());
    });

    it('refuses an id and an identifier the pinned Bedrock data does not have', () => {
        expect(bedrockBiomeToJava(9999)).toEqual({ kind: 'unknown', biome: 9999 });
        // Bedrock numbers its biomes sparsely; 50 falls inside the widest gap, 50 to 128.
        expect(bedrockBiomeToJava(50).kind).toBe('unknown');
        // A custom biome has no vanilla id to be stored as, so it is unknown rather than passed through.
        expect(bedrockBiomeToJava('mypack:volcano').kind).toBe('unknown');
    });
});

describe('property 2: every output carries exactly the declared Bedrock state set', () => {
    it('matches the pinned palette key set for each of the distinct targets', () => {
        for (const target of paletteTargets) {
            const declared = bedrockPalette.states[target.name];
            expect(declared, target.name).toBeDefined();
            expect(Object.keys(target.states).sort()).toEqual(Object.keys(declared ?? {}).sort());
        }
    });
});

describe('property 3: the mapping composed with the reverse index is identity except for reviewed losses', () => {
    // The reverse index: each Bedrock target's first Java (block, state index).
    const reverse = new Map<number, { javaId: string; index: number }>();
    for (const [javaId, flat] of flatTargets) {
        flat.forEach((target, index) => {
            if (!reverse.has(target)) reverse.set(target, { javaId, index });
        });
    }

    const droppedByBlock = new Map<string, Set<string>>();
    it('drops exactly the (block, property) pairs on the reviewed list', () => {
        // A property is dropped for a block when, for every pair of its states
        // that differ only in that property, the Bedrock target is the same.
        const computed = new Map<string, string[]>();
        for (const [javaId, entry] of Object.entries(blocksTable.blocks)) {
            const axes = Object.entries(entry.properties ?? {});
            const flat = flatTargets.get(javaId) ?? [];
            for (const [property] of axes) {
                const groups = new Map<string, Set<number>>();
                flat.forEach((target, index) => {
                    const state = javaStateAt(axes, index);
                    const key = JSON.stringify({ ...state, [property]: '' });
                    let group = groups.get(key);
                    if (group === undefined) groups.set(key, (group = new Set()));
                    group.add(target);
                });
                if ([...groups.values()].every((targets) => targets.size === 1)) {
                    computed.set(property, [...(computed.get(property) ?? []), javaId]);
                    let dropped = droppedByBlock.get(javaId);
                    if (dropped === undefined) droppedByBlock.set(javaId, (dropped = new Set()));
                    dropped.add(property);
                }
            }
        }
        expect([...computed.keys()].sort()).toEqual(
            DROPPED_BLOCK_PROPERTIES.map((declared) => declared.property).sort()
        );
        for (const declared of DROPPED_BLOCK_PROPERTIES) {
            const blocks = computed.get(declared.property) ?? [];
            if ('count' in declared.blocks) expect(blocks.length, declared.property).toBeGreaterThan(0);
            else expect(blocks.sort(), declared.property).toEqual([...declared.blocks]);
        }
    });

    it('round-trips every state to itself or a reviewed loss', () => {
        const mergeTargets = new Set(BLOCK_MERGES.map((merge) => merge.bedrockId));
        const partialByBlock = new Map<string, (typeof PARTIAL_BLOCK_PROPERTY_COLLAPSES)[number]>(
            PARTIAL_BLOCK_PROPERTY_COLLAPSES.map((entry) => [entry.block, entry])
        );

        // Merges are an identifier-level fact: a Bedrock identifier receiving
        // more than one Java block, whether or not their states collide.
        const javaBlocksByTarget = new Map<string, Set<string>>();
        for (const [javaId, flat] of flatTargets) {
            for (const target of flat) {
                const name = paletteTargets[target]?.name ?? '';
                let blocks = javaBlocksByTarget.get(name);
                if (blocks === undefined) javaBlocksByTarget.set(name, (blocks = new Set()));
                blocks.add(javaId);
            }
        }
        const observedMerges = [...javaBlocksByTarget.entries()]
            .filter(([, blocks]) => blocks.size > 1)
            .map(([name]) => name);
        expect(observedMerges.sort()).toEqual(BLOCK_MERGES.map((merge) => merge.bedrockId).sort());

        const partialHits = new Set<string>();
        for (const [javaId, entry] of Object.entries(blocksTable.blocks)) {
            const axes = Object.entries(entry.properties ?? {});
            const flat = flatTargets.get(javaId) ?? [];
            flat.forEach((target, index) => {
                const back = reverse.get(target);
                expect(back).toBeDefined();
                if (back === undefined) return;
                if (back.javaId === javaId && back.index === index) {
                    return;
                }
                if (back.javaId !== javaId) {
                    const targetName = paletteTargets[target]?.name ?? '';
                    expect(mergeTargets, `${javaId} -> ${targetName} <- ${back.javaId}`).toContain(targetName);
                    return;
                }
                const mine = javaStateAt(axes, index);
                const theirs = javaStateAt(axes, back.index);
                const dropped: ReadonlySet<string> = droppedByBlock.get(javaId) ?? new Set();
                const partial = partialByBlock.get(javaId);
                for (const property of Object.keys(mine)) {
                    if (mine[property] === theirs[property]) continue;
                    const allowed =
                        dropped.has(property) || partial?.properties.some((declared) => declared === property) === true;
                    expect(allowed, `${javaId}: undeclared collapse of ${property}`).toBe(true);
                    if (!dropped.has(property)) partialHits.add(javaId);
                }
            });
        }
        // The loss lists fail in both directions: every declared partial
        // collapse must actually occur.
        expect([...partialHits].sort()).toEqual(PARTIAL_BLOCK_PROPERTY_COLLAPSES.map((entry) => entry.block).sort());
        // And every block loss is a real table entry mapping onto its fallback.
        for (const loss of BLOCK_LOSSES) {
            const result = javaBlockStateToBedrock(loss.javaId);
            expect(result.kind).toBe('loss');
            if (result.kind === 'loss') expect(result.bedrock.name).toBe(loss.bedrockFallback);
        }
    });

    it('round-trips items, entities, biomes and enchantments except for reviewed merges and losses', () => {
        const javaItemsByIdentifier = new Map<string, Set<string>>();
        for (const [javaId, entry] of Object.entries(itemsTable.items)) {
            let items = javaItemsByIdentifier.get(entry.bedrockIdentifier);
            if (items === undefined) javaItemsByIdentifier.set(entry.bedrockIdentifier, (items = new Set()));
            items.add(javaId);
        }
        const observedItemMerges = [...javaItemsByIdentifier.entries()]
            .filter(([, items]) => items.size > 1)
            .map(([identifier]) => identifier);
        expect(observedItemMerges.sort()).toEqual(ITEM_MERGES.map((merge) => merge.bedrockId).sort());
        for (const loss of ITEM_LOSSES) {
            expect(itemsTable.items[loss.javaId]?.bedrockIdentifier).toBe(loss.bedrockFallback);
        }

        const entityReverse = new Map<string, string>();
        const entityMerges = new Set<string>();
        for (const [javaId, bedrockId] of Object.entries(entitiesTable.entities)) {
            const first = entityReverse.get(bedrockId);
            if (first === undefined) entityReverse.set(bedrockId, javaId);
            else {
                expect(
                    ENTITY_MERGES.map((merge) => merge.bedrockId),
                    `${javaId} and ${first}`
                ).toContain(bedrockId);
                entityMerges.add(bedrockId);
            }
        }
        expect([...entityMerges].sort()).toEqual(ENTITY_MERGES.map((merge) => merge.bedrockId).sort());

        const biomeReverse = new Map<string, string>();
        const biomeLossIds = new Set(
            REGISTRY_LOSSES.filter((loss) => loss.registry === 'biome').map((loss) => loss.javaId)
        );
        for (const [javaId, bedrockId] of Object.entries(registriesTable.biome)) {
            // Prefer the identically named Java biome as the canonical reverse.
            if (!biomeReverse.has(bedrockId) || javaId.endsWith(bedrockId.split(':')[1] ?? '')) {
                biomeReverse.set(bedrockId, javaId);
            }
        }
        for (const [javaId, bedrockId] of Object.entries(registriesTable.biome)) {
            if (biomeReverse.get(bedrockId) !== javaId) {
                expect(biomeLossIds, `${javaId} -> ${bedrockId}`).toContain(javaId);
            }
        }
        for (const loss of REGISTRY_LOSSES.filter((entry) => entry.registry === 'biome')) {
            expect(registriesTable.biome[loss.javaId]).toBe(loss.bedrockFallback);
        }

        const enchantmentReverse = new Map<string, string>();
        for (const [javaId, bedrockId] of Object.entries(registriesTable.enchantment)) {
            expect(enchantmentReverse.has(bedrockId), bedrockId).toBe(false);
            enchantmentReverse.set(bedrockId, javaId);
        }
    });

    it('round-trips biomes through the generated inverse, both ways', () => {
        const biomeLossIds = new Set(
            REGISTRY_LOSSES.filter((loss) => loss.registry === 'biome').map((loss) => loss.javaId)
        );

        // Java to Bedrock and back is identity, except for the five merged Java biomes, which
        // come back as the Bedrock biome's own counterpart.
        const merged: string[] = [];
        for (const javaId of Object.keys(registriesTable.biome)) {
            const forward = javaIdentifierToBedrock('biome', javaId);
            // The ids come out of the table itself, so `unknown` would be it disagreeing with
            // itself rather than anything this test is about.
            if (forward.kind === 'unknown') throw new Error(`the biome table does not map ${javaId}`);
            const bedrockId = forward.kind === 'loss' ? forward.loss.bedrockFallback : forward.bedrock;
            expect(bedrockId, javaId).toBeDefined();
            const back = bedrockBiomeToJava(bedrockId ?? '');
            expect(back.kind, javaId).toBe('mapped');
            if (back.kind !== 'mapped') continue;
            if (back.java !== javaId) merged.push(javaId);
        }
        expect(merged.sort()).toEqual([...biomeLossIds].sort());

        // Bedrock to Java and back is identity for every biome with a Java source.
        for (const [identifier, entry] of Object.entries(registriesTable.bedrockBiomes)) {
            const back = bedrockBiomeToJava(entry.id);
            if (back.kind !== 'mapped') continue;
            expect(javaIdentifierToBedrock('biome', back.java), identifier).toEqual({
                kind: 'mapped',
                bedrock: identifier
            });
        }
    });
});

describe('property 3 for states: the word vocabularies round-trip every state in the palette', () => {
    it('reads back every Bedrock target state unchanged', () => {
        for (const target of paletteTargets) {
            const words = javaBlockStates(target.name, target.states);
            expect(bedrockBlockStates(target.name, words), `${target.name} ${JSON.stringify(words)}`).toEqual(
                target.states
            );
        }
    });

    it('spells a word only where the two editions disagree', () => {
        // The vocabularies exist to be used: an entry that changes nothing would be dead weight,
        // and the generator drops those, so every listed block really does respell something.
        for (const [name, index] of Object.entries(blockStatesTable.blocks)) {
            const vocabulary = blockStatesTable.vocabularies[index];
            expect(vocabulary, name).toBeDefined();
            const respelled = Object.values(vocabulary ?? {}).some((words) =>
                Object.entries(words).some(([word, value]) => word !== String(value))
            );
            expect(respelled, name).toBe(true);
        }
    });

    it('leaves the reviewed losses as the Bedrock value, in both directions', () => {
        for (const loss of BLOCK_STATE_LOSSES) {
            for (const name of loss.blocks) {
                const index = blockStatesTable.blocks[name];
                const vocabulary = index === undefined ? undefined : blockStatesTable.vocabularies[index];
                expect(vocabulary?.[loss.state], `${name}.${loss.state}`).toBeUndefined();
                // So a caller holding the Bedrock value gets it back untouched either way.
                expect(javaBlockStates(name, { [loss.state]: 3 })).toEqual({ [loss.state]: 3 });
                expect(bedrockBlockStates(name, { [loss.state]: 3 })).toEqual({ [loss.state]: 3 });
            }
        }
    });

    it('drops the states a Bedrock block does not carry, and passes an unknown block through', () => {
        // Java's piston `extended`: an extended Bedrock piston is a piston with an arm in front.
        expect(bedrockBlockStates('minecraft:piston', { facing_direction: 'north', extended_bit: true })).toEqual({
            facing_direction: 3
        });
        // And the piston really does spell north differently from everything that is not a piston.
        expect(bedrockBlockStates('minecraft:dropper', { facing_direction: 'north' })).toEqual({
            facing_direction: 2
        });
        // A block the pinned data does not know has nothing to translate against.
        expect(bedrockBlockStates('mypack:turbine', { spin: 'fast' })).toEqual({ spin: 'fast' });
        expect(javaBlockStates('mypack:turbine', { spin: 'fast' })).toEqual({ spin: 'fast' });
    });
});

describe('property 4: every output identifier exists in the real Bedrock data for the pinned version', () => {
    it('block identifiers are in the 1.26.51 palette', () => {
        for (const [name] of blocksTable.statePalette) {
            expect(bedrockPalette.states, name).toHaveProperty(`minecraft:${name}`);
        }
    });

    it('item identifiers are in the 1.26.51 item table', () => {
        for (const entry of Object.values(itemsTable.items)) {
            expect(item_table, entry.bedrockIdentifier).toHaveProperty(entry.bedrockIdentifier);
        }
        for (const loss of ITEM_LOSSES) expect(item_table).toHaveProperty(loss.bedrockFallback);
    });

    it('entity identifiers are in the 1.26.51 actor identifier list', () => {
        // The capture is AvailableActorIdentifiersPacket NBT; the identifier
        // strings are pulled by pattern, the way the research note measured
        // them, because the file is not a plain NBT flavor this repo parses.
        const captured = new Set(entity_identifiers.toString('latin1').match(/minecraft:[a-z0-9_.]+/g));
        expect(entitiesTable.bedrockIdentifiers.sort()).toEqual([...captured].sort());
        for (const bedrockId of Object.values(entitiesTable.entities)) {
            expect(captured, bedrockId).toContain(bedrockId);
        }
        for (const loss of ENTITY_LOSSES) {
            if (loss.kind === 'rerender') expect(captured, loss.javaId).toContain(loss.bedrockFallback ?? '');
        }
    });

    it('mob effect and potion identifiers are in the pinned Bedrock name sets, one Java entry each', () => {
        for (const registry of ['mob_effect', 'potion'] as const) {
            const reverse = new Map<string, string>();
            for (const [javaId, bedrockId] of Object.entries(registriesTable[registry])) {
                expect(registriesTable.bedrock[registry], bedrockId).toContain(bedrockId);
                // Neither registry merges: two Java entries sharing a Bedrock
                // name would be a loss, and there is no row for one.
                expect(reverse.has(bedrockId), bedrockId).toBe(false);
                reverse.set(bedrockId, javaId);
            }
        }
    });

    it('biome and enchantment identifiers are in the pinned Bedrock name sets', () => {
        for (const bedrockId of Object.values(registriesTable.biome)) {
            expect(registriesTable.bedrockBiomes, bedrockId).toHaveProperty(bedrockId);
        }
        for (const loss of REGISTRY_LOSSES) {
            if (loss.registry !== 'biome') continue;
            const fallback = loss.bedrockFallback;
            expect(fallback, loss.javaId).toBeDefined();
            if (fallback !== undefined) expect(registriesTable.bedrockBiomes, fallback).toHaveProperty(fallback);
        }
        for (const bedrockId of Object.values(registriesTable.enchantment)) {
            expect(registriesTable.bedrock.enchantment, bedrockId).toContain(bedrockId);
        }
    });

    it('the inverse names only Java 26.3 biomes, and numbers every Bedrock biome once', () => {
        const ids = new Set<number>();
        for (const [identifier, entry] of Object.entries(registriesTable.bedrockBiomes)) {
            expect(ids.has(entry.id), identifier).toBe(false);
            ids.add(entry.id);
            if (entry.java === undefined) continue;
            expect(registriesTable.biome, entry.java).toHaveProperty(entry.java);
        }
        // Every reviewed inverse loss is a real Bedrock biome with no Java source.
        for (const loss of BEDROCK_BIOME_LOSSES) {
            expect(registriesTable.bedrockBiomes[loss.bedrockId], loss.bedrockId).toBeDefined();
            expect(registriesTable.bedrockBiomes[loss.bedrockId]?.java, loss.bedrockId).toBeUndefined();
        }
    });
});

describe("property 5: every output state value is in that state's real domain", () => {
    it('block state values are inside the 1.26.51 palette domains', () => {
        for (const target of paletteTargets) {
            const domains = bedrockPalette.domains[target.name];
            expect(domains, target.name).toBeDefined();
            for (const [key, value] of Object.entries(target.states)) {
                const domain = (domains?.[key]?.values ?? []).map(normalize);
                expect(domain, `${target.name} ${key}=${value}`).toContain(value);
            }
        }
    });
});

/**
 * The census is the sixth property, and the one Chunker has no equivalent
 * for: it is what lets the loader call its coverage total for the registries
 * no Bedrock table answers. The checks keep it from becoming a blanket pass.
 */
describe('the Java identifier census', () => {
    it('holds exactly the registries the classification declares, and no mapped one', () => {
        const declared = [
            ...SERVER_SIDE_REGISTRIES.map((entry) => entry.registry),
            ...UNTRANSLATED_REGISTRIES.map((entry) => entry.registry)
        ].sort();
        expect(Object.keys(javaIdentifiersTable.registries).sort()).toEqual(declared);
        // A registry in both halves would be allow-listed and waved through
        // at once, and a mapped registry does not belong here at all.
        expect(new Set(declared).size).toBe(declared.length);
        for (const registry of [...MAPPED_REGISTRIES, 'item', 'block', 'entity_type']) {
            expect(javaIdentifiersTable.registries, registry).not.toHaveProperty(registry);
        }
    });

    it('lists only namespaced minecraft identifiers, each once', () => {
        for (const [registry, ids] of Object.entries(javaIdentifiersTable.registries)) {
            expect(ids.length, registry).toBeGreaterThan(0);
            expect(new Set(ids).size, registry).toBe(ids.length);
            for (const id of ids) expect(id.startsWith('minecraft:'), `${registry} ${id}`).toBe(true);
        }
    });

    it('resolves a census registry only for entries the pinned data publishes', () => {
        const resolver = createPackIdentifierResolver();
        expect(resolver.resolve('game_event', 'minecraft:step')).toBe('known');
        expect(resolver.resolve('worldgen/structure', 'minecraft:ancient_city')).toBe('known');
        expect(resolver.resolve('painting_variant', 'minecraft:kebab')).toBe('loss');
        expect(resolver.resolve('game_event', 'minecraft:not_an_event')).toBe('unknown');
        // No passthrough: a custom structure has no path to a Bedrock client.
        expect(resolver.resolve('worldgen/structure', 'myaddon:tower')).toBe('unknown');
        expect(resolver.resolve('chat_type', 'minecraft:chat')).toBe('unknown');
    });
});
