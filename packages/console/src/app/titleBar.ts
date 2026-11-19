import { BoxRenderable, StyledText, TextRenderable, bg, bold, fg } from '@opentui/core';

import type { ConsoleContext } from '../context';
import { stateLabel, stateTone } from '../status/segments';
import type { ServerState } from '../status/segments';

/** Static text of the title bar. */
export interface TitleBarProps {
    serverName?: string;
    version?: string;
}

/** The one-row title at the top of the console. */
export interface TitleBar {
    renderable: BoxRenderable;
    /** Paints the state tile at the left edge in the state's tone. */
    setState(state: ServerState): void;
    dispose(): void;
}

const titleText = ({ serverName, version }: TitleBarProps): string => {
    const product = version === undefined ? 'JSPrismarine' : `JSPrismarine ${version}`;
    return serverName === undefined ? product : `${product} · ${serverName}`;
};

/**
 * Creates the title bar: a solid tile naming the server state, then the product name, version,
 * and server name. The app hides it below 30 rows, and the status bar shows the state instead.
 * What the dev supervisor is doing is the activity line's job.
 */
export function createTitleBar(ctx: Pick<ConsoleContext, 'renderer' | 'theme'>, props: TitleBarProps): TitleBar {
    const { renderer, theme } = ctx;

    const renderable = new BoxRenderable(renderer, {
        id: 'title-bar',
        width: '100%',
        height: 1,
        flexDirection: 'row',
        paddingRight: 1,
        backgroundColor: theme.surface
    });
    const left = new TextRenderable(renderer, { id: 'title-left', truncate: true });
    const paintLeft = (state: ServerState) => {
        // The tile's text takes the page background, which every theme keeps readable on its
        // tones; without color both are the default colors, so the tile reads as inverse.
        const tile = bg(theme[stateTone(state)])(fg(theme.background)(bold(` ${stateLabel(state).toUpperCase()} `)));
        left.content = new StyledText([tile, fg(theme.accent)(` ${titleText(props)}`)]);
    };
    paintLeft('starting');
    renderable.add(left);

    return {
        renderable,
        setState(state) {
            paintLeft(state);
        },
        dispose() {
            renderable.destroyRecursively();
        }
    };
}
