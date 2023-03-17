import { useTranslation } from "react-i18next";
import { FiCornerLeftUp, FiEdit3, FiInfo, FiPlay } from "react-icons/fi";
import { graphql } from "react-relay";

import { RootLoader } from "../../../layout/Root";
import { makeRoute, Route } from "../../../rauta";
import { loadQuery } from "../../../relay";
import { ellipsisOverflowCss, LinkList, LinkWithIcon } from "../../../ui";
import { NotAuthorized } from "../../../ui/error";
import { NotFound } from "../../NotFound";
import { PATH as MANAGE_VIDEOS_PATH } from ".";
import { b64regex } from "../../util";
import { Thumbnail } from "../../../ui/Video";
import { SharedVideoManageQuery } from "./__generated__/SharedVideoManageQuery.graphql";
import { Link } from "../../../router";


export const PAGE_WIDTH = 1100;

export type QueryResponse = SharedVideoManageQuery["response"];
export type Event = QueryResponse["event"];
export type AuthorizedEvent = Extract<Event, { __typename: "AuthorizedEvent" }>;

type ManageVideoSubPageType = "details" | "technical-details";

/** Helper around `makeRoute` for manage single video subpages. */
export const makeManageVideoRoute = (
    page: ManageVideoSubPageType,
    path: string,
    render: (event: AuthorizedEvent) => JSX.Element,
): Route => (
    makeRoute(url => {
        const regex = new RegExp(`^/~manage/videos/(${b64regex}+)${path}/?$`, "u");
        const params = regex.exec(url.pathname);
        if (params === null) {
            return null;
        }

        const videoId = decodeURIComponent(params[1]);
        const queryRef = loadQuery<SharedVideoManageQuery>(query, { id: `ev${videoId}` });

        return {
            render: () => <RootLoader
                {...{ query, queryRef }}
                noindex
                nav={data => [
                    <BackLink key={1} />,
                    <ManageVideoNav key={2} event={data.event} active={page} />,
                ]}
                render={data => {
                    if (data.event === null) {
                        return <NotFound kind="video" />;
                    }
                    if (data.event.__typename !== "AuthorizedEvent" || !data.event.canWrite) {
                        return <NotAuthorized />;
                    }

                    return render(data.event);
                }}
            />,
            dispose: () => queryRef.dispose(),
        };
    })
);


// We have one query for all "manage video" pages as there is a huge overlap in
// what they request. It just simplifies our code a lot and we only pay by
// overfetching a bit.
const query = graphql`
    query SharedVideoManageQuery($id: ID!) {
        ...UserData
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
                syncedData {
                    duration
                    thumbnail
                    updated
                    startTime
                    endTime
                    tracks { flavor resolution mimetype uri }
                }
                series {
                    title
                    opencastId
                    ...SeriesBlockSeriesData
                }
                hostRealms { id isMainRoot name path }
            }
        }
    }
`;


/** Simple nav element linking back to "my videos" overview page. */
const BackLink: React.FC = () => {
    const { t } = useTranslation();
    const items = [
        <LinkWithIcon key={MANAGE_VIDEOS_PATH} to={MANAGE_VIDEOS_PATH} iconPos="left">
            <FiCornerLeftUp />
            {t("manage.nav.my-videos")}
        </LinkWithIcon>,
    ];

    return <LinkList items={items} />;
};


type ManageVideoNavProps = {
    event: Event;
    active: ManageVideoSubPageType;
};

const ManageVideoNav: React.FC<ManageVideoNavProps> = ({ event, active }) => {
    const { t } = useTranslation();

    if (event === null) {
        return null;
    }
    if (event.__typename !== "AuthorizedEvent" || !event.canWrite) {
        return null;
    }

    const id = event.id.substring(2);

    const items = [
        {
            url: `/~manage/videos/${id}`,
            page: "details",
            body: <><FiEdit3 />{t("manage.my-videos.details.title")}</>,
        },
        // {
        //     url: `/~manage/videos/${id}/access`,
        //     page: "acl",
        //     body: <><FiShield />{t("manage.my-videos.acl.title")}</>,
        // },
        {
            url: `/~manage/videos/${id}/technical-details`,
            page: "technical-details",
            body: <><FiInfo />{t("manage.my-videos.technical-details.title")}</>,
        },

    ].map(({ url, page, body }, i) => (
        <LinkWithIcon key={i} to={url} iconPos="left" active={page === active}>
            {body}
        </LinkWithIcon>
    ));

    const videoLink = event.hostRealms.length === 1
        ? `${event.hostRealms[0].path.replace(/^\/$/, "")}/v/${id}`
        : `/!v/${id}`;

    const header = (
        <div css={{ display: "flex", flexDirection: "column" }}>
            <Link to={videoLink} css={{
                display: "block",
                position: "relative",
                width: "100%",
                maxWidth: "calc(40vh * 16 / 9)",
                alignSelf: "center",
                "& > svg": {
                    position: "absolute",
                    top: "50%",
                    left: "50%",
                    zIndex: 5,
                    fontSize: 64,
                    color: "white",
                    transform: "translate(-50%, -50%)",
                },
                "&:not(:hover, :focus) > svg": {
                    display: "none",
                },
                "&:hover > div, &:focus > div": {
                    opacity: 0.7,
                },
                backgroundColor: "black",
                borderRadius: 8,
            }}>
                <FiPlay />
                <Thumbnail event={event} />
            </Link>
            <div css={{
                textAlign: "center",
                fontWeight: "bold",
                marginTop: 4,
                marginBottom: 8,
                ...ellipsisOverflowCss(2),
            }}>{event.title}</div>
        </div>
    );

    return <LinkList items={[header, ...items]} />;
};
