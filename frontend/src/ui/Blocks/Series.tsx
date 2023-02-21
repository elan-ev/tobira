import React, {
    Children, createContext,
    ReactElement, ReactNode,
    useContext, useEffect, useRef, useState,
} from "react";
import { useTranslation } from "react-i18next";
import { graphql, useFragment } from "react-relay";

import { keyOfId, isSynced, SyncedOpencastEntity } from "../../util";
import { match } from "../../util";
import { unreachable } from "../../util/err";
import type { Fields } from "../../relay";
import { Link } from "../../router";
import {
    SeriesBlockData$data, SeriesBlockData$key, VideoListOrder,
} from "./__generated__/SeriesBlockData.graphql";
import {
    SeriesBlockSeriesData$data,
    SeriesBlockSeriesData$key,
} from "./__generated__/SeriesBlockSeriesData.graphql";
import { isPastLiveEvent, isUpcomingLiveEvent, Thumbnail } from "../Video";
import { RelativeDate } from "../time";
import { Card } from "../Card";
import {
    FiChevronDown, FiChevronLeft, FiChevronRight,
    FiColumns, FiGrid, FiList, FiPlay,
} from "react-icons/fi";
import { keyframes } from "@emotion/react";
import { Description, SmallDescription } from "../metadata";
import { ellipsisOverflowCss } from "..";
import {
    Floating, FloatingContainer, FloatingHandle, FloatingTrigger,
} from "../Floating";
import { ProtoButton } from "../Button";
import { IconType } from "react-icons";


type SharedProps = {
    basePath: string;
};

const blockFragment = graphql`
    fragment SeriesBlockData on SeriesBlock {
        series {
            ...SeriesBlockSeriesData
        }
        showTitle
        showMetadata
        order
    }
`;

const seriesFragment = graphql`
    fragment SeriesBlockSeriesData on Series {
        title
        # description is only queried to get the sync status
        syncedData { description }
        events {
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
    }
`;

type FromBlockProps = SharedProps & {
    fragRef: SeriesBlockData$key;
};

export const SeriesBlockFromBlock: React.FC<FromBlockProps> = ({ fragRef, ...rest }) => {
    const { t } = useTranslation();
    const { series, ...block } = useFragment(blockFragment, fragRef);
    return series === null
        ? <Card kind="error">{t("series.deleted-series-block")}</Card>
        : <SeriesBlockFromSeries fragRef={series} {...rest} {...block} />;
};

type BlockProps = Partial<Omit<Fields<SeriesBlockData$data>, "series">>;

type SharedFromSeriesProps = SharedProps & BlockProps & {
    title?: string;
    activeEventId?: string;
};

type FromSeriesProps = SharedFromSeriesProps & {
    fragRef: SeriesBlockSeriesData$key;
};

export const SeriesBlockFromSeries: React.FC<FromSeriesProps> = (
    { fragRef, ...rest },
) => {
    const series = useFragment(seriesFragment, fragRef);
    return <SeriesBlock series={series} {...rest} />;
};

type Props = SharedFromSeriesProps & {
    series: SeriesBlockSeriesData$data;
};

const VIDEO_GRID_BREAKPOINT = 600;

const SeriesBlock: React.FC<Props> = ({ series, ...props }) => {
    const { t } = useTranslation();

    if (!isSynced(series)) {
        const { title } = props;
        return <SeriesBlockContainer showViewOptions={false} title={title}>
            {t("series.not-ready.text")}
        </SeriesBlockContainer>;
    }

    return <ReadySeriesBlock series={series} {...props} />;
};

type ReadyProps = SharedFromSeriesProps & {
    series: SyncedOpencastEntity<SeriesBlockSeriesData$data>;
};

type OrderContext = {
    eventOrder: VideoListOrder;
    setEventOrder: (newOrder: VideoListOrder) => void;
};

const OrderContext = createContext<OrderContext>({
    eventOrder: "NEW_TO_OLD",
    setEventOrder: () => {},
});

