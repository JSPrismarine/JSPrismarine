/** `world.afterEvents.gameRuleChange`, from the server's `gameRuleChanged` event. */
import type Server from '../../Server';
import type { Level } from '../../world/Level';
import type { WorldEventSource } from './worldEvents';

/** The game rules of one level. */
export const ruleEvents = (server: Server, level: Level): WorldEventSource => ({
    events: (listener) =>
        server.getKernel().events.on('gameRuleChanged', (event) => {
            if (event.getLevel() !== level) return;
            listener({ event: 'GameRuleChangeAfterEvent', fields: { rule: event.getRule(), value: event.getValue() } });
        })
});
