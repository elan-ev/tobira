import React, {
    PropsWithChildren,
    ReactNode,
    createContext,
    useContext,
    useEffect,
    useId,
    useRef,
    useState,
} from "react";
import { Trans, useTranslation } from "react-i18next";
import type { i18n } from "i18next";
import {
    match, unreachable, ProtoButton, screenWidthAtMost, screenWidthAbove,
    useColorScheme, Floating, FloatingHandle, useFloatingItemProps, bug,
    matchTag,
} from "@opencast/appkit";
import { keyframes } from "@emotion/react";
import { IconType } from "react-icons";
import {
    LuColumns2, LuList, LuChevronLeft, LuChevronRight, LuPlay, LuLayoutGrid, LuCircleAlert, LuInfo,
    LuRss, LuLink,
} from "react-icons/lu";
import { graphql, readInlineData } from "react-relay";

import { VideoListLayout } from "./__generated__/SeriesBlockData.graphql";
import {
    VideoListEventData$data,
    VideoListEventData$key,
} from "./__generated__/VideoListEventData.graphql";
import { PlaylistBlockPlaylistData$data } from "./__generated__/PlaylistBlockPlaylistData.graphql";
import { floatingMenuProps, keyOfId } from "../../util";
import { Link } from "../../router";
import SeriesIcon from "../../icons/series.svg";
import {
    BaseThumbnailReplacement, isPastLiveEvent, isUpcomingLiveEvent, Thumbnail,
    ThumbnailOverlayContainer,
} from "../Video";
import { PrettyDate } from "../time";
import { CollapsibleDescription, DateAndCreators, SmallDescription } from "../metadata";
import { darkModeBoxShadow, ellipsisOverflowCss, focusStyle } from "..";
import { COLORS } from "../../color";
import { FloatingBaseMenu } from "../FloatingBaseMenu";
import { isRealUser, useUser } from "../../User";
import { LoginLink } from "../../routes/util";
import { QrCodeButton, ShareButton } from "../ShareButton";
import { CopyableInput } from "../Input";




// This uses `@inline` because the fragment is used in different situations,
// where using `useFragment` is very tricky (or maybe even impossible).
export const videoListEventFragment = graphql`
    fragment VideoListEventData on AuthorizedEvent @inline {
        id
        title
        created
        creators
        isLive
        description
        series { title id }
        syncedData {
            thumbnail
            duration
            startTime
            endTime
            audioOnly
        }
        authorizedData {
            tracks { resolution }
        }
    }
`;
type Event = VideoListEventData$data;


// ==============================================================================================
// ===== Main components defining UI
// ==============================================================================================

type OrderContext = {
    eventOrder: Order;
    setEventOrder: (newOrder: Order) => void;
    allowOriginalOrder: boolean;
};

const OrderContext = createContext<OrderContext | null>(null);

const VIDEO_GRID_BREAKPOINT = 600;

type VideoListItem = Event | "missing" | "unauthorized";

type Order = "ORIGINAL" | "AZ" | "ZA" | "NEW_TO_OLD" | "OLD_TO_NEW";

type Entries = Extract<
    PlaylistBlockPlaylistData$data,
    { __typename: "AuthorizedPlaylist" }
>["entries"];

export type VideoListBlockProps = {
    listId?: string;
    realmPath: string | null;
    activeEventId?: string;
    allowOriginalOrder: boolean;
    initialOrder: Order;
    initialLayout?: VideoListLayout;
    title?: string;
    description?: string;
    timestamp?: string;
    creators?: string[];
    shareInfo: VideoListShareButtonProps,
    isPlaylist?: boolean;
    listEntries: Entries;
    editMode: boolean;
}

