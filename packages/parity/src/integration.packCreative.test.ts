import { buildServerContent } from '@jsprismarine/prismarine/content/ServerContent';
import { actorIdentifiersFor } from '@jsprismarine/prismarine/editions/bedrock/actorIdentifiers';
import { buildNetworkContentPayloads } from '@jsprismarine/prismarine/editions/bedrock/contentPayloads';
import { codecForProtocol } from '@jsprismarine/prismarine/network/codec/CodecRegistry';
import { nbtToPlain, readNetworkNbt } from '@jsprismarine/protocol/bedrock/payload';
import { isDeepStrictEqual } from 'node:util';
import { beforeAll, expect, it } from 'vitest';

import { FAMILIES } from './families.ts';
import { describeFamily } from './measure.ts';
import { packActorEntriesOf, readPackActorsGolden } from './packActors.ts';
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
        let content: ReturnType<typeof buildServerContent>;
        let payloads: ReturnType<typeof buildNetworkContentPayloads>;

        // Composing the vanilla behavior pack with the fixtures takes minutes.
        beforeAll(() => {
            // The capture lists the packs in `world_behavior_packs.json` in fixture order, and the
            // server's first entry is the top of its stack. A stack here applies the last pack on
            // top, so the same priority is the reverse order.
            content = buildServerContent({
                packs: {
                    worldPacks: packBlockFixtures()
                        .packs.toReversed()
                        .map((pack) => ({ kind: 'directory' as const, path: pack.directory }))
                }
            });
            payloads = buildNetworkContentPayloads(content);
        }, 600_000);

        it('files each pack block and item in the creative menu as the pinned BDS does', () => {
            const golden = readPackCreativeGolden();
            const { creative, creativeItems, items } = payloads;

            const itemNames = new Map(items.map((item) => [item.runtimeId, item.name]));
            const groups = creative.groups.map((group) => ({
                category: group.category,
                name: group.name,
                icon: itemNames.get(group.icon.runtimeId) ?? ''
            }));

            const entries: Record<string, PackCreativeEntry> = {};
            creative.entries.forEach((entry, index) => {
                const name = creativeItems[index]?.name;
                if (name === undefined || !isPack(name)) return;
                entries[name] = { group: entry.group, blockRuntimeId: entry.item.blockRuntimeId };
            });

            const registry: Record<string, PackCreativeItemProperties> = {};
            for (const item of items) {
                if (!isPack(item.name) || item.componentData === undefined) continue;
                const properties = creativeItemPropertiesOf(item.componentData);
                if (properties !== undefined) registry[item.name] = properties;
            }

            const context = `CreativeContentPacket against BDS ${golden.server.serverVersion}`;
            const names = [...new Set([...Object.keys(golden.entries), ...Object.keys(entries)])].sort();
            const registryNames = [...new Set([...Object.keys(golden.items), ...Object.keys(registry)])].sort();
            const cases = [
                parityCase(
                    'pack-creative:groups',
                    'every heading, with those the packs open among the vanilla ones',
                    context,
                    isDeepStrictEqual(groups, golden.groups)
                ),
                ...names.map((name) =>
                    parityCase(
                        `pack-creative:${name}`,
                        name,
                        context,
                        isDeepStrictEqual(entries[name], golden.entries[name])
                    )
                ),
                ...registryNames.map((name) =>
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

            expect(groups).toEqual(golden.groups);
            expect(entries).toEqual(golden.entries);
            expect(registry).toEqual(golden.items);
        });

        it("lists each pack entity's type in the join's actor list as the pinned BDS does", () => {
            const golden = readPackActorsGolden();
            const vanilla = codecForProtocol(golden.server.protocolVersion)?.context.entityIdentifiers;
            const list = actorIdentifiersFor(vanilla, content).identifiers ?? vanilla;
            if (list === undefined) throw new Error(`No actor list for protocol ${golden.server.protocolVersion}`);
            const ours = packActorEntriesOf(nbtToPlain(readNetworkNbt(list)));

            const context = `AvailableActorIdentifiersPacket against BDS ${golden.server.serverVersion}`;
            const names = [...new Set([...Object.keys(golden.actors), ...Object.keys(ours)])].sort();
            const cases = names.map((name) =>
                parityCase(`pack-actor:${name}`, name, context, isDeepStrictEqual(ours[name], golden.actors[name]))
            );
            reportParityCases(FAMILIES.integrationClientPackets, import.meta.filename, cases);
            reportParityProgress(FAMILIES.integrationClientPackets, {
                'pack actor types matching BDS': cases.filter((record) => record.status === 'passed').length
            });

            expect(ours).toEqual(golden.actors);
        });
    },
    { tags: ['real-data'] }
);
