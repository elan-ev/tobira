import { ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { FiExternalLink, FiFilm, FiUpload, FiVideo } from "react-icons/fi";
import { HiOutlineFire, HiOutlineTemplate } from "react-icons/hi";
import { graphql } from "react-relay";
import { useColorScheme } from "@opencast/appkit";

import { RootLoader } from "../../layout/Root";
import { makeRoute } from "../../rauta";
import { loadQuery } from "../../relay";
import { LinkList, LinkWithIcon, linkWithIconStyle } from "../../ui";
import { NotAuthorized } from "../../ui/error";
import { isRealUser, useUser } from "../../User";
import { Breadcrumbs } from "../../ui/Breadcrumbs";
import { PageTitle } from "../../layout/header/ui";
import { ExternalLink } from "../../relay/auth";
import {
    manageDashboardQuery as ManageDashboardQuery,
} from "./__generated__/manageDashboardQuery.graphql";
import { COLORS } from "../../color";
import { useMenu } from "../../layout/MenuState";


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

    return <>
        <Breadcrumbs path={[]} tail={t("user.manage-content")} />
        <PageTitle title={t("manage.dashboard.title")} />
        <div css={{ maxWidth: "80ch", fontSize: 14, h2: { marginBottom: 8, fontSize: 18 } }}>
            <h2>{t("manage.dashboard.manage-pages-tile-title")}</h2>
            {t("manage.dashboard.manage-pages-tile-body")}
        </div>
    </>;
};


type ManageNavProps = {
    active?: "/~manage" | "/~manage/videos" | "/~manage/upload" | `/@${string}`;
};

export const ManageNav: React.FC<ManageNavProps> = ({ active }) => {
    const { t } = useTranslation();
    const user = useUser();
    const menu = useMenu();
    const isDark = useColorScheme().scheme === "dark";

    /* eslint-disable react/jsx-key */
    const entries: [NonNullable<ManageNavProps["active"]>, string, ReactElement][] = [
        ["/~manage", t("manage.nav.dashboard"), <HiOutlineTemplate />],
        ["/~manage/videos", t("manage.nav.my-videos"), <FiFilm />],
    ];
    if (isRealUser(user) && user.canCreateUserRealm) {
        entries.splice(
            1, 0, [`/@${user.username}`, t("realm.user-realm.my-page"), <HiOutlineFire />]
        );
    }
    if (isRealUser(user) && user.canUpload) {
        entries.push(["/~manage/upload", t("upload.title"), <FiUpload />]);
    }
    /* eslint-enable react/jsx-key */

    const items = entries.map(([path, label, icon]) => (
        <LinkWithIcon
            key={path}
            to={path}
            iconPos="left"
            active={path === active}
            close={() => menu.state === "burger" && menu.close()}
        >
            {icon}
            {label}
        </LinkWithIcon>
    ));

    if (isRealUser(user) && user.canUseStudio) {
        items.push(
            <ExternalLink
                service="STUDIO"
                params={{ "return.target": new URL(document.location.href) }}
                fallback="link"
                css={{
                    backgroundColor: "inherit",
                    border: "none",
                    color: COLORS.primary0,
                    cursor: "pointer",
                    width: "100%",
                    ...linkWithIconStyle(isDark, "left"),
                    ":hover, :focus-visible": { color: isDark ? COLORS.primary2 : COLORS.primary1 },
                }}
            >
                <FiVideo />
                {t("manage.dashboard.studio-tile-title")}
                <FiExternalLink size={18} css={{ marginLeft: 4 }}/>
            </ExternalLink>
        );
    }

    return <LinkList items={items} />;
};
