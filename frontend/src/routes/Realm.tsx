import React, { ReactElement, useState } from "react";

import { graphql, loadQuery, useMutation } from "react-relay/hooks";
import type { RealmQuery, RealmQuery$data } from "./__generated__/RealmQuery.graphql";
import { useTranslation } from "react-i18next";
import { LuSunrise, LuInfo, LuSettings, LuPlusCircle, LuPenSquare } from "react-icons/lu";
import { WithTooltip, screenWidthAtMost } from "@opencast/appkit";

import { environment as relayEnv } from "../relay";
import { Breadcrumbs } from "../ui/Breadcrumbs";
import { Blocks } from "../ui/Blocks";
import { RootLoader } from "../layout/Root";
import { NotFound } from "./NotFound";
import { Nav } from "../layout/Navigation";
import { LinkList, LinkWithIcon } from "../ui";
import CONFIG from "../config";
import { characterClass, useTitle, useTranslatedConfig } from "../util";
import { makeRoute } from "../rauta";
import { MissingRealmName } from "./util";
import { realmBreadcrumbs } from "../util/realm";
import { isRealUser, useUser } from "../User";
import { Button, Card } from "@opencast/appkit";
import { displayCommitError } from "./manage/Realm/util";
import { Spinner, boxError } from "@opencast/appkit";
import { useRouter } from "../router";
import { COLORS } from "../color";
import { useMenu } from "../layout/MenuState";
import { ManageNav } from "./manage";
import { BREAKPOINT as NAV_BREAKPOINT } from "../layout/Navigation";
import { AuthorizedData, AuthenticatedDataContext } from "./Video";


// eslint-disable-next-line @typescript-eslint/quotes
export const ILLEGAL_CHARS = '<>"[\\]^`{|}#%/?';
export const RESERVED_CHARS = "-+~@_!$&;:.,=*'()";

export type PathSegmentValidity = "valid"
| "too-short"
| "control-char"
| "whitespace"
| "illegal-chars"
| "reserved-chars-at-beginning";

export const checkPathSegment = (segment: string): PathSegmentValidity => {
    if ((new TextEncoder().encode(segment)).length <= 1) {
        return "too-short";
    }
    // eslint-disable-next-line no-control-regex
    if (segment.match(/[\u0000-\u001F\u007F-\u009F]/u)) {
        return "control-char";
    }
    if (segment.match(/[\u0020\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]/u)) {
        return "whitespace";
    }
    if (segment.match(new RegExp(characterClass(ILLEGAL_CHARS), "u"))) {
        return "illegal-chars";
    }
    if (segment.match(new RegExp(`^${characterClass(RESERVED_CHARS)}`, "u"))) {
        return "reserved-chars-at-beginning";
    }

    return "valid";
};

export const isValidPathSegment = (segment: string): boolean =>
    checkPathSegment(segment) === "valid";

export const isValidRealmPath = (path: string[]): boolean => {
    if (path.length === 1 && path[0] === "") {
        return true;
    }

    return path.every((segment, i) => (
        isValidPathSegment(segment)
           || (i === 0 && segment.startsWith("@") && isValidPathSegment(segment.substring(1)))
    ));
};

export const RealmRoute = makeRoute({
    match: url => {
        const urlPath = url.pathname.replace(/^\/|\/$/g, "");
        const pathSegments = urlPath.split("/").map(decodeURIComponent);
        if (!isValidRealmPath(pathSegments)) {
            return null;
        }

        const realmPath = "/" + pathSegments.join("/");

        const queryRef = loadQuery<RealmQuery>(relayEnv, query, { path: realmPath });

        return {
            render: () => <RootLoader
                {...{ query, queryRef }}
                nav={data => {
                    if (showCreateUserRealmPage(realmPath, data.currentUser) && !data.realm) {
                        return <ManageNav active={realmPath as `/@${string}`} />;
                    }

                    if (!data.realm) {
                        return [];
                    }

                    const mainNav = <Nav key="nav" fragRef={data.realm} />;
                    return data.realm.canCurrentUserModerate
                        ? [mainNav, <RealmEditLinks key="edit-buttons" path={realmPath} />]
                        : mainNav;
                }}
                render={data => (
                    data.realm
                        ? <RealmPage realm={data.realm} />
                        : <NoRealm realmPath={realmPath} />
                )}
            />,
            dispose: () => queryRef.dispose(),
        };
    },
});

