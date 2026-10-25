import type { CliRenderer } from '@opentui/core';

import type { Theme } from './theme/theme';

/**
 * What every console component reads from its host: the renderer it draws into and the theme it
 * takes colors from. Components declare the subset they use with `Pick<ConsoleContext, ...>`;
 * stores and callbacks travel as props.
 */
export interface ConsoleContext {
    renderer: CliRenderer;
    theme: Theme;
}
