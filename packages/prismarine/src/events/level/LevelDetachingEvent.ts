import LevelEvent from './LevelEvent';

/**
 * Fired as a level starts to detach, before its players move out and it saves and closes. A
 * listener that stops what it ran for the level, such as its scripts, does it here, and the
 * detach waits for it.
 */
export default class LevelDetachingEvent extends LevelEvent {}
