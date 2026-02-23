import { PropsWithChildren, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { UseMutationConfig } from "react-relay";
import { MutationParameters, Disposable } from "relay-runtime";
import {
    LuArrowDown,
    LuArrowUp,
    LuCalendar,
    LuCircleUser,
    LuListPlus,
    LuListX,
    LuUndo2,
    LuUpload,
} from "react-icons/lu";
import {
    boxError,
    bug,
    Button,
    Card,
    Floating,
    FloatingContainer,
    FloatingHandle,
    FloatingTrigger,
    match,
    screenWidthAbove,
    screenWidthAtMost,
    useColorScheme,
    useOnOutsideClick,
    WithTooltip,
} from "@opencast/appkit";
import { css } from "@emotion/react";

import { Series } from "../Series/Shared";
import { COLORS } from "../../../color";
import { SubmitButtonWithStatus } from "../../../ui/metadata";
import { displayCommitError } from "../Realm/util";
import { EventSelector } from "../../../ui/EventSelector";
import { currentRef, floatingMenuProps, Inertable, keyOfId } from "../../../util";
import { ellipsisOverflowCss, focusStyle } from "../../../ui";
import { Thumbnail } from "../../../ui/Video";
import { Link } from "../../../router";
import { DirectVideoRoute } from "../../Video";
import { thumbnailLinkStyle } from "./Table";
import { useNavBlocker } from "../../util";
import { UploadRoute } from "../../Upload";
import { LinkButton } from "../../../ui/LinkButton";
import { isRealUser, useUser } from "../../../User";
import CONFIG from "../../../config";
import { BREAKPOINT_SMALL } from "../../../GlobalStyle";


type Entry = Series["entries"][number];
type AuthEvent = Extract<Entry, { __typename: "AuthorizedEvent" }>;
export type ListEvent = AuthEvent & { action: "add" | "remove" | "none" };


type VideoListMutationParams = MutationParameters & {
    variables: {
        id: string;
    } & {
        addedEvents: readonly string[];
        removedEvents: readonly string[];
    } | {
        entries: readonly string[];
    }
};
type ManageVideoListProps<TMutation extends VideoListMutationParams> = {
    listId: string;
    listEntries: Entry[];
    getUpdatedEntries: (data: TMutation["response"]) => Entry[];
    description?: string;
    commit: (config: UseMutationConfig<TMutation>) => Disposable;
    inFlight: boolean;
}

export const ManageVideoListContent = <TMutation extends VideoListMutationParams>({
    listId,
    listEntries,
    getUpdatedEntries,
    description,
    commit,
    inFlight,
}: ManageVideoListProps<TMutation>) => {
    const { t } = useTranslation();
    const [commitError, setCommitError] = useState<JSX.Element | null>(null);
    const [success, setSuccess] = useState(false);
    const isPlaylist = listId.startsWith("pl");
    const [events, setEvents] = useState(mapItems(listEntries, isPlaylist));

    const initialOrderRef = useRef(
        isPlaylist ? listEntries.filter(isAuthorizedEvent).map(e => e.id) : [],
    );

    const isOrderChanged = () => {
        if (!isPlaylist) {
            return false;
        }
        const currentOrder = events.filter(e => e.action !== "remove").map(e => e.id);
        const initialOrder = initialOrderRef.current;
        return currentOrder.length === initialOrder.length
            && currentOrder.some((id, i) => id !== initialOrder[i]);
    };

    const hasChanges = events.some(e => e.action !== "none") || isOrderChanged();

    useNavBlocker(() => hasChanges || inFlight);

    const user = useUser();
    if (!isRealUser(user)) {
        return bug("Used <ManageVideoListContent> without user");
    }

    const unknownItemsCount = listEntries.filter(e => e.__typename !== "AuthorizedEvent").length;

    const updatedEntries = isPlaylist ? {
        entries: events.filter(e => e.action !== "remove").map(e => e.id),
    } : {
        addedEvents: events.filter(e => e.action === "add").map(e => e.id),
        removedEvents: events.filter(e => e.action === "remove").map(e => e.id),
    };

    const onSubmit = () => commit({
        variables: {
            id: listId,
            ...updatedEntries,
        },
        onCompleted: data => {
            setSuccess(true);
            const newEntries = getUpdatedEntries(data);
            if (isPlaylist) {
                initialOrderRef.current = newEntries.filter(isAuthorizedEvent).map(e => e.id);
            }
            setEvents(mapItems(newEntries, isPlaylist));
        },
        onError: e => {
            setSuccess(false);
            setCommitError(displayCommitError(e, t("manage.video-list.edit.error")));
        },
    });


    return <Inertable isInert={inFlight || !!commitError} css={{ marginBottom: 32, maxWidth: 750 }}>
        <VideoListMenu {...{ listEntries, isPlaylist, events, setEvents }} seriesLink={
            user.canUpload && !isPlaylist && <LinkButton
                to={UploadRoute.url({ seriesId: keyOfId(listId) })} >
                <LuUpload />
                {t("upload.title")}
            </LinkButton>
        }>
            {description && <p css={{ marginBottom: 8, maxWidth: 750, fontSize: 14 }}>
                {description}
            </p>}
            {!CONFIG.allowSeriesEventRemoval && <Card kind="info">
                {t("manage.video-list.removing-disabled")}
            </Card>}
        </VideoListMenu>
        {unknownItemsCount > 0 && <Card css={{ marginTop: 12 }} kind="info">
            {t("manage.video-list.details.unknown", { count: unknownItemsCount })}
        </Card>}
        {events.length > 0 && <SubmitButtonWithStatus
            label={t("manage.video-list.edit.save")}
            onClick={onSubmit}
            disabled={!!commitError || !hasChanges || inFlight}
            {...{ inFlight, success, setSuccess }}
        />}
        {boxError(commitError)}
    </Inertable>;
};

type VideoListMenuProps = PropsWithChildren<{
    isPlaylist: boolean;
    events: ListEvent[];
    setEvents: React.Dispatch<React.SetStateAction<ListEvent[]>>;
    seriesLink?: React.ReactNode;
}>;

export const VideoListMenu: React.FC<VideoListMenuProps> = ({
    isPlaylist,
    events,
    setEvents,
    children,
    seriesLink,
}) => {
    const { t } = useTranslation();
    return <>
        <div css={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <h2 css={{ fontSize: 20 }}>
                {t("video.plural")}
            </h2>
            <i css={{ fontSize: 14, color: COLORS.neutral50 }}>
                ({events.length > 0
                    ? t("manage.video-list.no-of-videos", { count: events.length })
                    : <i>{t("manage.video-list.no-content")}</i>
                })
            </i>
        </div>
        {children}
        <div css={{ margin: "24px auto 16px", display: "flex", gap: 12, flexWrap: "wrap" }}>
            <AddVideoMenu {...{ setEvents, events, isPlaylist }} />
            {seriesLink}
        </div>
        {events.length > 0 && <>
            <div css={{
                maxHeight: 360,
                overflowY: "auto",
                border: `1px solid ${COLORS.neutral25}`,
                borderRadius: 8,
                [screenWidthAtMost(420)]: {
                    margin: "0 -12px",
                },
            }}>
                {events.map((event, index) => (
                    <EventEntry
                        key={event.id}
                        event={event}
                        index={index}
                        totalEvents={events.length}
                        isPlaylistEntry={isPlaylist}
                        onMove={isPlaylist
                            ? direction => setEvents(
                                prev => moveItem(prev, index, index + direction),
                            )
                            : undefined
                        }
                        onChange={() => setEvents(prev => match(event.action, {
                            // Undo "add" -> remove from list again
                            "add": () => prev.filter(e => e.id !== event.id),
                            // Undo "remove" -> set action to "none"
                            "remove": () => prev.map(e =>
                                e.id === event.id ? { ...e, action: "none" } : e),
                            // Remove existing event
                            "none": () => prev.map(e =>
                                e.id === event.id ? { ...e, action: "remove" } : e),
                        }))}
                    />
                ))}
            </div>
        </>}
    </>;
};

type AddVideoMenuProps = {
    events: ListEvent[];
    setEvents: React.Dispatch<React.SetStateAction<ListEvent[]>>;
    isPlaylist: boolean;
};

const AddVideoMenu: React.FC<AddVideoMenuProps> = ({ events, setEvents, isPlaylist }) => {
    const { t } = useTranslation();
    const isDark = useColorScheme().scheme === "dark";
    const [buttonIsActive, setButtonIsActive] = useState(false);
    const floatingRef = useRef<FloatingHandle>(null);

    useOnOutsideClick(floatingRef, () => setButtonIsActive(false));

    return (
        <FloatingContainer
            ref={floatingRef}
            trigger="click"
            placement={window.innerWidth < 730 ? "bottom" : "right-start"}
            borderRadius={8}
            ariaRole="menu"
            css={{ width: "fit-content" }}
        >
            <FloatingTrigger>
                <Button onClick={() => setButtonIsActive(prev => !prev)} css={{
                    ...buttonIsActive && { "&&": {
                        borderColor: COLORS.neutral60,
                        backgroundColor: COLORS.neutral15,
                    } },
                }}>
                    <LuListPlus />
                    {t("manage.video-list.edit.add-video")}
                </Button>
            </FloatingTrigger>
            <Floating
                {...floatingMenuProps(isDark)}
                shadowBlur={12}
                shadowColor="rgba(0, 0, 0, 30%)"
                css={{
                    width: "clamp(300px, 95vw, 500px)",
                    height: 362,
                    padding: 8,
                    paddingBottom: 0,
                }}
                hideArrowTip
            >
                <EventSelector
                    writableOnly={!isPlaylist}
                    css={{ position: "relative" }}
                    onChange={event => {
                        if (!event) {
                            return;
                        }

                        setEvents(prev => [
                            {
                                ...event,
                                __typename: "AuthorizedEvent",
                                action: "add",
                                canWrite: true,
                            },
                            ...prev,
                        ]);

                        currentRef(floatingRef).close();
                        setButtonIsActive(false);
                    }}
                    controlShouldRenderValue={false}
                    backspaceRemovesValue={false}
                    isClearable={false}
                    menuIsOpen
                    additionalOptions={{
                        excludeSeriesMembers: !isPlaylist,
                        excludedIds: events.map(e => keyOfId(e.id)),
                    }}
                />
            </Floating>
        </FloatingContainer>
    );
};


type EventEntryProps = {
    event: ListEvent;
    index: number;
    totalEvents: number;
    onChange: () => void;
    onMove?: (direction: -1 | 1) => void;
    isPlaylistEntry: boolean;
};

const EventEntry: React.FC<EventEntryProps> = ({
    event, index, totalEvents, onChange, onMove, isPlaylistEntry,
}) => {
    const { t, i18n } = useTranslation();
    const isDark = useColorScheme().scheme === "dark";

    const buttonStyle = css({
        fontSize: 12,
        padding: "4px 8px",
        marginTop: "auto",
        gap: 5,
        [screenWidthAtMost(BREAKPOINT_SMALL)]: {
            span: { display: "none" },
        },
    });

    const moveButtonStyle = css({
        display: "flex",
        padding: 6,
        border: "none",
        borderRadius: 8,
        color: COLORS.neutral60,
        backgroundColor: "inherit",
        "&[disabled]": {
            color: COLORS.neutral25,
        },
        "&:not([disabled])": {
            cursor: "pointer",
            "&:hover, &:focus": {
                backgroundColor: COLORS.neutral10,
                ...isDark && {
                    backgroundColor: COLORS.neutral15,
                    color: COLORS.neutral80,
                },
            },
            ...focusStyle({}),
        },
    });

    const date = new Date(event.syncedData?.startTime ?? event.created);

    const actionColor = match(event.action, {
        "add": () => COLORS.happy0,
        "remove": () => COLORS.danger0,
        "none": () => "transparent",
    });

    return (
        <div
            key={event.id}
            css={{
                display: "flex",
                position: "relative",
                gap: 8,
                padding: 6,
                ":hover": { backgroundColor: COLORS.neutral15 },

                ...event.action !== "none" && {
                    "::before": {
                        content: "''",
                        position: "absolute",
                        inset: "1px 0",
                        width: 3,
                        backgroundColor: actionColor,
                    },
                },
            }}
        >
            <Link to={DirectVideoRoute.url({ videoId: event.id })} css={{
                width: 100,
                flexShrink: 0,
                ...thumbnailLinkStyle,
                [screenWidthAtMost(420)]: {
                    width: "min(100px, 25%)",
                },
            }}>
                <Thumbnail {...{ event }} />
            </Link>
            <div css={{
                display: "flex",
                flexGrow: 1,
                flexDirection: "column",
                minWidth: 0,
            }}>
                <div css={{
                    display: "flex",
                    flexGrow: 1,
                    justifyContent: "space-between",
                    gap: 8,
                }}>
                    <div css={{
                        display: "flex",
                        flexDirection: "column",
                        flex: 1,
                        minWidth: 0,
                        marginRight: 6,
                    }}>
                        <Link to={DirectVideoRoute.url({ videoId: event.id })} css={{
                            fontSize: 14,
                            borderRadius: 4,
                            maxWidth: "fit-content",
                            textDecoration: "none",
                            // ":focus, :focus-visible": {
                            //     outline: "none",
                            // },
                            ...ellipsisOverflowCss(1),
                            ...focusStyle({ offset: 1 }),
                        }}>
                            {event.title}
                        </Link>
                        <div css={{
                            fontSize: 12,
                            color: COLORS.neutral60,
                            ...ellipsisOverflowCss(1),
                        }}>
                            {event.description}
                        </div>
                        <div css={{
                            display: "flex",
                            alignItems: "center",
                            fontSize: 10,
                            color: COLORS.neutral60,
                            marginTop: "auto",
                        }}>
                            {event.creators.length > 0 && <>
                                <LuCircleUser />
                                <span css={{
                                    marginLeft: 2,
                                    maxWidth: 200,
                                    ...ellipsisOverflowCss(1),
                                    [screenWidthAbove(BREAKPOINT_SMALL)]: {
                                        "&:after": {
                                            content: "'•'",
                                            padding: "0 4px",
                                        },
                                    },
                                }}>{event.creators.join(", ")}</span>
                            </>}
                            <span css={{
                                [screenWidthAtMost(BREAKPOINT_SMALL)]: {
                                    display: "none",
                                },
                            }}>
                                <LuCalendar />
                                <time dateTime={date.toISOString()} css={{ marginLeft: 2 }}>
                                    {date.toLocaleDateString(i18n.language)}
                                </time>
                            </span>
                        </div>
                    </div>

                    <div css={{
                        display: "flex",
                        flexDirection: "column",
                        alignContent: "space-between",
                        alignItems: "flex-end",
                        i: { fontSize: 10, whiteSpace: "nowrap" },
                        [screenWidthAbove(BREAKPOINT_SMALL)]: {
                            minWidth: 75,
                        },
                    }}>
                        {event.action === "remove" && <>
                            <i css={{ color: COLORS.danger0 }}>
                                ({t("manage.video-list.edit.to-be-removed")})
                            </i>
                            <Button css={buttonStyle} onClick={onChange}>
                                <LuUndo2 size={16} />
                                <span>{t("manage.video-list.edit.undo")}</span>
                            </Button>
                        </>}
                        {event.action === "add" && <>
                            <i css={{ color: COLORS.happy0 }}>
                                ({t("manage.video-list.edit.to-be-added")})
                            </i>
                            <Button css={buttonStyle} onClick={onChange}>
                                <LuUndo2 size={16} />
                                <span>{t("manage.video-list.edit.undo")}</span>
                            </Button>
                        </>}
                        {event.action === "none" && <>
                            {!event.canWrite && !isPlaylistEntry
                                && <i css={{ color: COLORS.neutral50 }}>
                                ({t("manage.video-list.edit.cannot-be-removed")})
                                </i>
                            }
                            <Button
                                disabled={!isPlaylistEntry && (
                                    !event.canWrite || !CONFIG.allowSeriesEventRemoval
                                )}
                                kind="danger"
                                css={buttonStyle}
                                onClick={onChange}
                            >
                                <LuListX />
                                <span>{t("manage.video-list.edit.remove")}</span>
                            </Button>
                        </>}
                    </div>
                </div>
            </div>
            {/* Only show move buttons for playlists */}
            {onMove && (
                <div css={{ marginLeft: -2 }}>
                    <WithTooltip tooltip={t("manage.realm.content.move-up")} placement="left">
                        <button
                            aria-label={t("manage.realm.content.move-up")}
                            disabled={index === 0 || event.action === "remove"}
                            onClick={e => {
                                e.currentTarget.blur();
                                onMove(-1);
                            }}
                            css={moveButtonStyle}
                        >
                            <LuArrowUp size={16} />
                        </button>
                    </WithTooltip>
                    <WithTooltip tooltip={t("manage.realm.content.move-down")} placement="left">
                        <button
                            aria-label={t("manage.realm.content.move-down")}
                            disabled={index === totalEvents - 1 || event.action === "remove"}
                            onClick={e => {
                                e.currentTarget.blur();
                                onMove(1);
                            }}
                            css={moveButtonStyle}
                        >
                            <LuArrowDown size={16} />
                        </button>
                    </WithTooltip>
                </div>
            )}
        </div>
    );
};


const isAuthorizedEvent = (e: Entry): e is AuthEvent => e.__typename === "AuthorizedEvent";

/** Sorts series by date of creation but preserves manual order for playlists */
const mapItems = (entries: readonly Entry[], isPlaylist: boolean): ListEvent[] => {
    const authorized = entries.filter(isAuthorizedEvent);
    const sorted = isPlaylist
        ? authorized
        : [...authorized].sort((a, b) =>
            a.created === b.created ? 0 : (a.created > b.created ? 1 : -1));
    return sorted.map(e => ({ ...e, action: "none" }));
};

/** Swap two items in the video list */
const moveItem = (arr: ListEvent[], from: number, to: number): ListEvent[] => {
    if (to < 0 || to >= arr.length) {
        return arr;
    }
    const result = [...arr];
    result[from] = arr[to];
    result[to] = arr[from];
    return result;
};
