import { buildServerContent } from '@jsprismarine/prismarine/content/ServerContent';
import { buildNetworkContentPayloads } from '@jsprismarine/prismarine/editions/bedrock/contentPayloads';
import { isDeepStrictEqual } from 'node:util';
import { beforeAll, expect, it } from 'vitest';

import { FAMILIES } from './families.ts';
import { describeFamily } from './measure.ts';
import { PACK_BLOCK_NAMESPACE, packBlockFixtures } from './packBlocks.ts';
import { creativeItemPropertiesOf, readPackCreativeGolden } from './packCreative.ts';
import { reportParityProgress } from './progress.ts';
import { REFERENCES } from './references.ts';
import { parityCase, reportParityCases } from './trackerCases.ts';

import type { PackCreativeEntry, PackCreativeItemProperties } from './packCreative.ts';

const isPack = (name: string): boolean => name.startsWith(`${PACK_BLOCK_NAMESPACE}:`);

describeFamily(
    FAMILIES.integrationClientPackets,
    [REFERENCES.bedrockBehaviorPack],
    () => {
        let payloads: ReturnType<typeof buildNetworkContentPayloads>;

        // Composing the vanilla behavior pack with the fixtures takes minutes.
        beforeAll(() => {
            const content = buildServerContent({
                packs: {
                    worldPacks: packBlockFixtures().packs.map((pack) => ({
                        kind: 'directory' as const,
                        path: pack.directory
                    }))
                }
            });
            payloads = buildNetworkContentPayloads(content);
        }, 600_000);

        it('files each pack block and item in the creative menu as the pinned BDS does', () => {
            const golden = readPackCreativeGolden();
            const { creative, creativeItems, items } = payloads;

            // The packs' headings follow every vanilla one, so the vanilla indexes still mean
            // the same heading on both sides.
            const vanillaGroups = creative.groups.length - golden.groups.length;
            const packGroups = creative.groups.slice(vanillaGroups).map((group) => ({
                category: group.category,
                name: group.name,
                iconRuntimeId: group.icon.runtimeId
            }));

            const entries: Record<string, PackCreativeEntry> = {};
            creative.entries.forEach((entry, index) => {
                const name = creativeItems[index]?.name;
                if (name === undefined || !isPack(name)) return;
                entries[name] = { group: entry.group, blockRuntimeId: entry.item.blockRuntimeId };
            });
            const firstPackEntry = creativeItems.findIndex((item) => isPack(item.name));
            const trailing = creativeItems.slice(firstPackEntry).filter((item) => !isPack(item.name));

            const registry: Record<string, PackCreativeItemProperties> = {};
            for (const item of items) {
                if (!isPack(item.name) || item.componentData === undefined) continue;
                const properties = creativeItemPropertiesOf(item.componentData);
                if (properties !== undefined) registry[item.name] = properties;
            }

            const context = `CreativeContentPacket against BDS ${golden.server.serverVersion}`;
            const names = [...new Set([...Object.keys(golden.entries), ...Object.keys(entries)])].sort();
            const itemNames = [...new Set([...Object.keys(golden.items), ...Object.keys(registry)])].sort();
            const cases = [
                parityCase(
                    'pack-creative:groups',
                    'the headings the packs open',
                    context,
                    vanillaGroups === golden.vanillaGroups && isDeepStrictEqual(packGroups, golden.groups)
                ),
                parityCase(
                    'pack-creative:order',
                    "the packs' entries follow every vanilla entry",
                    context,
                    firstPackEntry !== -1 && trailing.length === 0
                ),
                ...names.map((name) =>
                    parityCase(
                        `pack-creative:${name}`,
                        name,
                        context,
                        isDeepStrictEqual(entries[name], golden.entries[name])
                    )
                ),
                ...itemNames.map((name) =>
                    parityCase(
                        `pack-creative-registry:${name}`,
                        name,
                        `ItemRegistryPacket creative keys against BDS ${golden.server.serverVersion}`,
                        isDeepStrictEqual(registry[name], golden.items[name])
                    )
                )
            ];
            reportParityCases(FAMILIES.integrationClientPackets, import.meta.filename, cases);
            reportParityProgress(FAMILIES.integrationClientPackets, {
                'pack creative placements matching BDS': cases.filter((record) => record.status === 'passed').length
            });

            expect({ vanillaGroups, groups: packGroups }).toEqual({
                vanillaGroups: golden.vanillaGroups,
                groups: golden.groups
            });
            expect(trailing.map((item) => item.name)).toEqual([]);
            expect(entries).toEqual(golden.entries);
            expect(registry).toEqual(golden.items);
        });
    },
    { tags: ['real-data'] }
);
