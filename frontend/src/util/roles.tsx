import CONFIG from "../config";
import { Acl } from "../ui/Access";
import { User } from "../User";
import { AccessKnownRolesData$data } from "../ui/__generated__/AccessKnownRolesData.graphql";

export const COMMON_ROLES = {
    ANONYMOUS: "ROLE_ANONYMOUS",
    ADMIN: "ROLE_ADMIN",
    USER_ADMIN: "ROLE_USER_ADMIN",
    USER: "ROLE_USER",
    TOBIRA_GLOBAL_PAGE_ADMIN: CONFIG.auth.globalPageAdminRole,
    TOBIRA_GLOBAL_PAGE_MODERATOR: CONFIG.auth.globalPageModeratorRole,
};

export const defaultAclMap = (user: User, knownRoles: AccessKnownRolesData$data): Acl => {
    const acl: Acl = new Map([
        [user.userRole, {
            actions: new Set(["read", "write"]),
            info: {
                label: { "default": user.displayName },
                implies: null,
                warnForAction: [],
            },
        }],
    ]);

    // Only default to public read access if the user is actually allowed to grant it.
    const anonymousGroup = knownRoles.knownGroups.find(g => g.role === COMMON_ROLES.ANONYMOUS);
    if (!anonymousGroup || anonymousGroup.assignableActions.includes("read")) {
        acl.set(COMMON_ROLES.ANONYMOUS, {
            actions: new Set(["read"]),
            info: null,
        });
    }

    return acl;
};