const query = graphql`
    query RealmQuery($path: String!) {
        ... UserData
        currentUser { username canCreateUserRealm }
        realm: realmByPath(path: $path) {
            id
            name
            path
            isMainRoot
            isUserRealm
            ownerDisplayName
            children { id }
            blocks { id }
            canCurrentUserModerate
            ancestors { name path ownerDisplayName }
            parent { id }
            ... BlocksData
            ... NavigationData
        }
    }
`;

type Props = {
    realm: NonNullable<RealmQuery$data["realm"]>;
};

const RealmPage: React.FC<Props> = ({ realm }) => {
    const { t } = useTranslation();
    const siteTitle = useTranslatedConfig(CONFIG.siteTitle);
    const breadcrumbs = realmBreadcrumbs(t, realm.ancestors);
    const [authenticatedData, setAuthenticatedData] = useState<AuthorizedData | null>(null);

    const title = realm.isMainRoot ? siteTitle : realm.name;
    useTitle(title, realm.isMainRoot);

    return <>
        {!realm.isMainRoot && (
            <Breadcrumbs path={breadcrumbs} tail={realm.name ?? <MissingRealmName />} />
        )}
        {title && (
            <div css={{
                marginBottom: 20,
                display: "flex",
                flexWrap: "wrap",
                alignItems: "baseline",
                columnGap: 12,
                rowGap: 6,
            }}>
                <h1 css={{ display: "inline-block", marginBottom: 0 }}>{title}</h1>
                {realm.isUserRealm && <UserRealmNote realm={realm} />}
            </div>
        )}
        <AuthenticatedDataContext.Provider value={{ authenticatedData, setAuthenticatedData }}>
            {realm.blocks.length === 0 && realm.isMainRoot
                ? <WelcomeMessage />
                : <Blocks realm={realm} />}
        </AuthenticatedDataContext.Provider>
    </>;
};

const WelcomeMessage: React.FC = () => {
    const { t } = useTranslation();

    return (
        <div css={{
            maxWidth: 500,
            marginTop: 32,
            display: "inline-flex",
            flexDirection: "column",
            borderRadius: 4,
            padding: "8px 16px",
            gap: 16,
            alignItems: "center",
            backgroundColor: COLORS.neutral10,
            border: `2px dashed ${COLORS.happy0}`,
        }}>
            <LuSunrise css={{ marginTop: 8, fontSize: 32, minWidth: 32 }} />
            <div>
                <h2 css={{ textAlign: "center", fontSize: 20, marginBottom: 16 }}>
                    {t("welcome.title")}
                </h2>
                <p>{t("welcome.body")}</p>
            </div>
        </div>
    );
};

const UserRealmNote: React.FC<Props> = ({ realm }) => {
    const { t } = useTranslation();
    const displayName = realm.ancestors.concat(realm)[0].ownerDisplayName;

    return (
        <WithTooltip
            tooltip={t("realm.user-realm.note-body", { user: displayName })}
            placement="bottom"
            tooltipCss={{ width: 400 }}
            css={{ display: "inline-block" }}
        >
            <div css={{
                fontSize: 14,
                lineHeight: 1,
                color: COLORS.neutral60,
                display: "flex",
                gap: 4,
            }}>
                <LuInfo />
                {t("realm.user-realm.note-label")}
            </div>
        </WithTooltip>

    );
};

