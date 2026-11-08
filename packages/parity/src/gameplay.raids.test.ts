import { javaEntityTypeToBedrock } from '@jsprismarine/mapping';
import { RAIDER_TABLE, wavesFor } from '@jsprismarine/prismarine/world/raid/RaidManager';
import { expect, it } from 'vitest';

import { FAMILIES } from './families.ts';
import { loadJavaEntityAttributes } from './goldens.ts';
import { describeFamily } from './measure.ts';
import { REFERENCES } from './references.ts';
import { reportParityCases } from './trackerCases.ts';
import { loadVanillaEntityTypes } from './vanillaEntities.ts';

describeFamily(FAMILIES.gameplayRaids, [REFERENCES.bedrockBehaviorPack, REFERENCES.javaEntityAttributes], () => {
    it('spawns only raiders both editions define, over the waves a difficulty runs', () => {
        const types = loadVanillaEntityTypes();
        const java = loadJavaEntityAttributes();
        const raiders = RAIDER_TABLE.map(([type]) => type);

        // The table speaks Java; the pack speaks Bedrock, where an evoker is an `evocation_illager`.
        const bedrockMissing = raiders.filter((type) => {
            const mapping = javaEntityTypeToBedrock(type);
            return mapping.kind !== 'mapped' && mapping.kind !== 'passthrough'
                ? true
                : !types.registry.has(mapping.bedrock);
        });
        const javaMissing = raiders.filter((type) => java[type] === undefined);

        reportParityCases(FAMILIES.gameplayRaids, import.meta.filename, [
            {
                id: 'raiders/definitions',
                title: 'raider table',
                context: 'Every raider type the raid manager spawns has a Bedrock pack definition and Java attributes',
                status: bedrockMissing.length === 0 && javaMissing.length === 0 ? 'passed' : 'failed'
            }
        ]);

        expect(bedrockMissing).toEqual([]);
        expect(javaMissing).toEqual([]);
        // Java runs three, five and seven waves on easy, normal and hard.
        expect([1, 2, 3].map(wavesFor)).toEqual([3, 5, 7]);
        // Each row names a count for the seven waves and the bonus wave.
        expect(RAIDER_TABLE.every(([, perWave]) => perWave.length === 8)).toBe(true);
    });
});
