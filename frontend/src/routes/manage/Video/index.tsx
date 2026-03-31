import { useTranslation } from "react-i18next";
import { graphql } from "react-relay";
import { match, screenWidthAtMost } from "@opencast/appkit";
import { LuUpload, LuVideo } from "react-icons/lu";

import { ManageNav } from "..";
import { RootLoader } from "../../../layout/Root";
import {
    VideoManageQuery,
    VideoManageQuery$data,
    VideosSortColumn,
} from "./__generated__/VideoManageQuery.graphql";
import { makeRoute } from "../../../rauta";
import { loadQuery } from "../../../relay";
import { NotAuthorized } from "../../../ui/error";
import { Thumbnail } from "../../../ui/Video";
import { keyOfId, translatedConfig } from "../../../util";
import {
    createQueryParamsParser, ManageItems, ListItem,
    CreateButton, buildSearchFilter,
} from "../Shared/Table";
import { PartOfSeriesLink } from "../../../ui/Blocks/VideoList";
import { UploadRoute } from "../../Upload";
import { DirectVideoRoute, VideoShareButton } from "../../Video";
import { COLORS } from "../../../color";
import { BREAKPOINT_MEDIUM, BREAKPOINT_SMALL } from "../../../GlobalStyle";
import { ExternalLink } from "../../../relay/auth";
import { isRealUser, useUser } from "../../../User";
import CONFIG from "../../../config";


const PATH = "/~manage/videos" as const;

export const ManageVideosRoute = makeRoute({
    url: PATH,
    match: url => {
        if (url.pathname !== PATH) {
            return null;
        }

        const vars = queryParamsToVideosVars(url.searchParams);
        const queryVars = {
            ...vars,
            filter: buildSearchFilter(vars.filters),
        };
        const queryRef = loadQuery<VideoManageQuery>(query, queryVars);

        return {
            render: () => <RootLoader
                {...{ query, queryRef }}
                noindex
                nav={() => <ManageNav active={PATH} />}
                render={data => !data.currentUser
                    ? <NotAuthorized />
                    : <ManageItems
                        vars={vars}
                        connection={data.currentUser.myVideos}
                        titleKey="manage.video.table"
                        additionalSortOptions={[
                            { key: "SERIES", label: "series.singular" },
                            { key: "CREATED", label: "manage.table.sorting.created" },
                            { key: "UPDATED", label: "manage.table.sorting.updated" },
                        ]}
                        RenderItem={VideoItem}
                        createButton={(
                            <div css={{
                                display: "flex",
                                gap: 12,
                                [screenWidthAtMost(BREAKPOINT_SMALL)]: {
                                    gap: 6,
                                },
                            }}>
                                <StudioLink />
                                <UploadLink />
                            </div>
                        )}
                    />
                }
            />,
            dispose: () => queryRef.dispose(),
        };
    },
});

const query = graphql`
    query VideoManageQuery(
        $order: VideosSortOrder!,
        $offset: Int!,
        $limit: Int!,
        $filter: SearchFilter,
    ) {
        ...UserData
        currentUser {
            myVideos(order: $order, offset: $offset, limit: $limit, filter: $filter) {
                __typename
                totalCount
                pageInfo { hasNextPage hasPrevPage }
                items {
                    id
                    title
                    created
                    creators
                    description
                    isLive
                    tobiraDeletionTimestamp
                    series { id opencastId title }
                    readRoles
                    writeRoles
                    syncedData {
                        duration
                        thumbnail
                        updated
                        startTime
                        endTime
                        audioOnly
                    }
                    authorizedData {
                        tracks { uri flavor resolution }
                    }
                }
            }
        }
    }
`;

const UploadLink: React.FC = () => <CreateButton
    condition="canUpload"
    path={UploadRoute.url()}
    text="upload.title"
    Icon={LuUpload}
/>;

const StudioLink: React.FC = () => {
    const { t, i18n } = useTranslation();
    const user = useUser();

    if (!isRealUser(user) || !user.canUseStudio) {
        return null;
    }

    return (
        <ExternalLink
            service="STUDIO"
            params={{
                "return.target": document.location.href,
                "return.label": translatedConfig(CONFIG.siteTitle, i18n),
            }}
            fallback="button"
            css={{
                "&&, && button": {
                    backgroundColor: "unset",
                    padding: "4px 10px",
                    gap: 7,
                    height: 38,
                    fontSize: 14,
                    display: "inline-flex",
                    alignItems: "center",
                    borderRadius: 8,
                    border: `1px solid ${COLORS.neutral40}`,
                    cursor: "pointer",
                    textDecoration: "none",
                    color: COLORS.neutral90,
                    "&:hover, &:focus-visible": {
                        border: `1px solid ${COLORS.neutral60}`,
                        backgroundColor: COLORS.neutral15,
                    },
                    [screenWidthAtMost(BREAKPOINT_MEDIUM)]: {
                        "&&, &&:hover": {
                            border: 0,
                        },
                        height: "unset",
                        padding: 8,
                        marginTop: -4,
                    },
                },
            }}
        >
            <p css={{
                [screenWidthAtMost(BREAKPOINT_MEDIUM)]: {
                    display: "none",
                },
            }}>
                {t("manage.dashboard.studio-title")}
            </p>
            <LuVideo size={17} />
        </ExternalLink>
    );
};


export type EventConnection = NonNullable<VideoManageQuery$data["currentUser"]>["myVideos"];
export type Events = EventConnection["items"];
export type Event = Events[number];


const VideoItem: React.FC<{ item: Event }> = ({ item }) => <ListItem
    itemType="video"
    item={item}
    link={`${PATH}/${keyOfId(item.id)}`}
    thumbnail={state => <Thumbnail event={item} {...{ state }} />}
    created={item.created}
    generalMetadataProps={{
        timestamp: item.syncedData?.startTime ?? item.created,
        isLive: item.isLive,
        creators: [...item.creators],
    }}
    specificMetadata={[
        item.series && <PartOfSeriesLink
            key="series-link"
            css={{
                fontSize: 12,
                gap: 6,
                svg: { fontSize: 15 },
                paddingTop: "unset",
                minWidth: 0,
            }}
            seriesTitle={item.series.title}
            seriesId={item.series.id}
        />,
    ]}
    directUrl={new URL(DirectVideoRoute.url({ videoId: item.id }), document.baseURI).href}
    renderShareButton={url => <VideoShareButton
        event={item}
        videoLink={url}
        hideLabel
        noTimestamp
    />}
/>;




const parseVideosColumn = (sortBy: string | null): VideosSortColumn =>
    sortBy !== null
        ? match(sortBy, {
            "title": () => "TITLE" as const,
            "created": () => "CREATED" as const,
            "updated": () => "UPDATED" as const,
            "series": () => "SERIES" as const,
        }) ?? "CREATED"
        : "CREATED";

const queryParamsToVideosVars = createQueryParamsParser<VideosSortColumn>(parseVideosColumn);
