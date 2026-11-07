<script setup lang="ts">
import { reactive } from 'vue';
import type { Contributor } from '../../contributors.data.mts';
import ContributorCommits from './ContributorCommits.vue';

defineProps<{ contributors: Contributor[]; repo: string }>();

const count = new Intl.NumberFormat('en-US');
const open = reactive(new Set<string>());

function toggle(login: string) {
    if (!open.delete(login)) open.add(login);
}
</script>

<template>
    <p v-if="!contributors.length" class="contributors-empty">
        The contributor list could not be loaded. See it on
        <a :href="`https://github.com/${repo}/graphs/contributors`">GitHub</a>.
    </p>
    <ul v-else class="contributors">
        <li v-for="person in contributors" :key="person.login" :class="{ 'is-open': open.has(person.login) }">
            <div class="contributors__person">
                <a class="contributors__profile" :href="person.url" rel="noopener">
                    <img
                        class="contributors__avatar"
                        :src="`${person.avatar}&s=96`"
                        width="48"
                        height="48"
                        loading="lazy"
                        alt=""
                    />
                    <span class="contributors__identity">
                        <span class="contributors__name">
                            {{ person.name }}
                            <span v-if="person.isOwner" class="contributors__badge">Owner</span>
                        </span>
                        <span class="contributors__login">@{{ person.login }}</span>
                    </span>
                </a>
                <button
                    class="contributors__toggle"
                    type="button"
                    :aria-expanded="open.has(person.login)"
                    :aria-controls="`commits-${person.login}`"
                    :aria-label="`Latest commits by ${person.login}`"
                    @click="toggle(person.login)"
                >
                    {{ count.format(person.contributions) }}
                    {{ person.contributions === 1 ? 'commit' : 'commits' }}
                    <span class="contributors__chevron" aria-hidden="true"></span>
                </button>
            </div>
            <div v-if="open.has(person.login)" :id="`commits-${person.login}`">
                <ContributorCommits :login="person.login" :repo="repo" />
            </div>
        </li>
    </ul>
</template>

<style scoped>
.contributors {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 320px), 1fr));
    gap: 0 32px;
    padding: 0;
    margin: 24px 0 0;
    list-style: none;
}

.contributors li {
    margin: 0;
    border-top: 1px solid var(--vp-c-divider);
}

.contributors li.is-open {
    grid-column: 1 / -1;
}

.contributors__person {
    display: flex;
    gap: 8px;
    align-items: center;
    padding: 14px 8px;
    margin: 0 -8px;
    border-radius: 8px;
    transition: background-color 0.2s;
}

.contributors__person:hover {
    background: var(--vp-c-default-soft);
}

.contributors__profile {
    display: flex;
    flex: 1;
    gap: 14px;
    align-items: center;
    min-width: 0;
    text-decoration: none;
}

.contributors__avatar {
    flex: none;
    width: 48px;
    height: 48px;
    background: var(--vp-c-default-soft);
    border-radius: 50%;
}

.contributors__identity {
    display: grid;
    flex: 1;
    min-width: 0;
}

.contributors__name {
    overflow: hidden;
    font-weight: 600;
    line-height: 24px;
    color: var(--vp-c-text-1);
    text-overflow: ellipsis;
    white-space: nowrap;
}

.contributors__badge {
    padding: 1px 8px;
    margin-left: 6px;
    font-size: 12px;
    font-weight: 600;
    color: var(--vp-c-brand-1);
    background: var(--vp-c-brand-soft);
    border-radius: 999px;
}

.contributors__login {
    font-size: 13px;
    line-height: 20px;
    color: var(--vp-c-text-2);
}

.contributors__toggle {
    display: inline-flex;
    flex: none;
    gap: 8px;
    align-items: center;
    padding: 4px 8px;
    font-size: 13px;
    font-variant-numeric: tabular-nums;
    color: var(--vp-c-text-2);
    border-radius: 6px;
    transition: color 0.2s;
}

.contributors__toggle:is(:hover, [aria-expanded='true']) {
    color: var(--vp-c-brand-1);
}

.contributors__toggle:focus-visible,
.contributors__profile:focus-visible {
    outline: 2px solid var(--vp-c-brand-1);
    outline-offset: 2px;
}

.contributors__chevron {
    width: 5px;
    height: 5px;
    border-right: 1.5px solid currentColor;
    border-bottom: 1.5px solid currentColor;
    transform: translateY(-2px) rotate(45deg);
    transition: transform 0.2s;
}

.contributors__toggle[aria-expanded='true'] .contributors__chevron {
    transform: translateY(1px) rotate(225deg);
}
</style>
