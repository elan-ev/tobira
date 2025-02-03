import CONFIG from "../config";
import { Acl } from "../ui/Access";
import { User } from "../User";

export const COMMON_ROLES = {
    ANONYMOUS: "ROLE_ANONYMOUS",
    ADMIN: "ROLE_ADMIN",
    USER_ADMIN: "ROLE_USER_ADMIN",
    USER: "ROLE_USER",
    TOBIRA_GLOBAL_PAGE_ADMIN: CONFIG.auth.globalPageAdminRole,
    TOBIRA_GLOBAL_PAGE_MODERATOR: CONFIG.auth.globalPageModeratorRole,
};

export const defaultAclMap = (user: User): Acl => new Map([
    [user.userRole, {
        actions: new Set(["read", "write"]),
        info: {
            label: { "default": user.displayName },
            implies: null,
            large: false,
        },
    }],
    [COMMON_ROLES.ANONYMOUS, {
        actions: new Set(["read"]),
        info: null,
    }],
]);

