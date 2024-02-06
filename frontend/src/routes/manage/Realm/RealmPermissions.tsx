import { useState } from "react";
import { graphql, useFragment, useMutation } from "react-relay";

import { RealmPermissionsData$key } from "./__generated__/RealmPermissionsData.graphql";
import { Acl, AclSelector, AclEditButtons, knownRolesFragment } from "../../../ui/Access";
import { AccessKnownRolesData$key } from "../../../ui/__generated__/AccessKnownRolesData.graphql";
import { RealmPermissionsMutation } from "./__generated__/RealmPermissionsMutation.graphql";
import { displayCommitError } from "./util";
import { boxError } from "../../../ui/error";
import { useTranslation } from "react-i18next";
import { MODERATE_ADMIN_ACTIONS } from "../../../util/permissionLevels";


const fragment = graphql`
    fragment RealmPermissionsData on Realm {
        id
        ownAcl { role actions info { label implies large } }
        inheritedAcl { role actions info { label implies large } }
        ownerDisplayName
        ancestors { ownerDisplayName }
    }
`;


type Props = {
    fragRef: RealmPermissionsData$key;
    data: AccessKnownRolesData$key;
};

export const RealmPermissions: React.FC<Props> = ({ fragRef, data }) => {
    const { t } = useTranslation();
    const realm = useFragment(fragment, fragRef);
    const knownRoles = useFragment(knownRolesFragment, data);
    const ownerDisplayName = (realm.ancestors[0] ?? realm).ownerDisplayName;

    const [initialAcl, inheritedAcl]: Acl[] = [realm.ownAcl, realm.inheritedAcl].map(acl => new Map(
        acl.map(item => [item.role, {
            actions: new Set(item.actions),
            info: item.info,
        }])
    ));

    const [selections, setSelections] = useState<Acl>(initialAcl);

    const [commitError, setCommitError] = useState<JSX.Element | null>(null);
    const [commit, inFlight] = useMutation<RealmPermissionsMutation>(graphql`
        mutation RealmPermissionsMutation($id: ID!, $permissions: UpdatedPermissions!) {
            updatePermissions(id: $id, permissions: $permissions) {
                ownAcl { role actions info { label implies large } }
                ... GeneralRealmData
            }
        }
    `);

    const mapSelections = (selections: Acl) => {
        const [moderatorRoles, adminRoles]: string[][] = [[], []];

        for (const [role, { actions }] of selections) {
            if (actions.has("moderate")) {
                moderatorRoles.push(role);
            }

            if (actions.has("admin")) {
                adminRoles.push(role);
            }
        }

        return { moderatorRoles, adminRoles };
    };

    const onSubmit = async () => {
        commit({
            variables: {
                id: realm.id,
                permissions: mapSelections(selections),
            },
            onError: e => setCommitError(displayCommitError(e)),
            updater: store => store.invalidateStore(),
        });
    };

    return <>
        <h2>{t("manage.realm.permissions.heading")}</h2>
        <AclSelector
            acl={selections}
            onChange={setSelections}
            {...{ knownRoles, inheritedAcl, ownerDisplayName }}
            permissionLevels={MODERATE_ADMIN_ACTIONS}
        />
        <AclEditButtons
            {...{ selections, setSelections, initialAcl, onSubmit, inFlight, inheritedAcl }}
            kind="admin"
            userIsOwner={!!ownerDisplayName}
            css={{ marginTop: 16 }}
        />
        {boxError(commitError)}
    </>;
};

