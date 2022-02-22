import { useTranslation } from "react-i18next";
import CONFIG from "../config";
import { Link } from "../router";
import { ABOUT_PATH } from "../routes/paths";
import { translatedConfig } from "../util";


export const Footer: React.FC = () => {
    const { t, i18n } = useTranslation();

    return (
        <footer css={{
            backgroundColor: "var(--grey92)",
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
                    let link;
                    let label;
                    if (entry === "about") {
                        link = ABOUT_PATH;
                        label = t("footer.about-tobira");
                    } else if (entry === "graphiql") {
                        link = "/~graphiql";
                        label = <>Graph<em>i</em>QL</>;
                    } else {
                        link = entry.link;
                        label = translatedConfig(entry.label, i18n);
                    }

                    return <li key={i}><Link to={link}>{label}</Link></li>;
                })}
            </ul>
        </footer>
    );
};
