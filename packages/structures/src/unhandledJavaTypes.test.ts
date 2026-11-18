import { StructuresErrors } from '@jsprismarine/errors/structures';
import { it } from 'vitest';

import { describeWithJavaRegistries, expectRegistryCovered, recognizesType } from '../../../.test/javaRegistries';
import { BLOCK_ENTITY_MODIFIER_TYPES, createProcessor, POS_RULE_TEST_TYPES, RULE_TEST_TYPES } from './processors';
import {
    UNHANDLED_POS_RULE_TEST,
    UNHANDLED_RULE_BLOCK_ENTITY_MODIFIER,
    UNHANDLED_RULE_TEST,
    UNHANDLED_STRUCTURE_PROCESSOR
} from './unhandledJavaTypes';

/** Whether a type list declares an id; the rule test and modifier readers are not exported. */
const declares =
    (types: readonly string[]) =>
    (id: string): boolean =>
        types.includes(id);

describeWithJavaRegistries('every type the pinned Java registry report lists', { tags: ['real-data'] }, () => {
    it('has a processor or a reviewed entry', () => {
        expectRegistryCovered({
            registry: 'minecraft:worldgen/structure_processor',
            handles: recognizesType(
                (type) => createProcessor({ processor_type: type }),
                (error) => error instanceof StructuresErrors.ProcessorUnknownProcessorType
            ),
            unhandled: UNHANDLED_STRUCTURE_PROCESSOR
        });
    });

    it('has a rule test or a reviewed entry', () => {
        expectRegistryCovered({
            registry: 'minecraft:rule_test',
            handles: declares(RULE_TEST_TYPES),
            unhandled: UNHANDLED_RULE_TEST
        });
    });

    it('has a position rule test or a reviewed entry', () => {
        expectRegistryCovered({
            registry: 'minecraft:pos_rule_test',
            handles: declares(POS_RULE_TEST_TYPES),
            unhandled: UNHANDLED_POS_RULE_TEST
        });
    });

    it('has a block entity modifier or a reviewed entry', () => {
        expectRegistryCovered({
            registry: 'minecraft:rule_block_entity_modifier',
            handles: declares(BLOCK_ENTITY_MODIFIER_TYPES),
            unhandled: UNHANDLED_RULE_BLOCK_ENTITY_MODIFIER
        });
    });
});
