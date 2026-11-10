/**
 * The player overlay: the parts of the `minecraft:player` definition that Bedrock keeps in its
 * engine and leaves out of the shipped `entities/player.json`
 * ([ADR 0008](../../../../docs/adr/0008-one-entity-model.md)).
 *
 * The shipped file declares 24 components and no `minecraft:health`, and the entity store takes
 * damage only from a health attribute, so without this a blow on a store player is lost and
 * `tickVoid` deletes a player that falls out of the world. The overlay is applied to whichever
 * pack's player file won the pack stack, and adds a component only where that file has none, so
 * a pack that edits the player keeps its own values.
 */
import { isRecord } from '../utils/isRecord';

/** The player's identifier. */
export const PLAYER_IDENTIFIER = 'minecraft:player';

/**
 * What the overlay adds, by component name. Bedrock's player has 20 health, ten hearts, as
 * `Player.getDefaultAttributes` gives the legacy player.
 */
export const PLAYER_OVERLAY_COMPONENTS: Readonly<Record<string, unknown>> = {
    'minecraft:health': { value: 20, max: 20 }
};

/**
 * Applies the overlay to one entity file in the shape a behavior pack writes.
 *
 * @param data - The parsed JSON of an entity file.
 * @returns The same object for any file that is not the player's, or that already declares
 *   every overlay component; otherwise a copy with the missing components added.
 */
export const withPlayerOverlay = (data: unknown): unknown => {
    if (!isRecord(data)) return data;
    const entity = data['minecraft:entity'];
    if (!isRecord(entity)) return data;
    const description = entity['description'];
    if (!isRecord(description) || description['identifier'] !== PLAYER_IDENTIFIER) return data;

    const components = isRecord(entity['components']) ? entity['components'] : {};
    const missing = Object.entries(PLAYER_OVERLAY_COMPONENTS).filter(([name]) => !(name in components));
    if (missing.length === 0) return data;

    return {
        ...data,
        'minecraft:entity': { ...entity, components: { ...Object.fromEntries(missing), ...components } }
    };
};

/**
 * Whether the client owns the movement of an entity of this type, which is true of a player
 * alone ([ADR 0008](../../../../docs/adr/0008-one-entity-model.md)). The tick then applies no
 * gravity, navigation or pushes to its body, an impulse aimed at it becomes an occurrence the
 * client is sent, and its death leaves it in the store until respawn revives it.
 *
 * @param identifier - The entity's type.
 */
export const clientOwnsMovement = (identifier: string): boolean => identifier === PLAYER_IDENTIFIER;