export const VideoListBlock: React.FC<VideoListBlockProps> = ({
    listId,
    realmPath,
    activeEventId,
    allowOriginalOrder,
    initialOrder,
    initialLayout = "GALLERY",
    title,
    description,
    timestamp,
    creators,
    shareInfo,
    isPlaylist = false,
    listEntries,
    editMode,
}) => {
    const { t, i18n } = useTranslation();
    const [eventOrder, setEventOrder] = useState<Order>(initialOrder);
    const user = useUser();

    const items = listEntries.map(entry => matchTag(entry, "__typename", {
        "AuthorizedEvent": entry =>
            readInlineData<VideoListEventData$key>(videoListEventFragment, entry),
        "Missing": () => "missing" as VideoListItem,
        "NotAllowed": () => "unauthorized" as VideoListItem,
        "%other": () => unreachable(),
    }));

    const {
        mainItems,
        upcomingLiveEvents,
        missingItems,
        unauthorizedItems,
    } = orderItems(items, eventOrder, i18n);

    const basePath = realmPath == null ? "/!v" : `${realmPath.replace(/\/$/u, "")}/v`;
    const renderEvents = (events: readonly VideoListItem[]) => (
        <Items
            basePath={basePath}
            showSeries={isPlaylist}
            {...{ listId }}
            items={events.map(item => ({
                item,
                active: item !== "missing"
                    && item !== "unauthorized"
                    && item.id === activeEventId,
            }))}
        />
    );

    const eventsNotEmpty = items.length > 0;
    const hasHiddenItems = missingItems + unauthorizedItems > 0;

    return <OrderContext.Provider value={{ eventOrder, setEventOrder, allowOriginalOrder }}>
        <VideoListBlockContainer
            showViewOptions={eventsNotEmpty}
            {...{ title, description, timestamp, creators, shareInfo, initialLayout, isPlaylist }}
        >
            {(mainItems.length + upcomingLiveEvents.length === 0 && !hasHiddenItems)
                ? <div css={{ padding: 14 }}>{t("manage.video-list.no-content")}</div>
                : <>
                    {upcomingLiveEvents.length > 1 && (
                        <UpcomingEventsGrid count={upcomingLiveEvents.length}>
                            {renderEvents(upcomingLiveEvents)}
                        </UpcomingEventsGrid>
                    )}
                    {renderEvents(mainItems)}
                </>
            }
            {hasHiddenItems && <div css={{ marginTop: 16 }}>
                {missingItems > 0 && editMode && <HiddenItemsInfo>
                    {t("video-list-block.hidden-items.missing", { count: missingItems })}
                </HiddenItemsInfo>}
                {unauthorizedItems > 0 && <HiddenItemsInfo>
                    <span>
                        {t("video-list-block.hidden-items.unauthorized", {
                            count: unauthorizedItems,
                        })}
                        &nbsp;
                        {!isRealUser(user) && <>
                            <Trans i18nKey="errors.might-need-to-login-link">
                                You might need to <LoginLink />
                            </Trans>
                        </>}
                    </span>
                </HiddenItemsInfo>}
            </div>}
        </VideoListBlockContainer>
    </OrderContext.Provider>;
};

const HiddenItemsInfo: React.FC<PropsWithChildren> = ({ children }) => <div css={{
    fontSize: 14,
    marginTop: 8,
    backgroundColor: COLORS.neutral15,
    padding: "8px 16px",
    borderRadius: 4,
    display: "flex",
    gap: 16,
    alignItems: "center",
}}>
    <LuInfo size={18} />
    {children}
</div>;

type OrderedItems = {
    mainItems: readonly VideoListItem[];
    upcomingLiveEvents: Event[];
    missingItems: number;
    unauthorizedItems: number;
};

