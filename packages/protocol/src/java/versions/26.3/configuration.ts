/** What vanilla 26.3 sends a client in the configuration phase, captured from its server jar. */
import type { JavaConfiguration } from '../javaConfiguration';
import capture from './configuration.json' with { type: 'json' };

/** The feature flags, known packs, registries and tags vanilla 26.3 sends a client that has its core pack. */
export const CONFIGURATION: JavaConfiguration = capture;
