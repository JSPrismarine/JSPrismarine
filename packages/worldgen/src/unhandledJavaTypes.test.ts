import { WorldgenErrors } from '@jsprismarine/errors/worldgen';
import { it } from 'vitest';

import { describeWithJavaRegistries, expectRegistryCovered, recognizesType } from '../../../.test/javaRegistries';
import { parseCarver } from './carver/Carver';
import { parseDensityFunction } from './density/parse';
import { MaterialRuleData } from './surface/MaterialRule';
import {
    UNHANDLED_CARVER_TYPE,
    UNHANDLED_DENSITY_FUNCTION_TYPE,
    UNHANDLED_MATERIAL_CONDITION_TYPE,
    UNHANDLED_MATERIAL_RULE_TYPE
} from './unhandledJavaTypes';

/** Fails a probe that reaches another registered document; the probes name none. */
const noReferences = (reference: unknown): never => {
    throw new TypeError(`the probe names no registered document, but ${String(reference)} was resolved`);
};

const surface = new MaterialRuleData({ materialRules: new Map(), materialConditions: new Map() }, noReferences);

describeWithJavaRegistries('every type the pinned Java registry report lists', { tags: ['real-data'] }, () => {
    it('has a material rule reader or a reviewed entry', () => {
        expectRegistryCovered({
            registry: 'minecraft:worldgen/material_rule_type',
            handles: recognizesType(
                (type, path) => surface.parseRule({ type }, path),
                (error) => error instanceof WorldgenErrors.UnknownMaterialRuleType
            ),
            unhandled: UNHANDLED_MATERIAL_RULE_TYPE
        });
    });

    it('has a material condition reader or a reviewed entry', () => {
        expectRegistryCovered({
            registry: 'minecraft:worldgen/material_condition_type',
            handles: recognizesType(
                (type, path) => surface.parseCondition({ type }, path),
                (error) => error instanceof WorldgenErrors.UnknownMaterialConditionType
            ),
            unhandled: UNHANDLED_MATERIAL_CONDITION_TYPE
        });
    });

    it('has a density function reader or a reviewed entry', () => {
        expectRegistryCovered({
            registry: 'minecraft:worldgen/density_function_type',
            handles: recognizesType(
                (type, path) => parseDensityFunction({ type }, noReferences, path),
                (error) => error instanceof WorldgenErrors.UnknownDensityFunctionType
            ),
            unhandled: UNHANDLED_DENSITY_FUNCTION_TYPE
        });
    });

    it('has a carver reader or a reviewed entry', () => {
        expectRegistryCovered({
            registry: 'minecraft:worldgen/carver_type',
            handles: recognizesType(
                (type, path) => parseCarver({ type }, path),
                (error) => error instanceof WorldgenErrors.UnknownCarverType
            ),
            unhandled: UNHANDLED_CARVER_TYPE
        });
    });
});
