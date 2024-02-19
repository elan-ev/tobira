import { useRef, useState } from "react";
import CONFIG, { TranslatedString } from "../config";
import { currentRef, useTranslatedConfig } from "../util";
import { Modal, ModalHandle } from "./Modal";
import { Button } from "./Button";
import { TextBlock } from "./Blocks/Text";
import { useTranslation } from "react-i18next";
import { notNullish } from "@opencast/appkit";


const LOCAL_STORAGE_KEY = "tobiraUserConsent";

export const InitialConsent: React.FC = () => {
    if (!CONFIG.initialConsent) {
        return null;
    }
    const { i18n } = useTranslation();
    const [consentGiven, setConsentGiven] = useState<boolean | null>(null);
    const modalRef = useRef<ModalHandle>(null);
    const title = useTranslatedConfig(CONFIG.initialConsent.title);
    const text = useTranslatedConfig(CONFIG.initialConsent.text);
    const buttonLabel = useTranslatedConfig(CONFIG.initialConsent.button);
    const currentLanguage = i18n.resolvedLanguage ?? "en";

    const calcHash = async (language: string): Promise<string> => {
        const getTranslated = (s: TranslatedString) => (
            language in s ? s[language as keyof TranslatedString] : undefined) ?? s.en;
        const conditions = notNullish(CONFIG.initialConsent);

        const data = getTranslated(conditions.title)
            + "\0" + getTranslated(conditions.button)
            + "\0" + getTranslated(conditions.text);
        const msg = new TextEncoder().encode(data);
        const hashBuffer = await crypto.subtle.digest("SHA-256", msg);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
    };

    if (consentGiven === null) {
        throw (async () => {
            const stored = localStorage.get(LOCAL_STORAGE_KEY);
            if (!stored) {
                setConsentGiven(false);
            }

            const storedLang = stored.split(":")[0];
            const hash = await calcHash(storedLang);
            setConsentGiven(hash === stored.split(":")[1]);
        })();
    }

    return consentGiven ? null : (
        <Modal
            open
            ref={modalRef}
            title={title}
            closable={false}
            initialFocus={false}
        >
            <TextBlock content={text} />
            <div css={{ display: "flex" }}>
                <Button css={{ marginTop: 20, marginLeft: "auto" }} onClick={async () => {
                    await calcHash(currentLanguage).then(hash =>
                        localStorage.setItem(LOCAL_STORAGE_KEY, hash));
                    currentRef(modalRef).close?.();
                }}>{buttonLabel}</Button>
            </div>
        </Modal>
    );
};

