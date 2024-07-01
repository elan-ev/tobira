import React, {
    ReactNode,
    createContext,
    useContext,
    useEffect,
    useId,
    useRef,
    useState,
} from "react";
import { useTranslation } from "react-i18next";
import {
    match, unreachable, ProtoButton, screenWidthAtMost, screenWidthAbove,
    useColorScheme, Floating, FloatingHandle, useFloatingItemProps,
} from "@opencast/appkit";
import { keyframes } from "@emotion/react";
import { IconType } from "react-icons";
import {
    LuColumns, LuList, LuChevronLeft, LuChevronRight, LuPlay, LuLayoutGrid,
} from "react-icons/lu";
import { graphql, useFragment } from "react-relay";

import { keyOfId } from "../../util";
import { Link } from "../../router";
import { VideoListOrder, VideoListLayout } from "./__generated__/SeriesBlockData.graphql";
import { isPastLiveEvent, isUpcomingLiveEvent, Thumbnail } from "../Video";
import { RelativeDate } from "../time";
import { CollapsibleDescription, SmallDescription } from "../metadata";
import { darkModeBoxShadow, ellipsisOverflowCss, focusStyle } from "..";
import { COLORS } from "../../color";
import { FloatingBaseMenu } from "../FloatingBaseMenu";
import {
    VideoListEventData$data,
    VideoListEventData$key,
} from "./__generated__/VideoListEventData.graphql";





const eventFragment = graphql`
    fragment VideoListEventData on AuthorizedEvent @relay(plural: true) {
        id
        title
        created
        creators
        isLive
        description
        syncedData {
            duration
            thumbnail
            startTime
            endTime
            tracks { resolution }
        }
    }
`;
type Event = VideoListEventData$data[0];


// ==============================================================================================
// ===== Main components defining UI
// ==============================================================================================

type OrderContext = {
    eventOrder: VideoListOrder;
    setEventOrder: (newOrder: VideoListOrder) => void;
};

const OrderContext = createContext<OrderContext>({
    eventOrder: "NEW_TO_OLD",
    setEventOrder: () => {},
});

const VIDEO_GRID_BREAKPOINT = 600;

export type VideoListBlockProps = {
    basePath: string;
    activeEventId?: string;
    initialOrder?: VideoListOrder;
    initialLayout?: VideoListLayout;
    title?: string;
    description?: string;
    eventsFrag: VideoListEventData$key;
}

export const VideoListBlock: React.FC<VideoListBlockProps> = ({
    basePath,
    activeEventId,
    initialOrder = "NEW_TO_OLD",
    initialLayout = "GALLERY",
    title,
    description,
    eventsFrag,
}) => {
    const { t, i18n } = useTranslation();
    const collator = new Intl.Collator(i18n.language);
    const [eventOrder, setEventOrder] = useState<VideoListOrder>(initialOrder);

    const events = useFragment(eventFragment, eventsFrag);

    const upcomingLiveEvents = [];
    const mainEvents = [];
    for (const event of events) {
        if (isUpcomingLiveEvent(event.syncedData?.startTime ?? null, event.isLive)) {
            upcomingLiveEvents.push(event);
        } else if (!isPastLiveEvent(event.syncedData?.endTime ?? null, event.isLive)) {
            mainEvents.push(event);
        }
    }

    const timeMs = (event: Event) =>
        new Date(event.syncedData?.startTime ?? event.created).getTime();

    const compareEvents = (a: Event, b: Event, reverseTime = false) =>
        match(eventOrder, {
            "NEW_TO_OLD": () => reverseTime ? timeMs(a) - timeMs(b) : timeMs(b) - timeMs(a),
            "OLD_TO_NEW": () => reverseTime ? timeMs(b) - timeMs(a) : timeMs(a) - timeMs(b),
            "AZ": () => collator.compare(a.title, b.title),
            "ZA": () => collator.compare(b.title, a.title),
        }, unreachable);

    mainEvents.sort((a, b) => {
        // Sort all live events before non-live events.
        if (a.isLive !== b.isLive) {
            return +b.isLive - +a.isLive;
        }

        return compareEvents(a, b);
    });

    // If there is only one upcoming event, it doesn't need an extra box or ordering.
    if (upcomingLiveEvents.length === 1) {
        mainEvents.unshift(upcomingLiveEvents[0]);
    } else {
        upcomingLiveEvents.sort((a, b) => compareEvents(a, b, true));
    }

    const renderEvents = (events: Event[]) => (
        <Videos
            basePath={basePath}
            items={events.map(event => ({ event, active: event.id === activeEventId }))}
        />
    );


    const eventsNotEmpty = events.length > 0;

    return <OrderContext.Provider value={{ eventOrder, setEventOrder }}>
        <VideoListBlockContainer
            showViewOptions={eventsNotEmpty}
            {...{ title, description, initialLayout }}
        >
            {!eventsNotEmpty
                ? <div css={{ padding: 14 }}>{t("series.no-events")}</div>
                : <>
                    {upcomingLiveEvents.length > 1 && (
                        <UpcomingEventsGrid count={upcomingLiveEvents.length}>
                            {renderEvents(upcomingLiveEvents)}
                        </UpcomingEventsGrid>
                    )}
                    {renderEvents(mainEvents)}
                </>
            }
        </VideoListBlockContainer>
    </OrderContext.Provider>;
};


