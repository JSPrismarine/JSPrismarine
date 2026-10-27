import type { ItemDrop } from '@jsprismarine/block-behaviors';

/** The outcome of applying a player's held item to a data-driven entity. */
export type EntityItemInteraction =
    | { readonly accepted: false }
    | {
          readonly accepted: true;
          readonly resultItem?: string;
          readonly resultItemData?: number;
          /** Items a data-defined interaction adds to the player's inventory. */
          readonly addedItems?: readonly ItemDrop[];
          /** The entity item moved into the player's previously empty selected slot. */
          readonly takenItem?: ItemDrop;
          /** Durability to remove from the player's held item. */
          readonly hurtItem?: number;
          readonly consumeItem?: boolean;
      };
