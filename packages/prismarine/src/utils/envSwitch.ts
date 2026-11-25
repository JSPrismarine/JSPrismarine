/**
 * The values an on/off environment variable takes, such as `JSP_BSTATS` and `JSP_UPDATE_CHECK`,
 * case aside. The docs quote them.
 */
export const ENV_SWITCH_VALUES = {
    /** Turn the feature off. The first is the one the docs show. */
    off: ['0', 'false', 'off', 'no'],
    /** Leave the decision to `config.json`, as an unset variable does. */
    on: ['1', 'true', 'on', 'yes']
} as const;

const OFF_VALUES: ReadonlySet<string> = new Set(ENV_SWITCH_VALUES.off);
const ON_VALUES: ReadonlySet<string> = new Set(ENV_SWITCH_VALUES.on);

/**
 * Reads an on/off environment variable.
 * @param value - The variable's value, undefined when it is unset.
 * @returns `off` or `on` for a value of {@link ENV_SWITCH_VALUES}, `invalid` for any other value,
 *   and undefined when the variable is unset.
 */
export const readEnvSwitch = (value: string | undefined): 'off' | 'on' | 'invalid' | undefined => {
    if (value === undefined) return undefined;
    const lower = value.toLowerCase();
    if (OFF_VALUES.has(lower)) return 'off';
    return ON_VALUES.has(lower) ? 'on' : 'invalid';
};
