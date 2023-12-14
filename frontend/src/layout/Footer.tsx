import { useTranslation } from "react-i18next";
import CONFIG from "../config";
import { Link } from "../router";
import { translatedConfig } from "../util";
import { COLORS } from "../color";
import { AboutRoute } from "../routes/About";


export const Footer: React.FC = () => {
    const { t, i18n } = useTranslation();

    return (
        <footer css={{
            backgroundColor: COLORS.neutral10,
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
                        color: COLORS.neutral60,
                        margin: "0 12px",
                    },
                    a: {
                        borderRadius: 4,
                        outlineOffset: 1,
                    },
                },
            }}>
                {CONFIG.footerLinks.map((entry, i) => {
                    if (entry === "about") {
                        return <li key={i}>
                            <Link to={AboutRoute.url}>{t("footer.about-tobira")}</Link>
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
