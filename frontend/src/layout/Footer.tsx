import { useTranslation } from "react-i18next";
import { Link } from "../router";


export const Footer: React.FC = () => {
    const { t } = useTranslation();

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
                <li><Link to="/~legal">{t("footer.legal-notice")}</Link></li>
                <li><Link to="/~tobira">{t("footer.about-tobira")}</Link></li>
            </ul>
        </footer>
    );
};
