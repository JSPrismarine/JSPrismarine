<script setup lang="ts">
import DefaultTheme from 'vitepress/theme';
import { useData } from 'vitepress';
import HomeLanding from './HomeLanding.vue';
import EditSource from './EditSource.vue';
import NotFound from './NotFound.vue';
import PrismMark from './components/PrismMark.vue';
import SiteBreadcrumb from './site-menu/SiteBreadcrumb.vue';
import SiteNav from './site-menu/SiteNav.vue';
import SitePhoneMenu from './site-menu/SitePhoneMenu.vue';

const { Layout } = DefaultTheme;
const { frontmatter } = useData();
</script>

<template>
    <Layout>
        <template #nav-bar-title-before>
            <PrismMark :size="26" />
        </template>
        <template #nav-bar-content-before>
            <SiteNav />
        </template>
        <template #nav-bar-content-after>
            <SitePhoneMenu />
        </template>
        <template #doc-before>
            <SiteBreadcrumb />
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
