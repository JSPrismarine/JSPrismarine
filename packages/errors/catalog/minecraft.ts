import { defineErrors } from './defineErrors';

/** The errors `@jsprismarine/minecraft` throws. */
export const MinecraftErrors = defineErrors('minecraft', {
    /** A game mode was given by a name or a number that names none of the four. */
    GametypeInvalid: 'Gametype "{gametype}" is not a valid game type.'
});