const ReadySeriesBlock: React.FC<ReadyProps> = ({
    basePath,
    title,
    series,
    activeEventId,
    order = "NEW_TO_OLD",
    showTitle = true,
    showMetadata,
}) => {
    const { t } = useTranslation();
    const [eventOrder, setEventOrder] = useState<VideoListOrder>(order);

    const finalTitle = title ?? (showTitle ? series.title : undefined);
    const eventsNotEmpty = series.events.length > 0;

    const events = series.events.filter(event =>
        !isPastLiveEvent(event.syncedData?.endTime ?? null, event.isLive)
        && !isUpcomingLiveEvent(event.syncedData?.startTime ?? null, event.isLive));

    const upcomingLiveEvents = series.events.filter(event =>
        isUpcomingLiveEvent(event.syncedData?.startTime ?? null, event.isLive));

    const timeMs = (event: Event) =>
        new Date(event.syncedData?.startTime ?? event.created).getTime();

    const sortedEvents = [...events];
    sortedEvents.sort((a, b) => {
        // Sort all live events before non-live events.
        if (a.isLive !== b.isLive) {
            return +b.isLive - +a.isLive;
        }

        return match(eventOrder, {
            "NEW_TO_OLD": () => timeMs(b) - timeMs(a),
            "OLD_TO_NEW": () => timeMs(a) - timeMs(b),
        }, unreachable);
    });

    // If there is only one upcoming event, it doesn't need an extra box or ordering.
    if (upcomingLiveEvents.length === 1) {
        sortedEvents.unshift(upcomingLiveEvents[0]);
    } else {
        upcomingLiveEvents.sort((a, b) => timeMs(a) - timeMs(b));
    }

    const eventsToTiles = (events: Event[]) => events.map(event =>
        <GridTile
            key={event.id}
            active={event.id === activeEventId}
            {...{ basePath, event }}
        />);

    const eventsUI = !eventsNotEmpty
        ? t("series.no-events")
        : <>
            {upcomingLiveEvents.length > 1
                && <UpcomingEventsGrid>
                    {eventsToTiles(upcomingLiveEvents)}
                </UpcomingEventsGrid>}
            <VideoGrid>
                {eventsToTiles(sortedEvents)}
            </VideoGrid>
        </>;

    return <OrderContext.Provider value={{ eventOrder, setEventOrder }}>
        {showMetadata && !showTitle && <Description text={series.syncedData.description} />}
        <SeriesBlockContainer showViewOptions={eventsNotEmpty} title={finalTitle}>
            {showMetadata && showTitle && series.syncedData.description && <>
                <Description text={series.syncedData.description} css={{ fontSize: 14 }} />
                <hr css={{ margin: "20px 0" }} />
            </>}
            {eventsUI}
        </SeriesBlockContainer>
    </OrderContext.Provider>;
};

type Event = SeriesBlockSeriesData$data["events"][0];

type SeriesBlockContainerProps = {
    title?: string;
    children: ReactNode;
    showViewOptions: boolean;
};

type View = "slider" | "gallery" | "list";

type ViewContext = {
    viewState: View;
    setViewState: (view: View) => void;
};

const ViewContext = createContext<ViewContext>({
    viewState: "gallery",
    setViewState: () => {},
});

const SeriesBlockContainer: React.FC<SeriesBlockContainerProps> = (
    { title, children, showViewOptions },
) => {
    const [viewState, setViewState] = useState<View>("gallery");

    return <ViewContext.Provider value={{ viewState, setViewState }}>
        <div css={{
            marginTop: 24,
            padding: 12,
            backgroundColor: "var(--grey95)",
            borderRadius: 10,
        }}>
            <div css={{
                display: "flex",
                [`@media (max-width: ${VIDEO_GRID_BREAKPOINT}px)`]: {
                    flexWrap: "wrap",
                },
            }}>
                <h2 css={{
                    display: "inline-block",
                    padding: "8px 12px",
                    color: "var(--grey20)",
                    fontSize: 20,
                    lineHeight: 1.3,
                }}>{title}</h2>
                {showViewOptions && <div css={{
                    display: "flex",
                    alignItems: "center",
                    alignSelf: "flex-start",
                    marginLeft: "auto",
                    fontSize: 14,
                    gap: 16,
                    padding: 5,
                }}>
                    <OrderMenu />
                    <ViewMenu/>
                </div>}
            </div>
            {children}
        </div>
    </ViewContext.Provider>;
};


