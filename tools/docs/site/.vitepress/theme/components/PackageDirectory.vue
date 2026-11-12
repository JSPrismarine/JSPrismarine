<script setup lang="ts">
import { withBase } from 'vitepress';
import { computed, ref } from 'vue';

import type { PublishedPackage } from '../../../project.data.mts';
import { groupPackages } from '../packageAreas';

const props = defineProps<{ packages: PublishedPackage[]; repositoryUrl: string }>();
const query = ref('');

/** The version every package shares, when they all ship at one; cards then leave it out. */
const sharedVersion = computed(() => {
    const versions = new Set(props.packages.map(({ version }) => version));
    return versions.size === 1 ? [...versions][0] : undefined;
});

/** The npm scope every package shares, when they share one; the count line names it once for all cards. */
const scope = computed(() => {
    const scopes = new Set(props.packages.map(({ name }) => name.slice(0, name.indexOf('/'))));
    return scopes.size === 1 ? [...scopes][0] : undefined;
});

const areas = computed(() => groupPackages(props.packages));

const shown = computed(() => {
    const term = query.value.trim().toLowerCase();
    if (!term) return props.packages;
    return props.packages.filter(({ name, description }) => `${name} ${description}`.toLowerCase().includes(term));
});

/** The areas with the packages the filter keeps, leaving out areas it empties. */
const shownAreas = computed(() => {
    const kept = new Set(shown.value);
    return areas.value
        .map((area) => ({ ...area, packages: area.packages.filter((pkg) => kept.has(pkg)) }))
        .filter((area) => area.packages.length);
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
            }}{{ scope ? ` under ${scope}` : '' }}{{ sharedVersion ? `, all at ${sharedVersion}` : '' }}
        </p>
        <nav class="package-directory__areas" aria-label="Package areas">
            <a v-for="area in shownAreas" :key="area.id" :href="`#${area.id}`"
                >{{ area.title }} <span>{{ area.packages.length }}</span></a
            >
        </nav>
        <section v-for="area in shownAreas" :key="area.id" class="package-area">
            <h2 :id="area.id">
                {{ area.title }} <span class="package-area__count">{{ area.packages.length }}</span>
            </h2>
            <p class="package-area__description">{{ area.description }}</p>
            <ul class="package-directory__grid">
                <li v-for="pkg in area.packages" :key="pkg.name" class="package-card">
                    <div class="package-card__head">
                        <!-- The name opens the API reference; README and npm follow as quieter links. -->
                        <h3>
                            <a :href="withBase(`/api/${pkg.name}/`)"
                                ><span class="package-card__scope" :class="{ 'is-shared': scope }">{{
                                    pkg.name.slice(0, pkg.name.indexOf('/') + 1)
                                }}</span
                                >{{ pkg.name.slice(pkg.name.indexOf('/') + 1) }}</a
                            >
                        </h3>
                        <span v-if="!sharedVersion" class="package-card__version">{{ pkg.version }}</span>
                    </div>
                    <p>{{ pkg.description }}</p>
                    <nav :aria-label="`${pkg.name} links`">
                        <a :href="withBase(`/api/${pkg.name}/`)">API reference</a>
                        <a :href="`${repositoryUrl}/tree/master/packages/${pkg.directory}#readme`">README</a>
                        <a :href="`https://www.npmjs.com/package/${pkg.name}`">npm</a>
                    </nav>
                </li>
            </ul>
        </section>
        <p v-if="!shown.length">No package matches “{{ query }}”.</p>
    </div>
</template>

<style scoped>
.package-directory__search {
    display: grid;
    gap: 6px;
    max-width: none;
    font: 700 var(--jsp-label-size) var(--vp-font-family-mono);
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
    font: var(--jsp-label-size) var(--vp-font-family-mono);
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

/* A scope every card shares is named once above the cards; screen readers still hear the full name. */
.package-card__scope.is-shared {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
}

.package-card__scope {
    display: block;
    margin-bottom: 2px;
    font: var(--jsp-label-size) var(--vp-font-family-mono);
    letter-spacing: 0;
    color: var(--vp-c-text-2);
}

.package-card__version {
    flex: none;
    font: var(--jsp-label-size) var(--vp-font-family-mono);
    color: var(--vp-c-text-2);
}

/* A package name is an identifier, so it is mono: display type's tight tracking squeezes its hyphens. */
.package-card h3 {
    min-width: 0;
    margin: 0;
    overflow-wrap: anywhere;
    font: 700 17px/1.2 var(--vp-font-family-mono);
    letter-spacing: 0;
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
    flex-wrap: nowrap;
    gap: 18px;
    padding-top: 10px;
    border-top: 1px solid var(--vp-c-divider);
}

/* The links are quiet mono text: the card's name is the main way in, and a 2px edge would mark them as
   controls. */
.package-card nav a {
    display: inline-flex;
    align-items: center;
    min-height: 28px;
    font: 700 var(--jsp-label-size) var(--vp-font-family-mono);
    color: var(--vp-c-text-2);
    white-space: nowrap;
    text-decoration: underline;
    text-decoration-thickness: 1px;
    text-underline-offset: 3px;
}

.package-card nav a:hover {
    color: var(--vp-c-text-1);
}

/* On a phone each link reaches the full touch target. */
@media (max-width: 640px) {
    /* Tighter cards on a phone, so a screen shows more than a handful of packages. */
    .package-card {
        gap: 2px;
        padding: 12px 14px 0;
    }

    .package-card nav {
        flex-wrap: wrap;
        gap: 0 20px;
        padding-top: 0;
        border-top: 0;
    }

    .package-card nav a {
        min-height: var(--jsp-target);
    }
}

.package-directory__search input::placeholder {
    color: var(--vp-c-text-2);
}
.package-area h2 {
    margin-top: 40px;
}

.package-area__count {
    display: inline-flex;
    align-items: center;
    padding: 2px 10px;
    margin-left: 6px;
    font: 700 var(--jsp-label-size) var(--vp-font-family-mono);
    vertical-align: middle;
    letter-spacing: 0;
    color: var(--vp-c-text-1);
    border: 1.5px solid var(--vp-c-divider);
    border-radius: 99px;
}

/* A jump list of the areas, so the whole directory reads in one screen. */
.package-directory__areas {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin: 4px 0 8px;
}

.package-directory__areas a {
    display: inline-flex;
    gap: 8px;
    align-items: center;
    min-height: 36px;
    padding: 0 12px;
    font-weight: 700;
    color: var(--vp-c-text-1);
    text-decoration: none;
    /* A filter is a control, so it has the 2px edge. */
    border: 2px solid var(--vp-c-divider);
    border-radius: 99px;
}

.package-directory__areas a:hover {
    border-color: var(--vp-c-text-1);
}

.package-directory__areas span {
    font: var(--jsp-label-size) var(--vp-font-family-mono);
    color: var(--vp-c-text-2);
}

.package-area__description {
    margin: 0 0 14px;
    color: var(--vp-c-text-2);
}

.package-card h3 a {
    font-weight: 800;
    color: inherit;
    text-decoration: none;
}

.package-card h3 a:hover {
    text-decoration: underline;
    text-decoration-thickness: 2px;
    text-underline-offset: 3px;
}
</style>
