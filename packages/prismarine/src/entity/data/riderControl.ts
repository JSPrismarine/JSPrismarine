/**
 * A mob that rides another mob steers it, as Java's `Mob` does.
 *
 * Java hands a mob's movement to its first passenger when that passenger is a mob that can control
 * a vehicle (`Mob.getControllingPassenger`, which refuses the types in the
 * `non_controlling_rider` entity type tag). The rider's goals then walk the mount: the rider's
 * `getNavigation` returns its mount's navigation. The mount's own goals give up the move, look and
 * jump control flags while it is steered (`Mob.updateControlFlags`), so a chicken carrying a baby
 * zombie stops wandering and runs at whatever the zombie chases.
 *
 * Bedrock writes the same thing as `minecraft:behavior.mount_pathing` on the rider. Java has no
 * such goal, and the server runs Java's rule instead.
 */
import { bedrockEntityTypeTagsFor } from '../../content/entityTypeTags';
import { withoutComponents } from '../definitionOverlay';
import { clientOwnsMovement } from '../playerOverlay';
import type { DataEntity, MobBody } from './DataEntity';
import type { EntityScene } from './scene';

/** The Java entity type tag of the riders that never steer what they ride, such as a slime. */
const NON_CONTROLLING_RIDER = 'minecraft:non_controlling_rider';

/** Whether an entity is a mob in Java's sense, one with an AI that a rider can take over. */
const isMob = (entity: DataEntity): boolean =>
    !clientOwnsMovement(entity.identifier) && (entity.brain !== undefined || entity.instance.goals.names().length > 0);

/**
 * The mob steering a vehicle: its first rider, when the vehicle is a mob and that rider is a mob
 * whose type may control a vehicle. Java's `Mob.getControllingPassenger`.
 */
export const controllingRiderOf = (vehicle: DataEntity, scene: EntityScene): DataEntity | undefined => {
    if (!isMob(vehicle)) return undefined;
    const [first] = scene.ridersOf(vehicle.body);
    const rider = typeof first?.id === 'number' ? scene.byId(first.id) : undefined;
    if (rider === undefined || !isMob(rider)) return undefined;
    if (bedrockEntityTypeTagsFor(scene.content().tags, rider.identifier).includes(NON_CONTROLLING_RIDER))
        return undefined;
    return rider;
};

/** The mob a rider steers, when it steers the one it rides. Java's `Entity.getControlledVehicle`. */
export const controlledVehicleOf = (rider: MobBody, scene: EntityScene): DataEntity | undefined => {
    const ridden = scene.vehicleOf(rider);
    const vehicle = typeof ridden?.id === 'number' ? scene.byId(ridden.id) : undefined;
    return vehicle !== undefined && controllingRiderOf(vehicle, scene)?.id === rider.id ? vehicle : undefined;
};

/**
 * Turns a mob's own movement goals off while a rider steers it and back on once none does, as
 * Java's `Mob.updateControlFlags` does before each AI step.
 */
export const updateControlFlags = (entity: DataEntity, scene: EntityScene): void => {
    const free = controllingRiderOf(entity, scene) === undefined;
    const { goals } = entity.instance;
    goals.setFlagEnabled('move', free);
    goals.setFlagEnabled('look', free);
    goals.setFlagEnabled('jump', free);
};

/** Bedrock's goal for a rider that walks its mount, which Java's rider steering stands in for. */
const MOUNT_PATHING = 'minecraft:behavior.mount_pathing';

/**
 * Takes `minecraft:behavior.mount_pathing` off an entity file as it loads. It claims the rider's
 * move and look flags above its attack, where Java's rider runs its attack and steers its mount
 * with it, so the server leaves the steering to {@link controlledVehicleOf}.
 *
 * @param data - The parsed JSON of an entity file.
 * @returns The same object for a file without the goal; otherwise a copy without it.
 */
export const withoutMountPathing = (data: unknown): unknown =>
    withoutComponents(data, (component) => component === MOUNT_PATHING);
