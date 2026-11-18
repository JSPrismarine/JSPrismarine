import { FeaturesErrors } from '@jsprismarine/errors/features';
import { it } from 'vitest';

import { describeWithJavaRegistries, expectRegistryCovered, recognizesType } from '../../../.test/javaRegistries';
import { FEATURE_TYPES } from './features/Feature';
import { parseRuleTest } from './features/ruleTest';
import { parsePlacementModifier } from './placement/modifiers';
import { parseBlockPredicate } from './providers/blockPredicate';
import { parseBlockStateProvider } from './providers/blockStateProvider';
import { parseHeightProvider } from './providers/heightProvider';
import { parseFloatProvider, parseIntProvider } from './providers/valueProviders';
import {
    UNHANDLED_BLOCK_PREDICATE_TYPE,
    UNHANDLED_BLOCK_STATE_PROVIDER_TYPE,
    UNHANDLED_FEATURE_TYPE,
    UNHANDLED_FLOAT_PROVIDER_TYPE,
    UNHANDLED_HEIGHT_PROVIDER_TYPE,
    UNHANDLED_INT_PROVIDER_TYPE,
    UNHANDLED_PLACEMENT_MODIFIER_TYPE,
    UNHANDLED_RULE_TEST
} from './unhandledJavaTypes';

describeWithJavaRegistries('every type the pinned Java registry report lists', { tags: ['real-data'] }, () => {
    it('has a feature reader or a reviewed entry', () => {
        expectRegistryCovered({
            registry: 'minecraft:worldgen/feature_type',
            handles: (id) => FEATURE_TYPES.some((type) => `minecraft:${type}` === id),
            unhandled: UNHANDLED_FEATURE_TYPE
        });
    });

    it('has a placement modifier reader or a reviewed entry', () => {
        expectRegistryCovered({
            registry: 'minecraft:worldgen/placement_modifier_type',
            handles: recognizesType(
                (type, path) => parsePlacementModifier({ type }, path),
                (error) => error instanceof FeaturesErrors.UnknownPlacementModifierType
            ),
            unhandled: UNHANDLED_PLACEMENT_MODIFIER_TYPE
        });
    });

    it('has a block predicate reader or a reviewed entry', () => {
        expectRegistryCovered({
            registry: 'minecraft:block_predicate_type',
            handles: recognizesType(
                (type, path) => parseBlockPredicate({ type }, path),
                (error) => error instanceof FeaturesErrors.UnknownBlockPredicateType
            ),
            unhandled: UNHANDLED_BLOCK_PREDICATE_TYPE
        });
    });

    it('has a block state provider reader or a reviewed entry', () => {
        expectRegistryCovered({
            registry: 'minecraft:worldgen/block_state_provider_type',
            handles: recognizesType(
                (type, path) => parseBlockStateProvider({ type }, path),
                (error) => error instanceof FeaturesErrors.UnknownBlockStateProviderType
            ),
            unhandled: UNHANDLED_BLOCK_STATE_PROVIDER_TYPE
        });
    });

    it('has a height provider reader or a reviewed entry', () => {
        expectRegistryCovered({
            registry: 'minecraft:height_provider_type',
            handles: recognizesType(
                (type, path) => parseHeightProvider({ type }, path),
                (error) => error instanceof FeaturesErrors.UnknownHeightProviderType
            ),
            unhandled: UNHANDLED_HEIGHT_PROVIDER_TYPE
        });
    });

    it('has an int provider reader or a reviewed entry', () => {
        expectRegistryCovered({
            registry: 'minecraft:int_provider_type',
            handles: recognizesType(
                (type, path) => parseIntProvider({ type }, path),
                (error) => error instanceof FeaturesErrors.UnknownIntProviderType
            ),
            unhandled: UNHANDLED_INT_PROVIDER_TYPE
        });
    });

    it('has a float provider reader or a reviewed entry', () => {
        expectRegistryCovered({
            registry: 'minecraft:float_provider_type',
            handles: recognizesType(
                (type, path) => parseFloatProvider({ type }, path),
                (error) => error instanceof FeaturesErrors.UnknownFloatProviderType
            ),
            unhandled: UNHANDLED_FLOAT_PROVIDER_TYPE
        });
    });

    it('has a rule test reader or a reviewed entry', () => {
        expectRegistryCovered({
            registry: 'minecraft:rule_test',
            handles: recognizesType(
                (type, path) => parseRuleTest({ predicate_type: type }, path),
                (error) => error instanceof FeaturesErrors.UnknownRuleTestType
            ),
            unhandled: UNHANDLED_RULE_TEST
        });
    });
});
