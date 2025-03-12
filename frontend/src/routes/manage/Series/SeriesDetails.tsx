import { useTranslation } from "react-i18next";
import { graphql, useMutation } from "react-relay";

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

const SeriesButtonSection: React.FC<{ series: Series }> = ({ series }) => {
    const { t } = useTranslation();
    const [commit] = useMutation(deleteSeriesMutation);

    return <div css={{ display: "flex", gap: 12, marginBottom: 16 }}>
        <DeleteButton
            itemId={series.id}
            itemTitle={series.title}
            itemType="series"
            returnPath="/~manage/series"
            commit={config => {
                const disposable = commit(config);
                return { [Symbol.dispose]: () => disposable.dispose() };
            }}
        >
            <br />
            <p>{t("manage.my-series.delete-note")}</p>
        </DeleteButton>
    </div>;
};

const SeriesMetadataSection: React.FC<{ series: Series }> = ({ series }) => {
    const [commit, inFlight] = useMutation(updateSeriesMetadata);

    return <MetadataSection
        item={{ ...series, description: series.syncedData?.description }}
        inFlight={inFlight}
        commit={config => {
            const disposable = commit(config);
            return { [Symbol.dispose]: () => disposable.dispose() };
        }}
    />;
};
