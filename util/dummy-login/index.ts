import fs from "fs/promises";
import { HttpLocation, LoginCheck, runServer, ServerOptions } from "../authkit";


const main = async () => {
    // When this is used in a dev environment, no argument is passed. In our
    // test deployments, we pass the deploy ID. In the latter case we need to
    // use Unix sockets.
    let listen: HttpLocation;
    let tobira: HttpLocation;
    if (process.argv[2]) {
        const deployId = process.argv[2];
        const listenSocket = `/opt/tobira/${deployId}/socket/auth.sock`;
        const tobiraSocket = `/opt/tobira/${deployId}/socket/tobira.sock`;

        // Remove socket if it already exists. Yes, that disconnects existing
        // connections, but its fine for test deployment.
        await fs.rm(listenSocket, { force: true });

        listen = { socketPath: listenSocket };
        tobira = { socketPath: tobiraSocket };
    } else {
        listen = { host: "0.0.0.0", port: 3091 };
        tobira = { host: "host.docker.internal", port: 3080 };
    };

    // React to sigterm to be able to quickly shut down. This is a problem in
    // docker containers, for some reason.
    process.on("SIGTERM", () => process.exit(0));

    try {
        await runServer({
            listen,
            tobira,
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
    return password === DUMMY_PASSWORD && user
        ? {
            username: userid,
            displayName: user.displayName,
            roles: user.roles.concat(["ROLE_ANONYMOUS", "ROLE_USER"]),
            email: user.email,
        }
        : "forbidden";
};

const DUMMY_PASSWORD = "tobira";
const DUMMY_USERS: Record<string, { displayName: string; roles: string[]; email?: string; }> = {
    "admin": {
        displayName: "Administrator",
        roles: ["ROLE_ADMIN", "ROLE_USER_ADMIN", "ROLE_SUDO"],
        email: "admin@example.org",
    },
    "sabine": {
        displayName: "Sabine Rudolfs",
        roles: ["ROLE_USER_SABINE", "ROLE_INSTRUCTOR", "ROLE_STAFF", "ROLE_TOBIRA_MODERATOR"],
        email: "sabine@example.org",
    },
    "björk": {
        displayName: "Prof. Björk Guðmundsdóttir",
        roles: ["ROLE_USER_BJOERK", "ROLE_EXTERNAL", "ROLE_TOBIRA_MODERATOR"],
        email: "bjoerk@example.org",
    },
    "morgan": {
        displayName: "Morgan Yu",
        roles: ["ROLE_USER_MORGAN", "ROLE_STUDENT", "ROLE_TOBIRA_UPLOAD"],
        email: "morgan@example.org",
    },
    "jose": {
        displayName: "José Carreño Quiñones",
        roles: ["ROLE_USER_JOSE", "ROLE_STUDENT"],
    },
};

main();