type VideoListBlockContainerProps = {
    title?: string;
    description?: string | null;
    children: ReactNode;
    showViewOptions: boolean;
    initialLayout?: VideoListLayout;
};

type LayoutContext = {
    layoutState: VideoListLayout;
    setLayoutState: (layout: VideoListLayout) => void;
};

const LayoutContext = createContext<LayoutContext>({
    layoutState: "GALLERY",
    setLayoutState: () => {},
});

export const VideoListBlockContainer: React.FC<VideoListBlockContainerProps> = (
    { title, description, children, showViewOptions, initialLayout = "GALLERY" },
) => {
    const [layoutState, setLayoutState] = useState<VideoListLayout>(initialLayout);
    const isDark = useColorScheme().scheme === "dark";

    return <LayoutContext.Provider value={{ layoutState, setLayoutState }}>
        <div css={{
            marginTop: 24,
            padding: 12,
            backgroundColor: COLORS.neutral10,
            borderRadius: 10,
            ...isDark && darkModeBoxShadow,
        }}>
            <>
                <div css={{
                    display: "flex",
                    justifyContent: "space-between",
                    ...title && description && { flexDirection: "column" },
                    [screenWidthAtMost(VIDEO_GRID_BREAKPOINT)]: {
                        flexWrap: "wrap",
                    },
                }}>
                    {title && <h2 css={{
                        display: "inline-block",
                        padding: "8px 12px",
                        color: isDark ? COLORS.neutral90 : COLORS.neutral80,
                        fontSize: 20,
                        lineHeight: 1.3,
                    }}>{title}</h2>}
                    <div css={{
                        display: "flex",
                        flexDirection: "row",
                        flexGrow: 1,
                        [screenWidthAtMost(VIDEO_GRID_BREAKPOINT)]: {
                            flexWrap: "wrap",
                        },
                    }}>
                        {description && <CollapsibleDescription
                            type="series"
                            bottomPadding={32}
                            {...{ description }}
                        />}
                        {showViewOptions && <div css={{
                            display: "flex",
                            alignItems: "center",
                            alignSelf: description ? "flex-end" : "flex-start",
                            marginLeft: "auto",
                            fontSize: 14,
                            gap: 16,
                            padding: 5,
                        }}>
                            <OrderMenu />
                            <LayoutMenu />
                        </div>}
                    </div>
                </div>
                {description && <hr css={{ margin: "12px 6px 20px 6px" }} />}
            </>
            {children}
        </div>
    </LayoutContext.Provider>;
};



// ==============================================================================================
// ===== The menus for choosing order and layout mode
// ==============================================================================================


