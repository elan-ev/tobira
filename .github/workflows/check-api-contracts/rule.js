const adminUIPaths = [
    "Query.realmByPath",
    "Realm.name",
    "Realm.pathSegment",
    "Realm.path",
    "Realm.children",
    "Realm.blocks",
    "Block.id",

    "Query.seriesByOpencastId",
    "Series.id",
    "Series.hostRealms",
    "Realm.ancestors",

    "Query.eventByOpencastId",
    "AuthorizedEvent.hostRealms",
    "AuthorizedEvent.id",

    "Mutation.mountSeries",
    "Mutation.addSeriesMountPoint",
    "Mutation.removeSeriesMountPoint",
    "Mutation.createRealmLineage",
    "NewSeries",
    "RealmSpecifier",
    "RealmLineageComponent",
];
module.exports = ({ changes }) => changes.filter(
    ({ path }) => adminUIPaths.some(adminUIPath => path.startsWith(adminUIPath)),
);
