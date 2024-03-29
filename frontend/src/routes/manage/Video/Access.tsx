import { useTranslation } from "react-i18next";
import { WithTooltip } from "@opencast/appkit";
import { useRef, useState } from "react";
import { LuInfo } from "react-icons/lu";
import { useFragment } from "react-relay";

import { Breadcrumbs } from "../../../ui/Breadcrumbs";
import { AuthorizedEvent, makeManageVideoRoute } from "./Shared";
import { PageTitle } from "../../../layout/header/ui";
import { COLORS } from "../../../color";
import { isRealUser, useUser } from "../../../User";
import { NotAuthorized } from "../../../ui/error";
import { Acl, AclSelector, AclEditButtons, knownRolesFragment } from "../../../ui/Access";
import {
    AccessKnownRolesData$data,
    AccessKnownRolesData$key,
} from "../../../ui/__generated__/AccessKnownRolesData.graphql";
import { ManageRoute } from "..";
import { ManageVideosRoute } from ".";
import { ManageVideoDetailsRoute } from "./Details";
import { READ_WRITE_ACTIONS } from "../../../util/permissionLevels";
import { ConfirmationModalHandle } from "../../../ui/Modal";


export const ManageVideoAccessRoute = makeManageVideoRoute(
    "acl",
    "/access",
    (event, data) => <AclPage event={event} data={data} />,
);

type AclPageProps = {
    event: AuthorizedEvent;
    data: AccessKnownRolesData$key;
};

const AclPage: React.FC<AclPageProps> = ({ event, data }) => {
    const { t } = useTranslation();
    const user = useUser();

    if (!isRealUser(user)) {
        return <NotAuthorized />;
    }

    const knownRoles = useFragment(knownRolesFragment, data);

    const breadcrumbs = [
        { label: t("user.manage-content"), link: ManageRoute.url },
        { label: t("manage.my-videos.title"), link: ManageVideosRoute.url },
        { label: event.title, link: ManageVideoDetailsRoute.url({ videoId: event.id }) },
    ];

    return <>
        <Breadcrumbs path={breadcrumbs} tail={t("manage.my-videos.acl.title")} />
        <PageTitle title={t("manage.my-videos.acl.title")} />
        {event.hostRealms.length < 1 && <UnlistedNote />}
        <AccessUI {...{ event, knownRoles }} />
    </>;
};


const UnlistedNote: React.FC = () => {
    const { t } = useTranslation();

    return (
        <WithTooltip
            tooltip={t("manage.access.unlisted.explanation")}
            placement="bottom"
            tooltipCss={{ width: 400 }}
            css={{ display: "inline-block" }}
        >
            <div css={{
                fontSize: 14,
                lineHeight: 1,
                color: COLORS.neutral60,
                display: "flex",
                gap: 4,
                marginBottom: 16,
            }}>
                <LuInfo />
                {t("manage.access.unlisted.note")}
            </div>
        </WithTooltip>
    );
};

type AccessUIProps = {
    event: AuthorizedEvent;
    knownRoles: AccessKnownRolesData$data;
}

const AccessUI: React.FC<AccessUIProps> = ({ event, knownRoles }) => {
    const saveModalRef = useRef<ConfirmationModalHandle>(null);

    const initialAcl: Acl = new Map(
        event.acl.map(item => [item.role, {
            actions: new Set(item.actions),
            info: item.info,
        }])
    );

    const [selections, setSelections] = useState<Acl>(initialAcl);

    return (
        <div css={{ maxWidth: 1040 }}>
            <div css={{
                display: "flex",
                flexDirection: "column",
                width: "100%",
            }}>
                <AclSelector
                    acl={selections}
                    onChange={setSelections}
                    knownRoles={knownRoles}
                    permissionLevels={READ_WRITE_ACTIONS}
                />
                <AclEditButtons
                    {...{ selections, setSelections, initialAcl, saveModalRef }}
                    kind="write"
                    onSubmit={async (acl: Acl) => {
                        // TODO: Actually save new ACL.
                        // eslint-disable-next-line no-console
                        console.log(acl);
                    }}
                />
            </div>
        </div>
    );
};

