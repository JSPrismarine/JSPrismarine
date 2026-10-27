/** The outcome of applying a player's held item to a data-driven entity. */
export type EntityItemInteraction =
    | { readonly accepted: false }
    | {
          readonly accepted: true;
          readonly resultItem?: string;
          readonly resultItemData?: number;
          /** Durability to remove from the player's held item. */
          readonly hurtItem?: number;
          readonly consumeItem?: boolean;
      };
