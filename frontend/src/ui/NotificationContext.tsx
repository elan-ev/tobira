import { bug, Card } from "@opencast/appkit";
import { createContext, useState, useContext, PropsWithChildren, useEffect, useMemo } from "react";
import { useRouter } from "../router";

export type NotificationMessage = {
    kind: "info" | "error";
    // Making this a function helps the message to use the currently
    // selected language when changed.
    message: () => string;
    // The path where the notification should be displayed. If specified, the
    // notification will be cleared when the user navigates away from this path.
    scope?: string;
}

type NotificationContext = {
    notification?: NotificationMessage;
    setNotification: (msg?: NotificationMessage) => void;
}

const NotificationContext = createContext<NotificationContext | null>(null);

export const NotificationProvider: React.FC<PropsWithChildren> = ({ children }) => {
    const [notification, setNotification] = useState<NotificationMessage>();
    const router = useRouter();
    const value = useMemo(() => ({
        notification,
        setNotification,
    }), [notification]);

    useEffect(() => {
        const clear = router.listenAtNav(({ newUrl }) => {
            if (notification?.scope && newUrl.pathname !== notification.scope) {
                setNotification(undefined);
            }
        });

        return () => clear();
    }, [router, notification]);

    return <NotificationContext.Provider value={value}>
        {children}
    </NotificationContext.Provider>;
};

export const useNotification = () => {
    const context = useContext(NotificationContext) ?? bug("Not initialized!");
    const { notification, setNotification } = context;

    const Notification: React.FC = () => notification && (
        <Card css={{ width: "fit-content", marginTop: 12 }} kind={notification.kind}>
            {notification.message()}
        </Card>
    );

    return { Notification, setNotification };
};
