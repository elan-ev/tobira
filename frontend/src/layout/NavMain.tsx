import React, { useState } from "react";
import { Link } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSitemap } from "@fortawesome/free-solid-svg-icons";
import { useTranslation } from "react-i18next";


type Props = {
    title?: string;
    breadcrumbs?: React.ReactNode;
    navItems: NavItem[];
};

type NavItem = {
    label: string;
    link: string;
};

// At this screen width, the layout changes from a sidebar for navigation (for
// larger screens) and the navigation inlined (for smaller screens).
const BREAKPOINT = 720;

// A layout for the `<main>` part of pages that require a navigation (mainly
// realms). The navigation is either shown on the left as a sidebar (for large
// screens) or inline below the page title (for small screens).
export const NavMain: React.FC<Props> = ({ title, breadcrumbs, navItems, children }) => (
    <div css={{
        // This funky expressions just means: above a screen width of 1100px,
        // the extra space will be 10% margin left and right. This is the middle
        // ground between filling the full screen and having a fixed max width.
        margin: "0 calc(max(0px, 100% - 1100px) * 0.1)",

        [`@media (min-width: ${BREAKPOINT}px)`]: {
            display: "grid",
            columnGap: 32,
            grid: `
                "nav  breadcrumbs" auto
                "nav  title"       auto
                "nav  main"        1fr
                / fit-content(27%) 1fr
            `,
        },
    }}>
        <div css={{ gridArea: "breadcrumbs" }}>{breadcrumbs}</div>
        <h1 css={{ gridArea: "title", margin: "12px 0" }}>{title}</h1>
        <Nav items={navItems} />
        <div css={{ gridArea: "main" }}>{children}</div>
    </div>
);

type NavProps = {
    items: NavItem[];
};

// The navigation part of the layout.
const Nav: React.FC<NavProps> = ({ items }) => {
    const [navExpanded, setNavExpanded] = useState(false);
    const { t } = useTranslation();

    return (
        <nav css={{
            gridArea: "nav",

            // This is necessary for the `fit-content` column width to correctly
            // apply.
            overflow: "hidden",

            [`@media not all and (min-width: ${BREAKPOINT}px)`]: {
                margin: 16,
                border: "1px solid #888",
            },
        }}>
            <div
                onClick={() => setNavExpanded(prev => !prev)}
                css={{
                    padding: "6px 12px",
                    fontSize: 18,

                    // This is required to make the parent `div` (a grid item)
                    // span up to 300px wide. This is basically the only way to
                    // get this grid item span a percentage with a maximum
                    // width.
                    minWidth: 300,

                    [`@media not all and (min-width: ${BREAKPOINT}px)`]: {
                        cursor: "pointer",
                        "&:hover": {
                            backgroundColor: "#eee",
                        },
                    },
                }}
            >
                {/* TODO: this icon is not optimal */}
                <FontAwesomeIcon icon={faSitemap} css={{ marginRight: 8 }} />
                <b>{t("navigation")}</b>
            </div>
            <ul css={{
                listStyle: "none",
                margin: 0,
                padding: 0,
                borderTop: "2px solid #888",

                [`@media not all and (min-width: ${BREAKPOINT}px)`]: {
                    borderTop: navExpanded ? "1px solid #888" : "none",
                    height: navExpanded ? "auto" : 0,
                    overflow: "hidden",
                },
            }}>
                {items.map((item, i) => (
                    <li
                        key={i}
                        css={{ borderBottom: "1px solid #ccc" }}
                    >
                        <Link
                            to={item.link}
                            css={{
                                padding: "6px 12px",
                                textDecoration: "none",
                                display: "block",
                                transition: "background-color 0.1s",
                                "&:hover": {
                                    transitionDuration: "0.05s",
                                    backgroundColor: "#eee",
                                    textDecoration: "underline",
                                },
                            }}
                        >{item.label}</Link>
                    </li>
                ))}
            </ul>
        </nav>
    );
};