const OrderMenu: React.FC = () => {
    const { t } = useTranslation();
    const ref = useRef<FloatingHandle>(null);
    const order = useContext(OrderContext);

    const triggerContent = match(order.eventOrder, {
        "NEW_TO_OLD": () => t("videolist-block.settings.new-to-old"),
        "OLD_TO_NEW": () => t("videolist-block.settings.old-to-new"),
        "AZ": () => t("videolist-block.settings.a-z"),
        "ZA": () => t("videolist-block.settings.z-a"),
        "%future added value": () => unreachable(),
    });

    return <FloatingBaseMenu
        {...{ ref }}
        label={t("videolist-block.settings.order-label")}
        triggerContent={<>{triggerContent}</>}
        list={<List type="order" close={() => ref.current?.close()} />}
    />;
};

const LayoutMenu: React.FC = () => {
    const { t } = useTranslation();
    const state = useContext(LayoutContext);
    const ref = useRef<FloatingHandle>(null);

    const icon = match(state.layoutState, {
        SLIDER: () => <LuColumns />,
        GALLERY: () => <LuLayoutGrid />,
        LIST: () => <LuList />,
        "%future added value": () => unreachable(),
    });

    const triggerContent = (
        <div css={{
            display: "flex",
            alignItems: "center",
            svg: { fontSize: 22, color: COLORS.neutral60 },
        }}>{icon}</div>
    );

    return <FloatingBaseMenu
        {...{ ref, triggerContent }}
        label={t("videolist-block.settings.layout-label")}
        list={<List type="layout" close={() => ref.current?.close()} />}
    />;
};


type ListProps = {
    type: "layout" | "order";
    close: () => void;
};

const List: React.FC<ListProps> = ({ type, close }) => {
    const { t } = useTranslation();
    const isDark = useColorScheme().scheme === "dark";
    const { layoutState, setLayoutState } = useContext(LayoutContext);
    const { eventOrder, setEventOrder } = useContext(OrderContext);
    const itemProps = useFloatingItemProps();
    const itemId = useId();

    const listStyle = {
        minWidth: 125,
        div: {
            cursor: "default",
            fontSize: 12,
            padding: "8px 14px 4px 14px",
            color: COLORS.neutral60,
        },
        ul: {
            listStyle: "none",
            margin: 0,
            padding: 0,
        },
    };

    const handleBlur = (event: React.FocusEvent<HTMLUListElement, Element>) => {
        if (!event.currentTarget.contains(event.relatedTarget as HTMLUListElement)) {
            close();
        }
    };

    type LayoutTranslationKey = "slider" | "gallery" | "list";
    const layoutItems: [
        VideoListLayout,
        LayoutTranslationKey,
        IconType
    ][] = [
        ["SLIDER", "slider", LuColumns],
        ["GALLERY", "gallery", LuLayoutGrid],
        ["LIST", "list", LuList],
    ];

    type OrderTranslationKey = "new-to-old" | "old-to-new" | "a-z" | "z-a";
    const orderItems: [VideoListOrder, OrderTranslationKey][] = [
        ["NEW_TO_OLD", "new-to-old"],
        ["OLD_TO_NEW", "old-to-new"],
        ["AZ", "a-z"],
        ["ZA", "z-a"],
    ];

    const sharedProps = (key: LayoutTranslationKey | OrderTranslationKey) => ({
        close: close,
        label: t(`videolist-block.settings.${key}`),
    });

    const list = match(type, {
        layout: () => <>
            <div>{t("videolist-block.settings.layout")}</div>
            <ul role="menu" onBlur={handleBlur}>
                {layoutItems.map(([layout, translationKey, icon], index) => <MenuItem
                    key={`${itemId}-${layout}`}
                    disabled={layoutState === layout}
                    Icon={icon}
                    {...sharedProps(translationKey)}
                    {...itemProps(index)}
                    onClick={() => setLayoutState(layout)}
                />)}
            </ul>
        </>,
        order: () => <>
            <div>{t("videolist-block.settings.order")}</div>
            <ul role="menu" onBlur={handleBlur}>
                {orderItems.map(([order, orderKey], index) => <MenuItem
                    key={`${itemId}-${order}`}
                    disabled={eventOrder === order}
                    {...sharedProps(orderKey)}
                    {...itemProps(index)}
                    onClick={() => setEventOrder(order)}
                />)}
            </ul>
        </>,
    });

    return <Floating
        backgroundColor={isDark ? COLORS.neutral15 : COLORS.neutral05}
        hideArrowTip
        padding={0}
        borderWidth={isDark ? 1 : 0}
        css={listStyle}
    >
        {list}
    </Floating>;
};