type FloatingBaseMenuProps = {
    triggerContent: ReactElement;
    list: ReactElement;
    label: string;
};

// TODO: Make menus work with arrow keys.
const FloatingBaseMenu = React.forwardRef<FloatingHandle, FloatingBaseMenuProps>(
    ({ triggerContent, list, label }, ref) => (
        <FloatingContainer
            ref={ref}
            placement="bottom"
            trigger="click"
            ariaRole="menu"
            distance={0}
            borderRadius={8}
        >
            <FloatingTrigger>
                <ProtoButton aria-label={label} css={{
                    display: "flex",
                    alignItems: "center",
                    border: "1px solid var(--grey65)",
                    borderRadius: 4,
                    gap: 8,
                    height: 31,
                    padding: "0 8px",
                    whiteSpace: "nowrap",
                    ":hover, :focus": {
                        backgroundColor: "var(--grey92)",
                    },
                    ":focus-visible": {
                        outline: "2px solid var(--accent-color)",
                    },
                }}>
                    {triggerContent}
                    <FiChevronDown css={{ fontSize: 20 }} />
                </ProtoButton>
            </FloatingTrigger>
            {list}
        </FloatingContainer>
    ),
);


const OrderMenu: React.FC = () => {
    const { t } = useTranslation();
    const ref = useRef<FloatingHandle>(null);
    const order = useContext(OrderContext);

    const triggerContent = match(order.eventOrder, {
        "NEW_TO_OLD": () => t("series.settings.new-to-old"),
        "OLD_TO_NEW": () => t("series.settings.old-to-new"),
        "%future added value": () => unreachable(),
    });

    return <FloatingBaseMenu
        ref={ref}
        label={t("series.settings.order-label")}
        triggerContent={<>{triggerContent}</>}
        list={<List type="order" close={() => ref.current?.close()} />}
    />;
};

const ViewMenu: React.FC = () => {
    const { t } = useTranslation();
    const state = useContext(ViewContext);
    const ref = useRef<FloatingHandle>(null);

    const icon = match(state.viewState, {
        slider: () => <FiColumns />,
        gallery: () => <FiGrid />,
        list: () => <FiList />,
    });

    const triggerContent = (
        <div css={{
            display: "flex",
            alignItems: "center",
            svg: { fontSize: 22, color: "var(--grey40)" },
        }}>{icon}</div>
    );

    return <FloatingBaseMenu
        ref={ref}
        label={t("series.settings.view-label")}
        triggerContent={triggerContent}
        list={<List type="view" close={() => ref.current?.close()} />}
    />;
};

type ListProps = {
    type: "view" | "order";
    close: () => void;
};

