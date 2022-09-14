// @ts-check

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'Tobira documentation',
  url: 'https://elan-ev.github.io/',
  baseUrl: '/tobira/',

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          routeBasePath: '/',
          sidebarCollapsed: false,
        },
        blog: false,
      }),
    ],
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      colorMode: {
        respectPrefersColorScheme: true,
      },
      navbar: {
        title: 'Tobira Documentation',
        hideOnScroll: true,
        items: [
          {
            href: 'https://github.com/elan-ev/tobira',
            label: 'GitHub',
            position: 'right',
          },
        ],
      },
      prism: {
        theme: require('prism-react-renderer/themes/nightOwlLight'),
        darkTheme: require('prism-react-renderer/themes/palenight'),
        additionalLanguages: ['toml', 'nginx'],
      },
    }),
};

module.exports = config;
