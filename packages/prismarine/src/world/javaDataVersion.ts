/**
 * The rule for opening a level under a Java data target.
 *
 * A level records in `level.dat` the Java data version it was last saved with. Opening it with a
 * newer target is an upgrade: chunks generated before it blend toward the new terrain, which the
 * per-chunk generation record handles. Opening it with an older target is a downgrade, which Java
 * refuses because an older release cannot read what a newer one wrote, and so does this server.
 */
import type { JavaDataTarget } from '@jsprismarine/packs/javaDataTarget';
import { PrismarineWorldErrors } from '@jsprismarine/errors/prismarine/world';

/**
 * Refuses to open a level saved with a newer Java data version than the target's.
 *
 * @param level - The level's name, for the message.
 * @param stored - The data version `level.dat` records, or undefined for a save that predates the
 *   record, which opens under any target.
 * @param target - The Java release the server runs.
 * @throws {PrismarineWorldErrors.JavaDataDowngrade} When `stored` is newer than the target's.
 */
export const assertJavaDataVersionOpens = (level: string, stored: number | undefined, target: JavaDataTarget): void => {
    if (stored === undefined || stored <= target.dataVersion) return;
    throw new PrismarineWorldErrors.JavaDataDowngrade({
        level,
        stored,
        release: target.release,
        dataVersion: target.dataVersion
    });
};
