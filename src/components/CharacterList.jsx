import React, { useState, useEffect } from 'react';
import { getConfig } from '../tauriApi';
import { message } from '@tauri-apps/plugin-dialog';

function CharacterList({ compact = false }) {
    const [characters, setCharacters] = useState([]);
    const [characterStatus, setCharacterStatus] = useState(new Map());
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadCharacters();

        // Listen for sync progress to update character status
        window.api.onSyncProgress((data) => {
            if (data.characterName) {
                setCharacterStatus(prev => {
                    const newMap = new Map(prev);
                    newMap.set(data.characterName, {
                        status: 'syncing',
                        timestamp: Date.now()
                    });
                    return newMap;
                });
            }
        });

        window.api.onSyncComplete((data) => {
            // Clear all character statuses on complete
            setCharacterStatus(new Map());
            loadCharacters(); // Reload to get updated stats
        });

        return () => {
            window.api.removeListener('sync-progress');
            window.api.removeListener('sync-complete');
        };
    }, []);

    const loadCharacters = async () => {
        try {
            setLoading(true);
            const result = await getConfig();

            if (result && result.characters) {
                setCharacters(result.characters);
            }
        } catch (error) {
            console.error('Failed to load characters:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSyncCharacter = async (character) => {
        await message(`Manual sync for individual characters is not yet implemented in the Tauri GUI.\n\nThe bot automatically syncs all characters every hour.\n\nCharacter: ${character.name}\n\nYou can see sync activity in the Logs tab.`, { title: 'DaeBot', kind: 'info' });
    };

    const getCharacterStatus = (characterName) => {
        return characterStatus.get(characterName);
    };

    const getStatusDisplay = (character) => {
        const status = getCharacterStatus(character.name);

        if (!status) {
            return (
                <button
                    className="btn btn-secondary btn-small"
                    onClick={() => handleSyncCharacter(character)}
                >
                    Sync
                </button>
            );
        }

        switch (status.status) {
            case 'syncing':
                return <span className="status-badge syncing">🔄 Syncing...</span>;
            case 'success':
                return <span className="status-badge success">✅ Synced ({status.runsAdded} runs)</span>;
            case 'error':
                return <span className="status-badge error">❌ Error</span>;
            default:
                return null;
        }
    };

    if (loading) {
        return (
            <div className="loading-state">
                <div className="spinner"></div>
                <p>Loading characters...</p>
            </div>
        );
    }

    if (characters.length === 0) {
        return (
            <div className="empty-state">
                <p>No characters configured.</p>
                <p>Add characters in the Settings panel to start tracking runs.</p>
            </div>
        );
    }

    if (compact) {
        return (
            <div className="character-list compact">
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>Character</th>
                            <th>Realm</th>
                            <th>Region</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {characters.slice(0, 5).map((char, index) => (
                            <tr key={index}>
                                <td className="character-name">{char.name}</td>
                                <td>{char.realm}</td>
                                <td>{char.region.toUpperCase()}</td>
                                <td>{getStatusDisplay(char)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {characters.length > 5 && (
                    <div className="table-footer">
                        Showing 5 of {characters.length} characters
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="character-list full">
            <div className="character-grid">
                {characters.map((char, index) => {
                    const status = getCharacterStatus(char.name);

                    return (
                        <div key={index} className={`character-card ${status ? status.status : ''}`}>
                            <div className="character-header">
                                <div>
                                    <h3 className="character-name">{char.name}</h3>
                                    <p className="character-server">
                                        {char.realm} - {char.region.toUpperCase()}
                                    </p>
                                </div>
                            </div>

                            <div className="character-body">
                                {status && status.error && (
                                    <div className="error-message">
                                        {status.error}
                                    </div>
                                )}
                            </div>

                            <div className="character-footer">
                                {getStatusDisplay(char)}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export default CharacterList;
