import { useTranslation } from "react-i18next";
import { graphql } from "react-relay";

import { RootLoader } from "../../../layout/Root";
import { makeRoute } from "../../../rauta";
import { loadQuery } from "../../../relay";
import { NotAuthorized } from "../../../ui/error";
import { PageTitle } from "../../../layout/header/ui";
import {
    UserRealmAdminDashboardQuery, UserRealmAdminDashboardQuery$data,
} from "./__generated__/UserRealmAdminDashboardQuery.graphql";
import { Link } from "../../../router";
import { AdminDashboardContainer, SimpleTable, t } from ".";



export const PATH = "/~manage/admin/user-realms" as const;

export const AdminDashboardUserRealmsRoute = makeRoute({
    url: PATH,
    match: url => {
        if (url.pathname !== PATH) {
            return null;
        }

        const queryRef = loadQuery<UserRealmAdminDashboardQuery>(query, {});
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
    query UserRealmAdminDashboardQuery {
        ...UserData
        adminDashboardInfo {
            userRealms {
                path numSubpages ownerDisplayName
            }
        }
    }
`;

type Props = {
    info: NonNullable<UserRealmAdminDashboardQuery$data["adminDashboardInfo"]>;
};

const Page: React.FC<Props> = ({ info }) => {
    const { i18n } = useTranslation();

    return <AdminDashboardContainer>
        <PageTitle title={i18n.t("manage.admin-dashboard")} />
        <h2>{t("User Realms")}</h2>
        {info.userRealms.length === 0
            ? t("None")
            : <SimpleTable>
                <thead>
                    <tr>
                        <th>{t("Path")}</th>
                        <th>{t("Owner")}</th>
                        <th>{t("Num subpages")}</th>
                    </tr>
                </thead>
                <tbody>
                    {info.userRealms.map((realm, i) => <tr key={i}>
                        <td><Link to={realm.path}><code>{realm.path}</code></Link></td>
                        <td>{realm.ownerDisplayName}</td>
                        <td>{realm.numSubpages}</td>
                    </tr>)}
                </tbody>
            </SimpleTable>
        }
    </AdminDashboardContainer>;
};