const orderItems = (
    items: readonly VideoListItem[],
    eventOrder: Order,
    i18n: i18n,
): OrderedItems => {
    if (eventOrder === "ORIGINAL") {
        return {
            mainItems: items,
            upcomingLiveEvents: [],
            missingItems: 0,
            unauthorizedItems: 0,
        };
    }

    const upcomingLiveEvents: Event[] = [];
    const mainItems: VideoListItem[] = [];
    let missingItems = 0;
    let unauthorizedItems = 0;
    for (const event of items) {
        // When the order isn't "original", then we don't show special items
        // inline, but as a separate note at the bottom.
        if (event === "missing") {
            missingItems += 1;
            continue;
        }
        if (event === "unauthorized") {
            unauthorizedItems += 1;
            continue;
        }

        if (isUpcomingLiveEvent(event.syncedData?.startTime ?? null, event.isLive)) {
            upcomingLiveEvents.push(event);
        } else if (!isPastLiveEvent(event.syncedData?.endTime ?? null, event.isLive)) {
            mainItems.push(event);
        }
    }

    const timeMs = (event: Event) =>
        new Date(event.syncedData?.startTime ?? event.created).getTime();

    const collator = new Intl.Collator(i18n.language);
    const compareEvents = (a: Event, b: Event, reverseTime = false) =>
        match(eventOrder, {
            "NEW_TO_OLD": () => reverseTime ? timeMs(a) - timeMs(b) : timeMs(b) - timeMs(a),
            "OLD_TO_NEW": () => reverseTime ? timeMs(b) - timeMs(a) : timeMs(a) - timeMs(b),
            "AZ": () => collator.compare(a.title, b.title),
            "ZA": () => collator.compare(b.title, a.title),
        });


    mainItems.sort((a, b) => {
        // Sort all missing and unauthorized items last. The `return` is
        // basically unreachable code, so it could also be replaced by
        // `unreachable`.
        const aSpecial = a === "missing" || a === "unauthorized";
        const bSpecial = b === "missing" || b === "unauthorized";
        if (aSpecial || bSpecial) {
            return +aSpecial - +bSpecial;
        }

        // Sort all live events before non-live events.
        if (a.isLive !== b.isLive) {
            return +b.isLive - +a.isLive;
        }

        return compareEvents(a, b);
    });

    // If there is only one upcoming event, it doesn't need an extra box or ordering.
    if (upcomingLiveEvents.length === 1) {
        mainItems.unshift(upcomingLiveEvents[0]);
    } else {
        upcomingLiveEvents.sort((a, b) => compareEvents(a, b, true));
    }

    return { mainItems, upcomingLiveEvents, missingItems, unauthorizedItems };
};


type VideoListBlockContainerProps = {
    title?: string;
    description?: string | null;
    timestamp?: string;
    creators?: string[];
    shareInfo?: VideoListShareButtonProps,
    children: ReactNode;
    showViewOptions: boolean;
    initialLayout?: VideoListLayout;
    isPlaylist?: boolean;
};

type LayoutContext = {
    layoutState: VideoListLayout;
    setLayoutState: (layout: VideoListLayout) => void;
};

const LayoutContext = createContext<LayoutContext>({
    layoutState: "GALLERY",
    setLayoutState: () => {},
});

export const VideoListBlockContainer: React.FC<VideoListBlockContainerProps> = ({
    title, description, timestamp, creators, shareInfo, children,
    showViewOptions, initialLayout = "GALLERY",
}) => {
    const [layoutState, setLayoutState] = useState<VideoListLayout>(initialLayout);
    const isDark = useColorScheme().scheme === "dark";
    const hasMetadata = description || timestamp || (creators && creators.length > 0);

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
                    ...title && hasMetadata && { flexDirection: "column" },
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
                        maxWidth: "100%",
                    }}>{title}</h2>}
                    <div css={{
                        display: "flex",
                        flexDirection: "row",
                        flexGrow: 1,
                        maxWidth: "100%",
                        [screenWidthAtMost(VIDEO_GRID_BREAKPOINT)]: {
                            flexWrap: "wrap",
                        },
                    }}>
                        <div>
                            {(timestamp || (creators && creators.length > 0)) && <DateAndCreators
                                timestamp={timestamp}
                                isLive={false}
                                creators={creators}
                                css={{
                                    margin: "0px 12px",
                                    gap: 16,
                                    "> *": {
                                        padding: "4px 6px",
                                        borderRadius: 4,
                                        background: COLORS.neutral15,
                                    },
                                }}
                            />}
                            {description && <CollapsibleDescription
                                type="series"
                                bottomPadding={32}
                                {...{ description }}
                            />}
                        </div>
                        <div css={{
                            display: "flex",
                            alignItems: "center",
                            alignSelf: description ? "flex-end" : "flex-start",
                            marginLeft: "auto",
                            fontSize: 14,
                            gap: 16,
                            padding: 5,
                            [screenWidthAtMost(VIDEO_GRID_BREAKPOINT)]: {
                                flexWrap: "wrap",
                            },
                        }}>
                            {shareInfo && <VideoListShareButton {...shareInfo} />}
                            {showViewOptions && <>
                                <OrderMenu />
                                <LayoutMenu />
                            </>}
                        </div>
                    </div>
                </div>
                {hasMetadata && <hr css={{ margin: "12px 6px 20px 6px" }} />}
            </>
            {children}
        </div>
    </LayoutContext.Provider>;
};

