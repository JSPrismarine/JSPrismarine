<script setup lang="ts">
import DefaultTheme from 'vitepress/theme';
import { useData } from 'vitepress';
import HomeLanding from './HomeLanding.vue';
import EditSource from './EditSource.vue';
import MegaNav from './MegaNav.vue';
import NotFound from './NotFound.vue';
import PrismMark from './components/PrismMark.vue';

const { Layout } = DefaultTheme;
const { frontmatter } = useData();
</script>

<template>
    <Layout>
        <template #nav-bar-title-before>
            <PrismMark :size="26" />
        </template>
        <template #nav-bar-content-before>
            <MegaNav />
        </template>
        <template #doc-footer-before>
            <EditSource />
        </template>
        <template #not-found>
            <NotFound />
        </template>
        <template #home-hero-before>
            <HomeLanding v-if="frontmatter.landing" />
        </template>
    </Layout>
</template>
