import { useTranslation } from "react-i18next";
import { graphql } from "react-relay";

import i18n from "../../../i18n";
import { makeManageSeriesRoute, Series } from "./Shared";
import { ManageSeriesRoute } from ".";
import { DirectSeriesRoute, SeriesRoute } from "../../Series";
import {
    UpdatedCreatedInfo,
    DetailsPage,
    DirectLink,
    MetadataSection,
    DeleteButton,
    HostRealms,
} from "../Shared/Details";
import { Link } from "../../../router";
import { useNotification } from "../../../ui/NotificationContext";
import { ManageVideoListContent } from "../Shared/EditVideoList";
import { useDisposableMutation } from "../../../relay";
import {
    SeriesDetailsMetadataMutation,
} from "./__generated__/SeriesDetailsMetadataMutation.graphql";
import { SeriesDetailsContentMutation } from "./__generated__/SeriesDetailsContentMutation.graphql";


const updateSeriesMetadata = graphql`
    mutation SeriesDetailsMetadataMutation($id: ID!, $title: String!, $description: String) {
        updateSeriesMetadata(id: $id, title: $title, description: $description) { id }
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
        pageTitle="manage.my-series.details.title"
        item={{ ...series, description: series.syncedData?.description }}
        breadcrumb={{
            label: i18n.t("manage.my-series.title"),
            link: ManageSeriesRoute.url,
        }}
        sections={series => [
            <NotificationSection key="notification" />,
            <UpdatedCreatedInfo key="date-info" item={series} />,
            <SeriesButtonSection key="button-section" {...{ series }} />,
            <DirectLink key="direct-link" url={
                new URL(DirectSeriesRoute.url({ seriesId: series.id }), document.baseURI)
            } />,
            <SeriesMetadataSection key="metadata" series={series} />,
            <SeriesContentSection key="content" series={series} />,
            <div key="host-realms" css={{ marginBottom: 32 }}>
                <HostRealms kind="series" hostRealms={series.hostRealms} itemLink={realmPath => (
                    <Link to={SeriesRoute.url({ realmPath: realmPath, seriesId: series.id })}>
                        {i18n.t("series.series")}
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

const SeriesButtonSection: React.FC<{ series: Series }> = ({ series }) => {
    const { t } = useTranslation();
    const [commit] = useDisposableMutation(deleteSeriesMutation);

    return <div css={{ display: "flex", gap: 12, marginBottom: 16 }}>
        <DeleteButton
            itemId={series.id}
            itemTitle={series.title}
            itemType="series"
            returnPath="/~manage/series"
            commit={commit}
        >
            <br />
            <p>{t("manage.my-series.delete-note")}</p>
        </DeleteButton>
    </div>;
};

const SeriesMetadataSection: React.FC<{ series: Series }> = ({ series }) => {
    const [commit, inFlight]
        = useDisposableMutation<SeriesDetailsMetadataMutation>(updateSeriesMetadata);

    return <MetadataSection
        item={{ ...series, description: series.syncedData?.description }}
        {...{ commit, inFlight }}
    />;
};

const SeriesContentSection: React.FC<{ series: Series }> = ({ series }) => {
    const { t } = useTranslation();
    const [commit, inFlight]
        = useDisposableMutation<SeriesDetailsContentMutation>(editSeriesContent);

    return <ManageVideoListContent
        listId={series.id}
        listEntries={[...series.entries]}
        getUpdatedEntries={data => [...data.updateSeriesContent.entries]}
        description={t("manage.my-series.details.edit-note")}
        {...{ commit, inFlight }}
    />;
};
