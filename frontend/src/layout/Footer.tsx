import { useTranslation } from "react-i18next";
import CONFIG from "../config";
import { Link } from "../router";
import { ABOUT_PATH } from "../routes/paths";
import { translatedConfig } from "../util";


export const Footer: React.FC = () => {
    const { t, i18n } = useTranslation();

    return (
        <footer css={{
            backgroundColor: "var(--grey95)",
            padding: 16,
            fontSize: 14,
            textAlign: "center",
        }}>
            <ul css={{
                listStyle: "none",
                margin: 0,
                padding: 0,
                "& > li": {
                    display: "inline",
                    "&:not(:first-child):before": {
                        content: "\"•\"",
                        color: "var(--grey40)",
                        margin: "0 12px",
                    },
                },
            }}>
                {CONFIG.footerLinks.map((entry, i) => {
                    if (entry === "about") {
                        return <li key={i}>
                            <Link to={ABOUT_PATH}>{t("footer.about-tobira")}</Link>
                        </li>;
                    } else if (entry === "graphiql") {
                        return <li key={i}>
                            <Link to="/~graphiql" htmlLink>Graph<em>i</em>QL</Link>
                        </li>;
                    } else {
                        return <li key={i}>
                            <Link to={entry.link}>{translatedConfig(entry.label, i18n)}</Link>
                        </li>;
                    }
                })}
            </ul>
        </footer>
    );
};
