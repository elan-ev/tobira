
export const REALM_MODERATE_ACTION = "tobira:realm:moderate";
export const REALM_ADMIN_ACTION = "tobira:realm:admin";

export type AclActions = "read" | "write"
    | typeof REALM_MODERATE_ACTION | typeof REALM_ADMIN_ACTION | "unknown";
export type PermissionLevel = "read" | "write" | "moderate" | "admin" | "unknown";
export type PermissionLevels = {
    /** Must include the below `default` and `highest` values. */
    all: Partial<Record<PermissionLevel, { actions: Set<AclActions> }>>;
    /** Default action for new entries. */
    default: PermissionLevel;
    /** Most privileged action, usually includes every other action. */
    highest: PermissionLevel;
}

export const READ_WRITE_ACTIONS: PermissionLevels = {
    all: {
        "read": { actions: new Set(["read"]) },
        "write": { actions: new Set(["read", "write"]) },
    },
    default: "read",
    highest: "write",
};

export const MODERATE_ADMIN_ACTIONS: PermissionLevels = {
    all: {
        "moderate": { actions: new Set([REALM_MODERATE_ACTION]) },
        "admin": { actions: new Set([REALM_MODERATE_ACTION, REALM_ADMIN_ACTION]) },
    },
    default: "moderate",
    highest: "admin",
};
