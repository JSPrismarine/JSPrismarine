/**
 * Java's air supply, written into the `minecraft:breathable` of each vanilla entity file as it
 * loads.
 *
 * Java gives every living entity `Entity.getMaxAirSupply`, 300 ticks, unless its class overrides
 * it, and spends a tick of it for each tick the entity cannot breathe. Bedrock's pack writes a
 * `total_supply` per entity, and three of them have drifted: a Bedrock bee holds no air at all, a
 * happy ghast five seconds and a tadpole eight. Air is the server's alone and the client draws no
 * mob's, so Java's supply decides, the way a stat Java decides does
 * ([ADR 0001](../../../../docs/adr/0001-entity-stat-authority.md)).
 *
 * The axolotl and the nautilus keep their files' supply. Java's classes run their own air on land,
 * which Bedrock writes as other components, such as the axolotl's `minecraft:drying_out_timer`.
 */
import { javaEntityTypeToBedrock } from '@jsprismarine/mapping';
import { entitiesTable } from '@jsprismarine/mapping/tables';

import { entityFileIdentifier, withComponentRewritten } from './definitionOverlay';

/** Java's default `Entity.getMaxAirSupply`, in ticks. */
export const JAVA_MAX_AIR_TICKS = 300;

/** The classes that override `getMaxAirSupply`, by Java entity type; `Dolphin.TOTAL_AIR_SUPPLY` is 4800. */
const JAVA_MAX_AIR_OVERRIDES: Readonly<Record<string, number>> = { 'minecraft:dolphin': 4800 };

/** The Java entity types whose air the overlay leaves to the pack, because their class runs it. */
const OWN_AIR: ReadonlySet<string> = new Set(['minecraft:axolotl', 'minecraft:nautilus']);

/** Java's air supply in ticks for each Bedrock entity that has one, by Bedrock identifier. */
export const javaAirSupplies = (): ReadonlyMap<string, number> => {
    const supplies = new Map<string, number>();
    for (const javaId of Object.keys(entitiesTable.entities)) {
        if (OWN_AIR.has(javaId)) continue;
        const entity = javaEntityTypeToBedrock(javaId);
        if (entity.kind === 'mapped')
            supplies.set(entity.bedrock, JAVA_MAX_AIR_OVERRIDES[javaId] ?? JAVA_MAX_AIR_TICKS);
    }
    return supplies;
};

/** Ticks per second, which `total_supply` is written in. */
const TICKS_PER_SECOND = 20;

/**
 * Applies Java's air supply to one entity file in the shape a behavior pack writes.
 *
 * @param data - The parsed JSON of an entity file.
 * @param supplies - Java's air supply of each entity, from {@link javaAirSupplies}.
 * @returns The same object for a file with no `minecraft:breathable` or no Java air; otherwise a
 *   copy whose breathable components hold Java's supply.
 */
export const withJavaAirSupply = (data: unknown, supplies: ReadonlyMap<string, number>): unknown => {
    const identifier = entityFileIdentifier(data);
    const supply = identifier === undefined ? undefined : supplies.get(identifier);
    if (supply === undefined) return data;
    return withComponentRewritten(data, 'minecraft:breathable', ({ totalSupply: _legacy, ...breathable }) => ({
        ...breathable,
        total_supply: supply / TICKS_PER_SECOND
    }));
};