type MenuItemProps = {
    Icon?: IconType;
    label: string;
    onClick?: () => void;
    close: () => void;
    disabled: boolean;
};

const MenuItem = React.forwardRef<HTMLButtonElement, MenuItemProps>(({
    Icon, label, onClick, close, disabled,
}, ref) => {
    const isDark = useColorScheme().scheme === "dark";

    return (
        <li css={{
            ":not(:last-child)": {
                borderBottom: `1px solid ${isDark ? COLORS.neutral40 : COLORS.neutral20}`,
            },
            ":last-child button": {
                borderRadius: "0 0 8px 8px",
            },
        }}>
            <ProtoButton
                {...{ ref, disabled }}
                role="menuitem"
                onClick={() => {
                    if (onClick) {
                        onClick();
                    }
                    close();
                }}
                css={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "8px 14px",
                    width: "100%",
                    svg: { fontSize: 16 },
                    ":hover, :focus": {
                        backgroundColor: isDark ? COLORS.neutral10 : COLORS.neutral15,
                    },
                    ...focusStyle({ inset: true }),
                    "&[disabled]": {
                        fontWeight: "bold",
                        color: COLORS.neutral80,
                        pointerEvents: "none",
                        ...isDark && { backgroundColor: COLORS.neutral10 },
                    },
                }}
            >
                {Icon && <Icon />}
                {label}
            </ProtoButton>
        </li>
    );
});

// ==============================================================================================
// ===== Components for displaying the main part: the video items
// ==============================================================================================

type ViewProps = {
    basePath: string;
    items: {
        event: Event;
        active: boolean;
    }[];
};

const Videos: React.FC<ViewProps> = ({ basePath, items }) => {
    const { layoutState } = useContext(LayoutContext);
    return match(layoutState, {
        SLIDER: () => <SliderView {...{ basePath, items }} />,
        GALLERY: () => <GalleryView {...{ basePath, items }} />,
        LIST: () => <ListView {...{ basePath, items }} />,
        "%future added value": () => unreachable(),
    });
};

const ITEM_MIN_SIZE = 250;
const ITEM_MIN_SIZE_SMALL_SCREENS = 240;
const ITEM_MAX_SIZE = 330;
const ITEM_MAX_SIZE_SMALL_SCREENS = 360;

