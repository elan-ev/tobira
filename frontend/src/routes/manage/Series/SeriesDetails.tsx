import { graphql, useMutation } from "react-relay";

import i18n from "../../../i18n";
import { makeManageSeriesRoute } from "./Shared";
import { ManageSeriesRoute, SingleSeries } from ".";
import { DirectSeriesRoute } from "../../Series";
import {
    UpdatedCreatedInfo,
    DetailsPage,
    DirectLink,
    MetadataSection,
} from "../Shared/Details";
import {
    SeriesDetailsMetadataMutation,
} from "./__generated__/SeriesDetailsMetadataMutation.graphql";


const updateSeriesMetadata = graphql`
    mutation SeriesDetailsMetadataMutation($id: ID!, $metadata: SeriesMetadata!) {
        updateSeriesMetadata(id: $id, metadata: $metadata) { id }
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
            <UpdatedCreatedInfo key="created-info" item={series} />,
            <DirectLink key="direct-link" url={
                new URL(DirectSeriesRoute.url({ seriesId: series.id }), document.baseURI)
            } />,
            <SeriesMetadataSection
                key="metadata"
                series={series}
            />,
        ]}
    />,
);

const SeriesMetadataSection: React.FC<{ series: SingleSeries }> = ({ series }) => {
    const [commit, inFlight] = useMutation<SeriesDetailsMetadataMutation>(updateSeriesMetadata);

    return <MetadataSection
        item={{ ...series, description: series.syncedData?.description }}
        {...{ commit, inFlight }}
    />;
};
