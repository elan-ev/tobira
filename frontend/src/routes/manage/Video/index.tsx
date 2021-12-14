import { useTranslation } from "react-i18next";
import { graphql, PreloadedQuery } from "react-relay";

import { ManageNav } from "..";
import { Root } from "../../../layout/Root";
import {
    VideoManageQuery,
    VideoManageQueryResponse,
} from "../../../query-types/VideoManageQuery.graphql";
import { makeRoute } from "../../../rauta";
import { loadQuery } from "../../../relay";
import { Link } from "../../../router";
import { NotAuthorized } from "../../../ui/error";
import { Thumbnail } from "../../../ui/Video";
import { keyOfId } from "../../../util";
import { QueryLoader } from "../../../util/QueryLoader";


const PATH = "/~manage/videos";

export const ManageVideosRoute = makeRoute<PreloadedQuery<VideoManageQuery>>({
    path: PATH,
    queryParams: [],
    prepare: () => loadQuery(query, {}),
    render: queryRef => <QueryLoader {...{ query, queryRef }} render={result => (
        <Root nav={<ManageNav key={1} active={PATH} />} userQuery={result}>
            <ManageVideos events={result.currentUser?.writableEvents}/>
        </Root>
    )} />,
});

const query = graphql`
    query VideoManageQuery {
        ...UserData
        currentUser {
            writableEvents {
                id title duration thumbnail created updated description
                tracks { resolution }
            }
        }
    }
`;

type Events = NonNullable<VideoManageQueryResponse["currentUser"]>["writableEvents"];

type Props = {
    events?: Events;
};

const ManageVideos: React.FC<Props> = ({ events }) => {
    const { t } = useTranslation();

    if (!events) {
        return <NotAuthorized />;
    }

    return (
        <div css={{
            display: "flex",
            flexDirection: "column",
            height: "100%",
            gap: 16,
        }}>
            <h1>{t("manage.my-videos.title")}</h1>
            <div css={{
                overflowY: "auto",
                minHeight: 0,
                flex: "1 0 0",
            }}>
                <EventTable events={events} />
            </div>
        </div>
    );
};

const THUMBNAIL_WIDTH = 16 * 8;

const EventTable: React.FC<{ events: Events }> = ({ events }) => {
    const { t } = useTranslation();

    return (
        <table css={{
            width: "100%",
            overflowY: "auto",
            borderSpacing: 0,
            tableLayout: "fixed",

            "& > thead > tr": {
                position: "sticky",
                top: 0,
                zIndex: 10,
                backgroundColor: "white",
                "& > th": {
                    borderBottom: "1px solid var(--grey80)",
                    textAlign: "left",
                    padding: "8px 12px",
                },
            },
            "& > tbody": {
                overflowY: "auto",
                "& > tr:hover": {
                    backgroundColor: "var(--grey92)",
                },
                "& > tr:not(:first-child) > td": {
                    borderTop: "1px solid var(--grey80)",
                },
                "& td": {
                    padding: 6,
                    verticalAlign: "top",
                    "&:not(:first-child)": {
                        padding: "8px 12px",
                    },
                },
            },
        }}>
            <colgroup>
                <col span={1} css={{ width: THUMBNAIL_WIDTH + 2 * 6 }} />
                <col span={1} />
                <col span={1} css={{ width: 110 }} />
            </colgroup>

            <thead>
                <tr>
                    <th></th>
                    <th>{t("manage.my-videos.columns.title")}</th>
                    <th>{t("manage.my-videos.columns.created")}</th>
                </tr>
            </thead>
            <tbody>
                {events.map(event => <Row key={event.id} event={event} />)}
            </tbody>
        </table>
    );
};

const Row: React.FC<{ event: Events[number] }> = ({ event }) => {
    const created = new Date(event.created);
    const link = `${PATH}/${keyOfId(event.id)}`;
    const { i18n } = useTranslation();

    return (
        <tr>
            <td>
                <Link to={link}>
                    <Thumbnail event={event} width={THUMBNAIL_WIDTH} />
                </Link>
            </td>
            <td>
                <div css={{
                    whiteSpace: "nowrap",
                    textOverflow: "ellipsis",
                    overflow: "hidden",
                }}><Link to={link}>{event.title}</Link></div>
                <Description text={event.description} />
            </td>
            <td css={{ fontSize: 14 }}>
                {created.toLocaleDateString(i18n.language)}
                <br />
                <span css={{ color: "var(--grey40)" }}>
                    {created.toLocaleTimeString(i18n.language)}
                </span>
            </td>
        </tr>
    );
};

const Description: React.FC<{ text: string | null }> = ({ text }) => {
    const { t } = useTranslation();
    const sharedStyle = {
        fontSize: 13,
        marginTop: 4,
    };

    if (text === null) {
        return <div css={{
            ...sharedStyle,
            color: "var(--grey65)",
            fontStyle: "italic",
        }}>{t("manage.my-videos.no-description")}</div>;
    } else {
        return <div css={{
            ...sharedStyle,
            color: "var(--grey40)",
            maxWidth: 800,
            display: "-webkit-box",
            WebkitBoxOrient: "vertical",
            textOverflow: "ellipsis",
            WebkitLineClamp: 2,
            overflow: "hidden",
        }}>{text}</div>;
    }
};
