import { ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { FiFilm } from "react-icons/fi";
import { HiTemplate } from "react-icons/hi";

import { Root } from "../../layout/Root";
import { makeRoute } from "../../rauta";
import { LinkList, LinkWithIcon } from "../../ui";


const PATH = "/~manage";

export const ManageRoute = makeRoute<void>({
    path: PATH,
    queryParams: [],
    prepare: () => {},
    render: () => <Manage />,
});

const Manage: React.FC = () => {
    const { t } = useTranslation();

    // TODO
    return (
        <Root nav={[<ManageNav key={1} active={PATH} />]}>
            <h1>{t("manage.dashboard.title")}</h1>
            <p>TODO</p>
        </Root>
    );
};

type ManageNavProps = {
    active: "/~manage" | "/~manage/videos";
};

export const ManageNav: React.FC<ManageNavProps> = ({ active }) => {
    const { t } = useTranslation();

    /* eslint-disable react/jsx-key */
    const entries: [ManageNavProps["active"], string, ReactElement][] = [
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
            css={path === active ? activeStyle : {}}
        >
            {icon}
            {label}
        </LinkWithIcon>
    ));

    return <LinkList items={items} />;
};
