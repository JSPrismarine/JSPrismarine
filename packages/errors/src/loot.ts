import { defineErrors } from '@jsprismarine/errors/JSPrismarineError';

/** The errors `@jsprismarine/loot` throws. */
export const LootErrors = defineErrors('loot', {
    /**
     * A saved loot random state lists the same sequence twice, so the save or the replay that holds
     * it is damaged.
     */
    DuplicateLootSequenceState: { message: 'Duplicate loot sequence state: {entry}', base: TypeError },
    /**
     * A saved loot random state is all zeros, which the generator can never reach, so the save is
     * damaged.
     */
    InvalidAllZeroLootRandomState: { message: 'Invalid all-zero loot random state', base: TypeError },
    /**
     * A saved loot random state does not have the shape the loot random source writes, so the save
     * is damaged.
     */
    InvalidLootRandomState: { message: 'Invalid loot random state', base: TypeError },
    /**
     * A saved loot sequence state does not have the shape the loot random source writes, so the
     * save is damaged.
     */
    InvalidLootSequenceState: { message: 'Invalid loot sequence state', base: TypeError },
    /**
     * A saved loot sequence entry does not have the shape the loot random source writes, so the
     * save is damaged.
     */
    InvalidNamedLootSequenceState: { message: 'Invalid named loot sequence state', base: TypeError },
    /** A strict loot table parse found errors. The error's `diagnostics` list every one. */
    LootTableGrammarErrors: 'the loot table reported {count} grammar error(s): {listed}'
});
