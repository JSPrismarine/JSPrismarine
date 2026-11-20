import { CommandPermissionLevel, CustomCommandStatus, system, world } from '@minecraft/server';

import { barOptions } from './bar.js';

/** The player dynamic property that says the player turned the bar on. */
const ENABLED = 'jsp:tpsbar';
/** Ticks between two redraws: once a second at 20 TPS. */
const REFRESH_TICKS = 20;

/**
 * `@jsprismarine/server` once it has loaded, when it has the members the bar needs. Undefined
 * before then, on Bedrock Dedicated Server, and on a JSPrismarine older than 0.23.0.
 */
let jsp;
/** The bar each player sees, by player id. */
const bars = new Map();
/**
 * The choice each player's last `/tpsbar` made, by player id, until the tick applies it. A second
 * `/tpsbar` in the same tick reads it, so two commands turn the bar back to where it was.
 */
const pending = new Map();

/** Whether the player turned the bar on. */
const isEnabled = (player) => player.getDynamicProperty(ENABLED) === true;

/** Shows the bar to the player, or redraws the one they have. */
const draw = (player) => {
    const options = barOptions(jsp.performance, jsp.getPing(player));
    const bar = bars.get(player.id);
    if (bar?.isValid) bar.update(options);
    else bars.set(player.id, jsp.bossBars.show(player, options));
};

/** Takes the player's bar down. */
const hide = (player) => {
    bars.get(player.id)?.hide();
    bars.delete(player.id);
};

/** Redraws the bar of every player who has it on, and forgets the bars of players who left. */
const refresh = () => {
    for (const [id, bar] of bars) if (!bar.isValid) bars.delete(id);
    for (const player of world.getAllPlayers()) if (isEnabled(player)) draw(player);
};

/** Runs `/tpsbar`: turns the bar on or off for the player who ran it, and remembers the choice. */
const toggle = (origin) => {
    const player = origin.sourceEntity;
    if (player?.typeId !== 'minecraft:player') {
        return { status: CustomCommandStatus.Failure, message: 'Only a player can turn on the TPS bar.' };
    }
    if (jsp === undefined) {
        return {
            status: CustomCommandStatus.Failure,
            message: 'The TPS bar needs JSPrismarine 0.23.0 or newer, and this server is not one.'
        };
    }
    const on = !(pending.get(player.id) ?? isEnabled(player));
    pending.set(player.id, on);
    // A command's callback cannot change the world, so the change waits for the tick.
    system.run(() => {
        if (pending.get(player.id) === on) pending.delete(player.id);
        if (!player.isValid) return;
        player.setDynamicProperty(ENABLED, on ? true : undefined);
        if (on) draw(player);
        else hide(player);
    });
    return { status: CustomCommandStatus.Success, message: on ? 'TPS bar on.' : 'TPS bar off.' };
};

system.beforeEvents.startup.subscribe(({ customCommandRegistry }) => {
    customCommandRegistry.registerCommand(
        {
            name: 'jsp:tpsbar',
            description: "Shows or hides a bar with the server's TPS, MSPT and your ping.",
            permissionLevel: CommandPermissionLevel.GameDirectors
        },
        toggle
    );
});

// Not in the manifest, and loaded with import(): Bedrock Dedicated Server refuses a pack that
// declares the module or imports it statically. There the import rejects and the bar stays off.
import('@jsprismarine/server').then(
    (module) => {
        if (!('bossBars' in module) || !('performance' in module) || !('getPing' in module)) return;
        jsp = module;
        system.runInterval(refresh, REFRESH_TICKS);
    },
    () => {}
);
