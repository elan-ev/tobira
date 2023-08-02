export type ACLRecord = Record<string, { label: string; roles: string[] }>

export const DUMMY_USERS: ACLRecord = {
    "admin": {
        label: "Administrator",
        roles: ["ROLE_ADMIN", "ROLE_USER_ADMIN", "ROLE_SUDO", "ROLE_USER", "ROLE_ANONYMOUS"],
    },
    "sabine": {
        label: "Sabine Rudolfs",
        roles: [
            "ROLE_USER_SABINE",
            "ROLE_INSTRUCTOR",
            "ROLE_TOBIRA_MODERATOR",
            "ROLE_USER",
            "ROLE_ANONYMOUS",
        ],
    },
    "björk": {
        label: "Prof. Björk Guðmundsdóttir",
        roles: [
            "ROLE_USER_BJÖRK",
            "ROLE_EXTERNAL",
            "ROLE_TOBIRA_MODERATOR",
            "ROLE_USER",
            "ROLE_ANONYMOUS",
        ],
    },
    "morgan": {
        label: "Morgan Yu",
        roles: [
            "ROLE_USER_MORGAN",
            "ROLE_STUDENT",
            "ROLE_TOBIRA_UPLOAD",
            "ROLE_USER",
            "ROLE_ANONYMOUS",
        ],
    },
    "jose": {
        label: "José Carreño Quiñones",
        roles: ["ROLE_USER_JOSE", "ROLE_STUDENT", "ROLE_USER", "ROLE_ANONYMOUS"],
    },
};

export const DUMMY_GROUPS: ACLRecord = {
    // TODO: get all possible groups (also from Opencast?).
    // TODO: read mappings from config. Maybe also make this an actual map instead of a record?
    "all": {
        label: "Everyone",
        roles: ["ROLE_ANONYMOUS"],
    },
    "loggedIn": {
        label: "Logged in users",
        roles: ["ROLE_USER"],
    },
    "opencast": {
        label: "Opencast gurus",
        roles: ["ROLE_TOBIRA_GURU"],
    },
    "mods": {
        label: "Moderators",
        roles: ["ROLE_TOBIRA_MODERATOR"],
    },
    "instructors": {
        label: "Instructors",
        roles: ["ROLE_INSTRUCTOR"],
    },
    "students": {
        label: "Students",
        roles: ["ROLE_STUDENT"],
    },
    "studio": {
        label: "Studio users",
        roles: ["ROLE_TOBIRA_STUDIO"],
    },
    "upload": {
        label: "Editors",
        roles: ["ROLE_TOBIRA_EDITOR"],
    },
};

type SubsetList = {
    superset: string;
    subsets: string[];
}

export const subsetRelations: SubsetList[] = [
    {
        superset: "ROLE_ANONYMOUS",
        subsets: [
            "ROLE_TOBIRA_MODERATOR",
            "ROLE_INSTRUCTOR",
            "ROLE_USER",
            "ROLE_STUDENT",
            "ROLE_TOBIRA_STUDIO",
            "ROLE_TOBIRA_EDITOR",
            "ROLE_TOBIRA_GURU",
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
        superset: "ROLE_TOBIRA_GURU",
        subsets: ["ROLE_TOBIRA_STUDIO", "ROLE_TOBIRA_EDITOR"],
    },
];


export type ACL = {
    readRoles: string[];
    writeRoles: string[];
};

// This is the ACL structure I expect from an event. Right now this isn't real world data.
export const currentACL: ACL = {
    readRoles: [
        "ROLE_USER_ADMIN",
        "ROLE_INSTRUCTOR",
        "ROLE_USER_SABINE",
        "ROLE_STUDENT",
        "ROLE_TOBIRA_MODERATOR",
        "ROLE_INSTRUCTOR",
        "ROLE_USER_FRITZ",
        "WACKY_UNKNOWN_ROLE",
        "ROLE_USER_BJÖRK",
        "ROLE_ANONYMOUS",
        "ROLE_TOBIRA_GURU",
        "ROLE_TOBIRA_STUDIO",
    ],
    writeRoles: [
        "ROLE_TOBIRA_STUDIO",
        "ROLE_USER_ADMIN",
        "ROLE_INSTRUCTOR",
        "ROLE_TOBIRA_MODERATOR",
        "ROLE_TOBIRA_GURU",
    ],
};

