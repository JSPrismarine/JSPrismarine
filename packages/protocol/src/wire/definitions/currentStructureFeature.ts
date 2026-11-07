/**
 * The structure the player stands in.
 *
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/#packets}
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';

import type { PayloadOf } from '../define';

/** The `CurrentStructureFeaturePacket` field list. */
export const currentStructureFeaturePacket = definePacket('CurrentStructureFeaturePacket', {
    /** `Current Structure Feature`: a structure identifier such as `minecraft:village`, empty outside every structure. */
    currentStructureFeature: t.string
});

/** Names the structure feature the player currently occupies. */
export type CurrentStructureFeaturePayload = PayloadOf<typeof currentStructureFeaturePacket>;
