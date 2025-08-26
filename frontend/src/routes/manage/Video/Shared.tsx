import { useTranslation } from "react-i18next";
import { LuInfo, LuShieldCheck, LuPlay, LuPenLine } from "react-icons/lu";
import { graphql } from "react-relay";

import { RootLoader } from "../../../layout/Root";
import { makeRoute, Route } from "../../../rauta";
import { loadQuery } from "../../../relay";
import { NotAuthorized } from "../../../ui/error";
import { NotFound } from "../../NotFound";
import { b64regex } from "../../util";
import { Thumbnail } from "../../../ui/Video";
import { SharedVideoManageQuery } from "./__generated__/SharedVideoManageQuery.graphql";
import { eventId, keyOfId } from "../../../util";
import { DirectVideoRoute, VideoRoute } from "../../Video";
import { ManageVideosRoute } from ".";
import CONFIG from "../../../config";
import { ReturnLink, ManageNav, ManageSubPageType } from "../Shared/Nav";


export const PAGE_WIDTH = 1100;

export type QueryResponse = SharedVideoManageQuery["response"];
export type Event = QueryResponse["event"];
export type AuthorizedEvent = Extract<Event, { __typename: "AuthorizedEvent" }>;

type ManageVideoSubPageType = "details" | "technical-details" | "acl";

/** Helper around `makeRoute` for manage single video subpages. */
export const makeManageVideoRoute = (
    page: ManageSubPageType,
    path: `/${string}` | "",
    render: (event: AuthorizedEvent, data: QueryResponse) => JSX.Element,
    options?: { fetchWorkflowState?: boolean },
): Route & { url: (args: { videoId: string }) => string } => (
    makeRoute({
        url: ({ videoId }: { videoId: string }) => `/~manage/videos/${keyOfId(videoId)}${path}`,
        match: url => {
            const regex = new RegExp(`^/~manage/videos/(${b64regex}+)${path}/?$`, "u");
            const params = regex.exec(url.pathname);
            if (params === null) {
                return null;
            }

            const videoId = decodeURIComponent(params[1]);
            const queryRef = loadQuery<SharedVideoManageQuery>(query, {
                id: eventId(videoId),
                fetchWorkflowState: options?.fetchWorkflowState ?? false,
            });

            return {
                render: () => <RootLoader
                    {...{ query, queryRef }}
                    noindex
                    nav={data => [
                        <ReturnLink
                            key={1}
                            url={ManageVideosRoute.url}
                            title="manage.video.table"
                        />,
                        <ManageVideoNav key={2} event={data.event} active={page} />,
                    ]}
                    render={data => {
                        if (data.event == null) {
                            return <NotFound kind="video" />;
                        }
                        if (data.event.__typename !== "AuthorizedEvent" || !data.event.canWrite) {
                            return <NotAuthorized />;
                        }

                        return render(data.event, data);
                    }}
                />,
                dispose: () => queryRef.dispose(),
            };
        },
    })
);


// We have one query for all "manage video" pages as there is a huge overlap in
// what they request. It just simplifies our code a lot and we only pay by
// overfetching a bit.
const query = graphql`
    query SharedVideoManageQuery($id: ID!, $fetchWorkflowState: Boolean!) {
        ...UserData
        ...AccessKnownRolesData
        event: eventById(id: $id) {
            __typename
            ... on AuthorizedEvent {
                id
                title
                description
                opencastId
                created
                canWrite
                isLive
                workflowStatus @include(if: $fetchWorkflowState)
                acl { role actions info { label implies large } }
                syncedData {
                    duration
                    updated
                    startTime
                    endTime
                    thumbnail
                    audioOnly
                }
                authorizedData {
                    tracks { flavor resolution mimetype uri }
                    captions { uri lang }
                }
                series {
                    id
                    title
                    opencastId
                    ...SeriesBlockSeriesData
                }
                hostRealms { id isMainRoot name path }
            }
        }
    }
`;


type ManageVideoNavProps = {
    event: Event;
    active: ManageVideoSubPageType;
};

const ManageVideoNav: React.FC<ManageVideoNavProps> = ({ event, active }) => {
    const { t } = useTranslation();

    if (event == null) {
        return null;
    }
    if (event.__typename !== "AuthorizedEvent" || !event.canWrite) {
        return null;
    }

    const id = keyOfId(event.id);

    const navEntries = [
        {
            url: `/~manage/videos/${id}`,
            page: "details",
            body: <><LuPenLine />{t("video.details")}</>,
        },
        {
            url: `/~manage/videos/${id}/technical-details`,
            page: "technical-details",
            body: <><LuInfo />{t("manage.video.technical-details.title")}</>,
        },
    ];

    if (CONFIG.allowAclEdit) {
        navEntries.splice(1, 0, {
            url: `/~manage/videos/${id}/access`,
            page: "acl",
            body: <><LuShieldCheck />{t("acl.title")}</>,
        });
    }

    const link = event.hostRealms.length === 1
        ? VideoRoute.url({ realmPath: event.hostRealms[0].path, videoID: id })
        : DirectVideoRoute.url({ videoId: id });
    const title = event.title;
    const ariaLabel = t("video.video-page", { video: event.title });
    const additionalStyles = {
        backgroundColor: "black",
        borderRadius: 8,
    };

    const thumbnail = <>
        <LuPlay />
        <Thumbnail event={event} />
    </>;

    return <ManageNav {...{
        active,
        link,
        ariaLabel,
        title,
        thumbnail,
        navEntries,
        additionalStyles,
    }} />;
};
