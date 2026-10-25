import type { ColorInput } from '@opentui/core';

import type { StatusColors } from '../status/segments';
import type { Theme } from '../theme';

const hex = (value: number) => value.toString(16).padStart(2, '0');

/**
 * Renders a theme color as a hex string for components whose props are typed `string`. An
 * `RGBA` that stands for the terminal's default foreground or background loses that meaning
 * and becomes the literal color OpenTUI uses for it.
 */
export function colorString(input: ColorInput): string {
    if (typeof input === 'string') return input;
    const [r, g, b] = input.toInts();
    return `#${hex(r)}${hex(g)}${hex(b)}`;
}

/** The status bar and toast colors a theme provides. */
export function statusColorsFrom(theme: Theme): StatusColors {
    return {
        ok: colorString(theme.ok),
        warning: colorString(theme.warning),
        danger: colorString(theme.danger),
        muted: colorString(theme.muted),
        accent: colorString(theme.accent),
        text: colorString(theme.text),
        background: colorString(theme.surface)
    };
}
