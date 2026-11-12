/**
 * What clients are shown of a store player beside its entity, named as the change log addresses it.
 *
 * The entity replica (`network/replica/EntityReplica.ts`) shows a player from the log alone. A
 * player's head yaw, its hand, the slots it is seen holding and wearing, and the components its
 * metadata shows are logged as they change, but none of them is in the entity's saved form. So a
 * store player's entity enters the log with a shown form beside that form
 * (`EntityRuntime.savedFormOf`), and the replica starts the player from it.
 */
import type { Gametype } from '@jsprismarine/minecraft';
import { getGametypeId } from '@jsprismarine/minecraft';

import { ARMOR_SLOTS, HOTBAR_SIZE } from '../inventory/HumanInventory';
import type { PlayerContainer } from '../inventory/slotLog';
import type { PlainData, PlainRecord } from '../world/changelog/PlainData';
import { booleanField, numberField } from './data/entityFields';
import type { PlayerComponentField } from './playerComponents';

/** The field a player's head yaw is logged as, which the client reports apart from the body's yaw. */
export const HEAD_YAW_FIELD = 'look.headYaw';

/** The field the hotbar slot a player's hand points at is logged as. */
export const HAND_SLOT_FIELD = 'inventory.handSlot';

/**
 * The component fields clients are shown of a player: sprinting, whether it may fly, which its
 * game mode decides, whether it is flying, and its breath.
 */
export const SHOWN_PLAYER_COMPONENTS = [
    'movement.sprinting',
    'abilities.gamemode',
    'abilities.flying',
    'vitals.air',
    'vitals.breathing'
] as const satisfies readonly PlayerComponentField[];

/** One slot a player carries, as a slot entry addresses it. */
export type PlayerSlot = { readonly container: PlayerContainer; readonly slot: number };

/** The key of a slot, as the replica holds it: `container:slot`. */
export const slotKey = (container: string, slot: number): string => `${container}:${slot}`;

/** The slots a player is seen holding and wearing: the hotbar the hand points into, the armor and the off hand. */
export const SHOWN_PLAYER_SLOTS: readonly PlayerSlot[] = [
    ...Array.from({ length: HOTBAR_SIZE }, (_unused, slot): PlayerSlot => ({ container: 'inventory', slot })),
    ...Array.from({ length: ARMOR_SLOTS }, (_unused, slot): PlayerSlot => ({ container: 'armor', slot })),
    { container: 'offhand', slot: 0 }
];

/**
 * A player's shown form: each shown field by the name its entries carry, and each shown slot by
 * its {@link slotKey}.
 */
export type PlayerShownForm = { readonly fields: PlainRecord; readonly slots: PlainRecord };

/** What clients are shown of a store player beside its entity, read back from logged fields. */
export type ShownPlayerState = {
    readonly headYaw: number;
    /** The hotbar slot the hand points at. */
    readonly handSlot: number;
    readonly sprinting: boolean;
    readonly gamemode: Gametype;
    readonly flying: boolean;
    /** Ticks of breath left. */
    readonly air: number;
    readonly breathing: boolean;
};

/**
 * A store player's shown state, from its logged fields.
 * @param field - One logged field by name, or undefined when none is held.
 * @returns The state, or undefined for an entity no store player's shown form started.
 */
export const shownPlayerStateIn = (field: (name: string) => PlainData | undefined): ShownPlayerState | undefined => {
    const headYaw = field(HEAD_YAW_FIELD);
    if (headYaw === undefined) return undefined;
    const value = (name: string): PlainData => field(name) ?? null;
    return {
        headYaw: numberField(HEAD_YAW_FIELD)(headYaw),
        handSlot: numberField(HAND_SLOT_FIELD)(value(HAND_SLOT_FIELD)),
        sprinting: booleanField('movement.sprinting')(value('movement.sprinting')),
        gamemode: getGametypeId(numberField('abilities.gamemode')(value('abilities.gamemode'))),
        flying: booleanField('abilities.flying')(value('abilities.flying')),
        air: numberField('vitals.air')(value('vitals.air')),
        breathing: booleanField('vitals.breathing')(value('vitals.breathing'))
    };
};
