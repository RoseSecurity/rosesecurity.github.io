import React from 'react';
import ComponentCreator from '@docusaurus/ComponentCreator';

export default [
  {
    path: '/__docusaurus/debug',
    component: ComponentCreator('/__docusaurus/debug', '5ff'),
    exact: true
  },
  {
    path: '/__docusaurus/debug/config',
    component: ComponentCreator('/__docusaurus/debug/config', '5ba'),
    exact: true
  },
  {
    path: '/__docusaurus/debug/content',
    component: ComponentCreator('/__docusaurus/debug/content', 'a2b'),
    exact: true
  },
  {
    path: '/__docusaurus/debug/globalData',
    component: ComponentCreator('/__docusaurus/debug/globalData', 'c3c'),
    exact: true
  },
  {
    path: '/__docusaurus/debug/metadata',
    component: ComponentCreator('/__docusaurus/debug/metadata', '156'),
    exact: true
  },
  {
    path: '/__docusaurus/debug/registry',
    component: ComponentCreator('/__docusaurus/debug/registry', '88c'),
    exact: true
  },
  {
    path: '/__docusaurus/debug/routes',
    component: ComponentCreator('/__docusaurus/debug/routes', '000'),
    exact: true
  },
  {
    path: '/blog',
    component: ComponentCreator('/blog', 'c26'),
    exact: true
  },
  {
    path: '/blog/2024/06/28/infrastructure-essentials-part-1',
    component: ComponentCreator('/blog/2024/06/28/infrastructure-essentials-part-1', '873'),
    exact: true
  },
  {
    path: '/blog/2024/07/25/crafting-malicious-pluggable-authentication-modules',
    component: ComponentCreator('/blog/2024/07/25/crafting-malicious-pluggable-authentication-modules', '853'),
    exact: true
  },
  {
    path: '/blog/2024/07/26/my-vim-note-taking-workflow',
    component: ComponentCreator('/blog/2024/07/26/my-vim-note-taking-workflow', 'b7f'),
    exact: true
  },
  {
    path: '/blog/2024/07/29/the-future-of-terraform-visualizations',
    component: ComponentCreator('/blog/2024/07/29/the-future-of-terraform-visualizations', '4a0'),
    exact: true
  },
  {
    path: '/blog/2024/08/28/homegrown-honeypots',
    component: ComponentCreator('/blog/2024/08/28/homegrown-honeypots', '788'),
    exact: true
  },
  {
    path: '/blog/2024/09/15/from-source-to-system-on-debian',
    component: ComponentCreator('/blog/2024/09/15/from-source-to-system-on-debian', '41f'),
    exact: true
  },
  {
    path: '/blog/archive',
    component: ComponentCreator('/blog/archive', '182'),
    exact: true
  },
  {
    path: '/markdown-page',
    component: ComponentCreator('/markdown-page', '3d7'),
    exact: true
  },
  {
    path: '/',
    component: ComponentCreator('/', '2e1'),
    exact: true
  },
  {
    path: '*',
    component: ComponentCreator('*'),
  },
];