type VideoListShareButtonProps = {
    shareUrl: string;
    rssUrl: string;
};

const VideoListShareButton: React.FC<VideoListShareButtonProps> = props => {
    const { t } = useTranslation();
    const shareUrl = document.location.origin + props.shareUrl;
    const rssUrl = document.location.origin + props.rssUrl;
    const tabs = {
        "main": {
            label: t("share.link"),
            Icon: LuLink,
            render: () => <>
                <CopyableInput label={t("share.copy-link")} value={shareUrl} />
                <QrCodeButton target={shareUrl} label={t("share.link")} />
            </>,
        },
        "rss": {
            label: t("share.rss"),
            Icon: LuRss,
            render: () => <>
                <CopyableInput label={t("share.copy-rss")} value={rssUrl} />
                <QrCodeButton target={rssUrl} label={t("share.rss")} />
            </>,
        },
    };
    return <ShareButton height={180} {...{ tabs }} css={{
        padding: 12,
        height: 31,
        borderRadius: 4,
    }} />;
};


// ==============================================================================================
// ===== The menus for choosing order and layout mode
// ==============================================================================================


const OrderMenu: React.FC = () => {
    const { t } = useTranslation();
    const ref = useRef<FloatingHandle>(null);
    const order = useContext(OrderContext) ?? bug("order context not defined for video-list block");

    const triggerContent = match(order.eventOrder, {
        "ORIGINAL": () => t("video-list-block.settings.original"),
        "NEW_TO_OLD": () => t("video-list-block.settings.new-to-old"),
        "OLD_TO_NEW": () => t("video-list-block.settings.old-to-new"),
        "AZ": () => t("video-list-block.settings.a-z"),
        "ZA": () => t("video-list-block.settings.z-a"),
    });

    return <FloatingBaseMenu
        {...{ ref }}
        label={t("video-list-block.settings.order-label")}
        triggerContent={<>{triggerContent}</>}
        list={<List type="order" close={() => ref.current?.close()} />}
    />;
};

