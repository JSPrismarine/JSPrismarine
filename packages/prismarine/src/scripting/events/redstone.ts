/**
 * `world.afterEvents.pistonActivate`, `leverAction`, `buttonPush`, `pressurePlatePush` and
 * `pressurePlatePop`, from the server's `redstoneActivated` event.
 */
import type { ScriptEventValue } from '@jsprismarine/script-host/host/world';

import type Server from '../../Server';
import type { Level } from '../../world/Level';
import { fieldsOf } from './values';
import type { WorldEventSource } from './worldEvents';

/** The redstone components of one level. */
export const redstoneEvents = (server: Server, level: Level): WorldEventSource => ({
    events: (listener) =>
        server.getKernel().events.on('redstoneActivated', (event) => {
            const world = event.getWorld();
            if (world.getLevel() !== level) return;
            const activation = event.getActivation();
            const { x, y, z } = activation.position;
            const at = { dimension: world.getDimension().bedrockName, x, y, z };
            const block: ScriptEventValue = { block: at };
            const actor =
                activation.kind === 'piston' || activation.source === undefined
                    ? undefined
                    : world.getActor(BigInt(activation.source));
            const source: ScriptEventValue | undefined =
                actor === null || actor === undefined
                    ? undefined
                    : { entity: { id: String(actor.getRuntimeId()), typeId: actor.getType() } };
            switch (activation.kind) {
                case 'piston':
                    listener({
                        event: 'PistonActivateAfterEvent',
                        fields: {
                            block,
                            isExpanding: activation.extending,
                            piston: { blockComponent: 'BlockPistonComponent', at }
                        }
                    });
                    return;
                case 'lever':
                    listener({
                        event: 'LeverActionAfterEvent',
                        fields: fieldsOf({ block, isPowered: activation.powered, player: source })
                    });
                    return;
                case 'button':
                    listener({ event: 'ButtonPushAfterEvent', fields: fieldsOf({ block, source }) });
                    return;
                case 'pressurePlate':
                    listener({
                        event: activation.power > 0 ? 'PressurePlatePushAfterEvent' : 'PressurePlatePopAfterEvent',
                        fields: fieldsOf({
                            block,
                            redstonePower: activation.power,
                            previousRedstonePower: activation.previousPower,
                            source: activation.power > 0 ? source : undefined
                        })
                    });
            }
        })
});
