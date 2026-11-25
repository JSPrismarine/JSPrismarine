import { BossBar } from '../../player/BossBar';
import type { SessionContext } from '../../network/handler/HandlerContext';
import type { Intent } from '../Intent';
import type { IntentHandler } from '../IntentHandler';

/**
 * The player asked about a boss bar it has on screen.
 *
 * The answer replays the bar bound to the named actor for the asking player, and a query about
 * an actor the player has no bar for goes unanswered.
 */
export default class QueryBossBarHandler implements IntentHandler<'queryBossBar'> {
    public static readonly Kind = 'queryBossBar';

    /** Replays the queried bar to the asking player. */
    public async handle({ actor }: Intent<'queryBossBar'>, { session }: SessionContext): Promise<void> {
        await BossBar.answerQuery(session, actor);
    }
}
