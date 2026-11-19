import { StyledText, TextRenderable, fg } from '@opentui/core';

import type { ConsoleContext } from '../context';
import { formatTime } from '../log/logLine';
import type { Activity } from './devState';
import { activityText } from './devState';

/** The one-row line above the prompt that reports what the dev supervisor last did. */
export interface ActivityLine {
    renderable: TextRenderable;
    /** Shows `activity`, or hides the line when there is none. */
    update(activity: Activity | undefined, watchRoot: string | undefined): void;
    dispose(): void;
}

/**
 * Creates the activity line. It replaces the notices the supervisor used to raise for every
 * change, restart and crash: the line is always in the same place, never covers the log, and
 * keeps the latest event until the next one.
 */
export function createActivityLine(ctx: Pick<ConsoleContext, 'renderer' | 'theme'>): ActivityLine {
    const { renderer, theme } = ctx;
    const renderable = new TextRenderable(renderer, {
        id: 'activity-line',
        width: '100%',
        height: 1,
        flexShrink: 0,
        truncate: true,
        visible: false
    });
    renderable.selectable = false;

    return {
        renderable,
        update(activity, watchRoot) {
            renderable.visible = activity !== undefined;
            if (activity === undefined) return;
            renderable.content = new StyledText([
                fg(theme[activity.tone])(' ● '),
                fg(theme.textMuted)(`${formatTime(activity.at)}  `),
                fg(theme.text)(activityText(activity, watchRoot))
            ]);
        },
        dispose() {
            renderable.destroyRecursively();
        }
    };
}
