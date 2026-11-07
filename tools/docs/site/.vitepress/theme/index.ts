import DefaultTheme from 'vitepress/theme';

import './brand.css';
import './mega-nav.css';
import ContributorList from './ContributorList.vue';
import Layout from './Layout.vue';
import ParityTracker from './ParityTracker.vue';

export default {
    extends: DefaultTheme,
    Layout,
    enhanceApp({ app }) {
        app.component('ContributorList', ContributorList);
        app.component('ParityTracker', ParityTracker);
    }
};
