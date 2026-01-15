import React, { ReactNode, useCallback, useEffect, useMemo, useRef } from "react";
import { keyframes } from "@emotion/react";
import { useTranslation } from "react-i18next";
import { currentRef, match, screenWidthAtMost } from "@opencast/appkit";

import { Header } from "./header";
import { BREAKPOINT as NAV_BREAKPOINT, NavItems } from "./Navigation";
import { useMenu } from "./MenuState";
import { Footer } from "./Footer";
import { BurgerMenu } from "./Burger";
import { SideBox } from "../ui";
import { OUTER_CONTAINER_MARGIN } from ".";
import { userDataFragment, UserProvider } from "../User";
import { GraphQLTaggedNode, PreloadedQuery, useFragment, usePreloadedQuery } from "react-relay";
import { OperationType } from "relay-runtime";
import { UserData$key } from "../__generated__/UserData.graphql";
import { translatedConfig, useNoindexTag } from "../util";
import { useRouter } from "../router";
import CONFIG from "../config";
import { RenderMarkdown } from "../ui/Blocks/Text";
import { COLORS } from "../color";
import { LuInfo, LuTriangleAlert } from "react-icons/lu";
import { BREAKPOINT_SMALL } from "../GlobalStyle";


export const MAIN_PADDING = 16;

type Props = {
    nav: NavItems;
    children: ReactNode;
};

export const Root: React.FC<Props> = ({ nav, children }) => {
    const menu = useMenu();
    const navElements = Array.isArray(nav) ? nav : [nav] as const;
    const navExists = navElements.length > 0;

    return (
        <Outer disableScrolling={menu.state === "burger"}>
            <Header hideNavIcon={!navExists} />
            {menu.state === "burger" && navExists && (
                <BurgerMenu items={navElements} hide={() => menu.close()} />
            )}
            <Main>
                {/* Sidebar */}
                {navExists && <StickyNav>
                    {navElements.map((elem, i) => <SideBox key={i}>{elem}</SideBox>)}
                </StickyNav>}

                {/* Main part */}
                <div css={{ width: "100%", minWidth: 0, flex: "12 0 0" }}>
                    <GlobalBanner />
                    {children}
                </div>
            </Main>
            <Footer />
        </Outer>
    );
};

type OuterProps = {
    disableScrolling?: boolean;
    children: ReactNode;
};

export const Outer: React.FC<OuterProps> = ({ children, disableScrolling = false }) => (
    <div css={{
        minHeight: "100%",
        maxWidth: 2290,
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        ...disableScrolling && {
            overflow: "hidden",
            height: "100%",
        },
    }}>{children}</div>
);

const Main: React.FC<{ children: ReactNode }> = ({ children }) => (
    <main css={{
        margin: OUTER_CONTAINER_MARGIN,
        marginBottom: 48,
        padding: MAIN_PADDING,
        flexGrow: 1,
        display: "flex",
        alignItems: "stretch",
    }}>{children}</main>
);

/**
 * The left side navigation that sticks to the viewport.
 *
 * This is unfortunately not easy. Mind you, if the nav fits into the
 * viewport, all is good: that case is trivial. But dealing with the case when
 * it not fits is hard, in particular if you want a good UX, not just a nested
 * scrollbar, for example.
 *
 * The UX we are going for is the nav being dragged around by the viewport. The
 * whole viewport is always filled with the nav. If the top of the nav aligns
 * with the top of the viewport, and the user scrolls up, the nav switches to
 * sticky/fixed and stays in the same place relative to the viewport. Same for
 * the other direction. The advantage is that whenever a user scrolls to reveal
 * parts of the nav that were hidden before, the nav immediately scrolls.
 */