const NoRealm: React.FC<{ realmPath: string }> = ({ realmPath }) => {
    const user = useUser();

    return isRealUser(user) && showCreateUserRealmPage(realmPath, user)
        ? <CreateUserRealm realmPath={realmPath} />
        : <NotFound kind="page" />;
};

const createUserRealmMutation = graphql`
    mutation RealmCreateForUserMutation {
        createMyUserRealm { id path }
    }
`;

const CreateUserRealm: React.FC<{ realmPath: string }> = ({ realmPath }) => {
    const { t } = useTranslation();
    const router = useRouter();

    const [commit, isInFlight] = useMutation(createUserRealmMutation);
    const [error, setError] = useState<JSX.Element | null>(null);
    const onSubmit = () => {
        commit({
            variables: {},
            onError: error => setError(displayCommitError(error)),
            onCompleted: () => {
                router.goto(`~manage/realm/content?path=${encodeURIComponent(realmPath)}`);
            },
            // To prevent a short flash of "no realm found"
            updater: store => store.invalidateStore(),
        });
    };

    return <>
        <Breadcrumbs path={[]} tail={<i>{t("realm.user-realm.create.heading")}</i>} />
        <div css={{
            width: "80ch",
            maxWidth: "100%",
            [screenWidthAtMost(NAV_BREAKPOINT)]: {
                textAlign: "center",
            },
            "> h1, > p": {
                textAlign: "left",
                margin: "16px 0",
            },
            code: {
                display: "block",
                fontSize: 14,
                backgroundColor: COLORS.neutral10,
                borderRadius: 4,
                padding: "4px 8px",
            },
        }}>
            <Card kind="info" css={{ marginBottom: 32 }}>
                {t("realm.user-realm.create.currently-none")}
            </Card>
            <h1>{t("realm.user-realm.create.heading")}</h1>
            <p>{t("realm.user-realm.create.what-you-can-do")}</p>
            <p>{t("realm.user-realm.create.available-at")}</p>
            <code css={{ textAlign: "center" }}>{window.location.origin + realmPath}</code>
            <p>{t("realm.user-realm.create.find-and-delete")}</p>
            <Button kind="call-to-action"css={{ marginTop: 32 }} onClick={onSubmit}>
                {t("realm.user-realm.create.button")}
            </Button>
            {isInFlight && <div css={{ marginTop: 16 }}><Spinner size={20} /></div>}
            {boxError(error)}
        </div>
    </>;
};

export const RealmEditLinks: React.FC<{ path: string }> = ({ path }) => {
    const { t } = useTranslation();
    const menu = useMenu();

    /* eslint-disable react/jsx-key */
    const buttons: [string, string, ReactElement][] = [
        ["/~manage/realm?path=", t("realm.page-settings"), <LuSettings />],
        ["/~manage/realm/content?path=", t("realm.edit-page-content"), <LuPenSquare />],
        ["/~manage/realm/add-child?parent=", t("realm.add-sub-page"), <LuPlusCircle />],
    ];
    /* eslint-enable react/jsx-key */

    const isActive = (route: string) => document.location.href.includes(route);

    const encodedPath = pathToQuery(path);

    const items = buttons.map(([route, label, icon], i) => (
        <LinkWithIcon key={i}
            to={`${route}${encodedPath}`}
            iconPos="left"
            active={isActive(route)}
            close={() => menu.state === "burger" && menu.close()}
        >
            {icon}
            {label}
        </LinkWithIcon>
    ));

    return <LinkList items={items} />;
};

/**
 * Formats a realm path for inclusion in a query parameter.
 * Specifically, it preserves the path separators (`/`) between the
 * individual path segments for better readability.
 * It is thus **not** suited for use in the path-part of a URL!
 */
export const pathToQuery = (path: string): string => (
    encodeURIComponent(path).replace(/%2f/gui, "/")
);

const showCreateUserRealmPage = (
    realmPath: string,
    user?: { username: string; canCreateUserRealm: boolean } | null,
) => user && `/@${user.username}` === realmPath && user.canCreateUserRealm;
