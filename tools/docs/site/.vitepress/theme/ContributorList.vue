<script setup lang="ts">
import type { Contributor } from '../../contributors.data.mts';

defineProps<{ contributors: Contributor[] }>();

const count = new Intl.NumberFormat('en-US');
</script>

<template>
    <p v-if="!contributors.length" class="contributors-empty">
        The contributor list could not be loaded. See it on
        <a href="https://github.com/JSPrismarine/JSPrismarine/graphs/contributors">GitHub</a>.
    </p>
    <ul v-else class="contributors">
        <li v-for="person in contributors" :key="person.login">
            <a class="contributors__person" :href="person.url" rel="noopener">
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
                <span class="contributors__count"
                    >{{ count.format(person.contributions) }}
                    {{ person.contributions === 1 ? 'commit' : 'commits' }}</span
                >
            </a>
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

.contributors__person {
    display: flex;
    gap: 14px;
    align-items: center;
    padding: 14px 8px;
    margin: 0 -8px;
    text-decoration: none;
    border-radius: 8px;
    transition: background-color 0.2s;
}

.contributors__person:is(:hover, :focus-visible) {
    background: var(--vp-c-default-soft);
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

.contributors__count {
    flex: none;
    font-size: 13px;
    font-variant-numeric: tabular-nums;
    color: var(--vp-c-text-2);
}
</style>
