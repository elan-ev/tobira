import { useTranslation } from "react-i18next";
import { graphql } from "react-relay";

import { RootLoader } from "../../../layout/Root";
import { makeRoute } from "../../../rauta";
import { loadQuery } from "../../../relay";
import { NotAuthorized } from "../../../ui/error";
import { PageTitle } from "../../../layout/header/ui";
import {
    UserSessionsAdminDashboardQuery, UserSessionsAdminDashboardQuery$data,
} from "./__generated__/UserSessionsAdminDashboardQuery.graphql";
import { AdminDashboardContainer, SimpleTable, t } from ".";
import { COLORS } from "../../../color";
import React from "react";



export const PATH = "/~manage/admin/user-sessions" as const;

export const AdminDashboardUserSessionsRoute = makeRoute({
    url: PATH,
    match: url => {
        if (url.pathname !== PATH) {
            return null;
        }

        const queryRef = loadQuery<UserSessionsAdminDashboardQuery>(query, {});
        return {
            render: () => <RootLoader
                {...{ query, queryRef }}
                noindex
                nav={() => []}
                render={data => data.adminDashboardInfo
                    ? <Page info={data.adminDashboardInfo} />
                    : <NotAuthorized />}
            />,
            dispose: () => queryRef.dispose(),
        };
    },
});


const query = graphql`
    query UserSessionsAdminDashboardQuery {
        ...UserData
        adminDashboardInfo {
            userSessions {
                username
                sessions { displayName roles created email userRole userRealmHandle }
            }
        }
    }
`;

type Props = {
    info: NonNullable<UserSessionsAdminDashboardQuery$data["adminDashboardInfo"]>;
};

type SingleSessionInfo = Props["info"]["userSessions"][number]["sessions"][number];

const roleStyle = {
    backgroundColor: COLORS.neutral15,
    borderRadius: 4,
    fontSize: 12,
    padding: "0 4px",
    border: `1px solid ${COLORS.neutral25}`,
};

const Page: React.FC<Props> = ({ info }) => {
    const { i18n } = useTranslation();

    return <AdminDashboardContainer css={{ maxWidth: 1800 }}>
        <PageTitle title={i18n.t("manage.admin-dashboard")} />
        <h2>{t("User Sessions")}</h2>
        <p css={{ maxWidth: 670, fontSize: 14 }}>
            {t("The sessions are grouped by username. "
                + "Each row beginning with a date+time represents an actual session "
                + "(with its creation timestamp). "
                + "If a value is the same across all sessions of a user, it is shown "
                + "with normal background, once for the user. "
                + "Otherwise each sessions shows its value per session row.")}
        </p>
        <SimpleTable>
            <colgroup>
                <col css={{ width: 120 }} />
                <col css={{ }} />
                <col css={{ }} />
            </colgroup>
            <thead>
                <tr>
                    <th>{t("Username/created")}</th>
                    <th>{t("Name")}</th>
                    <th>{t("E-Mail")}</th>
                    <th>{t("Realm handle")}</th>
                    <th>{t("User role")}</th>
                    <th>{t("Roles")}</th>
                </tr>
            </thead>
            <tbody>
                {info.userSessions.flatMap((user, i) => {
                    const makeField = <F extends keyof SingleSessionInfo>(
                        field: F,
                        render: (val: SingleSessionInfo[F]) => JSX.Element,
                    ) => {
                        const first = user.sessions[0][field];
                        // JSON stringify works for our types
                        const allSame = user.sessions.slice(1)
                            .every(s => JSON.stringify(s[field]) === JSON.stringify(first));

                        return {
                            allSame,
                            mainRow: <td
                                rowSpan={allSame ? user.sessions.length + 1 : undefined}
                                css={{ verticalAlign: "top" }}
                            >
                                {allSame ? render(first) : null}
                            </td>,
                            subRow: (val: SingleSessionInfo[F]) => allSame
                                ? null
                                : <td>{render(val)}</td>,
                        };
                    };

                    const displayName = makeField("displayName", v => <>{v}</>);
                    const email = makeField("email", v => <code css={{ fontSize: 13 }}>{v}</code>);
                    const userRealmHandle = makeField("userRealmHandle",
                        v => <code css={{ fontSize: 13 }}>{v}</code>);
                    const userRole = makeField("userRole", v => <code css={roleStyle}>{v}</code>);
                    const roles = makeField("roles", v => <div css={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 4,
                        code: roleStyle,
                    }}>
                        {v.map((r, i) => <code key={i}>{r}</code>)}
                    </div>);

                    return <React.Fragment key={i}>
                        <tr>
                            <td><b><code>{user.username}</code></b></td>
                            {displayName.mainRow}
                            {email.mainRow}
                            {userRealmHandle.mainRow}
                            {userRole.mainRow}
                            {roles.mainRow}
                        </tr>
                        {user.sessions.map((session, i) => <tr
                            key={`${user.username}-${i}`}
                            css={{ backgroundColor: COLORS.neutral00 }}
                        >
                            <td css={{
                                paddingLeft: "32px !important",
                                fontSize: 14,
                                whiteSpace: "nowrap",
                            }}>
                                {new Date(session.created).toLocaleString("sv-SE")}
                            </td>
                            {displayName.subRow(session.displayName)}
                            {email.subRow(session.email)}
                            {userRealmHandle.subRow(session.userRealmHandle)}
                            {userRole.subRow(session.userRole)}
                            {roles.subRow(session.roles)}
                        </tr>)}
                    </React.Fragment>;
                })}
            </tbody>
        </SimpleTable>
    </AdminDashboardContainer>;
};
