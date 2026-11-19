/**
 * The entity and player members of `@minecraft/server` this directory implements, registered in
 * one call: the definition-backed components, the `Entity` and `Player` members, and the aim
 * assist registry.
 */
import type { ScriptApiImplementations } from '../../shape/implementations';
import type { PackHost } from '../minecraftServer';
import { implementAimAssist } from './aimAssist';
import { implementEntityComponents } from './components';
import { implementEntityMembers } from './entityMembers';
import { implementPlayerMembers } from './playerMembers';

/**
 * Registers the entity and player members.
 * @param implementations - The pack's implementations, which this adds to.
 * @param host - The pack's view of the runtime and the world.
 */
export const implementEntityArea = (implementations: ScriptApiImplementations, host: PackHost): void => {
    implementEntityComponents(implementations, host);
    implementEntityMembers(implementations, host);
    implementPlayerMembers(implementations, host);
    implementAimAssist(implementations, host);
};
