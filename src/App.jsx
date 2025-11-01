import React, { useState, useEffect } from 'react';
import Dashboard from './components/Dashboard';
import SetupWizard from './components/SetupWizard';
import { getSettings, saveSettings } from './tauriApi';

function App() {
    const [showSetup, setShowSetup] = useState(false);
    const [settings, setSettings] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        try {
            const result = await getSettings();
            setSettings(result);
            setShowSetup(result.firstRun);
        } catch (error) {
            console.error('Failed to load settings:', error);
            // Fallback to default settings
            const defaultSettings = {
                firstRun: true,
                autoStart: false,
                minimizeToTray: true,
                startMinimized: false
            };
            setSettings(defaultSettings);
            setShowSetup(true);
        } finally {
            setLoading(false);
        }
    };

    const handleSetupComplete = async (newSettings) => {
        try {
            // Mark first run as complete
            const updatedSettings = {
                ...newSettings,
                firstRun: false
            };
            await saveSettings(updatedSettings);
            setSettings(updatedSettings);
            setShowSetup(false);
        } catch (error) {
            console.error('Failed to save setup settings:', error);
        }
    };

    if (loading) {
        return (
            <div className="loading-container">
                <div className="spinner"></div>
                <p>Loading DaeBot...</p>
            </div>
        );
    }

    if (showSetup) {
        return <SetupWizard onComplete={handleSetupComplete} />;
    }

    return <Dashboard settings={settings} />;
}

export default App;
