import { useTranslation } from "react-i18next";
import { LuShieldCheck, LuPenLine, LuEye } from "react-icons/lu";
import { graphql } from "react-relay";

import { RootLoader } from "../../../layout/Root";
import { makeRoute, Route } from "../../../rauta";
import { loadQuery } from "../../../relay";
import { NotFound } from "../../NotFound";
import { b64regex } from "../../util";
import { seriesId, keyOfId } from "../../../util";
import CONFIG from "../../../config";
import { ManageSeriesRoute, SeriesThumbnail } from ".";
import { SharedSeriesManageQuery } from "./__generated__/SharedSeriesManageQuery.graphql";
import { DirectSeriesRoute } from "../../Series";
import { ReturnLink, ManageNav, SharedManageNavProps } from "../Shared/Nav";
import { COLORS } from "../../../color";


export const PAGE_WIDTH = 1100;

export type QueryResponse = SharedSeriesManageQuery["response"];
export type Series = NonNullable<QueryResponse["series"]>;

type ManageSeriesSubPageType = "details" | "acl";

/** Helper around `makeRoute` for manage single series subpages. */
export const makeManageSeriesRoute = (
    page: ManageSeriesSubPageType,
    path: string,
    render: (series: Series, data: QueryResponse) => JSX.Element,
): Route & { url: (args: { seriesId: string }) => string } => (
    makeRoute({
        url: ({ seriesId }: { seriesId: string }) => `/~manage/series/${keyOfId(seriesId)}/${path}`,
        match: url => {
            const regex = new RegExp(`^/~manage/series/(${b64regex}+)${path}/?$`, "u");
            const params = regex.exec(url.pathname);
            if (params === null) {
                return null;
            }

            const id = decodeURIComponent(params[1]);
            const queryRef = loadQuery<SharedSeriesManageQuery>(query, {
                id: seriesId(id),
            });

            return {
                render: () => <RootLoader
                    {...{ query, queryRef }}
                    noindex
                    nav={data => data.series ? [
                        <ReturnLink
                            key={1}
                            url={ManageSeriesRoute.url}
                            title="manage.my-series.title"
                        />,
                        <ManageSeriesNav key={2} series={data.series} active={page} />,
                    ] : []}
                    render={data => {
                        if (data.series == null) {
                            return <NotFound kind="series" />;
                        }
                        return render(data.series, data);
                    }}
                />,
                dispose: () => queryRef.dispose(),
            };
        },
    })
);


const query = graphql`
    query SharedSeriesManageQuery($id: ID!) {
        ...UserData
        ...AccessKnownRolesData
        series: seriesById(id: $id) {
            id
            title
            created
            updated
            syncedData { description }
            numVideos
            thumbnailStack { thumbnails { url live audioOnly }}
        }
    }
`;


type ManageSeriesNavProps = SharedManageNavProps & {
    series: Series;
};

const ManageSeriesNav: React.FC<ManageSeriesNavProps> = ({ series, active }) => {
    const { t } = useTranslation();

    if (series == null) {
        return null;
    }

    const id = keyOfId(series.id);

    const navEntries = [
        {
            url: `/~manage/series/${id}`,
            page: "details",
            body: <><LuPenLine />{t("manage.my-series.details.title")}</>,
        },
    ];

    if (CONFIG.allowAclEdit) {
        navEntries.splice(1, 0, {
            url: `/~manage/series/${id}/access`,
            page: "acl",
            body: <><LuShieldCheck />{t("manage.shared.acl.title")}</>,
        });
    }

    const link = DirectSeriesRoute.url({ seriesId: id });
    const title = series.title;
    const ariaLabel = t("series.series-page", { series: series.title });

    const additionalStyles = {
        padding: 8,
        borderBottom: `2px solid ${COLORS.neutral05}`,
    };

    const thumbnail = <>
        <LuEye />
        <SeriesThumbnail {...{ series }} />
    </>;

    return <ManageNav {...{
        active,
        link,
        ariaLabel,
        title,
        thumbnail,
        navEntries,
        additionalStyles,
    }} />;
};
