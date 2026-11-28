import type { InputContext } from '../../player/context/HandlerContext';
import type { Intent } from '../Intent';
import type { IntentHandler } from '../IntentHandler';

/**
 * The player pressed the respawn button.
 *
 * Three states across two sides. The docs number them `SearchingForSpawn` (0) and
 * `ReadyToSpawn` (1) for the server and `ClientReadyToSpawn` (2) for the client. An unpinned
 * Bedrock Dedicated Server runs a death like this, recorded through the proxy:
 *
 * 1. the player dies, and the server sends `SearchingForSpawn` with where they will
 *    reappear - the client will not offer the respawn button until it has this;
 * 2. the player presses it, and the client sends `ClientReadyToSpawn`, which is this intent;
 * 3. the server answers at once with `SearchingForSpawn` at the spawn block, then
 *    `ReadyToSpawn` at the eyes above it, and the client puts its player there;
 * 4. the client sends a `Respawn` player action, and the server sends the living player:
 *    see `PlayerSession.respawn`.
 *
 * When the spawn is in another world, a Nether death with an Overworld bed, step 3 opens with
 * a `ChangeDimension` carrying `Respawn` set, which is what the client asks for in that case
 * (gophertunnel, `DimensionChangeRequest`), and the two answers follow in the new world.
 *
 * Getting step 3 wrong leaves the client frozen. Answered with `ReadyToSpawn` alone, at the
 * spawn block's height rather than the eyes', and followed by the dead player's health, the
 * client sent nothing more: no movement, no input, for as long as it stayed connected.
 * @see https://github.com/pmmp/PocketMine-MP/blob/stable/src/network/mcpe/handler/DeathPacketHandler.php
 */
export default class RespawnHandler implements IntentHandler<'respawn'> {
    public static readonly Kind = 'respawn';

    /**
     * Answers a client that is ready to spawn. A dead player's spawn point is a request, which a
     * later input step answers with the respawn exchange; a living player is told where it stands
     * through `step.output`. So the call returns before any of that is sent, and nothing it starts
     * is awaited.
     */
    public handle(_intent: Intent<'respawn'>, { session, step }: InputContext): undefined {
        const player = session.getPlayer();

        if (player.getHealth() <= 0) {
            // Where the player comes back: the spawn block and the eyes above it, in the world the
            // spawn is in. The search reads blocks that may not be loaded, so it is a request, and
            // the input step that has its answer runs the rest; the search clears a spawn point
            // that no longer holds. The answer is applied in that step and queues its packets.
            session.requestRespawnPoint((point) => {
                // The dead body moves world first, facing as it fell; `PlayerSession.requestRespawn` then
                // stands it at the eyes once the client's `Respawn` action arrives, as in one world.
                if (point.world !== session.getWorld()) {
                    session.released(
                        session.changeWorld({
                            world: point.world,
                            position: point.block,
                            yaw: player.yaw,
                            pitch: player.pitch,
                            respawn: true,
                            closesLoadingScreen: false
                        })
                    );
                }
                const { block, eyes } = point;
                session.released(
                    session.presenter.showRespawnPoint({
                        block: { x: block.getX(), y: block.getY(), z: block.getZ() },
                        eyes: { x: eyes.getX(), y: eyes.getY(), z: eyes.getZ() }
                    })
                );
            });
            return;
        }

        // Already alive: the respawn action came first. How a Bedrock Dedicated Server answers
        // this order has not been recorded, so the player is told where they stand and
        // described again, as this server did before. One output, so the packets keep their order.
        const position = player.getPosition();
        step.output(
            (async () => {
                await session.presenter.showRespawnPoint({
                    eyes: { x: position.getX(), y: position.getY(), z: position.getZ() }
                });
                await session.sendAttributes();
                await session.sendMetadata();
                await session.sendAbilities();
                await session.sendInventory();
            })()
        );
    }
}
