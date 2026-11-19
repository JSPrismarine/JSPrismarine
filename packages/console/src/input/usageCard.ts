import { BoxRenderable, StyledText, TextRenderable, bg, bold, fg } from '@opentui/core';
import type { TextChunk } from '@opentui/core';

import type { ConsoleContext } from '../context';
import type { UsageMatch } from './commandUsage';
import { usageWords } from './commandUsage';

/** The card above the command line that shows the forms of the command being typed. */
export interface UsageCard {
    /** Absolutely positioned; add it to the log column. */
    renderable: BoxRenderable;
    /** Shows `match`, or hides the card when there is none. */
    update(match: UsageMatch | undefined): void;
    readonly isVisible: boolean;
    dispose(): void;
}

/** Forms shown before the rest fold behind a count. */
const SHOWN_FORMS = 4;

/**
 * Creates the usage card: the command's name and description, then each form it takes with the
 * argument being typed marked, so the next thing to type is visible without leaving the line.
 */
export function createUsageCard(ctx: Pick<ConsoleContext, 'renderer' | 'theme'>): UsageCard {
    const { renderer, theme } = ctx;
    const renderable = new BoxRenderable(renderer, {
        id: 'usage-card',
        position: 'absolute',
        bottom: 0,
        left: 0,
        width: '100%',
        zIndex: 7,
        visible: false,
        flexDirection: 'column',
        backgroundColor: theme.surface,
        paddingLeft: 1,
        paddingRight: 1
    });

    const formChunks = (form: string, argument: number): TextChunk[] =>
        usageWords(form, argument).flatMap(({ text, current }, index) => [
            ...(index === 0 ? [] : [fg(theme.text)(' ')]),
            current
                ? bg(theme.accent)(fg(theme.background)(bold(text)))
                : fg(index === 0 ? theme.text : theme.textMuted)(text)
        ]);

    const rowsFor = ({ command, argument }: UsageMatch): TextChunk[][] => {
        const header: TextChunk[] = [fg(theme.accent)(bold(command.name))];
        if (command.aliases.length > 0) header.push(fg(theme.textMuted)(` (${command.aliases.join(', ')})`));
        if (command.description !== undefined) header.push(fg(theme.text)(`  ${command.description}`));
        const rows = [header, ...command.usage.slice(0, SHOWN_FORMS).map((form) => formChunks(form, argument))];
        const folded = command.usage.length - SHOWN_FORMS;
        if (folded > 0)
            rows.push([
                fg(theme.textMuted)(`▸ ${folded} more form${folded === 1 ? '' : 's'}; help ${command.name} lists them`)
            ]);
        return rows;
    };

    return {
        renderable,
        update(match) {
            renderable.visible = match !== undefined;
            if (match === undefined) return;
            for (const child of renderable.getChildren()) {
                renderable.remove(child);
                child.destroyRecursively();
            }
            rowsFor(match).forEach((chunks, index) => {
                const row = new TextRenderable(renderer, {
                    id: `usage-card-row-${index}`,
                    height: 1,
                    truncate: true,
                    content: new StyledText(chunks)
                });
                row.selectable = false;
                renderable.add(row);
            });
            renderable.height = renderable.getChildren().length;
        },
        get isVisible() {
            return renderable.visible;
        },
        dispose() {
            renderable.destroyRecursively();
        }
    };
}