const GalleryView: React.FC<ViewProps> = ({ basePath, items }) => (
    // The following is not exactly what we want, but CSS does not allow us to
    // do what we want. Let me elaborate. For the sake of this explanation,
    // let's assume we want the items to be at least 240px and at most 300px
    // wide.
    //
    // What we want is the `repeat(auto-fill)` behavior of the grid. It's nice,
    // but has one crucial limitation: it is not possible to properly specify a
    // max-width for items. That's what we want: Fit as many items as possible
    // given a min item width. With the remaining space, try to grow each item
    // by the same amount. If you already grew each item as much as possible
    // (according to a max item width), then align all items in the center of
    // the container (as if the remaining space was padding-left/right of the
    // container).
    //
    // As you can see below we use `minmax(240px, 1fr)`: a fixed minimum and 1fr
    // as maximum. The minimum works well, but `1fr` as maximum means that the
    // track always takes 1fr of the container width, even if thats more than
    // the `max-width` of the items below. In that case, the `justifySelf`
    // below gets active and aligns the `Item` inside the track.
    //
    // Using `justifySelf: center` means that the remaining space is added
    // around each item, effectively growing the gap between the items. That
    // doesn't look that great.
    //
    // The obvious idea is to use `minmax(240px, 300px)` right? Except that
    // doesn't work. I'm still not sure if its intended by the spec or if
    // browser just implement it incorrectly. But with that, browsers always
    // make the tracks max (300px) wide.
    //
    // One promising solution is to use `minmax(240px, max-content)`. We do need
    // to add a `<div style="width: 300px" />` as child of the grid item to
    // explicitly state that the max-content is 300px (otherwise videos without
    // thumbnails break). But the larger problem is that the virtual items that
    // are imagined by `auto-fill` take the width 240px as they don't have a
    // defined max-content. At least that's the case if there are not enough
    // items to completely fill one line. So then the real and virtual items
    // have different widths, leading to weird alignment problems. These are
    // particularly apparent if two series blocks are right next to each other
    // and one of those has few enough videos to not fill a line. So I have not
    // been able to make this approach work.
    //
    // A few other ideas I tried and failed to make work:
    // - Add left and right padding to the container which we manually
    //   calculate. Can't get it to work because CSS does not yet offer modulo
    //   operations. I haven't found a way to polyfill `mod()` as there isn't
    //   even a way to floor/round a number.
    // - Add `margin: 0 auto` to the container and/or put it into a flexbox,
    //   both with `inline-grid`. It seems like `auto-fill` just doesn't work
    //   with `inline-grid`. And without `inline-grid`, the container always
    //   fill the whole container.
    //
    // What I ended up doing now is just putting a band-aid over the biggest
    // ugliness, which is the large gap in the worst screen width when not
    // quite fitting 3 items in a row. That happens inside the  screen width
    // range 650px to 1150px. In that range, we `justifySelf: right` every odd
    // item(i.e. the left one in a 2 item line). With this alternating
    // alignment (the default is `left`), it looks as if both items in a line
    // are centered. Crucially, inside this range, there is never a
    // non-2-item-line where the alignment matters (i.e. the space is always
    // filled completely by the items). So this doesn't break anything. There
    // is still a slightly enlarged gap for a small range of screens sizes with
    // 3 items per line. But that's not too bad.
    <div css={{
        display: "grid",
        gridTemplateColumns: `repeat(auto-fill, minmax(${ITEM_MIN_SIZE}px, 1fr))`,
        marginTop: 6,
        columnGap: 12,
        rowGap: 28,
        [screenWidthAtMost(1600)]: {
            gridTemplateColumns: `repeat(auto-fill, minmax(${ITEM_MIN_SIZE_SMALL_SCREENS}px, 1fr))`,
        },
    }}>
        {items.map(({ event, active }) => (
            <Item
                key={event.id}
                {...{ event, active, basePath }}
                css={{
                    width: "100%",
                    maxWidth: ITEM_MAX_SIZE,

                    // See long comment above.
                    "@media (min-width: 650px) and (max-width: 1150px)": {
                        ":nth-child(odd)": {
                            justifySelf: "right",
                        },
                    },
                    [screenWidthAtMost(VIDEO_GRID_BREAKPOINT)]: {
                        maxWidth: ITEM_MAX_SIZE_SMALL_SCREENS,
                        justifySelf: "center",
                    },
                }}
            />
        ))}
    </div>
);

const ListView: React.FC<ViewProps> = ({ basePath, items }) => (
    <div css={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
    }}>
        {items.map(({ event, active }) => (
            <Item
                key={event.id}
                {...{ event, active, basePath }}
                showDescription
                css={{
                    width: "100%",
                    margin: 6,
                    [screenWidthAtMost(VIDEO_GRID_BREAKPOINT)]: {
                        maxWidth: 360,
                    },
                    [screenWidthAbove(VIDEO_GRID_BREAKPOINT)]: {
                        display: "flex",
                        gap: 16,
                        "> :first-child": { flex: "0 0 240px" },
                    },
                }}
            />
        ))}
    </div>
);

