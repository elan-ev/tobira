export type PermissionLevel = "read" | "write" | "moderate" | "admin" | "unknown";
export type PermissionLevels = {
    /** Must include the below `default` and `highest` values. */
    all: Partial<Record<PermissionLevel, { actions: Set<PermissionLevel> }>>;
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

