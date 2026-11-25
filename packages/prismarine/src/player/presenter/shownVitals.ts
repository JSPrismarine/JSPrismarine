/** A player's health, food and saturation as the plain values a presenter of another edition shows. */
import type { Attributes } from '@jsprismarine/protocol/bedrock/wire/structures/Attribute';
import { AttributeIds } from '@jsprismarine/protocol/bedrock/wire/structures/Attribute';

import type { ShownVitals } from './SessionPresenter';

/** The attributes that make up the vitals: a change to any of them is shown as all three. */
export const VITAL_ATTRIBUTES: ReadonlySet<string> = new Set([
    AttributeIds.Health,
    AttributeIds.PlayerHunger,
    AttributeIds.PlayerSaturation
]);

/**
 * The vitals a player's attributes hold.
 * @param attributes - The player's attributes.
 */
export const vitalsOf = (attributes: Attributes): ShownVitals => ({
    health: attributes.getValue(AttributeIds.Health),
    food: attributes.getValue(AttributeIds.PlayerHunger),
    saturation: attributes.getValue(AttributeIds.PlayerSaturation)
});
