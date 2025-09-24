import { useTranslation } from "react-i18next";
import { graphql } from "react-relay";

import { RootLoader } from "../../layout/Root";
import { makeRoute } from "../../rauta";
import { loadQuery } from "../../relay";
import { NotAuthorized } from "../../ui/error";
import { PageTitle } from "../../layout/header/ui";
import {
    AdminDashboardQuery, AdminDashboardQuery$data,
} from "./__generated__/AdminDashboardQuery.graphql";
import { COLORS } from "../../color";
import { LuTriangleAlert } from "react-icons/lu";
import { PrettyDate } from "../../ui/time";
import { WithTooltip } from "@opencast/appkit";
import { ReactNode } from "react";
import CONFIG from "../../config";
import { Link } from "../../router";
import { ManageRealmContentRoute } from "./Realm/Content";




const PATH = "/~manage/admin" as const;

export const AdminDashboardRoute = makeRoute({
    url: PATH,
    match: url => {
        if (url.pathname !== PATH) {
            return null;
        }

        const queryRef = loadQuery<AdminDashboardQuery>(query, {});
        return {
            render: () => <RootLoader
                {...{ query, queryRef }}
                noindex
                nav={() => []}
                render={data => data.adminDashboardInfo
                    ? <AdminDashboard info={data.adminDashboardInfo} />
                    : <NotAuthorized />}
            />,
            dispose: () => queryRef.dispose(),
        };
    },
});


const query = graphql`
    query AdminDashboardQuery {
        ...UserData
        adminDashboardInfo {
            db {
                numEvents
                numEventsPendingSync
                numEventsPendingDeletion
                numEventsListed
                numSeries
                numSeriesPendingSync
                numSeriesPendingDeletion
                numSeriesListed
                numPlaylists
                numPlaylistsListed
                numRealms
                numUserRealms
                numBlocks
                numKnownUsers
                numKnownGroups
                numUserSessions
                dbSize
            }
            searchIndex {
                isHealthy
                state
                meili {
                    version
                    size
                    lastUpdate
                    eventIndex { numDocuments isIndexing }
                    seriesIndex { numDocuments isIndexing }
                    playlistIndex { numDocuments isIndexing }
                    realmIndex { numDocuments isIndexing }
                    userIndex { numDocuments isIndexing }
                }
                queueLen
                queuedEvents
                queuedSeries
                queuedPlaylists
                queuedRealms
                queuedUsers
            }
            sync {
                ocReachable
                harvestedUntil
                lastUpdatedItem
                requiredTobiraApiVersion
                tobiraApiVersion
                externalApiVersion
            }
            problems {
                realmsBrokenName
                realmsBrokenBlocks
            }
        }
    }
`;

type Props = {
    info: NonNullable<AdminDashboardQuery$data["adminDashboardInfo"]>;
};

// The admin dashboard is only for admins, so to cut down an translation
// work for now, especially while this is still frequently changed, we don't
// use translations. However, to easily find translatable strings later, I
// use this fake function.
const t = (s: string) => s;

const AdminDashboard: React.FC<Props> = ({ info }) => {
    const { i18n } = useTranslation();

    return <>
        <div css={{
            maxWidth: 1000,
            margin: "0 auto",
            h2: {
                marginTop: 24,
                marginBottom: 8,
                fontSize: 21,
            },
            h3: {
                marginTop: 8,
                fontSize: 18,
            },
        }}>
            <PageTitle title={i18n.t("manage.admin-dashboard")} />
            <MainInfos info={info} />
            <SyncSection info={info} />
            <SearchIndexSection info={info} />
            <ContentSection info={info} />
            <VersionSection />
        </div>
    </>;
};

const MainInfos: React.FC<Props> = ({ info }) => (
    <FactsBoxes entries={[
        {
            label: t("Tobira version"),
            value: CONFIG.version.identifier,
        },
        {
            label: t("DB size"),
            value: prettyByteSize(info.db.dbSize),
        },
    ]} />
);

