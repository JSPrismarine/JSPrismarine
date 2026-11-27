/**
 * A player's health, food and saturation, and its experience, as the plain values a presenter of
 * another edition shows.
 */
import type { Attributes } from '@jsprismarine/protocol/bedrock/wire/structures/Attribute';
import { AttributeIds } from '@jsprismarine/protocol/bedrock/wire/structures/Attribute';

import type { ShownExperience, ShownVitals } from './SessionPresenter';

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

/** The attributes experience lives in: a change to either is shown as the level and the bar. */
export const EXPERIENCE_ATTRIBUTES: ReadonlySet<string> = new Set([
    AttributeIds.PlayerLevel,
    AttributeIds.PlayerExperience
]);

/**
 * The experience a player's attributes hold.
 * @param attributes - The player's attributes.
 */
export const experienceOf = (attributes: Attributes): ShownExperience => ({
    level: attributes.getValue(AttributeIds.PlayerLevel),
    progress: attributes.getValue(AttributeIds.PlayerExperience)
});
