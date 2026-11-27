/**
 * A fully oxidized copper golem turning into a statue, after Java 26.3's
 * `CopperGolem.updateWeathering` and `CopperGolem.turnToStatue`.
 *
 * The server runs the copper golem on its Java brain, which leaves its Bedrock goals off, so the
 * `minecraft:behavior.place_block` that the golem's `becoming_statue` group declares never ran
 * and an oxidized golem stayed a golem for good. Java's statue is no brain behavior either: the
 * golem's own tick turns it. Once the golem is fully oxidized, which is when Bedrock's file adds
 * the group, each tick it turns when the block it stands in is air and `nextFloat()` comes in at
 * or under the goal's `chance`, Java's 0.0058. The statue is the goal's placeable block whose
 * `minecraft:cardinal_direction` is the golem's facing, Java's `Direction.fromYRot`. The goal's
 * `on_place` event then runs, which drops what the golem holds, and the golem is gone, as
 * `turnToStatue` discards it.
 *
 * @javaSee Direction.fromYRot
 */
import type { EntityPosition } from '@jsprismarine/entities';
import { isRecord } from '@jsprismarine/entities';

import type { DataEntity } from './DataEntity';
import { blockStatesOf } from './blockStatesOf';
import { blockPositionOf } from './position';

/** The goal whose body names the statue, its chance and its event. */
export const STATUE_GOAL = 'minecraft:behavior.place_block';

/** The entity type this rule runs for. */
const COPPER_GOLEM = 'minecraft:copper_golem';

/** The block state a statue faces by. */
const FACING_STATE = 'minecraft:cardinal_direction';

/** Java's horizontal `Direction`s by their 2D data value, which `Direction.fromYRot` indexes. */
const FACINGS = ['south', 'west', 'north', 'east'] as const;

/** One statue the goal may place: the block and the states it carries. */
interface Statue {
    readonly name: string;
    readonly states: Readonly<Record<string, string | number | boolean>>;
}

/** What the statue rule reads from the golem's `place_block` body. */
interface StatueTuning {
    readonly chance: number;
    readonly statues: readonly Statue[];
    readonly onPlace: string | undefined;
}

/** What turning to a statue needs of the runtime. */
export interface CopperGolemStatueHost {
    /** Java's `level.getRandom().nextFloat()`. */
    random(): number;
    isAir(at: EntityPosition): boolean;
    setBlock(at: EntityPosition, identifier: string, states: Readonly<Record<string, string | number | boolean>>): void;
    remove(id: number, reason: string): void;
}

/**
 * Java's `Direction.fromYRot`: the facing a yaw rounds to, by quarter turns.
 *
 * @javaSource Direction.fromYRot
 */
export const facingOfYaw = (yaw: number): (typeof FACINGS)[number] =>
    FACINGS[Math.floor(yaw / 90 + 0.5) & 3] ?? 'south';

/** The statue rule's numbers, from the parsed `place_block` goal, or undefined when it declares none. */
const tuningOf = (entity: DataEntity): StatueTuning | undefined => {
    const component = entity.instance.componentParams(STATUE_GOAL);
    const params = isRecord(component) ? component['params'] : undefined;
    if (!isRecord(params) || typeof params['chance'] !== 'number') return undefined;
    const placeable = Array.isArray(params['placeableBlocks']) ? params['placeableBlocks'] : [];
    const statues = placeable.flatMap((entry): Statue[] => {
        if (!isRecord(entry) || typeof entry['name'] !== 'string') return [];
        return [{ name: entry['name'], states: blockStatesOf(entry['states']) }];
    });
    const onPlace = params['onPlace'];
    return {
        chance: params['chance'],
        statues,
        onPlace: isRecord(onPlace) && typeof onPlace['event'] === 'string' ? onPlace['event'] : undefined
    };
};

/** Whether a data entity is a copper golem this rule runs for. */
export const isCopperGolem = (entity: DataEntity): boolean => entity.identifier === COPPER_GOLEM;

/**
 * One tick of the statue rule for one copper golem.
 * @returns Whether the golem turned into a statue and is gone.
 */
export const tickCopperGolemStatue = (entity: DataEntity, host: CopperGolemStatueHost): boolean => {
    // Only a golem whose oxidation is complete carries the goal, which is Java's `OXIDIZED` state.
    if (!entity.instance.hasComponent(STATUE_GOAL)) return false;
    const tuning = tuningOf(entity);
    if (tuning === undefined) return false;
    const at = blockPositionOf(entity.position);
    if (!host.isAir(at) || host.random() > tuning.chance) return false;

    const facing = facingOfYaw(entity.body.yaw);
    const statue = tuning.statues.find((entry) => entry.states[FACING_STATE] === facing) ?? tuning.statues[0];
    if (statue === undefined) return false;
    host.setBlock(at, statue.name, statue.states);
    // The event lands now rather than on a next tick the golem no longer has.
    if (tuning.onPlace !== undefined) {
        entity.instance.fire(tuning.onPlace);
        entity.instance.applyQueuedEvents();
    }
    host.remove(entity.id, 'became_statue');
    return true;
};
