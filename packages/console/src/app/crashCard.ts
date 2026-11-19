import { BoxRenderable, StyledText, TextRenderable, bg, bold, fg } from '@opentui/core';
import type { TextChunk } from '@opentui/core';
import { basename } from 'node:path';

import type { ConsoleContext } from '../context';
import { formatTime } from '../log/logLine';
import type { Crash } from './crashReport';

/** What the card shows: the crash, how the server ended and when, and which keys work. */
export interface CrashCardModel {
    crash: Crash;
    /** How the server ended: `exit 1` or a signal name. */
    exit: string;
    at: number;
    /** Whether `r` restarts the server; only a watching host restarts on request. */
    canRestart: boolean;
    /** Whether `o` opens the first frame that names a file. */
    canOpen: boolean;
}

/** The card at the foot of the log that says why the server stopped and what to do next. */
export interface CrashCard {
    /** Absolutely positioned; add it to the log column. */
    renderable: BoxRenderable;
    show(model: CrashCardModel): void;
    hide(): void;
    readonly isVisible: boolean;
    dispose(): void;
}

/** Frames shown before the rest fold behind a count. */
const SHOWN_FRAMES = 2;

/**
 * Creates the crash card. It replaces scrolling back through raw stderr for the line that says
 * what failed: the error, the first frames with the files they name, and one key each to restart,
 * open the first named frame, and copy the whole trace.
 */
export function createCrashCard(ctx: Pick<ConsoleContext, 'renderer' | 'theme'>): CrashCard {
    const { renderer, theme } = ctx;
    const renderable = new BoxRenderable(renderer, {
        id: 'crash-card',
        position: 'absolute',
        bottom: 0,
        left: 0,
        width: '100%',
        zIndex: 8,
        visible: false,
        flexDirection: 'column',
        border: ['left'],
        borderColor: theme.danger,
        backgroundColor: theme.errorBackground,
        paddingLeft: 1,
        paddingRight: 1
    });

    // A key cap is the text color reversed, so it reads as a key in every theme, monochrome too.
    const key = (letter: string, what: string): TextChunk[] => [
        bg(theme.text)(fg(theme.background)(bold(` ${letter} `))),
        fg(theme.text)(` ${what}   `)
    ];

    const rowsFor = (model: CrashCardModel): TextChunk[][] => {
        const { crash } = model;
        const rows: TextChunk[][] = [
            [fg(theme.danger)(bold(`The server stopped (${model.exit}) at ${formatTime(model.at)}.`))]
        ];
        if (crash.error !== undefined) rows.push([fg(theme.text)(crash.error)]);
        for (const frame of crash.frames.slice(0, SHOWN_FRAMES)) rows.push([fg(theme.textMuted)(`  ${frame.text}`)]);
        const folded = crash.frames.length - SHOWN_FRAMES;
        if (folded > 0) rows.push([fg(theme.textMuted)(`  ▸ ${folded} more frame${folded === 1 ? '' : 's'}`)]);

        const opens = crash.frames.find((frame) => frame.location !== undefined)?.location;
        const keys: TextChunk[] = [];
        if (model.canRestart) keys.push(...key('r', 'restart now'));
        if (model.canOpen && opens !== undefined) keys.push(...key('o', `open ${basename(opens.path)}:${opens.line}`));
        if (crash.trace !== '') keys.push(...key('c', 'copy the trace'));
        if (keys.length > 0) rows.push(keys);
        return rows;
    };

    return {
        renderable,
        show(model) {
            for (const child of renderable.getChildren()) {
                renderable.remove(child);
                child.destroyRecursively();
            }
            rowsFor(model).forEach((chunks, index) => {
                const row = new TextRenderable(renderer, {
                    id: `crash-card-row-${index}`,
                    height: 1,
                    truncate: true,
                    content: new StyledText(chunks)
                });
                row.selectable = false;
                renderable.add(row);
            });
            renderable.height = renderable.getChildren().length;
            renderable.visible = true;
        },
        hide() {
            renderable.visible = false;
        },
        get isVisible() {
            return renderable.visible;
        },
        dispose() {
            renderable.destroyRecursively();
        }
    };
}