const StickyNav: React.FC<React.PropsWithChildren> = ({ children }) => {
    const VIEWPORT_MARGIN = 16;

    const containerRef = useRef<HTMLDivElement | null>(null);
    const stickyBoxRef = useRef<HTMLDivElement | null>(null);

    // This is called whenever the nav or viewport resizes, or when the user
    // scrolls in a different direction than the previous scroll (i.e. changes
    // direction). If the viewport does not fit the nav, this sets a bunch of
    // CSS properties.
    const setStyle = useCallback((direction: "up" | "down") => {
        const container = currentRef(containerRef);
        const stickyBox = currentRef(stickyBoxRef);


        // If the nav fits the viewport, we don't set anything. The static CSS
        // properties set in the JSX can deal with that.
        const fitsViewport = window.innerHeight >= stickyBox.scrollHeight + 2 * VIEWPORT_MARGIN;
        if (fitsViewport) {
            // Reset everything this function might have set.
            ["margin-top", "margin-bottom", "top", "bottom"]
                .forEach(prop => stickyBox.style.removeProperty(prop));
            container.style.removeProperty("align-items");

            return;
        }

        // Set CSS properties to make the nav drag along with the viewport. The
        // idea is that we set 'top/bottom' to a negative number corresponding
        // to the amount of overflow (see `pos`). That way, when scrolling down,
        // the top of the nav can scroll out of view and only sticks later, when
        // the bottom of the nav aligns with the bottom of the viewport. The
        // same works `bottom` the other way around. We have to align the nav
        // at the bottom of the container in that case though, that's why we
        // set `alignItems`.
        //
        // But that's not enough yet, this does not have a "memory" yet so the
        // positioning is a pure function from just the scroll position. Imagine
        // really long main content and the user having scrolled to the center
        // of the page. Changing scroll direction there would immediately snap
        // the nav to one of the limit positions, being aligned either top or
        // bottom with the viewport. But we want the nav to only scroll as fast
        // as the main page. This is done by setting margin-top/bottom to
        // artificially enlarge the element by the exact amount so that in the
        // instance of scroll-direction-change, the `position: sticky` has no
        // effect. This is just the space between the top/bottom of the nav and
        // the top/bottom of the container. This space appears due to
        // `position: sticky`, but this way we manually position the nav via
        // margins.
        const posInContainer = stickyBox.offsetTop - container.offsetTop;
        const marginBottom = container.offsetHeight - posInContainer - stickyBox.offsetHeight;
        const pos = `calc(100vh - ${stickyBox.scrollHeight}px - ${VIEWPORT_MARGIN}px)`;
        match(direction, {
            "down": () => {
                stickyBox.style.top = pos;
                stickyBox.style.marginTop = `${posInContainer}px`;
                container.style.alignItems = "start";
                stickyBox.style.removeProperty("margin-bottom");
                stickyBox.style.removeProperty("bottom");
            },
            "up": () => {
                stickyBox.style.bottom = pos;
                stickyBox.style.marginBottom = `${marginBottom}px`;
                container.style.alignItems = "end";

                // It is very important to set this to `initial` to overwrite
                // the CSS set below in the JSX. Removing the property here
                // means the `top: VIEWPORT_MARGIN` stays active and conflicts
                // with `bottom`, which can lead to weird bugs in specific
                // situations.
                stickyBox.style.top = "initial";
                stickyBox.style.removeProperty("margin-top");
            },
        });
    }, []);

    const lastDirection = useRef<"up" | "down" | null>(null);
    const resizeObserver = useMemo(() => new ResizeObserver(() => {
        setStyle(lastDirection.current ?? "down");
    }), []);

    const lastScrollY = useRef(window.scrollY);
    useEffect(() => {
        // Listen for resizes of the viewport or the nav element.
        const stickyBox = currentRef(stickyBoxRef);
        resizeObserver.observe(stickyBox);
        resizeObserver.observe(document.body);

        // Check if the scroll direction reversed and if so, call `setStyle`
        const onScroll = () => {
            if (window.scrollY === lastScrollY.current) {
                return;
            }

            const direction = window.scrollY < lastScrollY.current ? "up" : "down";
            lastScrollY.current = window.scrollY;
            if (direction !== lastDirection.current) {
                lastDirection.current = direction;
                setStyle(direction);
            }
        };

        document.addEventListener("scroll", onScroll);
        return () => {
            resizeObserver.disconnect();
            document.removeEventListener("scroll", onScroll);
        };
    }, []);

    return <div ref={containerRef} css={{
        flex: "1 0 12.5%",
        minWidth: 240,
        maxWidth: 360,
        marginRight: 48,
        display: "flex",
        alignItems: "start",
        [screenWidthAtMost(NAV_BREAKPOINT)]: {
            display: "none",
        },
    }}>
        <div ref={stickyBoxRef} css={{
            width: "100%",
            position: "sticky",
            top: VIEWPORT_MARGIN,
        }}>
            {children}
        </div>
    </div>;
};

