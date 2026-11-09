import { loadProject, type ProjectData } from '../project.mts';

export type { Executable, ProjectData, PublishedPackage, SupportedProtocol } from '../project.mts';

declare const data: ProjectData;
export { data };

export default {
    watch: [
        '../../../package.json',
        '../../../packages/*/package.json',
        '../../../packages/protocol/src/wire/versions/*.ts',
        '../../../packages/prismarine/src/config/Config.ts',
        '../../../.github/scripts/build-aot.mjs'
    ],
    load: loadProject
};
