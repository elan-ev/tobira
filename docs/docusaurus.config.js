// @ts-check

/** @type {import("@docusaurus/types").Config} */
const config = {
    title: "Tobira documentation",
    url: "https://elan-ev.github.io/",
    baseUrl: "/tobira/",
    // This is better when deploying via GH pages. See:
    // https://docusaurus.io/docs/deployment#docusaurusconfigjs-settings
    trailingSlash: false,

    i18n: {
        defaultLocale: "en",
        locales: ["en"],
    },

    presets: [[
        "classic",
        /** @type {import("@docusaurus/preset-classic").Options} */
        ({
            docs: {
                routeBasePath: "/",
                editUrl: "https://github.com/elan-ev/tobira/edit/master/docs/",
                editCurrentVersion: true,
            },
            blog: false,
        }),
    ]],

    themes: [[
        require.resolve("@easyops-cn/docusaurus-search-local"),
        {
            hashed: true,
            indexBlog: false,
            docsRouteBasePath: "/",
        },
    ]],

    themeConfig:
        /** @type {import("@docusaurus/preset-classic").ThemeConfig} */
        ({
            colorMode: {
                respectPrefersColorScheme: true,
            },
            navbar: {
                title: "Tobira Documentation",
                hideOnScroll: true,
                items: [
                    {
                      type: 'docsVersionDropdown',
                      position: 'right',
                    },
                    {
                        href: "https://github.com/elan-ev/tobira",
                        label: "GitHub",
                        position: "right",
                    },
                ],
            },
            prism: {
                theme: require("prism-react-renderer/themes/nightOwlLight"),
                darkTheme: require("prism-react-renderer/themes/palenight"),
                additionalLanguages: ["toml", "nginx", "systemd"],
            },
        }),
};

module.exports = config;