const SliderView: React.FC<ViewProps> = ({ basePath, items }) => {
    const { t } = useTranslation();
    const ref = useRef<HTMLDivElement>(null);
    const scrollDistance = 240;

    const [rightVisible, setRightVisible] = useState(false);
    const [leftVisible, setLeftVisible] = useState(false);

    /**
     * This hides the left and/or right scroll buttons if the slider is scrolled almost all
     * the way to the left or right respectively, or when there is nothing to scroll to.
     */
    const setVisibilities = () => {
        if (ref.current) {
            const totalSliderWidth = ref.current.scrollWidth;
            const scrollPositionLeft = ref.current.scrollLeft;
            const scrollPositionRight = ref.current.scrollLeft + ref.current.offsetWidth;
            setRightVisible(scrollPositionRight < (totalSliderWidth - 16));
            setLeftVisible(scrollPositionLeft > 16);
        }
    };

    const scroll = (distance: number) => {
        if (ref.current) {
            ref.current.scrollLeft += distance;
            setVisibilities();
        }
    };

    useEffect(setVisibilities, []);

    const buttonCss = {
        position: "absolute",
        alignSelf: "center",
        backgroundColor: COLORS.neutral40,
        borderRadius: 24,
        padding: 11,
        transition: "background-color .05s",
        svg: {
            color: "white",
            display: "block",
            fontSize: 26,
        },
        ":hover, :focus": {
            backgroundColor: COLORS.neutral60,
        },
        ...focusStyle({}),
    } as const;

    return <div css={{ position: "relative" }}>
        <div tabIndex={-1} onScroll={() => setVisibilities()} ref={ref} css={{
            display: "flex",
            marginRight: 5,
            overflow: "auto",
            scrollBehavior: "smooth",
            scrollSnapType: "inline mandatory",
            ":first-child > :first-child": {
                scrollMargin: 6,
            },
        }}>
            {items.map(({ event, active }) => (
                <Item
                    key={event.id}
                    {...{ event, active, basePath }}
                    css={{
                        scrollSnapAlign: "start",
                        flex: "0 0 270px",
                        maxWidth: 270,
                        margin: 6,
                        marginBottom: 24,
                    }}
                />
            ))}
            {leftVisible && <ProtoButton
                aria-label={t("videolist-block.slider.scroll-left")}
                onClick={() => scroll(-scrollDistance)}
                css={{ left: 8, ...buttonCss }}
            ><LuChevronLeft /></ProtoButton>}
            {rightVisible && <ProtoButton
                aria-label={t("videolist-block.slider.scroll-right")}
                onClick={() => scroll(scrollDistance)}
                css={{ right: 8, ...buttonCss }}
            ><LuChevronRight /></ProtoButton>}
        </div>
    </div>;
};


type UpcomingEventsGridProps = React.PropsWithChildren<{
    count: number;
}>;

const UpcomingEventsGrid: React.FC<UpcomingEventsGridProps> = ({ count, children }) => {
    const { t } = useTranslation();

    return (
        <details css={{
            backgroundColor: COLORS.neutral20,
            borderRadius: 4,
            margin: "8px 0",
            ":is([open]) summary": {
                borderBottom: `1px solid ${COLORS.neutral25}`,
                borderRadius: "4px 4px 0 0",
            },
        }}>
            <summary css={{
                color: COLORS.neutral80,
                cursor: "pointer",
                fontSize: 14,
                padding: "6px 12px",
                ":hover, :focus-visible": {
                    backgroundColor: COLORS.neutral25,
                    borderRadius: 4,
                    color: COLORS.neutral90,
                },
                ...focusStyle({}),
            }}>
                <span css={{ marginLeft: 4 }}>
                    {t("videolist-block.upcoming-live-streams", { count })}
                </span>
            </summary>
            {children}
        </details>
    );
};


type ItemProps = {
    basePath: string;
    event: Event;
    active: boolean;
    showDescription?: boolean;
    className?: string;
};

