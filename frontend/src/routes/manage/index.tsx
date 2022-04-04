import { ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { FiFilm, FiUpload, FiVideo } from "react-icons/fi";
import { HiOutlineTemplate } from "react-icons/hi";
import { graphql } from "react-relay";

import { RootLoader } from "../../layout/Root";
import {
    manageDashboardQuery as ManageDashboardQuery,
} from "./__generated__/manageDashboardQuery.graphql";
import { makeRoute } from "../../rauta";
import { loadQuery } from "../../relay";
import { Link } from "../../router";
import { LinkList, LinkWithIcon } from "../../ui";
import { NotAuthorized } from "../../ui/error";
import { useUser } from "../../User";
import CONFIG from "../../config";
import { Breadcrumbs } from "../../ui/Breadcrumbs";
import { PageTitle } from "../../layout/header/ui";


const PATH = "/~manage";

export const ManageRoute = makeRoute(url => {
    if (url.pathname !== PATH) {
        return null;
    }

    const queryRef = loadQuery<ManageDashboardQuery>(query, {});
    return {

        render: () => <RootLoader
            {...{ query, queryRef }}
            nav={() => <ManageNav key={1} active={PATH} />}
            render={() => <Manage />}
        />,
        dispose: () => queryRef.dispose(),
    };
});


const query = graphql`
    query manageDashboardQuery { ...UserData }
`;

const Manage: React.FC = () => {
    const { t } = useTranslation();
    const user = useUser();
    if (user === "none" || user === "unknown") {
        return <NotAuthorized />;
    }
    const returnTarget = encodeURIComponent(document.location.href);
    const studioUrl = `${CONFIG.opencast.studioUrl}?return.target=${returnTarget}`;

    return <>
        <Breadcrumbs path={[]} tail={t("manage.management")} />
        <PageTitle title={t("manage.dashboard.title")} />
        <div css={{
            display: "grid",
            width: 950,
            maxWidth: "100%",
            margin: "32px 0",
            gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))",
            gap: 24,
        }}>
            {user.canUpload && <GridTile link="/~upload">
                <FiUpload />
                <h2>{t("upload.title")}</h2>
                {t("manage.dashboard.upload-tile")}
            </GridTile>}
            {user.canUseStudio && <GridTile link={studioUrl}>
                <FiVideo />
                <h2>{t("manage.dashboard.studio-tile-title")}</h2>
                {t("manage.dashboard.studio-tile-body")}
            </GridTile>}
            <GridTile link="/~manage/videos">
                <FiFilm />
                <h2>{t("manage.my-videos.title")}</h2>
                {t("manage.dashboard.my-videos-tile")}
            </GridTile>
            <GridTile>
                <h2>{t("manage.dashboard.manage-pages-tile-title")}</h2>
                {t("manage.dashboard.manage-pages-tile-body")}
            </GridTile>
        </div>
    </>;
};

type GridTileProps = {
    link?: string;
};

const GridTile: React.FC<GridTileProps> = ({ link, children }) => {
    const style = {
        borderRadius: 4,
        border: "1px solid var(--grey92)",
        backgroundColor: "var(--grey97)",
        padding: "8px 16px 16px 16px",
        fontSize: 14,
        color: "black",
        "&:hover": !link
            ? {}
            : {
                color: "black",
                borderColor: "var(--grey80)",
                boxShadow: "1px 1px 5px var(--grey92)",
            },
        position: "relative",
        "& > svg:first-of-type": {
            position: "absolute",
            top: 8,
            right: 8,
            color: "var(--accent-color)",
            fontSize: 22,
        },
        "& > h2": {
            fontSize: 18,
            marginBottom: 16,
        },
    } as const;

    return link
        ? <Link to={link} css={style}>{children}</Link>
        : <div css={style}>{children}</div>;
};

type ManageNavProps = {
    active?: "/~manage" | "/~manage/videos";
};

export const ManageNav: React.FC<ManageNavProps> = ({ active }) => {
    const { t } = useTranslation();

    /* eslint-disable react/jsx-key */
    const entries: [NonNullable<ManageNavProps["active"]>, string, ReactElement][] = [
        ["/~manage", t("manage.nav.dashboard"), <HiOutlineTemplate />],
        ["/~manage/videos", t("manage.nav.my-videos"), <FiFilm />],
    ];
    /* eslint-enable react/jsx-key */

    // TODO: we probably want a better style for active items
    const activeStyle = {
        fontWeight: "bold" as const,
    };
    const items = entries.map(([path, label, icon]) => (
        <LinkWithIcon
            key={path}
            to={path}
            iconPos="left"
            active={path === active}
            css={path === active ? activeStyle : {}}
        >
            {icon}
            {label}
        </LinkWithIcon>
    ));

    return <LinkList items={items} />;
};
