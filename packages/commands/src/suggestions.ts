import type { CommandContext, RequiredArgumentBuilder } from '@jsprismarine/brigadier';

type SuggestionProvider<S> = Parameters<RequiredArgumentBuilder<S, unknown>['suggests']>[0];

/**
 * Builds a suggestion provider from a fixed list or values selected from the parsed command.
 *
 * Suggestions match the current input prefix without regard to case, and duplicate values are
 * returned once.
 *
 * @param values - Candidate values, or a function that selects them from the parsed context.
 * @returns A Brigadier provider that suggests matching candidate values.
 */
export const suggestFromData = <S>(
    values: readonly string[] | ((context: CommandContext<S>) => Iterable<string>)
): SuggestionProvider<S> => ({
    getSuggestions(context, builder) {
        const prefix = builder.getRemaining().toLowerCase();
        const candidates = typeof values === 'function' ? values(context) : values;
        for (const candidate of new Set(candidates)) {
            if (candidate.toLowerCase().startsWith(prefix)) builder.suggest(candidate);
        }
        return builder.buildPromise();
    }
});
