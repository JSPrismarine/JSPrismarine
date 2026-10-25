import { describe, expect, it } from 'vitest';

import { GameRuleType } from './StartGamePacket';

import type {
    BlockProperty,
    ExperimentToggle,
    GameRule,
    GatheringJoinInfo,
    ItemRegistryEntry,
    ServerJoinInformation,
    Vec3Like,
    WireUUID
} from './index';

/**
 * A payload is only half of a packet's public interface. The other half is the member types a
 * caller needs to build one, and a consumer that has to deep import `./packet/StartGamePacket`
 * to name a block property is pinned to this package's file layout rather than to its exports.
 */
describe('the packet index', () => {
    it('exports the member types a StartGame payload is built from', () => {
        const position: Vec3Like = { x: 0, y: 64, z: 0 };
        const rule: GameRule = { name: 'showcoordinates', editable: true, type: GameRuleType.BOOL, value: true };
        const experiment: ExperimentToggle = { name: 'data_driven_items', enabled: true };
        const uuid: WireUUID = { mostSignificantBits: 1n, leastSignificantBits: 2n };
        const block: BlockProperty = { name: 'minecraft:red_shrub', definition: Buffer.alloc(0) };
        const gathering: GatheringJoinInfo = { experienceId: uuid };
        const join: ServerJoinInformation = { gathering };

        expect([position.y, rule.type, experiment.enabled, block.name, join.gathering?.experienceId]).toEqual([
            64,
            GameRuleType.BOOL,
            true,
            'minecraft:red_shrub',
            uuid
        ]);
    });

    it('exports the entry type an ItemRegistry payload is a list of', () => {
        const entry: ItemRegistryEntry = { name: 'minecraft:stick', runtimeId: 1, componentBased: false, version: 0 };

        expect(entry.name).toBe('minecraft:stick');
    });
});