export const InitialLoading: React.FC = () => {
    const { t } = useTranslation();
    const pulsing = keyframes({
        "0%": { opacity: 0.5 },
        "50%": { opacity: 1 },
        "100%": { opacity: 0.5 },
    });

    return (
        <Outer>
            <Header />
            <Main>
                <div css={{ margin: "auto", marginTop: "min(120px, 20vh)" }}>
                    <div css={{
                        marginTop: 32,
                        animation: `${pulsing} 1.2s infinite`,
                        fontSize: 20,
                    }}>{t("general.loading")}</div>
                </div>
            </Main>
            <Footer />
        </Outer>
    );
};

const GlobalBanner: React.FC = () => {
    const { i18n } = useTranslation();

    if (!CONFIG.globalBanner) {
        return null;
    }

    const text = translatedConfig(CONFIG.globalBanner.text, i18n);

    return (
        <div css={{
            border: "1px solid",
            borderRadius: 8,
            padding: "12px 16px",
            marginBottom: 20,
            maxWidth: 800,
            display: "flex",
            alignItems: "center",
            gap: 24,
            svg: {
                flexShrink: 0,
            },
            lineHeight: 1.3,
            ...match(CONFIG.globalBanner.color, {
                "neutral": () => ({
                    backgroundColor: COLORS.neutral15,
                    color: COLORS.neutral90,
                    borderColor: COLORS.neutral30,
                }),
                "primary": () => ({
                    backgroundColor: COLORS.primary1,
                    color: COLORS.primary1BwInverted,
                    borderColor: COLORS.primary2,
                }),
                "danger": () => ({
                    backgroundColor: COLORS.danger0,
                    color: COLORS.danger0BwInverted,
                    borderColor: COLORS.danger1,
                }),
            }),
            [screenWidthAtMost(BREAKPOINT_SMALL)]: {
                fontSize: 15,
                padding: "8px 8px",
                gap: 16,
                flexDirection: "column",
            },
        }}>
            {match(CONFIG.globalBanner.icon, {
                "warning": () => <LuTriangleAlert size={28} />,
                "info": () => <LuInfo size={28} />,
            })}
            <div css={{
                "& > *:first-child": { marginTop: 0 },
                "& > *:last-child": { marginBottom: 0 },
                p: { color: "inherit" },
            }}>
                <RenderMarkdown>{text}</RenderMarkdown>
            </div>
        </div>
    );
};

/** A query that contains user data needed for the header */
interface QueryWithUserData extends OperationType {
    response: UserData$key;
}

type RootLoaderProps<Q extends QueryWithUserData> = {
    query: GraphQLTaggedNode;
    queryRef: PreloadedQuery<Q>;
    nav: (data: Q["response"]) => NavItems;
    render: (data: Q["response"]) => JSX.Element;
    /** If set to `true`, a `<meta name="robots" content="noindex">` tag is added. */
    noindex?: boolean;
};

/** Entry point for almost all routes: loads the GraphQL query and renders the main page layout */
export const RootLoader = <Q extends QueryWithUserData>({
    query,
    queryRef,
    nav,
    render,
    noindex = false,
}: RootLoaderProps<Q>) => {
    useNoindexTag(noindex);
    const data = usePreloadedQuery(query, queryRef);
    const userData = useFragment(userDataFragment, data);

    // We use a counter to force rerendering of the main part, whenever the user
    // navigates. This is an unfortunate hack for some cases where routes are
    // not rerendered. For example, the upload route, after uploading a video,
    // clicking on "upload video" in the user menu again does nothing without
    // this hack.
    const counter = useRef(0);
    const router = useRouter();
    useEffect(() => router.listenBeforeNav(() => {
        counter.current += 1;
        return undefined;
    }));

    // Unfortunately, `<ActiveRoute />` and `<RootLoader />` are still rendered
    // more than they need to on router navigation. I could not figure out how
    // to fix that. So here, we at least memoize the rendering of the whole
    // page, so that we don't rerun expensive rendering.
    const content = useMemo(() => (
        <Root nav={nav(data)}>
            <React.Fragment key={counter.current}>{render(data)}</React.Fragment>
        </Root>
    ), [render, nav, data]);

    return (
        <UserProvider data={userData?.currentUser}>
            {content}
        </UserProvider>
    );
};