const List: React.FC<ListProps> = ({ type, close }) => {
    const { t } = useTranslation();
    const { viewState, setViewState } = useContext(ViewContext);
    const { eventOrder, setEventOrder } = useContext(OrderContext);

    const listStyle = {
        minWidth: 125,
        div: {
            cursor: "default",
            fontSize: 12,
            padding: "8px 14px 4px 14px",
            color: "var(--grey40)",
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

    const list = match(type, {
        view: () => <>
            <div>{t("series.settings.view")}</div>
            <ul role="menu" onBlur={handleBlur}>
                <MenuItem
                    disabled={viewState === "slider"}
                    onClick={() => setViewState("slider")}
                    close={close}
                    Icon={FiColumns}
                    label={t("series.settings.slider")}
                />
                <MenuItem
                    disabled={viewState === "gallery"}
                    onClick={() => setViewState("gallery")}
                    close={close}
                    Icon={FiGrid}
                    label={t("series.settings.gallery")}
                />
                <MenuItem
                    disabled={viewState === "list"}
                    onClick={() => setViewState("list")}
                    close={close}
                    Icon={FiList}
                    label= {t("series.settings.list")}
                />
            </ul>
        </>,
        order: () => <>
            <div>{t("series.settings.order")}</div>
            <ul role="menu" onBlur={handleBlur}>
                <MenuItem
                    disabled={eventOrder === "NEW_TO_OLD"}
                    onClick={() => setEventOrder("NEW_TO_OLD")}
                    close={close}
                    label= {t("series.settings.new-to-old")}
                />
                <MenuItem
                    disabled={eventOrder === "OLD_TO_NEW"}
                    onClick={() => setEventOrder("OLD_TO_NEW")}
                    close={close}
                    label= {t("series.settings.old-to-new")}
                />
            </ul>
        </>,
    });

    return <Floating hideArrowTip padding={0} borderWidth={0} css={listStyle}>
        {list}
    </Floating>;
};

type MenuItemProps = {
    Icon?: IconType;
    label: string;
    onClick: () => void;
    close: () => void;
    disabled?: boolean;
};

const MenuItem: React.FC<MenuItemProps> = ({ Icon, label, onClick, close, disabled }) => {
    const ref = useRef<HTMLButtonElement>(null);

    return (
        <li css={{
            ":not(:last-child)": {
                borderBottom: "1px solid var(--grey86)",
            },
            ":last-child button": {
                borderRadius: "0 0 8px 8px",
            },
        }}>
            <ProtoButton
                ref={ref}
                disabled={disabled}
                role="menuitem"
                onClick={() => {
                    onClick();
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
                        backgroundColor: "var(--grey92)",
                    },
                    ":focus-visible": {
                        outline: "2px solid var(--accent-color)",
                        outlineOffset: -2,
                    },
                    "&[disabled]": {
                        fontWeight: "bold",
                        color: "var(--grey20)",
                        pointerEvents: "none",
                    },
                }}
            >
                {Icon && <Icon />}
                {label}
            </ProtoButton>
        </li>
    );
};

const SliderView: React.FC<{ children: ReactNode }> = ({ children }) => {
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
        backgroundColor: "var(--grey65)",
        borderRadius: 24,
        padding: 11,
        transition: "background-color .05s",
        svg: {
            color: "white",
            display: "block",
            fontSize: 26,
        },
        ":hover, :focus": {
            backgroundColor: "var(--grey40)",
        },
        ":focus-visible": {
            outline: "2px solid var(--accent-color)",
        },
    } as const;

    return <div css={{ position: "relative" }}>
        <div tabIndex={-1} onScroll={() => setVisibilities()} ref={ref} css={{
            display: "flex",
            marginRight: 5,
            overflow: "auto",
            scrollBehavior: "smooth",
            scrollSnapType: "inline mandatory",
            "> *": {
                scrollSnapAlign: "start",
                flex: "0 0 240px",
            },
            ":first-child > :first-child": {
                scrollMargin: 6,
            },
        }}>
            {children}
            {leftVisible && <ProtoButton
                aria-label={t("series.slider.scroll-left")}
                onClick={() => scroll(-scrollDistance)}
                css={{ left: 8, ...buttonCss }}
            ><FiChevronLeft /></ProtoButton>}
            {rightVisible && <ProtoButton
                aria-label={t("series.slider.scroll-right")}
                onClick={() => scroll(scrollDistance)}
                css={{ right: 8, ...buttonCss }}
            ><FiChevronRight /></ProtoButton>}
        </div>
    </div>;
};

