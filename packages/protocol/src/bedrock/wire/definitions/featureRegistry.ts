/**
 * `FeatureRegistryPacket`: the server's active feature registry, so the client can place
 * features itself.
 *
 * Protocol 2193 layout: `FeaturesDataList` as a varuint32 count followed by one
 * `FeatureRegistry::FeatureBinaryJsonFormat` entry per feature. Each entry is `Feature Name` then
 * `Binary Json Output`, both strings.
 */
import { definePacket } from '../../../wire/define';
import * as t from '../../../wire/fieldTypes';

import type { PayloadOf } from '../../../wire/define';

/** The fields of a `FeatureRegistryPacket`, in wire order. */
export const featureRegistryPacket = definePacket('FeatureRegistryPacket', {
    /** `FeaturesDataList`: one entry per feature the client should be able to place itself. */
    features: t.list(
        t.record({
            /** `Feature Name`: the identifier the feature is registered under, for example "minecraft:oak_tree_feature". */
            name: t.string,
            /** `Binary Json Output`: the feature's JSON definition serialized to a string. */
            binaryJson: t.string
        })
    )
});

/** Payload carried by `FeatureRegistryPacket`. */
export type FeatureRegistry = PayloadOf<typeof featureRegistryPacket>;

/** One `FeatureRegistry::FeatureBinaryJsonFormat` entry of the `FeaturesDataList`. */
export type FeatureRegistryEntry = FeatureRegistry['features'][number];
