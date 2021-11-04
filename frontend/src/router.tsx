import { AboutRoute } from "./routes/About";
import { LoginRoute } from "./routes/Login";
import { ManageRoute } from "./routes/manage";
import { ManageRealmRoute } from "./routes/manage/Realm";
import { AddChildRoute } from "./routes/manage/Realm/AddChild";
import { NotFoundRoute } from "./routes/NotFound";
import { RealmRoute } from "./routes/Realm";
import { VideoRoute } from "./routes/Video";

import { makeRouter } from "./rauta";

const { ActiveRoute, Link, matchInitialRoute, matchRoute, Router, useRouter } = makeRouter({
    fallback: NotFoundRoute,
    routes: [
        AboutRoute,
        LoginRoute,
        RealmRoute,
        VideoRoute,
        ManageRoute,
        ManageRealmRoute,
        AddChildRoute,
    ],
});

export { ActiveRoute, Link, matchInitialRoute, matchRoute, Router, useRouter };
