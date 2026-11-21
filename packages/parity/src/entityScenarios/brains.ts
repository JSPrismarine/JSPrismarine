import type { BehaviorScenario } from '../behaviorScenarios.ts';
import { serverContent } from '../serverStack.ts';
import { javaBrainActivities } from './javaEntityCode.ts';
import type { EntitySubject } from './subjects.ts';
import { javaEntityIds, mappedEntity } from './subjects.ts';

/**
 * The brain mobs' activities: each activity a Java mob's brain registers, against the brain the
 * server builds for the mob. A brain switches between its activities (a frog's tongue attack, a
 * warden's dig, a villager's work and rest), so a missing one is a whole mode of behavior the
 * mob never enters.
 */
export const brainScenarios: readonly BehaviorScenario<EntitySubject>[] = [
    {
        name: 'brain-activity',
        java: "A brain mob's brain registers each activity its Java class's brain does.",
        reference: 'Java <Mob>Ai.makeBrain and VillagerGoalPackages, read from the pinned jar',
        subjects: () =>
            javaEntityIds().flatMap((javaId) => {
                const subject = mappedEntity(javaId);
                if (subject === undefined) return [];
                return javaBrainActivities(javaId).map((activity) => ({ ...subject, tag: activity }));
            }),
        idOf: (subject) => `${subject.javaId}/${subject.tag ?? ''}`,
        covers: (subject) => subject.javaId,
        aspects: (subject) => [`java-activity:${subject.tag ?? ''}`],
        run: (subject) => {
            const brainMob = serverContent().entities.brains.get(subject.javaId);
            if (brainMob === undefined) return 'the server runs no brain for it';
            // A baby's brain holds the play activity an adult's leaves out, so both are read.
            const names = new Set(
                [brainMob.makeBrain(), brainMob.makeBrain({ baby: true })].flatMap((brain) =>
                    brain.activities.map((activity) => activity.name)
                )
            );
            return names.has(subject.tag ?? '') ? undefined : `its brain registers no ${subject.tag ?? ''} activity`;
        }
    }
];
