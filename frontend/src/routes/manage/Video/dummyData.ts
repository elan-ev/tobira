
type SubsetList = {
    superset: string;
    subsets: string[];
}

export const SUBSET_RELATIONS: SubsetList[] = [
    {
        superset: "ROLE_ANONYMOUS",
        subsets: [
            "ROLE_TOBIRA_MODERATOR",
            "ROLE_INSTRUCTOR",
            "ROLE_USER",
            "ROLE_STUDENT",
            "ROLE_TOBIRA_STUDIO",
            "ROLE_TOBIRA_EDITOR",
        ],
    },
    {
        superset: "ROLE_USER",
        subsets: [
            "ROLE_TOBIRA_MODERATOR",
            "ROLE_INSTRUCTOR",
            "ROLE_STUDENT",
            "ROLE_TOBIRA_STUDIO",
            "ROLE_TOBIRA_EDITOR",
        ],
    },
    {
        superset: "ROLE_TOBIRA_MODERATOR",
        subsets: [
            "ROLE_INSTRUCTOR",
            "ROLE_STUDENT",
            "ROLE_TOBIRA_STUDIO",
            "ROLE_TOBIRA_EDITOR",
        ],
    },
    {
        superset: "ROLE_INSTRUCTOR",
        subsets: [
            "ROLE_STUDENT",
            "ROLE_TOBIRA_STUDIO",
            "ROLE_TOBIRA_EDITOR",
        ],
    },
];

export const LARGE_GROUPS = ["ROLE_ANONYMOUS", "ROLE_USER"];

