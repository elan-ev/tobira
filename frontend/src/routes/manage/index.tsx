import { ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { FiFilm, FiUpload, FiVideo } from "react-icons/fi";
import { HiOutlineFire, HiOutlineTemplate } from "react-icons/hi";
import { graphql } from "react-relay";

import { RootLoader } from "../../layout/Root";
import { makeRoute } from "../../rauta";
import { loadQuery } from "../../relay";
import { Link } from "../../router";
import { LinkList, LinkWithIcon } from "../../ui";
import { NotAuthorized } from "../../ui/error";
import { isRealUser, useUser } from "../../User";
import { Breadcrumbs } from "../../ui/Breadcrumbs";
import { PageTitle } from "../../layout/header/ui";
import { ExternalLink } from "../../relay/auth";
import {
    manageDashboardQuery as ManageDashboardQuery,
} from "./__generated__/manageDashboardQuery.graphql";
import { css } from "@emotion/react";


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
            nav={() => <ManageNav active={PATH} />}
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
    if (!isRealUser(user)) {
        return <NotAuthorized />;
    }

    const studioReturnUrl = new URL(document.location.href);
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
            {user.canUpload && <Link to="/~manage/upload" css={gridTile}>
                <FiUpload />
                <h2>{t("upload.title")}</h2>
                {t("manage.dashboard.upload-tile")}
            </Link>}
            {user.canUseStudio && <ExternalLink
                service={"STUDIO"}
                params={{ "return.target": studioReturnUrl }}
                fallback="link"
                css={gridTile}
            >
                <FiVideo />
                <h2>{t("manage.dashboard.studio-tile-title")}</h2>
                {t("manage.dashboard.studio-tile-body")}
            </ExternalLink>}
            <Link to="/~manage/videos" css={gridTile}>
                <FiFilm />
                <h2>{t("manage.my-videos.title")}</h2>
                {t("manage.dashboard.my-videos-tile")}
            </Link>
            {user.canCreateUserRealm && <Link to={`/@${user.username}`} css={gridTile}>
                <HiOutlineFire />
                <h2>{t("realm.user-realm.your-page")}</h2>
                {t("manage.dashboard.user-realm-tile")}
            </Link>}
            <div css={gridTile}>
                <h2>{t("manage.dashboard.manage-pages-tile-title")}</h2>
                {t("manage.dashboard.manage-pages-tile-body")}
            </div>
        </div>
    </>;
};

const gridTile = css({
    borderRadius: 4,
    border: "1px solid var(--grey92)",
    backgroundColor: "var(--grey97)",
    padding: "8px 16px 16px 16px",
    fontSize: 14,
    color: "black",
    textAlign: "left",
    "&:is(button, a)": {
        "&:hover, &:focus": {
            color: "black",
            borderColor: "var(--grey80)",
            boxShadow: "1px 1px 5px var(--grey92)",
            cursor: "pointer",
        },
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
});

type ManageNavProps = {
    active?: "/~manage" | "/~manage/videos" | "/~manage/upload";
};

export const ManageNav: React.FC<ManageNavProps> = ({ active }) => {
    const { t } = useTranslation();

    /* eslint-disable react/jsx-key */
    const entries: [NonNullable<ManageNavProps["active"]>, string, ReactElement][] = [
        ["/~manage", t("manage.nav.dashboard"), <HiOutlineTemplate />],
        ["/~manage/videos", t("manage.nav.my-videos"), <FiFilm />],
        ["/~manage/upload", t("upload.title"), <FiUpload />],
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
