/**
 * How a recipe's public ID is spelled, which is what the recipe packet carries.
 *
 * Kept beside `generate-recipes.js` rather than inside it so the rule can be read and
 * tested on its own: the generator is a script that runs on import.
 */

/**
 * The public ID for one recipe at one station, with `idAliases` applied.
 *
 * A recipe's source ID says nothing about where it is crafted, and the same source ID can
 * be registered at several stations, so the published ID is the station and the source ID
 * together. `idAliases` renames a few published IDs - it is how the server keeps American
 * spellings that Mojang's files write in British English - and its keys are published IDs,
 * station included. That is why the rename happens here and not when the layers are
 * composed: at compose time there is no station yet, so every key would miss.
 *
 * @param aliases - The version's `recipes.idAliases`, or `undefined` when it declares none.
 * @param station - The crafting station tag, such as `crafting_table`.
 * @param sourceId - The recipe identifier as the source files spell it.
 * @returns The ID to publish the recipe under.
 */
export const publicIdOf = (aliases: Record<string, string> | undefined, station: string, sourceId: string): string => {
    const id = `${station}/${sourceId}`;
    return aliases?.[id] ?? id;
};
