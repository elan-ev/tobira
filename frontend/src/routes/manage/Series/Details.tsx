import i18n from "../../../i18n";
import { makeManageSeriesRoute } from "./Shared";
import { ManageSeriesRoute } from ".";
import { DirectSeriesRoute } from "../../Series";
import { UpdatedCreatedInfo, DetailsPage, DirectLink, MetadataSection } from "../Shared/Details";


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
            <MetadataSection
                key="metadata"
                title={series.title}
                description={series.syncedData?.description}
            />,
        ]}
    />,
);
