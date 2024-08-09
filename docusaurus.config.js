import {themes as prismThemes} from 'prism-react-renderer';

const config = {
  title: 'RoseSecurity Development Log',
  tagline: 'A blog about development, security, and other nerdy things.',
  favicon: 'img/favicon.ico',

  url: 'https://rosesecurity.dev',
  baseUrl: '/',

  // GitHub pages deployment config.
  organizationName: 'rosesecurity',
  projectName: 'rosesecurity.github.io',
  trailingSlash: false,

  onBrokenLinks: 'warn',
  onBrokenMarkdownLinks: 'warn',

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: false,
        blog: {
          routeBasePath: '/',
          showReadingTime: true,
          editUrl:
            'https://github.com/codespaces/new?hide_repo_select=true&ref=main&repo=rosesecurity/rosesecurity.github.io&skip_quickstart=true',
        },
        theme: {
          customCss: './src/css/custom.css',
        },
      }),
    ],
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      colorMode: {
        defaultMode: 'dark',
        disableSwitch: false,
        respectPrefersColorScheme: false,
      },
      // Replace with your project's social card
      image: 'img/rosesecurity.png',
      navbar: {
        title: 'Development Log',
        logo: {
          alt: 'RoseSecurity Logo',
          src: 'img/logo.svg',
        },
        items: [
          {to: '/blog', label: 'Blog', position: 'left'},
          {
            href: 'https://github.com/rosesecurity',
            label: 'GitHub',
            position: 'right',
          },
        ],
      },
      footer: {
        style: 'dark',
        links: [
          {
            title: 'Community',
            items: [
              {
                label: 'Dev.to',
                href: 'https://dev.to/rosesecurity',
              },
              {
                label: 'LinkedIn',
                href: 'https://linkedin.com/in/rosesecurity',
              },
              {
                label: 'Stack Overflow',
                href: 'https://stackoverflow.com/users/22638505/rosesecurity',
              },
            ],
          },
          {
            title: 'More',
            items: [
              {
                label: 'Blog',
                to: '/blog',
              },
              {
                label: 'GitHub',
                href: 'https://github.com/rosesecurity',
              },
            ],
          },
        ],
        copyright: `Copyright © ${new Date().getFullYear()} RoseSecurity.`,
      },
      prism: {
        theme: prismThemes.github,
        darkTheme: prismThemes.dracula,
      },
    }),
};

export default config;
