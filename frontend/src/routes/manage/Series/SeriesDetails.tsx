import { useTranslation } from "react-i18next";
import { graphql, useMutation } from "react-relay";

import i18n from "../../../i18n";
import { makeManageSeriesRoute, Series } from "./Shared";
import { ManageSeriesRoute } from ".";
import { SeriesRoute } from "../../Series";
import { Link } from "../../../router";
import {
    UpdatedCreatedInfo,
    DetailsPage,
    MetadataSection,
    DeleteButton,
    HostRealms,
} from "../Shared/Details";
import { SeriesDetailsDeleteMutation } from "./__generated__/SeriesDetailsDeleteMutation.graphql";
import {
    SeriesDetailsMetadataMutation,
} from "./__generated__/SeriesDetailsMetadataMutation.graphql";
import { useNotification } from "../../../ui/NotificationContext";
import { ManageVideoListContent } from "../Shared/EditVideoList";
import { SeriesDetailsContentMutation } from "./__generated__/SeriesDetailsContentMutation.graphql";
import { Inertable, isSynced, keyOfId } from "../../../util";
import { NotReadyNote } from "../../util";
import { VideoListShareButton } from "../../../ui/Blocks/VideoList";


const updateSeriesMetadata = graphql`
    mutation SeriesDetailsMetadataMutation($id: ID!, $metadata: BasicMetadata!) {
        updateSeriesMetadata(id: $id, metadata: $metadata) { id }
    }
`;

const deleteSeriesMutation = graphql`
    mutation SeriesDetailsDeleteMutation($id: ID!) {
        deleteSeries(id: $id) { id }
    }
`;

const editSeriesContent = graphql`
    mutation SeriesDetailsContentMutation($id: ID!, $addedEvents: [ID!]!, $removedEvents: [ID!]!) {
        updateSeriesContent(id: $id, addedEvents: $addedEvents, removedEvents: $removedEvents) {
            entries {
                __typename
                ...on AuthorizedEvent {
                    id
                    isLive
                    title
                    created
                    creators
                    description
                    canWrite
                    syncedData { thumbnail audioOnly duration startTime endTime }
                }
            }
        }
    }
`;

export const ManageSeriesDetailsRoute = makeManageSeriesRoute(
    "details",
    "",
    series => <DetailsPage
        pageTitle="manage.series.details.title"
        item={series}
        breadcrumb={{
            label: i18n.t("manage.series.table.title"),
            link: ManageSeriesRoute.url,
        }}
        sections={series => [
            <NotificationSection key="notification" />,
            <SeriesNoteSection key="series-note" {...{ series }} />,
            <UpdatedCreatedInfo key="date-info" item={series} />,
            <SeriesButtonSection key="button-section" {...{ series }} />,
            <SeriesMetadataSection key="metadata" series={series} />,
            <SeriesContentSection key="content" series={series} />,
            <div key="host-realms" css={{ marginBottom: 32 }}>
                <HostRealms kind="series" hostRealms={series.hostRealms} itemLink={realmPath => (
                    <Link to={SeriesRoute.url({ realmPath: realmPath, seriesId: series.id })}>
                        {i18n.t("series.singular")}
                    </Link>
                )}/>
            </div>,
        ]}
    />,
);

const NotificationSection: React.FC = () => {
    const { Notification } = useNotification();
    return <Notification />;
};

const SeriesNoteSection: React.FC<{ series: Series }> = ({ series }) =>
    !isSynced(series) && <NotReadyNote kind="series" />;

const SeriesButtonSection: React.FC<{ series: Series }> = ({ series }) => {
    const { t } = useTranslation();
    const [commit] = useMutation<SeriesDetailsDeleteMutation>(deleteSeriesMutation);

    const seriesKey = keyOfId(series.id);
    const shareInfo = {
        kind: "series" as const,
        shareUrl: `/!s/${seriesKey}`,
        rssUrl: `/~rss/series/${seriesKey}`,
    };

    return <div css={{ display: "flex", gap: 12, marginBottom: 16 }}>
        <VideoListShareButton {...shareInfo} css={{ height: 40, borderRadius: 8 }} />
        <DeleteButton
            item={series}
            kind="series"
            returnPath="/~manage/series"
            commit={commit}
        >
            <br />
            <p>{t("manage.series.details.delete-note")}</p>
        </DeleteButton>
    </div>;
};

const SeriesMetadataSection: React.FC<{ series: Series }> = ({ series }) => {
    const [commit, inFlight] = useMutation<SeriesDetailsMetadataMutation>(updateSeriesMetadata);

    return <MetadataSection
        item={series}
        {...{ commit, inFlight }}
    />;
};

const SeriesContentSection: React.FC<{ series: Series }> = ({ series }) => {
    const { t } = useTranslation();
    const [commit, inFlight] = useMutation<SeriesDetailsContentMutation>(editSeriesContent);

    return <Inertable isInert={!isSynced(series)}>
        <ManageVideoListContent
            listId={series.id}
            listEntries={[...series.entries]}
            getUpdatedEntries={data => [...data.updateSeriesContent.entries]}
            description={t("manage.series.details.edit-note")}
            {...{ commit, inFlight }}
        />
    </Inertable>;
};