const Item: React.FC<ItemProps> = ({
    event,
    basePath,
    active,
    showDescription = false,
    className,
}) => {
    const TRANSITION_IN_DURATION = "0.15s";
    const TRANSITION_OUT_DURATION = "0.3s";
    const date = event.syncedData?.startTime ?? event.created;

    const inner = <>
        <div css={{ borderRadius: 8, position: "relative" }}>
            <Thumbnail event={event} active={active} />
            <div css={{
                position: "absolute",
                top: 0,
                height: "100%",
                width: "100%",
                overflow: "hidden",
                borderRadius: 8,
            }}>
                <div css={{
                    background: "linear-gradient(to top, white, rgba(255, 255, 255, 0.1))",
                    height: 90,
                    transition: `transform ${TRANSITION_OUT_DURATION}, `
                        + `opacity ${TRANSITION_OUT_DURATION}`,
                    opacity: 0.1,
                    filter: "blur(3px)",
                    transformOrigin: "bottom right",
                    transform: "translateY(-60px) rotate(30deg)",
                }} />
            </div>
        </div>
        <div css={{
            margin: "0px 4px",
            marginTop: 12,
            color: COLORS.neutral90,
        }}>
            <h3 css={{
                display: "flex",
                alignItems: "center",
                fontSize: "inherit",
                gap: 4,
                marginBottom: 4,
            }}>
                {active && <LuPlay css={{
                    flex: "0 0 auto",
                    strokeWidth: 3,
                    animation: `${keyframes({
                        "0%": { opacity: 1 },
                        "50%": { opacity: 0.3 },
                        "100%": { opacity: 1 },
                    })} 2s infinite`,
                }}/>}
                <div css={{
                    fontSize: "inherit",
                    lineHeight: 1.3,
                    ...ellipsisOverflowCss(2),
                }}>{event.title}</div>
            </h3>
            <div css={{
                color: COLORS.neutral80,
                fontSize: 14,
                display: "flex",
                flexWrap: "wrap",
                "& > span": {
                    display: "inline-block",
                    whiteSpace: "nowrap",
                },
            }}>
                {event.creators.length > 0 && <span css={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    "&:after": {
                        content: "'•'",
                        padding: "0 8px",
                    },
                    // TODO: maybe find something better than `join`
                }}>{event.creators.join(", ")}</span>}
                {/* `new Date` is well defined for our ISO Date strings */}
                <RelativeDate date={new Date(date)} isLive={event.isLive} />
            </div>
            {showDescription && <SmallDescription lines={3} text={event.description} />}
        </div>
    </>;

    const containerStyle = {
        position: "relative",
        display: "block",
        padding: 6,
        borderRadius: 12,
        textDecoration: "none",
        "& a": { color: COLORS.neutral90, textDecoration: "none" },
        ...active && { backgroundColor: COLORS.neutral20 },
        ...!active && {
            "& > div:first-child": {
                transition: `transform ${TRANSITION_OUT_DURATION}, `
                    + `box-shadow ${TRANSITION_OUT_DURATION},`
                    + `filter ${TRANSITION_OUT_DURATION}`,
            },
            "&:hover > div:first-child, &:focus-visible > div:first-child": {
                boxShadow: "0 6px 10px rgb(0 0 0 / 40%)",
                transform: "perspective(500px) rotateX(7deg) scale(1.05)",
                transitionDuration: TRANSITION_IN_DURATION,
                "& > div:nth-child(2) > div": {
                    opacity: 0.2,
                    transform: "rotate(30deg)",
                    transitionDuration: TRANSITION_IN_DURATION,
                },
            },
            "&:hover img, &:focus-visible img": {
                filter: "brightness(100%)",
            },
            ...focusStyle({}),
        },
    } as const;

    return active
        ? <div css={containerStyle} {...{ className }}>{inner}</div>
        : <Link
            to={`${basePath}/${keyOfId(event.id)}`}
            css={containerStyle}
            {...{ className }}
        >{inner}</Link>;
};