const SyncSection: React.FC<Props> = ({ info }) => {
    const sync = info.sync;

    return <>
        <h2>{t("Opencast Sync")}</h2>
        <FactsBoxes entries={[
            {
                label: t("OC reachable"),
                value: boolToYesNoPretty(sync.ocReachable),
            },
            {
                label: t("Harvested until"),
                value: withMaybeDanger(
                    prettyDate(sync.harvestedUntil),
                    // Warn if more than 30min ago (or undefined)
                    (Date.now() - new Date(sync.harvestedUntil).getTime()) > 1000 * 60 * 30,
                ),
            },
            {
                label: t("Latest item"),
                value: prettyDate(sync.lastUpdatedItem),
            },
            {
                label: t("Pending sync/deletion"),
                value: info.db.numEventsPendingSync + info.db.numEventsPendingDeletion
                    + info.db.numSeriesPendingSync + info.db.numSeriesPendingDeletion,
            },
        ]} />
        <h3>{t("API versions:")}</h3>
        <ul css={{ margin: 0 }}>
            <li>{t("Tobira (required): ") + sync.requiredTobiraApiVersion}</li>
            <li>{t("Tobira (actual): ") + (sync.tobiraApiVersion ?? "?")}</li>
            <li>{t("External API (actual): ") + (sync.externalApiVersion ?? "?")}</li>
        </ul>
    </>;
};

const SearchIndexSection: React.FC<Props> = ({ info }) => {
    const si = info.searchIndex;

    // If `meili` is null, something is wrong as well.
    const isHealthy = si.isHealthy && !!si.meili;

    // TODO: in the future, we can add a "search index size" column
    const rows = [
        [t("Events"), info.db.numEvents, si.meili?.eventIndex, si.queuedEvents],
        [t("Series"), info.db.numSeries, si.meili?.seriesIndex, si.queuedSeries],
        [t("Playlist"), info.db.numPlaylists, si.meili?.playlistIndex, si.queuedPlaylists],
        [t("Pages"), info.db.numRealms, si.meili?.realmIndex, si.queuedRealms],
        [t("Known users"), info.db.numKnownUsers, si.meili?.userIndex, si.queuedUsers],
    ] as const;

    return <>
        <h2>{t("Search index")}</h2>
        <FactsBoxes entries={[
            {
                label: t("Healthy"),
                value: boolToYesNoPretty(isHealthy),
            },
            {
                label: t("Meili version"),
                value: si.meili?.version ?? "?",
            },
            {
                label: t("Last update"),
                value: prettyDate(si.meili?.lastUpdate),
            },
            {
                label: <WithTooltip
                    tooltip={t("Total size, including non-Tobira data (if applicable)")}
                    css={{ display: "inline-block" }}
                >
                    <div>{t("Size")}</div>
                </WithTooltip>,
                value: si.meili ? prettyByteSize(si.meili.size) : "?",
            },
            {
                label: t("Schema version"),
                value: si.state ?? "?",
            },
        ]} />
        <table css={{
            margin: "16px 0",
            borderCollapse: "collapse",
            "th, td": {
                border: `1px solid ${COLORS.neutral25}`,
                padding: "2px 10px",
            },
            "td:not(:first-child)": {
                textAlign: "right",
            },
        }}>
            <thead>
                <tr>
                    <th></th>
                    <th>{t("Database")}</th>
                    <th>{t("Search index")}</th>
                    <th>{t("Index queue")}</th>
                    <th>{t("Indexing")}</th>
                </tr>
            </thead>
            <tbody>
                {rows.map(([name, db, si, siq], i) => <tr key={i}>
                    <td>{name}</td>
                    <td>{db}</td>
                    <td>{si?.numDocuments ?? "?"}</td>
                    <td>{siq}</td>
                    <td>{boolToYesNo(si?.isIndexing)}</td>
                </tr>)}
            </tbody>
        </table>
    </>;
};

