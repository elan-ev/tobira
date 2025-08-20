import fs from "fs/promises";
import { HttpLocation, LoginCheck, runLoginCallbackServer } from "../authkit";


const main = async () => {
    // When this is used in a dev environment, no argument is passed. In our
    // test deployments, we pass the deploy ID. In the latter case we need to
    // use Unix sockets.
    let listen: HttpLocation;
    if (process.argv[2]) {
        const deployId = process.argv[2];
        const listenSocket = `/opt/tobira/${deployId}/socket/auth.sock`;

        // Remove socket if it already exists. Yes, that disconnects existing
        // connections, but its fine for test deployment.
        await fs.rm(listenSocket, { force: true });

        listen = { socketPath: listenSocket };
    } else {
        listen = { host: "0.0.0.0", port: 3091 };
    };

    // React to sigterm to be able to quickly shut down. This is a problem in
    // docker containers, for some reason.
    process.on("SIGTERM", () => process.exit(0));

    try {
        await runLoginCallbackServer({
            listen,
            check,
            onListen: () => {
                console.log("Listening on:", listen);

                // Make the socket file accessible for all to ease test deployments.
                if ("socketPath" in listen) {
                    fs.chmod(listen.socketPath, 0o777)
                        .catch(e => console.warn("could not chmod socket file", e));
                }
            },
        });
    } catch (e) {
        console.log(e);
    }
};

const check: LoginCheck = async ({ userid, password }) => {
    const user = DUMMY_USERS[userid];

    // On the test deployment, for admin, we require a good password.
    const expectedPassword = (process.argv[2] && user?.properPassword)
        ? process.env.TOBIRA_ADMIN_PASSWORD
        : DUMMY_PASSWORD;

    if (!expectedPassword) {
        console.error("Tobira admin password env not set!");
        return "forbidden";
    }

    if (password === expectedPassword && user) {
        return {
            username: userid,
            displayName: user.displayName,
            userRole: user.userRole,
            roles: user.roles.concat(["ROLE_ANONYMOUS", "ROLE_USER"]),
            email: user.email,
            userRealmHandle: user.userRealmHandle,
        }
    } else {
        console.log(`Invalid login ${userid}:${password}`);
        return "forbidden";
    }
};

type DummyUserInfo = {
    displayName: string;
    userRole: string;
    roles: string[];
    email?: string;
    userRealmHandle?: string;
    properPassword?: boolean;
};
const DUMMY_PASSWORD = "tobira";
const DUMMY_USERS: Record<string, DummyUserInfo> = {
    "admin": {
        displayName: "Administrator",
        userRole: "ROLE_USER_ADMIN",
        roles: ["ROLE_ADMIN", "ROLE_SUDO"],
        email: "admin@example.org",
        properPassword: true,
    },
    "tobiradmin": {
        displayName: "Tobira Admin",
        userRole: "ROLE_USER_TOBIRADMIN",
        roles: ["ROLE_TOBIRA_ADMIN"],
        email: "tobiradmin@example.org",
        properPassword: true,
    },
    "gustav": {
        displayName: "Gustav Mahler",
        userRole: "ROLE_USER_GUSTAV",
        roles: ["ROLE_INSTRUCTOR", "ROLE_TOBIRA_GLOBAL_PAGE_ADMIN"],
        properPassword: true,
    },
    "sabine": {
        displayName: "Sabine Rudolfs",
        userRole: "ROLE_USER_SABINE",
        roles: ["ROLE_INSTRUCTOR", "ROLE_STAFF", "ROLE_TOBIRA_CAN_FIND_UNLISTED",
            "ROLE_TOBIRA_UPLOAD", "ROLE_TOBIRA_STUDIO", "ROLE_TOBIRA_CAN_CREATE_SERIES"],
        email: "sabine@example.org",
    },
    "björk": {
        displayName: "Prof. Björk Guðmundsdóttir",
        userRole: "ROLE_USER_BJOERK",
        roles: ["ROLE_EXTERNAL", "ROLE_TOBIRA_CAN_FIND_UNLISTED",
            "ROLE_TOBIRA_UPLOAD", "ROLE_TOBIRA_STUDIO", "ROLE_TOBIRA_CAN_CREATE_SERIES"],
        email: "bjoerk@example.org",
        userRealmHandle: "bjorky",
    },
    "morgan": {
        displayName: "Morgan Yu",
        userRole: "ROLE_USER_MORGAN",
        roles: ["ROLE_STUDENT", "ROLE_TOBIRA_UPLOAD"],
        email: "morgan@example.org",
    },
    "jose": {
        displayName: "José Carreño Quiñones",
        userRole: "ROLE_USER_JOSE",
        roles: ["ROLE_STUDENT"],
    },
};

main();
