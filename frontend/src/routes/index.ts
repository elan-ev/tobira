import { AboutRoute } from "./About";
import { NotFoundRoute } from "./NotFound";
import { RealmRoute } from "./Realm";
import { VideoRoute } from "./Video";
import { ManageRoute } from "./manage";
import { ManageRealmRoute } from "./manage/Realm";
import { AddChildRoute } from "./manage/Realm/AddChild";
import { LoginRoute } from "./Login";


export const ROUTES = [
    AboutRoute,
    LoginRoute,
    RealmRoute,
    VideoRoute,

    ManageRoute,
    ManageRealmRoute,
    AddChildRoute,

    NotFoundRoute,
] as const;