const ContentSection: React.FC<Props> = ({ info }) => {
    const db = info.db;

    return <>
        <h2>{t("Content")}</h2>
        <ul css={{ margin: 0, ul: { paddingLeft: 16 } }}>
            <li>
                {t("Events: ") + db.numEvents}
                <ul>
                    <li>{t("Pending sync: ") + db.numEventsPendingSync}</li>
                    <li>{t("Pending deletion: ") + db.numEventsPendingDeletion}</li>
                    <li>{t("Listed: ") + db.numEventsListed}</li>
                </ul>
            </li>
            <li>
                {t("Series: ") + db.numSeries}
                <ul>
                    <li>{t("Pending sync: ") + db.numSeriesPendingSync}</li>
                    <li>{t("Pending deletion: ") + db.numSeriesPendingDeletion}</li>
                    <li>{t("Listed: ") + db.numSeriesListed}</li>
                </ul>
            </li>
            <li>
                {t("Playlists: ") + db.numPlaylists}
                <ul>
                    <li>{t("Listed: ") + db.numPlaylistsListed}</li>
                </ul>
            </li>
            <li>
                {t("Pages: ") + db.numRealms}
                <ul>
                    <li>{t("User pages: ") + db.numUserRealms}</li>
                </ul>
            </li>
            <li>{t("Blocks: ") + db.numBlocks}</li>
            <li>{t("Known groups: ") + db.numKnownGroups}</li>
            <li>{t("Known users: ") + db.numKnownUsers}</li>
            <li>{t("User sessions: ") + db.numUserSessions}</li>
        </ul>

        <h3>Problems</h3>
        {t("Pages with broken name:")}
        {info.problems.realmsBrokenName.length === 0
            ? <i>{t(" none")}</i>
            : <ul css={{ margin: 0 }}>
                {info.problems.realmsBrokenName.map(path => <li key={path}>
                    <Link to={path}><code>{path}</code></Link>
                </li>)}
            </ul>
        }
        <br />
        {t("Pages with blocks having broken links:")}
        {info.problems.realmsBrokenBlocks.length === 0
            ? <i>{t(" none")}</i>
            : <ul css={{ margin: 0 }}>
                {info.problems.realmsBrokenBlocks.map(path => <li key={path}>
                    <Link to={ManageRealmContentRoute.url({ realmPath: path })}>
                        <code>{path}</code>
                    </Link>
                </li>)}
            </ul>
        }
    </>;
};

const VersionSection: React.FC = () => <>
    <h2>{t("Tobira version")}</h2>
    <ul css={{ margin: 0 }}>
        <li>{t("Version: ") + CONFIG.version.identifier}</li>
        <li>{t("Target arch: ")}<code>{CONFIG.version.target}</code></li>
        <li>{t("Build date: ") + CONFIG.version.buildDateUtc}</li>
        <li>{t("Commit: ")}<code>{CONFIG.version.gitCommitHash}</code></li>
        <li>{t("Dirty? ") + boolToYesNo(CONFIG.version.gitWasDirty)}</li>
    </ul>
</>;


const boolToYesNo = (b: boolean | null | undefined) => {
    if (b == null) {
        return "?";
    }
    return b ? t("Yes") : t("No");
};


const boolToYesNoPretty = (good: boolean) => withMaybeDanger(boolToYesNo(good), !good);

const withMaybeDanger = (elem: ReactNode, danger: boolean) => (
    <div css={{
        display: "flex",
        gap: 8,
        alignItems: "center",
        ...danger && { color: COLORS.danger0 },
        svg: {
            fontSize: 20,
            flexShrink: 0,
        },
    }}>
        {elem}
        {danger && <LuTriangleAlert />}
    </div>
);

const prettyDate = (date: string | null | undefined) => (
    date ? <PrettyDate date={new Date(date)} /> : "?"
);

const prettyByteSize = (bytes: number): string => {
    const KIB = 1024;
    const MIB = KIB * 1024;
    const GIB = MIB * 1024;
    const round = (n: number) => n >= 100 ? Math.round(n) : Math.round(n * 10) / 10;

    if (bytes < 1500) {
        return `${bytes}\u{2009}B`;
    } else if (bytes < 1500 * KIB) {
        return `${round(bytes / KIB)}\u{2009}KiB`;
    } else if (bytes < 1500 * MIB) {
        return `${round(bytes / MIB)}\u{2009}MiB`;
    } else {
        return `${round(bytes / GIB)}\u{2009}GiB`;
    }
};

type FactsBoxesProps = {
    entries: {
        label: React.ReactNode;
        value: React.ReactNode;
    }[];
};

const FactsBoxes: React.FC<FactsBoxesProps> = ({ entries }) => (
    <div css={{
        display: "flex",
        flexWrap: "wrap",
        gap: 4,
        "> div": {
            display: "flex",
            flexDirection: "column",
            padding: "6px 12px",
            backgroundColor: COLORS.neutral10,
            border: `1px solid ${COLORS.neutral15}`,
            "> div:first-child::after": {
                content: "':'",
            },
            "> div:last-child": {
                fontWeight: "bold",
            },
        },
    }}>
        {entries.map(({ label, value }, i) => <div key={i}>
            <div>{label}</div>
            <div>{value}</div>
        </div>)}
    </div>
);
