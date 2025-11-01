import { useEffect } from 'react';
import useUpdateManager from '../hooks/useUpdateManager';

function UpdateNotification() {
    const {
        updateInfo,
        installing,
        error,
        dismissed,
        checkUpdates,
        installUpdate: handleInstall,
        dismiss: handleDismiss
    } = useUpdateManager();

    useEffect(() => {
        // Check for updates on component mount
        checkUpdates();

        // Set up periodic checking every hour (3600000ms)
        const intervalId = setInterval(() => {
            console.log('[UpdateNotification] Running periodic update check...');
            checkUpdates();
        }, 120000); // 2 mins (testing) 1 hour 120000\3600000

        // Cleanup interval on unmount
        return () => clearInterval(intervalId);
    }, [checkUpdates]);

    // Don't show if dismissed or no update available
    if (dismissed || !updateInfo || !updateInfo.available) {
        return null;
    }

    return (
        <div className="update-notification">
            <div className="update-notification-content">
                <div className="update-notification-icon">🔔</div>
                <div className="update-notification-text">
                    <strong>Update Available!</strong>
                    <p>Version {updateInfo.version} is ready to install (current: {updateInfo.currentVersion})</p>
                    {updateInfo.changelog && (
                        <div className="update-changelog">
                            <details>
                                <summary>What's New</summary>
                                <div className="changelog-content">
                                    {updateInfo.changelog}
                                </div>
                            </details>
                        </div>
                    )}
                </div>
                <div className="update-notification-actions">
                    {installing ? (
                        <button className="btn btn-primary btn-small" disabled>
                            Installing...
                        </button>
                    ) : (
                        <>
                            <button
                                className="btn btn-primary btn-small"
                                onClick={handleInstall}
                            >
                                Install & Restart
                            </button>
                            <button
                                className="btn btn-secondary btn-small"
                                onClick={handleDismiss}
                            >
                                Later
                            </button>
                        </>
                    )}
                </div>
            </div>
            {error && (
                <div className="update-notification-error">
                    Error: {error}
                </div>
            )}
        </div>
    );
}

export default UpdateNotification;