const LayoutMenu: React.FC = () => {
    const { t } = useTranslation();
    const state = useContext(LayoutContext);
    const ref = useRef<FloatingHandle>(null);

    const icon = match(state.layoutState, {
        SLIDER: () => <LuColumns2 />,
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
        label={t("video-list-block.settings.layout-label")}
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
    const { eventOrder, setEventOrder, allowOriginalOrder }
        = useContext(OrderContext) ?? bug("missing order context");
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
        ["SLIDER", "slider", LuColumns2],
        ["GALLERY", "gallery", LuLayoutGrid],
        ["LIST", "list", LuList],
    ];

    type OrderTranslationKey = "original" | "new-to-old" | "old-to-new" | "a-z" | "z-a";
    const orderItems: [Order, OrderTranslationKey][] = [
        ["NEW_TO_OLD", "new-to-old"],
        ["OLD_TO_NEW", "old-to-new"],
        ["AZ", "a-z"],
        ["ZA", "z-a"],
    ];
    if (allowOriginalOrder) {
        orderItems.unshift(["ORIGINAL", "original"]);
    }

    const sharedProps = (key: LayoutTranslationKey | OrderTranslationKey) => ({
        close: close,
        label: t(`video-list-block.settings.${key}`),
    });

    const list = match(type, {
        layout: () => <>
            <div>{t("video-list-block.settings.layout")}</div>
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
            <div>{t("video-list-block.settings.order")}</div>
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
        {...floatingMenuProps(isDark)}
        hideArrowTip
        css={listStyle}
    >
        {list}
    </Floating>;
};


type MenuItemProps = {
    Icon?: IconType;
    label: string;
    onClick?: () => void;
    close?: () => void;
    disabled: boolean;
    className?: string;
};

export const MenuItem = React.forwardRef<HTMLButtonElement, MenuItemProps>(({
    Icon, label, onClick, close, disabled, className,
}, ref) => {
    const isDark = useColorScheme().scheme === "dark";

    return (
        <li {...{ className }} css={{
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
                    close?.();
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
    showSeries?: boolean;
    listId?: string;
    items: {
        item: VideoListItem;
        active: boolean;
    }[];
};

const Items: React.FC<ViewProps> = ({ basePath, items, showSeries = false, listId }) => {
    const { layoutState } = useContext(LayoutContext);
    return match(layoutState, {
        SLIDER: () => <SliderView {...{ listId, basePath, items }} />,
        GALLERY: () => <GalleryView {...{ listId, basePath, items }} />,
        LIST: () => <ListView {...{ listId, basePath, items, showSeries }} />,
        "%future added value": () => unreachable(),
    });
};

const ITEM_MIN_SIZE = 250;
const ITEM_MIN_SIZE_SMALL_SCREENS = 240;
const ITEM_MAX_SIZE = 330;
const ITEM_MAX_SIZE_SMALL_SCREENS = 360;

const GalleryView: React.FC<ViewProps> = ({ basePath, items, listId }) => (
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
        {items.map(({ item, active }, idx) => (
            <Item
                key={idx}
                {...{ item, active, basePath, listId }}
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

const ListView: React.FC<ViewProps> = ({ basePath, items, showSeries, listId }) => (
    <div css={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
    }}>
        {items.map(({ item, active }, idx) => (
            <Item
                key={idx}
                {...{ item, active, basePath, showSeries, listId }}
                showDescription
                dateAndCreatorOneLine
                css={{
                    width: "100%",
                    margin: 6,
                    [screenWidthAtMost(VIDEO_GRID_BREAKPOINT)]: {
                        maxWidth: 360,
                    },
                    [screenWidthAbove(VIDEO_GRID_BREAKPOINT)]: {
                        display: "flex",
                        gap: 16,
                        "> div:nth-of-type(1)": { flex: "0 0 240px" },
                        "> :last-child": {
                            marginTop: 0,
                        },
                    },
                }}
            />
        ))}
    </div>
);

const SliderView: React.FC<ViewProps> = ({ basePath, items, listId }) => {
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
        zIndex: 5,
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
        // TODO: investigate hover style not disappearing correctly
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
            {items.map(({ item, active }, idx) => (
                <Item
                    key={idx}
                    {...{ item, active, basePath, listId }}
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
                aria-label={t("video-list-block.slider.scroll-left")}
                onClick={() => scroll(-scrollDistance)}
                css={{ left: 8, ...buttonCss }}
            ><LuChevronLeft /></ProtoButton>}
            {rightVisible && <ProtoButton
                aria-label={t("video-list-block.slider.scroll-right")}
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
                    {t("video-list-block.upcoming-live-streams", { count })}
                </span>
            </summary>
            {children}
        </details>
    );
};


type ItemProps = {
    basePath: string;
    item: VideoListItem;
    listId?: string;
    active: boolean;
    showDescription?: boolean;
    dateAndCreatorOneLine?: boolean;
    showSeries?: boolean;
    className?: string;
};

const Item: React.FC<ItemProps> = ({
    item,
    basePath,
    listId,
    active,
    showDescription = false,
    dateAndCreatorOneLine = false,
    showSeries = false,
    className,
}) => {
    const { t } = useTranslation();
    const isPlaceholder = item === "missing" || item === "unauthorized";

    const TRANSITION_IN_DURATION = "0.15s";
    const TRANSITION_OUT_DURATION = "0.3s";

    const thumbnail = isPlaceholder
        ? <ThumbnailOverlayContainer>
            <BaseThumbnailReplacement css={{
                background: "repeating-linear-gradient(115deg, "
                    + "#2e2e2e, #2e2e2e 30px, #292929 30px, #292929 60px)",
                color: "#dbdbdb",
            }}>
                <LuCircleAlert />
            </BaseThumbnailReplacement>
        </ThumbnailOverlayContainer>
        : <>
            <Thumbnail event={item} active={active} />
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
        </>;
    const title = (() => {
        const placeholderStyle = {
            fontWeight: "normal",
            color: COLORS.neutral80,
        } as const;
        if (item === "missing") {
            return <i css={placeholderStyle}>{t("not-found.video-not-found")}</i>;
        } else if (item === "unauthorized") {
            return <i css={placeholderStyle}>{t("video-list-block.unauthorized")}</i>;
        } else {
            return item.title;
        }
    })();

    const dateAndCreator = () => {
        if (isPlaceholder) {
            return null;
        }

        const date = item.syncedData?.startTime ?? item.created;

        if (dateAndCreatorOneLine) {
            return <DateAndCreators
                isLive={item.isLive}
                creators={[...item.creators]}
                timestamp={date}
            />;
        }

        return <>
            <div css={{
                position: "relative",
                zIndex: 6,
                display: "flex",
                alignItems: "center",
                gap: 6,
                marginBottom: 2,
                fontSize: 13,
                color: COLORS.neutral70,
            }}>
                <PrettyDate date={new Date(date)} isLive={item.isLive} />
            </div>
            {item.creators.length > 0 && <ul css={{
                listStyle: "none",
                margin: 0,
                padding: 0,
                overflow: "hidden",
                whiteSpace: "nowrap",
                textOverflow: "ellipsis",
                color: COLORS.neutral80,
                fontSize: 14,
                "& > li": {
                    display: "inline",
                    "&:not(:last-child):after": {
                        content: "'•'",
                        padding: "0 6px",
                    },
                },
            }}>
                {item.creators.map((creator, i) => <li key={i}>{creator}</li>)}
            </ul>}
        </>;
    };

    const inner = <>
        <div css={{
            position: "relative",
            borderRadius: 8,
        }}>{thumbnail}</div>
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
                }}>{title}</div>
            </h3>
            {!isPlaceholder && <>
                {dateAndCreator()}
                {showDescription && <SmallDescription lines={3} text={item.description} />}
                {showSeries && item.series?.id && item.series.title && <PartOfSeriesLink
                    seriesId={item.series.id}
                    seriesTitle={item.series.title}
                    css={{ marginTop: 4 }}
                />}
            </>}
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
        ...!active && !isPlaceholder && {
            "& > div:nth-child(2)": {
                transition: `transform ${TRANSITION_OUT_DURATION}, `
                    + `box-shadow ${TRANSITION_OUT_DURATION},`
                    + `filter ${TRANSITION_OUT_DURATION}`,
            },
            "&:hover > div:nth-child(2), &:focus-visible > div:nth-child(2)": {
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

    const listIdParam = listId ? `?list=${keyOfId(listId)}` : "";

    return <div css={containerStyle} {...{ className }}>
        {(!active && !isPlaceholder) && <Link
            to={`${basePath}/${keyOfId(item.id)}${listIdParam}`}
            css={{
                position: "absolute",
                inset: 0,
                zIndex: 4,
                borderRadius: 16,
            }}
        />}
        {inner}
    </div>;
};

type PartOfSeriesLinkProps = {
    seriesTitle: React.ReactNode;
    seriesId: string;
    className?: string;
}

export const PartOfSeriesLink: React.FC<PartOfSeriesLinkProps> = ({
    seriesTitle,
    seriesId,
    className,
}) => (
    <div className={className} css={{
        fontSize: 14,
        marginTop: "auto",
        paddingTop: 8,
        whiteSpace: "nowrap",
        display: "flex",
        alignItems: "center",
        gap: 8,
    }}>
        <SeriesIcon css={{ flexShrink: 0, color: COLORS.neutral60, fontSize: 16 }} />
        <Link to={`/!s/${keyOfId(seriesId)}`} css={{
            borderRadius: 4,
            outlineOffset: 1,
            position: "relative",
            zIndex: 5,
            overflow: "hidden",
            textOverflow: "ellipsis",
            // The next few rules are... unfortunate but necessary, as they will otherwise
            // be overwritten by the parent's css. This is in part due to the wonky nature of
            // having to workaround "nesting" links within other links.
            "&&": {
                color: COLORS.primary0,
                textDecoration: "underline",
                ":hover, :focus": {
                    color: COLORS.primary1,
                    textDecoration: "none",
                },
            },
        }}>{seriesTitle}</Link>
    </div>
);
