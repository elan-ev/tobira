import CONFIG from "../config";

export const COMMON_ROLES = {
    ANONYMOUS: "ROLE_ANONYMOUS",
    ADMIN: "ROLE_ADMIN",
    USER_ADMIN: "ROLE_USER_ADMIN",
    USER: "ROLE_USER",
    TOBIRA_GLOBAL_PAGE_ADMIN: CONFIG.auth.globalPageAdminRole,
    TOBIRA_GLOBAL_PAGE_MODERATOR: CONFIG.auth.globalPageModeratorRole,
};

