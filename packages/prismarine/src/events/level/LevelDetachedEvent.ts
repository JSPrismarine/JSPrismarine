import LevelEvent from './LevelEvent';

/** Fired once a level has saved and closed. Its files stay, and attaching it again loads the same save. */
export default class LevelDetachedEvent extends LevelEvent {}
