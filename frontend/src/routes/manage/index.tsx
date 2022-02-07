import { ReactElement } from "react";
import { Trans, useTranslation } from "react-i18next";
import { FiFilm, FiUpload, FiVideo } from "react-icons/fi";
import { HiTemplate } from "react-icons/hi";
import { graphql } from "react-relay";

import { Root } from "../../layout/Root";
import {
    manageDashboardQuery as ManageDashboardQuery,
} from "./__generated__/manageDashboardQuery.graphql";
import { makeRoute } from "../../rauta";
import { loadQuery } from "../../relay";
import { Link } from "../../router";
import { LinkList, LinkWithIcon } from "../../ui";
import { NotAuthorized } from "../../ui/error";
import { useUser } from "../../User";
import { QueryLoader } from "../../util/QueryLoader";


const PATH = "/~manage";

export const ManageRoute = makeRoute(url => {
    if (url.pathname !== PATH) {
        return null;
    }

    const queryRef = loadQuery<ManageDashboardQuery>(query, {});
    return {
        render: () => (
            <QueryLoader {...{ query, queryRef }} render={result => (
                <Root nav={<ManageNav key={1} active={PATH} />} userQuery={result}>
                    <Manage />
                </Root>
            )} />
        ),
        dispose: () => queryRef.dispose(),
    };
});


const query = graphql`
    query manageDashboardQuery {
        ...UserData
        currentUser { canUpload }
    }
`;

const Manage: React.FC = () => {
    const { t } = useTranslation();
    const user = useUser();
    if (user === "none" || user === "unknown") {
        return <NotAuthorized />;
    }

    return <>
        <h1>{t("manage.dashboard.title")}</h1>
        <div css={{
            display: "grid",
            width: 950,
            maxWidth: "100%",
            margin: "32px 0",
            gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
            gap: 24,
            "& > div": {
                borderRadius: 4,
                border: "1px solid var(--grey92)",
                backgroundColor: "var(--grey97)",
                padding: "8px 16px 16px 16px",
                fontSize: 14,
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
            },
        }}>
            {user.canUpload && <div>
                <FiUpload />
                <h2>{t("upload.title")}</h2>
                <Trans i18nKey="manage.dashboard.upload-tile">
                    Foo <Link to="/~upload">the uploader</Link>
                </Trans>
            </div>}
            {/* TODO: Studio integration */}
            <div>
                <FiVideo />
                <h2>{t("manage.dashboard.studio-tile-title")}</h2>
                <Trans i18nKey="manage.dashboard.studio-tile-body">
                    Foo <Link to="/~studio">OC Studio</Link>
                </Trans>
            </div>
            <div>
                <FiFilm />
                <h2>{t("manage.my-videos.title")}</h2>
                <Trans i18nKey="manage.dashboard.my-videos-tile">
                    Foo <Link to="/~manage/videos">my videos</Link>
                </Trans>
            </div>
            <div>
                <h2>{t("manage.dashboard.manage-pages-tile-title")}</h2>
                {t("manage.dashboard.manage-pages-tile-body")}
            </div>
        </div>
    </>;
};

type ManageNavProps = {
    active?: "/~manage" | "/~manage/videos";
};

export const ManageNav: React.FC<ManageNavProps> = ({ active }) => {
    const { t } = useTranslation();

    /* eslint-disable react/jsx-key */
    const entries: [NonNullable<ManageNavProps["active"]>, string, ReactElement][] = [
        ["/~manage", t("manage.nav.dashboard"), <HiTemplate />],
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
