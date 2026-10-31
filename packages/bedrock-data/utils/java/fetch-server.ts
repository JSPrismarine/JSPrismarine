import { fetchSource } from '../fetch/fetch.ts';
import { cacheRoot, loadJavaServerSource } from './worldgen-cache.ts';

const source = await loadJavaServerSource();
const fetched = await fetchSource(source, { cacheRoot });
const state = fetched.fromOverride ? 'override' : fetched.fromCache ? 'cached' : 'downloaded';

console.log(`Java ${source.version} server jar: ${state} (${fetched.contentPath})`);
