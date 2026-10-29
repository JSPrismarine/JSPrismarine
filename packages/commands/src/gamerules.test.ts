import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { reportProgress } from '../../../.test/reportProgress';

import {
    JAVA_GAME_RULES,
    REMOVED_GAME_RULES,
    bedrockGameRuleNames,
    bedrockOnlyGameRuleNames,
    gameRule,
    isRemovedGameRule,
    renamedGameRule
} from './gamerules';

describe('the Java gamerule registry', () => {
    it('keeps each rule addressable by a namespaced registry id', () => {
        const names = JAVA_GAME_RULES.map((rule) => rule.name);

        expect(new Set(names).size).toBe(names.length);
        expect(JAVA_GAME_RULES.every((rule) => rule.name.startsWith('minecraft:'))).toBe(true);
        reportProgress(`${names.length} Java game rules are registered.`);
    });

    it('supports the value types declared by the Java registry', () => {
        const integers = JAVA_GAME_RULES.filter((rule) => rule.type === 'integer');
        const booleans = JAVA_GAME_RULES.filter((rule) => rule.type === 'boolean');

        expect(integers.length + booleans.length).toBe(JAVA_GAME_RULES.length);
        reportProgress(`${booleans.length} boolean and ${integers.length} integer Java game rules are registered.`);
    });

    it('renames the two limits the mcfunction runtime reads', () => {
        expect(renamedGameRule('maxCommandChainLength')).toBe('minecraft:max_command_sequence_length');
        expect(renamedGameRule('maxCommandForkCount')).toBe('minecraft:max_command_forks');
    });

    it('states the bounds and defaults for the three numeric limits, and no others', () => {
        expect(gameRule('minecraft:max_command_sequence_length')).toMatchObject({ min: 0, default: 65_536 });
        expect(gameRule('minecraft:max_command_forks')).toMatchObject({ min: 1, default: 65_536 });
        expect(gameRule('minecraft:max_block_modifications')).toMatchObject({ min: 1, default: 32_768 });
    });

    it('carries the rest of the renames the 1.21.11 changelog names', () => {
        expect(renamedGameRule('commandModificationBlockLimit')).toBe('minecraft:max_block_modifications');
        expect(renamedGameRule('commandBlocksEnabled')).toBe('minecraft:command_blocks_work');
        expect(renamedGameRule('enableCommandBlocks')).toBe('minecraft:command_blocks_work');
        expect(renamedGameRule('sendCommandFeedback')).toBe('minecraft:send_command_feedback');
    });

    it('maps every declared legacy name to its current rule id', () => {
        const legacy = JAVA_GAME_RULES.flatMap((rule) => rule.legacyNames.map((name) => [name, rule.name] as const));

        for (const [name, current] of legacy) expect(renamedGameRule(name)).toBe(current);
        reportProgress(`${legacy.length} legacy game rule names resolve to their current ids.`);
    });

    it('folds the two fire booleans into one radius rather than renaming either', () => {
        const rule = gameRule('doFireTick');

        expect(rule?.name).toBe('minecraft:fire_spread_radius_around_player');
        expect(rule?.type).toBe('integer');
        expect(gameRule('allowFireTicksAwayFromPlayer')).toBe(rule);
    });

    it('names the three removals and refuses to rename them', () => {
        expect(REMOVED_GAME_RULES).toEqual([
            'entitiesWithPassengersCanUsePortals',
            'gameLoopFunction',
            'spawnChunkRadius'
        ]);
        for (const name of REMOVED_GAME_RULES) {
            expect(isRemovedGameRule(name)).toBe(true);
            expect(renamedGameRule(name)).toBeUndefined();
        }
    });

    it('resolves a rule by current id, bare id, legacy name or Bedrock name', () => {
        const rule = gameRule('minecraft:send_command_feedback');

        expect(gameRule('send_command_feedback')).toBe(rule);
        expect(gameRule('sendCommandFeedback')).toBe(rule);
        expect(gameRule('sendcommandfeedback')).toBe(rule);
        expect(gameRule('nonsense')).toBeUndefined();
    });
});

describe('the Bedrock gamerules', () => {
    it('reads its names from Mojang’s own /gamerule enums', () => {
        const { boolean, integer } = bedrockGameRuleNames();

        expect(new Set(boolean).size).toBe(boolean.length);
        expect(new Set(integer).size).toBe(integer.length);
        expect(boolean).toContain('sendcommandfeedback');
        expect(integer).toContain('maxcommandchainlength');
        reportProgress(`${boolean.length} Bedrock boolean and ${integer.length} integer game rules are exposed.`);
    });

    it('names the Bedrock rules Java has no counterpart for', () => {
        expect(bedrockOnlyGameRuleNames()).toEqual([
            'recipesunlock',
            'showcoordinates',
            'showdaysplayed',
            'showtags',
            'respawnblocksexplode',
            'showbordereffect',
            'showrecipemessages',
            'functioncommandlimit'
        ]);
    });

    it('still spells max_command_sequence_length the old way on Bedrock', () => {
        expect(gameRule('minecraft:max_command_sequence_length')?.bedrockName).toBe('maxcommandchainlength');
    });
});

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
const registriesPath = join(
    repoRoot,
    'node_modules/.cache/jsprismarine/java-reports/26.3/generated/reports/registries.json'
);
const hasReport = existsSync(registriesPath);

describe.skipIf(!hasReport)('against Mojang’s own registry report', { tags: ['real-data'] }, () => {
    it('matches the 26.3 minecraft:game_rule registry exactly', () => {
        // The data generator's report, this repository's pinned Java source.
        const registries = JSON.parse(readFileSync(registriesPath, 'utf8')) as {
            'minecraft:game_rule': { entries: Record<string, unknown> };
        };
        const published = Object.keys(registries['minecraft:game_rule'].entries).sort();

        expect(JAVA_GAME_RULES.map((rule) => rule.name).sort()).toEqual(published);
    });
});
