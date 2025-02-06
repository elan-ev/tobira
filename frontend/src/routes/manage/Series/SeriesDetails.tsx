import { useTranslation } from "react-i18next";
import { graphql, useMutation } from "react-relay";

import i18n from "../../../i18n";
import { makeManageSeriesRoute, Series } from "./Shared";
import { ManageSeriesRoute } from ".";
import { DirectSeriesRoute } from "../../Series";
import {
    UpdatedCreatedInfo,
    DetailsPage,
    DirectLink,
    MetadataSection,
    DeleteButton,
} from "../Shared/Details";
import {
    SeriesDetailsMetadataMutation,
} from "./__generated__/SeriesDetailsMetadataMutation.graphql";
import { SeriesDetailsDeleteMutation } from "./__generated__/SeriesDetailsDeleteMutation.graphql";


const updateSeriesMetadata = graphql`
    mutation SeriesDetailsMetadataMutation($id: ID!, $metadata: SeriesMetadata!) {
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
        pageTitle="manage.my-series.details.title"
        item={{ ...series, description: series.syncedData?.description }}
        breadcrumb={{
            label: i18n.t("manage.my-series.title"),
            link: ManageSeriesRoute.url,
        }}
        sections={series => [
            <UpdatedCreatedInfo key="date-info" item={series} />,
            <SeriesButtonSection key="button-section" seriesId={series.id} />,
            <DirectLink key="direct-link" url={
                new URL(DirectSeriesRoute.url({ seriesId: series.id }), document.baseURI)
            } />,
            <SeriesMetadataSection key="metadata" series={series} />,
        ]}
    />,
);

const SeriesButtonSection: React.FC<{ seriesId: string }> = ({ seriesId }) => {
    const { t } = useTranslation();
    const [commit] = useMutation<SeriesDetailsDeleteMutation>(deleteSeriesMutation);

    return <div css={{ display: "flex", gap: 12, marginBottom: 16 }}>
        <DeleteButton
            itemId={seriesId}
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
    const [commit, inFlight] = useMutation<SeriesDetailsMetadataMutation>(updateSeriesMetadata);

    return <MetadataSection
        item={{ ...series, description: series.syncedData?.description }}
        {...{ commit, inFlight }}
    />;
};