const VideoGrid: React.FC<React.PropsWithChildren> = ({ children }) => {
    const { viewState } = useContext(ViewContext);

    const containerStyle = {
        display: "flex",
        flexWrap: "wrap",
        [`@media (max-width: ${VIDEO_GRID_BREAKPOINT}px)`]: {
            justifyContent: "center",
        },
    } as const;

    return match(viewState, {
        slider: () => <SliderView>{children}</SliderView>,
        gallery: () => <div css={containerStyle}>{children}</div>,
        list: () => <div css={containerStyle}>{children}</div>,
    });
};

const UpcomingEventsGrid: React.FC<React.PropsWithChildren> = ({ children }) => {
    const { t } = useTranslation();

    return (
        <details css={{
            backgroundColor: "var(--grey86)",
            borderRadius: 4,
            margin: "8px 0",
            summary: {
                color: "var(--grey20)",
                cursor: "pointer",
                fontSize: 14,
                padding: "6px 12px",
                span: {
                    marginLeft: 4,
                },
                ":hover, :focus-visible": {
                    backgroundColor: "var(--grey80)",
                    borderRadius: 4,
                    color: "black",
                },
                ":focus-visible": {
                    outline: "2px solid var(--accent-color)",
                },
            },
            ":is([open]) summary": {
                borderBottom: "1px solid var(--grey80)",
                borderRadius: "4px 4px 0 0",
            },
        }}>
            <summary>
                <span>
                    {t("series.upcoming-live-streams", { count: Children.count(children) })}
                </span>
            </summary>
            <VideoGrid>
                {children}
            </VideoGrid>
        </details>
    );
};


type GridTypeProps = {
    basePath: string;
    event: Event;
    active: boolean;
};

const GridTile: React.FC<GridTypeProps> = ({ event, basePath, active }) => {
    const TRANSITION_IN_DURATION = "0.15s";
    const TRANSITION_OUT_DURATION = "0.3s";
    const date = event.syncedData?.startTime ?? event.created;
    const view = useContext(ViewContext);
    const isList = view.viewState === "list";

    const inner = <>
        <div css={{ borderRadius: 8, position: "relative" }}>
            <Thumbnail event={event} active={active} />
            <div css={{
                position: "absolute",
                top: 0,
                height: "100%",
                width: "100%",
                overflow: "hidden",
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
            color: "black",
        }}>
            <h3 css={{
                display: "flex",
                alignItems: "center",
                fontSize: "inherit",
                gap: 4,
                marginBottom: 4,
            }}>
                {active && <FiPlay css={{
                    flex: "0 0 auto",
                    strokeWidth: 3,
                    color: "var(--accent-color)",
                    animation: `${keyframes({
                        "0%": { opacity: 1 },
                        "50%": { opacity: 0.4 },
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
                color: "var(--grey20)",
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
            {isList && <SmallDescription lines={3} text={event.description} />}
        </div>
    </>;

    const containerStyle = {
        position: "relative",
        display: "block",
        margin: "8px 6px 28px 6px",
        padding: 6,
        width: 16 * 15,
        borderRadius: 12,
        "& a": { color: "black", textDecoration: "none" },
        [`@media (max-width: ${VIDEO_GRID_BREAKPOINT}px)`]: {
            width: "100%",
            maxWidth: 360,
        },
        ...active && {
            backgroundColor: "var(--grey86)",
        },
        ...!active && {
            "& > div:first-child": {
                transition: `transform ${TRANSITION_OUT_DURATION}, `
                    + `box-shadow ${TRANSITION_OUT_DURATION}`,
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
            "&:focus-visible": {
                outline: "none",
                boxShadow: "0 0 0 2px var(--accent-color)",
            },
        },
        // ListView styles:
        ...isList && {
            [`@media not all and (max-width: ${VIDEO_GRID_BREAKPOINT}px)`]: {
                width: "100%",
                display: "flex",
                gap: 16,
                marginBottom: 16,
                "> :first-child": { flex: "0 0 240px" },
            },
        },
    } as const;

    return active
        ? <div css={{ ...containerStyle, display: "inline-block" }}>{inner}</div>
        : <Link
            to={`${basePath}/${keyOfId(event.id)}`}
            css={containerStyle}
        >{inner}</Link>;
};
