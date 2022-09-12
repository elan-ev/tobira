const adminUIPaths = [
    "Query.realmByPath",
    "Realm.name",
    "Realm.pathSegment",
    "Realm.path",
    "Realm.children",
    "Realm.blocks",
    "Block.id",

    "Query.seriesByOpencastId",
    "Series.hostRealms",
    "Realm.ancestors",

    "Mutation.mountSeries",
    "NewSeries",
    "RealmSpecifier",
];
module.exports = ({ changes }) => changes.filter(
    ({ path }) => adminUIPaths.some(adminUIPath => path.startsWith(adminUIPath)),
);
