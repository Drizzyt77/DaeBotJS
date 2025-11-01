import { useState, useEffect, useCallback } from 'react';
import { checkForUpdates, installUpdate } from '../tauriApi';
import { ask } from '@tauri-apps/plugin-dialog';

/**
 * Global update manager state
 */
let globalUpdateState = {
    updateInfo: null,
    checking: false,
    installing: false,
    error: null,
    dismissed: false,
    listeners: new Set()
};

/**
 * Notify all listeners of state changes
 */
function notifyListeners() {
    globalUpdateState.listeners.forEach(listener => listener(globalUpdateState));
}

/**
 * Update the global state
 */
function updateGlobalState(updates) {
    globalUpdateState = { ...globalUpdateState, ...updates };
    notifyListeners();
}

/**
 * Custom hook for managing application updates
 * Provides shared state across all components
 */
function useUpdateManager() {
    const [state, setState] = useState(globalUpdateState);

    useEffect(() => {
        // Register listener
        const listener = (newState) => setState({ ...newState });
        globalUpdateState.listeners.add(listener);

        // Cleanup
        return () => {
            globalUpdateState.listeners.delete(listener);
        };
    }, []);

    const checkUpdates = useCallback(async (forceShow = false) => {
        updateGlobalState({ checking: true, error: null });

        if (forceShow) {
            updateGlobalState({ dismissed: false });
        }

        try {
            const info = await checkForUpdates();
            console.log('[UpdateManager] Update check result:', info);
            updateGlobalState({
                updateInfo: info,
                checking: false,
                dismissed: forceShow ? false : globalUpdateState.dismissed
            });
            return info;
        } catch (err) {
            console.error('[UpdateManager] Error checking for updates:', err);
            updateGlobalState({
                error: err.message || 'Failed to check for updates',
                checking: false
            });
            throw err;
        }
    }, []);

    const installUpdateNow = useCallback(async () => {
        const confirmed = await ask(`Install update v${globalUpdateState.updateInfo.version}?\n\nThe application will restart after installation.`, { title: 'DaeBot', kind: 'info' });
        if (!confirmed) {
            return;
        }

        updateGlobalState({ installing: true, error: null });

        try {
            await installUpdate();
            // App will restart automatically
        } catch (err) {
            console.error('[UpdateManager] Error installing update:', err);
            updateGlobalState({
                error: err.message || 'Failed to install update',
                installing: false
            });
            throw err;
        }
    }, []);

    const dismiss = useCallback(() => {
        updateGlobalState({ dismissed: true });
    }, []);

    const reset = useCallback(() => {
        updateGlobalState({
            updateInfo: null,
            error: null,
            dismissed: false
        });
    }, []);

    return {
        updateInfo: state.updateInfo,
        checking: state.checking,
        installing: state.installing,
        error: state.error,
        dismissed: state.dismissed,
        checkUpdates,
        installUpdate: installUpdateNow,
        dismiss,
        reset
    };
}

export default useUpdateManager;
