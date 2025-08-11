import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { UseMutationConfig } from "react-relay";
import { MutationParameters, Disposable } from "relay-runtime";
import { LuCalendar, LuCircleUser, LuListPlus, LuListX, LuUndo2, LuUpload } from "react-icons/lu";
import {
    boxError,
    bug,
    Button,
    Floating,
    FloatingContainer,
    FloatingHandle,
    FloatingTrigger,
    match,
    useColorScheme,
    useOnOutsideClick,
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


type Entry = Series["entries"][number];
type AuthEvent = Extract<Entry, { __typename: "AuthorizedEvent" }>;
type ListEvent = AuthEvent & { action: "add" | "remove" | "none" };


type VideoListMutationParams = MutationParameters & {
    variables: {
        id: string;
        addedEvents: readonly string[];
        removedEvents: readonly string[];
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
    const [events, setEvents] = useState(mapItems(listEntries));

    useNavBlocker(() => events.some(e => e.action !== "none") || inFlight);

    const user = useUser();
    if (!isRealUser(user)) {
        return bug("Used <ManageVideoListContent> without user");
    }

    const onSubmit = () => commit({
        variables: {
            id: listId,
            addedEvents: events.filter(e => e.action === "add").map(e => e.id),
            removedEvents: events.filter(e => e.action === "remove").map(e => e.id),
        },
        onCompleted: data => {
            setSuccess(true);
            setEvents(mapItems(getUpdatedEntries(data)));
        },
        onError: e => {
            setSuccess(false);
            setCommitError(displayCommitError(e, t("manage.video-list.edit.error")));
        },
    });


    return <Inertable isInert={inFlight || !!commitError} css={{ marginBottom: 32, maxWidth: 750 }}>
        <div css={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <h2 css={{ fontSize: 20 }}>
                {t("video.singular")}
            </h2>
            <i css={{ fontSize: 14, color: COLORS.neutral50 }}>
                ({listEntries.length > 0
                    ? t("manage.video-list.no-of-videos", { count: listEntries.length })
                    : <i>{t("manage.video-list.no-content")}</i>
                })
            </i>
        </div>
        {description && <p css={{ marginBottom: 8, maxWidth: 750, fontSize: 14 }}>
            {description}
        </p>}
        <div css={{ margin: "24px auto 16px", display: "flex", gap: 12, flexWrap: "wrap" }}>
            <AddVideoMenu {...{ setEvents, events }} />
            {/* // Todo: Omit upload button when adding this route for playlists */}
            {user.canUpload && <LinkButton to={UploadRoute.url({ seriesId: keyOfId(listId) })} >
                <LuUpload />
                {t("upload.title")}
            </LinkButton>}
        </div>
        {events.length > 0 && <>
            <div css={{
                maxHeight: 360,
                overflowY: "auto",
                border: `1px solid ${COLORS.neutral25}`,
                borderRadius: 8,
            }}>
                {events.map(event => (
                    <EventEntry
                        key={event.id}
                        event={event}
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
            <SubmitButtonWithStatus
                label={t("manage.video-list.edit.save")}
                onClick={onSubmit}
                disabled={!!commitError || events.every(e => e.action === "none") || inFlight}
                {...{ inFlight, success, setSuccess }}
            />
        </>}
        {boxError(commitError)}
    </Inertable>;
};

type AddVideoMenuProps = {
    events: ListEvent[];
    setEvents: React.Dispatch<React.SetStateAction<ListEvent[]>>;
};

const AddVideoMenu: React.FC<AddVideoMenuProps> = ({ events, setEvents }) => {
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
                    writableOnly
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
                        excludeSeriesMembers: true,
                        excludedIds: events.filter(e => e.action === "add").map(e => keyOfId(e.id)),
                    }}
                />
            </Floating>
        </FloatingContainer>
    );
};


type EventEntryProps = {
    event: ListEvent;
    onChange: () => void;
};

const EventEntry: React.FC<EventEntryProps> = ({ event, onChange }) => {
    const { t, i18n } = useTranslation();

    const buttonStyle = css({
        fontSize: 12,
        padding: "4px 8px",
        marginTop: "auto",
        gap: 5,
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
                            ":focus, :focus-visible": {
                                outline: "none",
                            },
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
                                    "&:after": {
                                        content: "'•'",
                                        padding: "0 4px",
                                    },
                                }}>{event.creators.join(", ")}</span>
                            </>}
                            <LuCalendar />
                            <time dateTime={date.toISOString()} css={{ marginLeft: 2 }}>
                                {date.toLocaleDateString(i18n.language)}
                            </time>
                        </div>
                    </div>

                    <div css={{
                        display: "flex",
                        flexDirection: "column",
                        alignContent: "space-between",
                        alignItems: "flex-end",
                        minWidth: 75,
                        i: { fontSize: 10, whiteSpace: "nowrap" },
                    }}>
                        {event.action === "remove" && <>
                            <i css={{ color: COLORS.danger0 }}>
                                ({t("manage.video-list.edit.to-be-removed")})
                            </i>
                            <Button css={buttonStyle} onClick={onChange}>
                                <LuUndo2 size={16} />
                                {t("manage.video-list.edit.undo")}
                            </Button>
                        </>}
                        {event.action === "add" && <>
                            <i css={{ color: COLORS.happy0 }}>
                                ({t("manage.video-list.edit.to-be-added")})
                            </i>
                            <Button css={buttonStyle} onClick={onChange}>
                                <LuUndo2 size={16} />
                                {t("manage.video-list.edit.undo")}
                            </Button>
                        </>}
                        {event.action === "none" && <>
                            {!event.canWrite && <i css={{ color: COLORS.neutral50 }}>
                                ({t("manage.video-list.edit.cannot-be-removed")})
                            </i>}
                            <Button
                                disabled={!event.canWrite}
                                kind="danger"
                                css={buttonStyle}
                                onClick={onChange}
                            >
                                <LuListX />
                                {t("manage.video-list.edit.remove")}
                            </Button>
                        </>}
                    </div>
                </div>
            </div>
        </div>
    );
};


const isAuthorizedEvent = (e: Entry): e is AuthEvent => e.__typename === "AuthorizedEvent";
const mapItems = (entries: readonly Entry[]): ListEvent[] => entries
    .filter(isAuthorizedEvent)
    .sort((a, b) => a.created === b.created
        ? 0
        : (a.created > b.created ? 1 : -1))
    .map(e => ({ ...e, action: "none" }));
