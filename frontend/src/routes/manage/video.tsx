import { useTranslation } from "react-i18next";

import { ManageNav } from ".";
import { Root } from "../../layout/Root";
import { makeRoute } from "../../rauta";


const PATH = "/~manage/videos";

export const ManageVideosRoute = makeRoute<void>({
    path: PATH,
    queryParams: [],
    prepare: () => {},
    render: () => <ManageVideos />,
});

const ManageVideos: React.FC = () => {
    const { t } = useTranslation();

    // TODO
    return (
        <Root nav={[<ManageNav key={1} active={PATH} />]}>
            <h1>{t("manage.my-videos.title")}</h1>
            <p>TODO</p>
        </Root>
    );
};
