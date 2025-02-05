import i18n from "../../../i18n";
import { makeManageSeriesRoute } from "./Shared";
import { ManageSeriesRoute } from ".";
import { DirectSeriesRoute } from "../../Series";
import { DetailsPage, UpdatedCreatedInfo, DirectLink, MetadataSection } from "../Shared/Details";


export const ManageSeriesDetailsRoute = makeManageSeriesRoute(
    "details",
    "",
    series => <DetailsPage
        pageTitle="manage.my-series.details.title"
        asset={{
            ...series,
            description: series.syncedData?.description,
            urlProps: {
                url: new URL(DirectSeriesRoute.url({ seriesId: series.id }), document.baseURI),
            },
        }}
        breadcrumb={{
            label: i18n.t("manage.my-series.title"),
            link: ManageSeriesRoute.url,
        }}
        sections={series => [
            <UpdatedCreatedInfo key="created-info" asset={series} />,
            <DirectLink key="direct-link" asset={series} />,
            <div key="metadata" css={{ marginBottom: 32 }}>
                <MetadataSection asset={series} />
            </div>,
        ]}
    />,
);
