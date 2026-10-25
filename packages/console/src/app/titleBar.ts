import { BoxRenderable, StyledText, TextRenderable, fg } from '@opentui/core';
import type { CliRenderer } from '@opentui/core';

import type { Theme } from '../theme';
import type { DevBadge } from './devState';

/** Renderer-level dependencies the title bar needs. */
export interface TitleBarContext {
    renderer: CliRenderer;
    theme: Theme;
}

/** Static text of the title bar. */
export interface TitleBarProps {
    serverName?: string;
    version?: string;
}

/** The one-row title at the top of the console. */
export interface TitleBar {
    renderable: BoxRenderable;
    /** Shows the dev badge on the right, or clears it with `undefined`. */
    setBadge(badge: DevBadge | undefined): void;
    dispose(): void;
}

const titleText = ({ serverName, version }: TitleBarProps): string => {
    const product = version === undefined ? 'JSPrismarine' : `JSPrismarine ${version}`;
    return serverName === undefined ? product : `${product} · ${serverName}`;
};

/**
 * Creates the title bar: the product name, version, and server name on the left and the dev
 * badge on the right. The app hides it below 30 rows.
 */
export function createTitleBar(ctx: TitleBarContext, props: TitleBarProps): TitleBar {
    const { renderer, theme } = ctx;

    const renderable = new BoxRenderable(renderer, {
        id: 'title-bar',
        width: '100%',
        height: 1,
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingLeft: 1,
        paddingRight: 1,
        backgroundColor: theme.surface
    });
    const left = new TextRenderable(renderer, {
        id: 'title-left',
        fg: theme.accent,
        content: titleText(props),
        truncate: true
    });
    const right = new TextRenderable(renderer, { id: 'title-right', fg: theme.textMuted });
    renderable.add(left);
    renderable.add(right);

    return {
        renderable,
        setBadge(badge) {
            right.content =
                badge === undefined
                    ? ''
                    : new StyledText([fg(theme.textMuted)('dev '), fg(theme[badge.tone])(`● ${badge.text}`)]);
        },
        dispose() {
            renderable.destroyRecursively();
        }
    };
}
