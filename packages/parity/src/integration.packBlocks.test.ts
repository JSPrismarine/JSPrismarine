import { parseBlockDefinition } from '@jsprismarine/blocks';
import { buildBlockProperties, nbtToPlain, readNetworkNbt } from '@jsprismarine/protocol/bedrock/payload';
import { isDeepStrictEqual } from 'node:util';
import { expect, it } from 'vitest';

import { FAMILIES } from './families.ts';
import { isRecord } from './isRecord.ts';
import { describeFamily } from './measure.ts';
import { packBlockFixtures, readPackBlocksGolden } from './packBlocks.ts';
import { reportParityProgress } from './progress.ts';
import { parityCase, reportParityCases } from './trackerCases.ts';

/**
 * A definition without its `block_id`. The server numbers a pack's blocks from 10000 in an order
 * of its own, so the number says nothing about the block; what the client is told about it does.
 */
const withoutBlockId = (definition: unknown): unknown => {
    if (!isRecord(definition) || !isRecord(definition.vanilla_block_data)) return definition;
    const { block_id: _blockId, ...data } = definition.vanilla_block_data;
    return { ...definition, vanilla_block_data: data };
};

describeFamily(FAMILIES.integrationClientPackets, [], () => {
    it('defines each pack block for a joining client as the pinned BDS does', () => {
        const { blocks } = packBlockFixtures();
        const golden = readPackBlocksGolden();
        const documents = blocks.map((block) => {
            const { document, diagnostics } = parseBlockDefinition(block.data, {
                pack: block.pack.name,
                path: block.path,
                minEngineVersion: block.pack.minEngineVersion
            });
            expect(
                diagnostics.filter((diagnostic) => diagnostic.severity === 'error'),
                block.path
            ).toEqual([]);
            if (document === undefined) throw new Error(`${block.pack.name}/${block.path} did not parse`);
            return document;
        });
        const { properties } = buildBlockProperties(documents, { fromPacks: true });

        const cases = properties.map((property) => {
            const ours = withoutBlockId(nbtToPlain(readNetworkNbt(property.definition)));
            const theirs = withoutBlockId(golden.blocks[property.name]);
            return {
                record: parityCase(
                    `pack-block:${property.name}`,
                    property.name,
                    `StartGamePacket.blockProperties against BDS ${golden.server.serverVersion}`,
                    isDeepStrictEqual(ours, theirs)
                ),
                ours,
                theirs
            };
        });
        reportParityCases(
            FAMILIES.integrationClientPackets,
            import.meta.filename,
            cases.map(({ record }) => record)
        );
        reportParityProgress(FAMILIES.integrationClientPackets, {
            'pack block definitions matching BDS': cases.filter(({ record }) => record.status === 'passed').length
        });

        expect(properties.map((property) => property.name).sort()).toEqual(Object.keys(golden.blocks).sort());
        for (const { record, ours, theirs } of cases) expect(ours, record.title).toEqual(theirs);
    });
});
