<script setup lang="ts">
import { withBase } from 'vitepress';
import { computed, ref } from 'vue';

import type { PublishedPackage } from '../../../project.data.mts';

const props = defineProps<{ packages: PublishedPackage[]; repositoryUrl: string }>();
const query = ref('');

const shown = computed(() => {
    const term = query.value.trim().toLowerCase();
    if (!term) return props.packages;
    return props.packages.filter(({ name, description }) => `${name} ${description}`.toLowerCase().includes(term));
});
</script>

<template>
    <div class="package-directory">
        <label class="package-directory__search">
            <span>Filter {{ packages.length }} packages</span>
            <input v-model="query" type="search" placeholder="protocol, nbt, worldgen..." />
        </label>
        <p class="package-directory__count" aria-live="polite">
            {{
                shown.length === packages.length
                    ? `${packages.length} packages`
                    : `${shown.length} of ${packages.length}`
            }}
        </p>
        <ul class="package-directory__grid">
            <li v-for="pkg in shown" :key="pkg.name" class="package-card">
                <div class="package-card__head">
                    <h3>{{ pkg.name.slice(pkg.name.indexOf('/') + 1) }}</h3>
                    <span class="package-card__version">{{ pkg.version }}</span>
                </div>
                <!-- Break after the scope, never inside a name. -->
                <code
                    >{{ pkg.name.slice(0, pkg.name.indexOf('/') + 1) }}<wbr />{{
                        pkg.name.slice(pkg.name.indexOf('/') + 1)
                    }}</code
                >
                <p>{{ pkg.description }}</p>
                <nav :aria-label="`${pkg.name} links`">
                    <a :href="withBase(`/api/${pkg.name}/`)">API</a>
                    <a :href="`${repositoryUrl}/tree/master/packages/${pkg.directory}#readme`">README</a>
                    <a :href="`https://www.npmjs.com/package/${pkg.name}`">npm</a>
                </nav>
            </li>
        </ul>
        <p v-if="!shown.length">No package matches “{{ query }}”.</p>
    </div>
</template>

<style scoped>
.package-directory__search {
    display: grid;
    gap: 6px;
    max-width: 420px;
    font: 700 12px var(--vp-font-family-mono);
    color: var(--vp-c-text-2);
    text-transform: uppercase;
    letter-spacing: 0.1em;
}

.package-directory__search input {
    padding: 10px 14px;
    font: 15px var(--vp-font-family-base);
    color: var(--vp-c-text-1);
    text-transform: none;
    letter-spacing: 0;
    background: var(--vp-c-bg-soft);
    border: 2px solid var(--vp-c-divider);
    border-radius: var(--jsp-radius-control);
}

.package-directory__search input:focus-visible {
    border-color: var(--jsp-accent);
    outline: none;
}

.package-directory__count {
    font: 12px var(--vp-font-family-mono);
    color: var(--vp-c-text-2);
}

.package-directory__grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(240px, 100%), 1fr));
    gap: var(--jsp-gap);
    padding: 0;
    margin: 0;
    list-style: none;
}

.package-card {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 18px;
    margin: 0;
    background: var(--vp-c-bg-soft);
    border-radius: var(--jsp-radius-panel);
    /* A hairline edge, so a soft card on the light page does not wash into it. */
    box-shadow: inset 0 0 0 1px var(--vp-c-divider);
}

.package-card__head {
    display: flex;
    gap: 10px;
    align-items: baseline;
    justify-content: space-between;
}

.package-card__version {
    flex: none;
    font: var(--jsp-label-size) var(--vp-font-family-mono);
    color: var(--vp-c-text-2);
}

.package-card h3 {
    min-width: 0;
    margin: 0;
    overflow-wrap: anywhere;
    font-size: 20px;
    line-height: 1.1;
    letter-spacing: -0.03em;
}

.package-card code {
    max-width: 100%;
    overflow-wrap: break-word;
    justify-self: start;
    align-self: flex-start;
    font-size: var(--jsp-label-size);
}

.package-card p {
    flex: 1;
    margin: 4px 0 8px;
    font-size: 14px;
    line-height: 1.5;
    color: var(--vp-c-text-2);
}

.package-card nav {
    display: flex;
    gap: 6px;
}

.package-card nav a {
    display: inline-flex;
    align-items: center;
    min-height: 30px;
    padding: 4px 12px;
    font: 700 12px var(--vp-font-family-mono);
    color: var(--vp-c-text-1);
    text-decoration: none;
    border: 1.5px solid var(--vp-c-divider);
    border-radius: 99px;
}

.package-card nav a:hover {
    color: var(--jsp-on-accent);
    background: var(--jsp-accent);
    border-color: var(--jsp-accent);
}

@media (max-width: 640px) {
    .package-card nav a {
        min-height: var(--jsp-target);
    }
}
</style>
