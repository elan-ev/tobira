import { ReactElement, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { FiFilm, FiUpload, FiVideo } from "react-icons/fi";
import { HiOutlineTemplate } from "react-icons/hi";
import { graphql } from "react-relay";

import { RootLoader } from "../../layout/Root";
import { makeRoute } from "../../rauta";
import { loadQuery } from "../../relay";
import { Link } from "../../router";
import { LinkList, LinkWithIcon } from "../../ui";
import { NotAuthorized } from "../../ui/error";
import { useUser } from "../../User";
import CONFIG from "../../config";
import { Breadcrumbs } from "../../ui/Breadcrumbs";
import { PageTitle } from "../../layout/header/ui";
import { authenticateLink } from "../../relay/auth";
import {
    manageDashboardQuery as ManageDashboardQuery,
} from "./__generated__/manageDashboardQuery.graphql";


const PATH = "/~manage";

export const ManageRoute = makeRoute(url => {
    if (url.pathname !== PATH) {
        return null;
    }

    const queryRef = loadQuery<ManageDashboardQuery>(query, {});
    return {

        render: () => <RootLoader
            {...{ query, queryRef }}
            noindex
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
            {user.canUseStudio && <GridTile onClick={linkToStudio}>
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

const linkToStudio = async () => {
    const studioUrl = new URL(CONFIG.opencast.studioUrl);
    studioUrl.searchParams.append("return.target", document.location.href);
    const authenticatedUrl = await authenticateLink(studioUrl);
    window.open(authenticatedUrl, "_blank");
};

type GridTileProps = {
    children: ReactNode;
} & ({
    link?: string;
} | {
    onClick?: () => void;
});

const GridTile: React.FC<GridTileProps> = ({ children, ...props }) => {
    const link = "link" in props && props.link;
    const onClick = "onClick" in props && props.onClick;
    const style = {
        borderRadius: 4,
        border: "1px solid var(--grey92)",
        backgroundColor: "var(--grey97)",
        padding: "8px 16px 16px 16px",
        fontSize: 14,
        color: "black",
        "&:hover": !(link || onClick)
            ? {}
            : {
                color: "black",
                borderColor: "var(--grey80)",
                boxShadow: "1px 1px 5px var(--grey92)",
                cursor: "pointer",
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
        : onClick
            ? <button onClick={onClick} css={style}>{children}</button>
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

    const items = entries.map(([path, label, icon]) => (
        <LinkWithIcon key={path} to={path} iconPos="left" active={path === active}>
            {icon}
            {label}
        </LinkWithIcon>
    ));

    return <LinkList items={items} />;
};
