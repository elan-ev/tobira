import { PropsWithChildren, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { UseMutationConfig } from "react-relay";
import { MutationParameters, Disposable } from "relay-runtime";
import {
    DragDropContext,
    Droppable,
    Draggable,
    DropResult,
} from "@hello-pangea/dnd";
import {
    LuArrowDown,
    LuArrowLeftRight,
    LuArrowUp,
    LuCalendar,
    LuCircleHelp,
    LuCircleUser,
    LuListPlus,
    LuListX,
    LuShieldQuestion,
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
    notNullish,
    screenWidthAbove,
    screenWidthAtMost,
    useColorScheme,
    useOnOutsideClick,
    WithTooltip,
} from "@opencast/appkit";
import { css } from "@emotion/react";
import { createPortal } from "react-dom";

import { Series } from "../Series/Shared";
import { COLORS } from "../../../color";
import { SubmitButtonWithStatus } from "../../../ui/metadata";
import { displayCommitError } from "../Realm/util";
import { EventSelector } from "../../../ui/EventSelector";
import {
    ConditionalWrapper, currentRef, floatingMenuProps, Inertable, keyOfId,
} from "../../../util";
import { ellipsisOverflowCss, focusStyle } from "../../../ui";
import { PlaceholderThumbnailReplacement, Thumbnail } from "../../../ui/Video";
import { Link } from "../../../router";
import { DirectVideoRoute } from "../../Video";
import { thumbnailLinkStyle, titleLinkStyle } from "./Table";
import { useNavBlocker } from "../../util";
import { UploadRoute } from "../../Upload";
import { LinkButton } from "../../../ui/LinkButton";
import { isRealUser, useUser } from "../../../User";
import CONFIG from "../../../config";
import { VideoListSelector } from "../../../ui/SearchableSelect";
import { BREAKPOINT_SMALL, BREAKPOINT_MEDIUM } from "../../../GlobalStyle";


type Entry = Series["entries"][number];
type AuthEvent = Extract<Entry, { __typename: "AuthorizedEvent" }>;
export type ListEvent = AuthEvent & (
    | { action: "add" | "remove" | "none"; }
    | { action: "move", targetSeries: { id: string; title: string } }
);

type PlaceholderEvent = {
    __typename: "placeholder";
    placeholderKind: "missing" | "not-allowed";
    id: string;
    action: "none" | "remove";
};

export type ListItem = ListEvent | PlaceholderEvent;


type VideoListMutationParams = MutationParameters & {
    variables: {
        id: string;
    } & {
        addedEvents: readonly string[];
        removedEvents: readonly {
            id: string;
            seriesId?: string | null;
        }[];
    } | {
        entries?: readonly {
            id?: string | null;
            opencastId?: string | null;
        }[] | null;
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
    const [items, setItems] = useState(mapItems(listEntries, isPlaylist));
    const events = items.filter(isListEvent);

    const initialOrder = isPlaylist
        ? items.filter(e => e.action !== "remove").map(e => e.id)
        : [];
    const initialOrderRef = useRef(initialOrder);

    const isOrderChanged = () => {
        if (!isPlaylist) {
            return false;
        }
        const currentOrder = items
            .filter(e => e.action !== "remove")
            .map(e => e.id);
        const initialOrder = initialOrderRef.current;
        return currentOrder.length === initialOrder.length
            && currentOrder.some((id, i) => id !== initialOrder[i]);
    };

    const hasChanges = items.some(e => e.action !== "none") || isOrderChanged();

    useNavBlocker(() => hasChanges || inFlight);

    const user = useUser();
    if (!isRealUser(user)) {
        return bug("Used <ManageVideoListContent> without user");
    }

    const updatedEntries = isPlaylist ? {
        entries: items
            .filter(e => e.action !== "remove")
            .map(e => isPlaceholder(e)
                ? { opencastId: e.id }
                : { id: e.id }),
    } : {
        addedEvents: events.filter(e => e.action === "add").map(e => e.id),
        removedEvents: events
            .filter(e => e.action === "remove" || e.action === "move")
            .map(e => ({
                id: e.id,
                seriesId: e.action === "move" ? e.targetSeries.id : undefined,
            })),
    };

    const onSubmit = () => commit({
        variables: {
            id: listId,
            ...updatedEntries,
        },
        onCompleted: data => {
            setSuccess(true);
            const newEntries = getUpdatedEntries(data);
            const newItems = mapItems(newEntries, isPlaylist);
            if (isPlaylist) {
                initialOrderRef.current = newItems.map(e => e.id);
            }
            setItems(newItems);
        },
        onError: e => {
            setSuccess(false);
            setCommitError(displayCommitError(e, t("manage.video-list.edit.error")));
        },
    });


    return <Inertable isInert={inFlight || !!commitError} css={{ marginBottom: 32, maxWidth: 750 }}>
        <VideoListMenu
            {...{ isPlaylist, listId, items, setItems }}
            seriesLink={
                user.canUpload && !isPlaylist && <LinkButton
                    to={UploadRoute.url({ seriesId: keyOfId(listId) })} >
                    <LuUpload />
                    {t("upload.title")}
                </LinkButton>
            }
        >
            {description && <p css={{ marginBottom: 8, maxWidth: 750, fontSize: 14 }}>
                {description}
            </p>}
            {!CONFIG.allowSeriesEventRemoval && <Card kind="info">
                {t("manage.video-list.removing-disabled")}
            </Card>}
        </VideoListMenu>
        {items.length > 0 && <SubmitButtonWithStatus
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
    listId?: string;
    items: ListItem[];
    setItems: React.Dispatch<React.SetStateAction<ListItem[]>>;
    seriesLink?: React.ReactNode;
}>;

export const VideoListMenu: React.FC<VideoListMenuProps> = ({
    isPlaylist,
    listId,
    items,
    setItems,
    children,
    seriesLink,
}) => {
    const { t } = useTranslation();

    const handleSeriesChange = (
        eventId: string,
        targetSeries: { id: string; title: string },
    ) => {
        setItems(prev => updateListEventById(
            prev,
            eventId,
            event => setEventAction(event, "move", targetSeries),
        ));
    };

    return <>
        <div css={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <h2 css={{ fontSize: 20 }}>
                {t("video.plural")}
            </h2>
            <i css={{ fontSize: 14, color: COLORS.neutral50 }}>
                ({items.length > 0
                    ? t("manage.video-list.no-of-videos", { count: items.length })
                    : <i>{t("manage.video-list.no-content")}</i>
                })
            </i>
        </div>
        {children}
        <div css={{ margin: "24px auto 16px", display: "flex", gap: 12, flexWrap: "wrap" }}>
            <AddVideoMenu {...{ isPlaylist, items, setItems }} />
            {seriesLink}
        </div>
        {items.length > 0 && <>
            <DragDropContext onDragEnd={(result: DropResult) => {
                if (!result.destination || !isPlaylist) {
                    return;
                }
                const from = result.source.index;
                const to = result.destination.index;
                if (from === to) {
                    return;
                }
                setItems(prev => reorderItems(prev, from, to));
            }}>
                <Droppable droppableId="video-list">
                    {provided => (
                        <div
                            ref={provided.innerRef}
                            {...provided.droppableProps}
                            css={{
                                maxHeight: 360,
                                overflowY: "auto",
                                border: `1px solid ${COLORS.neutral25}`,
                                borderRadius: 8,
                                [screenWidthAtMost(420)]: {
                                    margin: "0 -12px",
                                },
                            }}
                        >
                            {items.map((item, index) => {
                                if (isPlaceholder(item)) {
                                    return <DraggableItem
                                        key={item.id}
                                        id={item.id}
                                        {...{ index }}
                                        isDragDisabled={!isPlaylist || item.action === "remove"}
                                    >
                                        <PlaceholderEntry
                                            {...{ index, item }}
                                            totalItems={items.length}
                                            onChange={() => {
                                                setItems(prev => prev.map(e =>
                                                    (e === item
                                                        ? togglePlaceholderRemoval(e)
                                                        : e)));
                                            }}
                                            onMove={isPlaylist
                                                ? direction => setItems(
                                                    prev => moveItem(
                                                        prev,
                                                        index,
                                                        index + direction,
                                                    ),
                                                )
                                                : undefined
                                            }
                                        />
                                    </DraggableItem>;
                                }

                                return <DraggableItem
                                    key={item.id}
                                    id={item.id}
                                    {...{ index }}
                                    isDragDisabled={!isPlaylist || item.action === "remove"}
                                >
                                    <EventEntry
                                        isPlaylistEntry={isPlaylist}
                                        {...{ index, listId }}
                                        event={item}
                                        onSeriesChange={handleSeriesChange}
                                        totalEvents={items.length}
                                        onMove={isPlaylist
                                            ? direction => setItems(
                                                prev => moveItem(prev, index, index + direction),
                                            )
                                            : undefined
                                        }
                                        onChange={() => setItems(prev => {
                                            const update = match(item.action, {
                                                // Undo "add" -> remove from list again
                                                "add": () => prev.filter(e => e.id !== item.id),
                                                // Undo "remove" -> set action to "none"
                                                "remove": () => updateListEventById(
                                                    prev,
                                                    item.id,
                                                    clearEventAction,
                                                ),
                                                // Undo "move" -> set action to "none" and
                                                // target series to "undefined"
                                                "move": () => updateListEventById(
                                                    prev,
                                                    item.id,
                                                    clearEventAction,
                                                ),
                                                // Remove existing event
                                                "none": () => updateListEventById(
                                                    prev,
                                                    item.id,
                                                    event => setEventAction(event, "remove"),
                                                ),
                                            });
                                            return update;
                                        })}
                                    />
                                </DraggableItem>;
                            })}
                            {provided.placeholder}
                        </div>
                    )}
                </Droppable>
            </DragDropContext>
        </>}
    </>;
};

type AddVideoMenuProps = {
    items: ListItem[];
    setItems: React.Dispatch<React.SetStateAction<ListItem[]>>;
    isPlaylist: boolean;
};

const AddVideoMenu: React.FC<AddVideoMenuProps> = ({ items, setItems, isPlaylist }) => {
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

                        setItems(prev => [
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
                        excludedIds: items
                            .filter(isListEvent)
                            .map(e => keyOfId(e.id)),
                    }}
                />
            </Floating>
        </FloatingContainer>
    );
};


const thumbnailContainerStyle = {
    width: 100,
    flexShrink: 0,
    [screenWidthAtMost(420)]: {
        width: "min(100px, 25%)",
    },
} as const;

type DraggableItemProps = PropsWithChildren<{
    id: string;
    index: number;
    isDragDisabled: boolean;
}>;

const DraggableItem: React.FC<DraggableItemProps> = ({
    id, index, isDragDisabled, children,
}) => (
    <Draggable draggableId={id} {...{ index }} isDragDisabled={isDragDisabled}>
        {(provided, snapshot) => (
            <div
                ref={provided.innerRef}
                {...provided.draggableProps}
                {...provided.dragHandleProps}
                css={{
                    ...!isDragDisabled && { cursor: "grab" },
                    ...snapshot.isDragging && {
                        cursor: "grabbing",
                        boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
                        borderRadius: 8,
                        backgroundColor: COLORS.neutral05,
                    },
                }}
            >
                {children}
            </div>
        )}
    </Draggable>
);

type EntryRowProps = PropsWithChildren<{
    action: string;
    actionColor?: string;
    index: number;
    totalItems: number;
    onMove?: (direction: -1 | 1) => void;
}>;

const EntryRow: React.FC<EntryRowProps> = ({
    action,
    actionColor,
    index,
    totalItems,
    onMove,
    children,
}) => (
    <div css={{
        display: "flex",
        position: "relative",
        gap: 8,
        padding: 6,
        ":hover": { backgroundColor: COLORS.neutral15 },
        "::before": {
            content: "''",
            position: "absolute",
            inset: "1px 0",
            width: 3,
            backgroundColor: actionColor,
        },
    }}>
        {children}
        {onMove && <MoveButtons
            disabled={action === "remove"}
            {...{ index, totalItems, onMove }}
        />}
    </div>
);

type EventEntryProps = {
    event: ListEvent;
    listId?: string;
    onSeriesChange?: (eventId: string, targetSeries: { id: string; title: string }) => void;
    index: number;
    totalEvents: number;
    onChange: () => void;
    onMove?: (direction: -1 | 1) => void;
    isPlaylistEntry: boolean;
};

const EventEntry: React.FC<EventEntryProps> = ({
    event, index, totalEvents, onChange, listId, onSeriesChange, onMove, isPlaylistEntry,
}) => {
    const { t, i18n } = useTranslation();

    const date = new Date(event.syncedData?.startTime ?? event.created);

    const pendingAction = match(event.action, {
        "add": () => ({
            color: COLORS.happy0,
            label: t("manage.video-list.edit.to-be-added"),
        }),
        "remove": () => ({
            color: COLORS.danger0,
            label: t("manage.video-list.edit.to-be-removed"),
        }),
        "move": () => ({
            color: COLORS.danger0,
            label: t("manage.video-list.edit.to-be-moved", {
                series: event.action === "move" ? event.targetSeries.title : undefined,
            }),
        }),
        "none": () => null,
    });

    return (
        <EntryRow
            action={event.action}
            actionColor={pendingAction?.color}
            totalItems={totalEvents}
            {...{ index, onMove }}
        >
            <Link to={DirectVideoRoute.url({ videoId: event.id })} css={{
                ...thumbnailLinkStyle,
                ...thumbnailContainerStyle,
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
                            ...ellipsisOverflowCss(1),
                            ...titleLinkStyle,
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
                                }}>
                                    {event.creators.join(", ")}
                                </span>
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
                        ...actionColumnStyle,
                        [screenWidthAbove(BREAKPOINT_SMALL)]: {
                            minWidth: 75,
                        },
                    }}>
                        {pendingAction && <>
                            <ActionLabel {...pendingAction} />
                            <UndoButton onClick={onChange} />
                        </>}

                        {event.action === "none" && <>
                            {!event.canWrite && !isPlaylistEntry
                                && <ActionLabel
                                    color={COLORS.neutral50}
                                    label={t("manage.video-list.edit.cannot-be-removed")}
                                />
                            }
                            <div css={{
                                display: "flex",
                                gap: 8,
                                marginTop: "auto",
                            }}>
                                {!isPlaylistEntry && onSeriesChange
                                    && <SwitchSeriesMenu
                                        {...{ event, onSeriesChange }}
                                        listId={notNullish(listId)}
                                    />
                                }

                                <RemoveButton
                                    disabled={!isPlaylistEntry && (
                                        !event.canWrite || !CONFIG.allowSeriesEventRemoval
                                    )}
                                    onClick={onChange}
                                />
                            </div>
                        </>}
                    </div>
                </div>
            </div>
        </EntryRow>
    );
};


type PlaceholderEntryProps = {
    item: PlaceholderEvent;
    index: number;
    totalItems: number;
    onChange: () => void;
    onMove?: (direction: -1 | 1) => void;
};

const PlaceholderEntry: React.FC<PlaceholderEntryProps> = ({
    item,
    index,
    totalItems,
    onChange,
    onMove,
}) => {
    const { t } = useTranslation();
    const isMissing = item.placeholderKind === "missing";
    const actionColor = item.action === "remove" ? COLORS.danger0 : "transparent";
    const label = isMissing
        ? t("manage.video-list.edit.placeholder-missing")
        : t("manage.video-list.edit.placeholder-not-allowed");
    const Icon = isMissing ? LuCircleHelp : LuShieldQuestion;

    return (
        <EntryRow
            action={item.action}
            {...{ actionColor, index, totalItems, onMove }}
        >
            <PlaceholderThumbnailReplacement
                icon={<Icon />}
                css={{
                    ...thumbnailContainerStyle,
                    aspectRatio: "16 / 9",
                    borderRadius: 8,
                }}
            />
            <div css={{
                display: "flex",
                flexGrow: 1,
                justifyContent: "space-between",
                gap: 8,
                minWidth: 0,
            }}>
                <i css={{ fontSize: 14, color: COLORS.neutral50, alignSelf: "center" }}>
                    {label}
                </i>
                <div css={actionColumnStyle}>
                    {item.action === "remove"
                        ? <>
                            <ActionLabel
                                color={COLORS.danger0}
                                label={t("manage.video-list.edit.to-be-removed")}
                            />
                            <UndoButton onClick={onChange} />
                        </>
                        : isMissing && <RemoveButton onClick={onChange} />
                    }
                </div>
            </div>
        </EntryRow>
    );
};


type MoveButtonsProps = {
    index: number;
    totalItems: number;
    disabled?: boolean;
    onMove: (direction: -1 | 1) => void;
};

const MoveButtons: React.FC<MoveButtonsProps> = ({ index, totalItems, disabled, onMove }) => {
    const { t } = useTranslation();
    const isDark = useColorScheme().scheme === "dark";

    const style = css({
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

    const upDisabled = index === 0 || disabled;
    const downDisabled = index === totalItems - 1 || disabled;

    return <div css={{ marginLeft: -2 }}>
        <ConditionalWrapper condition={!upDisabled} wrapper={children =>
            <WithTooltip tooltip={t("manage.realm.content.move-up")} placement="left">
                {children}
            </WithTooltip>
        }>
            <button
                aria-label={t("manage.realm.content.move-up")}
                disabled={upDisabled}
                onClick={e => {
                    e.currentTarget.blur();
                    onMove(-1);
                }}
                css={style}
            >
                <LuArrowUp size={16} />
            </button>
        </ConditionalWrapper>
        <ConditionalWrapper condition={!downDisabled} wrapper={children =>
            <WithTooltip tooltip={t("manage.realm.content.move-down")} placement="left">
                {children}
            </WithTooltip>
        }>
            <button
                aria-label={t("manage.realm.content.move-down")}
                disabled={downDisabled}
                onClick={e => {
                    e.currentTarget.blur();
                    onMove(1);
                }}
                css={style}
            >
                <LuArrowDown size={16} />
            </button>
        </ConditionalWrapper>
    </div>;
};


type SwitchSeriesMenuProps = {
    event: ListEvent;
    listId: string;
    onSeriesChange: NonNullable<EventEntryProps["onSeriesChange"]>
}

const SwitchSeriesMenu: React.FC<SwitchSeriesMenuProps> = ({ event, onSeriesChange, listId }) => {
    const { t } = useTranslation();
    const isDark = useColorScheme().scheme === "dark";
    const floatingRef = useRef<FloatingHandle>(null);
    const [buttonIsActive, setButtonIsActive] = useState(false);

    useOnOutsideClick(floatingRef, () => setButtonIsActive(false));

    return (
        <FloatingContainer
            ref={floatingRef}
            trigger="click"
            placement="bottom"
            borderRadius={8}
            ariaRole="menu"
        >
            <FloatingTrigger>
                <Button
                    disabled={!event.canWrite}
                    onClick={() => setButtonIsActive(prev => !prev)}
                    css={{
                        ...buttonStyle,
                        display: "flex",
                        ...buttonIsActive && { "&&": {
                            borderColor: COLORS.neutral60,
                            backgroundColor: COLORS.neutral15,
                        } },
                    }}
                >
                    <LuArrowLeftRight size={16} />
                    <span>{t("manage.video-list.edit.move")}</span>
                </Button>
            </FloatingTrigger>
            {createPortal(
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
                    <VideoListSelector
                        writableOnly
                        type="series"
                        css={{ position: "relative" }}
                        onChange={series => {
                            if (!series) {
                                return;
                            }

                            onSeriesChange(event.id, {
                                id: series.id,
                                title: series.title,
                            });

                            currentRef(floatingRef).close();
                            setButtonIsActive(false);
                        }}
                        controlShouldRenderValue={false}
                        backspaceRemovesValue={false}
                        isClearable={false}
                        menuIsOpen
                        filterOption={option => option.data.id !== listId}
                    />
                </Floating>,
                document.body,
            )}
        </FloatingContainer>
    );
};


const isAuthorizedEvent = (e: Entry): e is AuthEvent => e.__typename === "AuthorizedEvent";

/** Sorts series by date of creation but preserves manual order for playlists */
const mapItems = (entries: readonly Entry[], isPlaylist: boolean): ListItem[] => {
    const toPlaceholder = (e: Exclude<Entry, AuthEvent>): PlaceholderEvent | null => {
        if (e.__typename !== "Missing" && e.__typename !== "NotAllowed") {
            return null;
        }
        return {
            __typename: "placeholder",
            placeholderKind: e.__typename === "Missing" ? "missing" : "not-allowed",
            id: e.opencastId,
            action: "none",
        };
    };

    if (isPlaylist) {
        // Preserve original order for all entry types (regular events and placeholders).
        return entries.flatMap(e =>
            isAuthorizedEvent(e) ? { ...e, action: "none" } : toPlaceholder(e) ?? []);
    }

    // For series: sort authorized events by creation date, keep placeholders in.. place.
    const authorized = [...entries.filter(isAuthorizedEvent)]
        .sort((a, b) => a.created === b.created ? 0 : (a.created > b.created ? 1 : -1));
    let eventIdx = 0;
    return entries.flatMap(e =>
        isAuthorizedEvent(e)
            ? { ...authorized[eventIdx++], action: "none" }
            : toPlaceholder(e) ?? []);
};

/** Swap two adjacent items in the video list */
const moveItem = (arr: ListItem[], from: number, to: number): ListItem[] => {
    if (to < 0 || to >= arr.length) {
        return arr;
    }
    const result = [...arr];
    result[from] = arr[to];
    result[to] = arr[from];
    return result;
};

/** Reorder items after drag and drop */
const reorderItems = (arr: ListItem[], from: number, to: number): ListItem[] => {
    const result = [...arr];
    const [removed] = result.splice(from, 1);
    result.splice(to, 0, removed);
    return result;
};


const buttonStyle = css({
    fontSize: 12,
    padding: "4px 8px",
    marginTop: "auto",
    gap: 5,
    [screenWidthAtMost(BREAKPOINT_MEDIUM)]: {
        span: { display: "none" },
    },
});

const actionColumnStyle = {
    display: "flex",
    flexDirection: "column",
    alignContent: "space-between",
    alignItems: "flex-end",
} as const;

const ActionLabel: React.FC<{ color: string; label: string }> = ({ color, label }) => (
    <i css={{ fontSize: 10, whiteSpace: "nowrap", color }}>({label})</i>
);

const UndoButton: React.FC<{ onClick: () => void }> = ({ onClick }) => {
    const { t } = useTranslation();
    return (
        <Button css={buttonStyle} onClick={onClick}>
            <LuUndo2 size={16} />
            <span>{t("manage.video-list.edit.undo")}</span>
        </Button>
    );
};

const RemoveButton: React.FC<{ onClick: () => void; disabled?: boolean }> = ({
    onClick,
    disabled,
}) => {
    const { t } = useTranslation();
    return (
        <Button disabled={disabled} kind="danger" css={buttonStyle} onClick={onClick}>
            <LuListX size={16} />
            <span>{t("manage.video-list.edit.remove")}</span>
        </Button>
    );
};

const isPlaceholder = (item: ListItem): item is PlaceholderEvent =>
    item.__typename === "placeholder";
const isListEvent = (item: ListItem): item is ListEvent =>
    item.__typename === "AuthorizedEvent";

const updateListEventById = (
    items: ListItem[],
    id: string,
    update: (event: ListEvent) => ListEvent,
): ListItem[] => items.map(item => {
    if (item.id === id && isListEvent(item)) {
        return update(item);
    }

    return item;
});


/**
 * Returns the event without the `targetSeries` field. This is needed because
 * `targetSeries` only exists on events with `action: "move"` (see the
 * `ListEvent` type), so before changing an event's action, we need to strip
 * it to avoid a stale `targetSeries` leaking into the new state.
 */
const stripTargetSeries = (event: ListEvent): AuthEvent & { action: string } => {
    if (event.action !== "move") {
        return event;
    }
    const { targetSeries, ...rest } = event;
    return rest;
};

const clearEventAction = (event: ListEvent): ListEvent =>
    ({ ...stripTargetSeries(event), action: "none" });

const togglePlaceholderRemoval = (placeholder: PlaceholderEvent): PlaceholderEvent => {
    if (placeholder.placeholderKind === "not-allowed") {
        return placeholder;
    }
    return {
        ...placeholder,
        action: placeholder.action === "remove" ? "none" : "remove",
    };
};

const setEventAction = (
    event: ListEvent,
    action: "remove" | "move",
    targetSeries?: { id: string; title: string },
): ListEvent => {
    const base = stripTargetSeries(event);
    return action === "move"
        ? { ...base, action, targetSeries: notNullish(targetSeries) }
        : { ...base, action };
};
