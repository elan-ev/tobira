import { useTranslation } from "react-i18next";
import { graphql, useMutation } from "react-relay";

import i18n from "../../../i18n";
import { makeManageSeriesRoute, Series } from "./Shared";
import { ManageSeriesRoute } from ".";
import { DirectSeriesRoute, SeriesRoute } from "../../Series";
import { Link } from "../../../router";
import {
    UpdatedCreatedInfo,
    DetailsPage,
    DirectLink,
    MetadataSection,
    DeleteButton,
    HostRealms,
} from "../Shared/Details";
import { SeriesDetailsDeleteMutation } from "./__generated__/SeriesDetailsDeleteMutation.graphql";
import {
    SeriesDetailsMetadataMutation,
} from "./__generated__/SeriesDetailsMetadataMutation.graphql";
import { useNotification } from "../../../ui/NotificationContext";


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

export const ManageSeriesDetailsRoute = makeManageSeriesRoute(
    "details",
    "",
    series => <DetailsPage
        kind="series"
        pageTitle="manage.my-series.details.title"
        item={series}
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
    const [commit] = useMutation<SeriesDetailsDeleteMutation>(deleteSeriesMutation);

    return <div css={{ display: "flex", gap: 12, marginBottom: 16 }}>
        <DeleteButton
            item={series}
            kind="series"
            returnPath="/~manage/series"
            commit={commit}
        >
            <br />
            <p>{t("manage.my-series.delete-note")}</p>
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
