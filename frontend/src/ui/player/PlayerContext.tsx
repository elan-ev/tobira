import {
    Dispatch,
    MutableRefObject,
    PropsWithChildren,
    SetStateAction,
    createContext,
    useContext,
    useRef,
    useState,
} from "react";
import { PaellaState } from "./Paella";
import { bug } from "@opencast/appkit";
import { useTranslation } from "react-i18next";

type PlayerContext = {
    paella: MutableRefObject<PaellaState | undefined>;
    playerIsLoaded: boolean;
    setPlayerIsLoaded: Dispatch<SetStateAction<boolean>>;
};

const PlayerContext = createContext<PlayerContext | null>(null);

export const PlayerContextProvider: React.FC<PropsWithChildren> = ({ children }) => {
    const { t } = useTranslation();
    const paella = useRef<PaellaState>();
    const [playerIsLoaded, setPlayerIsLoaded] = useState(false);

    return <PlayerContext.Provider value={{ paella, playerIsLoaded, setPlayerIsLoaded }}>
        <section aria-label={t("video.video-player")}>
            {children}
        </section>
    </PlayerContext.Provider>;
};

export const usePlayerContext = () => useContext(PlayerContext)
    ?? bug("Player context is not initialized!");

