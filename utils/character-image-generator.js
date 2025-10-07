/**
 * Character Image Generator Utility
 * Generates custom character screen images showing equipped items, M+ runs, and progression
 * Uses HTML5 Canvas API via node-canvas to create WoW-style character sheets
 */

const { createCanvas, loadImage, registerFont } = require('canvas');
const fs = require('fs').promises;
const path = require('path');
const logger = require('./logger');
const { getTimedSymbol, calculateWeeklyStats, groupCharactersByRole, getClassIcon, ROLE_ICONS, CLASS_UNICODE } = require('./data-formatters');

// Image cache for pre-loaded dungeon icons, class icons, and character portraits
const imageCache = {
    dungeonImages: new Map(),
    classImages: new Map(),
    characterPortraits: new Map(),
    initialized: false
};

// Canvas dimensions and layout constants
const CANVAS_WIDTH = 2400;
const CANVAS_HEIGHT = 1250;
const PADDING = 20;
const HEADER_HEIGHT = 120;

// Color scheme matching WoW item qualities
const ITEM_QUALITY_COLORS = {
    0: '#9d9d9d', // Poor (gray)
    1: '#ffffff', // Common (white)
    2: '#1eff00', // Uncommon (green)
    3: '#0070dd', // Rare (blue)
    4: '#a335ee', // Epic (purple)
    5: '#ff8000', // Legendary (orange)
    6: '#e6cc80', // Artifact (light yellow)
    7: '#00ccff'  // Heirloom (light blue)
};

const BACKGROUND_COLOR = '#1a1a1a';
const TEXT_COLOR = '#ffffff';
const ACCENT_COLOR = '#f4c430';
const SECTION_BORDER_COLOR = '#444444';

// Enhanced styling constants - DOUBLED SIZE
const SECTION_BACKGROUND = '#2a2a2a';
const SECTION_BORDER_RADIUS = 16; // Doubled from 8
const SECTION_BORDER_WIDTH = 4; // Doubled from 2
const SECTION_PADDING = 30; // Doubled from 15
const SECTION_MARGIN = 40; // Doubled from 20
const HEADER_ACCENT = '#3a3a3a';
const SHADOW_COLOR = 'rgba(0, 0, 0, 0.3)';

// WoW Class Colors
const CLASS_COLORS = {
    'Death Knight': '#C41E3A',
    'Demon Hunter': '#A330C9',
    'Druid': '#FF7C0A',
    'Evoker': '#33937F',
    'Hunter': '#AAD372',
    'Mage': '#3FC7EB',
    'Monk': '#00FF98',
    'Paladin': '#F48CBA',
    'Priest': '#FFFFFF',
    'Rogue': '#FFF468',
    'Shaman': '#0070DD',
    'Warlock': '#8788EE',
    'Warrior': '#C69B6D'
};

// View modes
const VIEW_MODES = {
    DETAILED: 'detailed',
    COMPACT: 'compact',
    COMPARISON: 'comparison'
};

// Default view mode
let currentViewMode = VIEW_MODES.DETAILED;

/**
 * Draws a rounded rectangle with shadow
 * @param {CanvasRenderingContext2D} ctx - Canvas rendering context
 * @param {number} x - X position
 * @param {number} y - Y position
 * @param {number} width - Width of rectangle
 * @param {number} height - Height of rectangle
 * @param {number} radius - Border radius
 * @param {string} fillColor - Fill color
 * @param {string} borderColor - Border color (optional)
 * @param {number} borderWidth - Border width (optional)
 */
function drawRoundedRect(ctx, x, y, width, height, radius, fillColor, borderColor = null, borderWidth = 0) {
    ctx.save();

    // Draw shadow first
    if (fillColor !== 'transparent') {
        ctx.shadowColor = SHADOW_COLOR;
        ctx.shadowBlur = 8;
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;
    }

    // Create rounded rectangle path manually (node-canvas might not support roundRect)
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();

    // Fill background
    if (fillColor && fillColor !== 'transparent') {
        ctx.fillStyle = fillColor;
        ctx.fill();
    }

    // Reset shadow for border
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    // Draw border
    if (borderColor && borderWidth > 0) {
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = borderWidth;
        ctx.stroke();
    }

    ctx.restore();
}

/**
 * Draws a section container with enhanced styling
 * @param {CanvasRenderingContext2D} ctx - Canvas rendering context
 * @param {number} x - X position
 * @param {number} y - Y position
 * @param {number} width - Width of section
 * @param {number} height - Height of section
 * @param {string} title - Section title
 */
function drawSectionContainer(ctx, x, y, width, height, title) {
    // Draw main section background
    drawRoundedRect(
        ctx,
        x,
        y,
        width,
        height,
        SECTION_BORDER_RADIUS,
        SECTION_BACKGROUND,
        SECTION_BORDER_COLOR,
        SECTION_BORDER_WIDTH
    );

    // Draw title background if title provided
    if (title) {
        const titleHeight = 35;
        drawRoundedRect(
            ctx,
            x,
            y,
            width,
            titleHeight,
            SECTION_BORDER_RADIUS,
            HEADER_ACCENT,
            SECTION_BORDER_COLOR,
            SECTION_BORDER_WIDTH
        );

        // Draw title text
        ctx.fillStyle = ACCENT_COLOR;
        ctx.font = 'bold 28px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(title, x + width / 2, y + titleHeight / 2 + 10);
        ctx.textAlign = 'left'; // Reset alignment
    }
}

/**
 * Draws interactive view mode buttons
 * @param {CanvasRenderingContext2D} ctx - Canvas rendering context
 */
function drawViewModeButtons(ctx) {
    const buttonY = PADDING + 90; // Move below header text to avoid overlap
    const buttonWidth = 90;
    const buttonHeight = 28;
    const buttonSpacing = 6;
    const startX = CANVAS_WIDTH - PADDING - (3 * buttonWidth) - (2 * buttonSpacing) - 30;

    const modes = [
        { mode: VIEW_MODES.DETAILED, label: 'Detailed' },
        { mode: VIEW_MODES.COMPACT, label: 'Compact' },
        { mode: VIEW_MODES.COMPARISON, label: 'Compare' }
    ];

    modes.forEach((modeInfo, index) => {
        const buttonX = startX + (index * (buttonWidth + buttonSpacing));
        const isActive = modeInfo.mode === currentViewMode;

        // Draw button background
        drawRoundedRect(
            ctx,
            buttonX,
            buttonY,
            buttonWidth,
            buttonHeight,
            5,
            isActive ? ACCENT_COLOR : SECTION_BACKGROUND,
            isActive ? '#ffffff' : SECTION_BORDER_COLOR,
            2
        );

        // Draw button text
        ctx.fillStyle = isActive ? '#000000' : TEXT_COLOR;
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(modeInfo.label, buttonX + buttonWidth / 2, buttonY + buttonHeight / 2 + 5);
    });

    ctx.textAlign = 'left'; // Reset alignment
}

/**
 * Initializes the image cache by pre-loading all dungeon and class images
 * Should be called once at application startup
 */
async function initializeImageCache() {
    if (imageCache.initialized) {
        return;
    }

    try {
        // Load dungeon images
        const dungeonDir = path.join(__dirname, '..', 'images', 'dungeons');
        const dungeonFiles = await fs.readdir(dungeonDir);

        logger.info('Initializing dungeon image cache', { fileCount: dungeonFiles.length });

        // Load class images
        const classDir = path.join(__dirname, '..', 'images', 'classes');
        const classFiles = await fs.readdir(classDir);

        logger.info('Initializing class image cache', { fileCount: classFiles.length });

        // Load all dungeon images in parallel
        const dungeonLoadPromises = dungeonFiles
            .filter(file => file.endsWith('.jpg') || file.endsWith('.png'))
            .map(async (file) => {
                try {
                    const filePath = path.join(dungeonDir, file);
                    const image = await loadImage(filePath);
                    const dungeonKey = file.replace(/\.(jpg|png)$/i, '');
                    imageCache.dungeonImages.set(dungeonKey, image);
                    return { file, success: true, type: 'dungeon' };
                } catch (error) {
                    logger.warn('Failed to pre-load dungeon image', { file, error: error.message });
                    return { file, success: false, type: 'dungeon' };
                }
            });

        // Load all class images in parallel - with enhanced error handling
        const classLoadPromises = classFiles
            .filter(file => file.endsWith('.jpg') || file.endsWith('.png') || file.endsWith('.webp'))
            .map(async (file) => {
                try {
                    const filePath = path.join(classDir, file);
                    logger.debug('Attempting to load class image', { file, path: filePath });

                    const image = await loadImage(filePath);
                    const classKey = file.replace(/\.(jpg|png|webp)$/i, '');
                    imageCache.classImages.set(classKey, image);
                    logger.debug('Successfully loaded class image', { file, classKey });
                    return { file, success: true, type: 'class' };
                } catch (error) {
                    logger.warn('Failed to pre-load class image - will use Unicode fallback', {
                        file,
                        error: error.message,
                        note: 'Class images may be in WebP format which requires additional setup'
                    });
                    return { file, success: false, type: 'class' };
                }
            });

        // Wait for all images to load
        const allResults = await Promise.all([...dungeonLoadPromises, ...classLoadPromises]);

        const dungeonResults = allResults.filter(r => r.type === 'dungeon');
        const classResults = allResults.filter(r => r.type === 'class');

        const dungeonSuccessCount = dungeonResults.filter(r => r.success).length;
        const classSuccessCount = classResults.filter(r => r.success).length;

        imageCache.initialized = true;
        logger.info('Image cache initialized', {
            dungeonSuccessCount,
            classSuccessCount,
            totalDungeonFiles: dungeonFiles.length,
            totalClassFiles: classFiles.length,
            dungeonCacheSize: imageCache.dungeonImages.size,
            classCacheSize: imageCache.classImages.size
        });

    } catch (error) {
        logger.error('Failed to initialize image cache', { error: error.message });
        // Don't throw - allow app to continue without cache
    }
}

/**
 * Generates a character sheet image with gear and M+ information
 * @param {Object} characterData - Character information including runs and gear
 * @param {Object} gearData - Character's equipped gear information
 * @param {string} viewMode - View mode: 'detailed', 'compact', or 'comparison'
 * @returns {Promise<Buffer>} PNG image buffer
 */
async function generateCharacterImage(characterData, gearData, viewMode = VIEW_MODES.DETAILED) {
    try {
        // Set current view mode
        currentViewMode = viewMode;

        logger.info('Starting character image generation', {
            characterName: characterData.name,
            hasGearData: !!gearData,
            viewMode: currentViewMode,
            runsCount: characterData.mythic_plus_runs?.length || 0,
            runsSample: characterData.mythic_plus_runs?.slice(0, 3).map(r => ({
                dungeon: r.dungeon,
                level: r.mythic_level,
                spec: r.spec_name
            })) || []
        });

        // Create canvas
        const canvas = createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
        const ctx = canvas.getContext('2d');

        // Set up the background
        drawBackground(ctx);

        // Draw view mode buttons
        drawViewModeButtons(ctx);

        // Draw character header (name, class, level, item level)
        await drawCharacterHeader(ctx, characterData, gearData);

        // Draw character portrait if available
        if (gearData?.thumbnail_url) {
            await drawCharacterPortrait(ctx, gearData.thumbnail_url);
        }

        // Draw content based on view mode
        if (currentViewMode === VIEW_MODES.COMPACT) {
            drawCompactView(ctx, characterData, gearData);
        } else if (currentViewMode === VIEW_MODES.COMPARISON) {
            drawComparisonView(ctx, characterData, gearData);
        } else {
            // Default detailed view
            drawEquippedGear(ctx, gearData);
            drawMythicPlusRuns(ctx, characterData);
            drawStatsSection(ctx, characterData, gearData);
        }

        logger.info('Character image generation completed successfully', {
            characterName: characterData.name,
            canvasSize: `${CANVAS_WIDTH}x${CANVAS_HEIGHT}`
        });

        return canvas.toBuffer('image/png');

    } catch (error) {
        logger.error('Error generating character image', {
            error: error.message,
            stack: error.stack,
            characterName: characterData?.name || 'unknown'
        });
        throw error;
    }
}

/**
 * Draws the background and basic layout structure
 * @param {CanvasRenderingContext2D} ctx - Canvas rendering context
 */
function drawBackground(ctx) {
    // Create gradient background
    const gradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
    gradient.addColorStop(0, '#1a1a1a');
    gradient.addColorStop(0.5, '#151515');
    gradient.addColorStop(1, '#0f0f0f');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Draw main content border with enhanced styling
    drawRoundedRect(
        ctx,
        PADDING,
        PADDING,
        CANVAS_WIDTH - (PADDING * 2),
        CANVAS_HEIGHT - (PADDING * 2),
        12,
        'transparent',
        ACCENT_COLOR,
        3
    );
}

/**
 * Draws character header with name, class, level, and item level
 * @param {CanvasRenderingContext2D} ctx - Canvas rendering context
 * @param {Object} characterData - Character data
 * @param {Object} gearData - Gear data for item level
 */
async function drawCharacterHeader(ctx, characterData, gearData) {
    const headerY = PADDING + 50;

    // Character name (much larger, more prominent) - increased by 15pt
    ctx.fillStyle = ACCENT_COLOR;
    ctx.font = 'bold 63px Arial';
    ctx.textAlign = 'left';
    ctx.fillText(characterData.name, PADDING + 40, headerY);

    // Class and level (bigger text) - increased by 15pt
    ctx.fillStyle = TEXT_COLOR;
    ctx.font = 'bold 39px Arial';
    const classText = `Level ${characterData.level || '??'} ${characterData.class || 'Unknown'}`;
    ctx.fillText(classText, PADDING + 40, headerY + 60);

    // Selected spec display (centered below character info)
    if (characterData.selected_spec) {
        ctx.fillStyle = ACCENT_COLOR;
        ctx.font = 'bold 45px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(characterData.selected_spec, CANVAS_WIDTH / 2, headerY + 30);
    }

    // Item level (if available) - bigger text - increased by 15pt
    if (gearData?.item_level) {
        ctx.fillStyle = ACCENT_COLOR;
        ctx.font = 'bold 43px Arial';
        ctx.textAlign = 'right';
        ctx.fillText(`Item Level: ${gearData.item_level}`, CANVAS_WIDTH - PADDING - 20, headerY + 10);
    }

    // M+ Score (if available) - bigger text - increased by 15pt
    if (characterData.mythic_plus_scores_by_season?.[0]?.scores?.all) {
        const mplusScore = Math.round(characterData.mythic_plus_scores_by_season[0].scores.all);
        ctx.fillStyle = '#4CAF50';
        ctx.font = 'bold 41px Arial';
        ctx.fillText(`M+ Score: ${mplusScore}`, CANVAS_WIDTH - PADDING - 20, headerY + 65);
    }

    ctx.textAlign = 'left'; // Reset alignment
}

/**
 * Loads character portrait with caching
 * @param {string} thumbnailUrl - URL to character thumbnail
 * @returns {Promise<Image|null>} Loaded image or null if failed
 */
async function loadCharacterPortrait(thumbnailUrl) {
    if (!thumbnailUrl) return null;

    // Check cache first
    if (imageCache.characterPortraits.has(thumbnailUrl)) {
        logger.debug('Using cached character portrait', { thumbnailUrl });
        return imageCache.characterPortraits.get(thumbnailUrl);
    }

    try {
        const portraitImage = await loadImage(thumbnailUrl);
        // Cache successful loads with 10 minute TTL
        imageCache.characterPortraits.set(thumbnailUrl, portraitImage);

        // Auto-cleanup cache after 10 minutes
        setTimeout(() => {
            imageCache.characterPortraits.delete(thumbnailUrl);
        }, 10 * 60 * 1000);

        logger.debug('Loaded and cached character portrait', { thumbnailUrl });
        return portraitImage;
    } catch (error) {
        logger.warn('Failed to load character portrait', { error: error.message, thumbnailUrl });
        return null;
    }
}

/**
 * Draws character portrait in top-left section
 * @param {CanvasRenderingContext2D} ctx - Canvas rendering context
 * @param {string} thumbnailUrl - URL to character thumbnail
 */
async function drawCharacterPortrait(ctx, thumbnailUrl) {
    const portraitX = PADDING + 20;
    const portraitY = PADDING + HEADER_HEIGHT + 50; // Align with gear section
    const portraitSize = 80; // Much smaller portrait

    // Try to load portrait with caching
    const portraitImage = await loadCharacterPortrait(thumbnailUrl);

    if (portraitImage) {
        // Draw portrait with border
        ctx.strokeStyle = ACCENT_COLOR;
        ctx.lineWidth = 2;
        ctx.strokeRect(portraitX - 2, portraitY - 2, portraitSize + 4, portraitSize + 4);

        ctx.drawImage(portraitImage, portraitX, portraitY, portraitSize, portraitSize);
    } else {
        // Draw placeholder (reuse the same positioning variables)
        // portraitX, portraitY, portraitSize already defined above

        ctx.fillStyle = '#333333';
        ctx.fillRect(portraitX, portraitY, portraitSize, portraitSize);
        ctx.strokeStyle = ACCENT_COLOR;
        ctx.lineWidth = 2;
        ctx.strokeRect(portraitX, portraitY, portraitSize, portraitSize);

        ctx.fillStyle = TEXT_COLOR;
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('No Image', portraitX + portraitSize/2, portraitY + portraitSize/2);
        ctx.textAlign = 'left';
    }
}

/**
 * Draws equipped gear section with item names and levels
 * @param {CanvasRenderingContext2D} ctx - Canvas rendering context
 * @param {Object} gearData - Character gear information
 */
function drawEquippedGear(ctx, gearData) {
    const sectionX = PADDING + 120;
    const sectionY = PADDING + HEADER_HEIGHT + 40; // Just enough space for view mode buttons
    const sectionWidth = 850;
    const sectionHeight = 780;
    const slotHeight = 70; // Much more vertical space between gear items

    // Draw section container
    drawSectionContainer(ctx, sectionX, sectionY, sectionWidth, sectionHeight, 'Equipped Gear');

    const gearStartX = sectionX + SECTION_PADDING;
    const gearStartY = sectionY + 45; // Account for title height

    if (!gearData?.items) {
        ctx.fillStyle = '#888888';
        ctx.font = '33px Arial'; // No-data text increased by 15pt
        ctx.fillText('No gear data available', gearStartX, gearStartY + 50);
        return;
    }

    // Define gear slots to display
    const gearSlots = [
        { key: 'head', name: 'Head' },
        { key: 'neck', name: 'Neck' },
        { key: 'shoulder', name: 'Shoulders' },
        { key: 'back', name: 'Back' },
        { key: 'chest', name: 'Chest' },
        { key: 'wrist', name: 'Wrists' },
        { key: 'hands', name: 'Hands' },
        { key: 'waist', name: 'Waist' },
        { key: 'legs', name: 'Legs' },
        { key: 'feet', name: 'Feet' }
    ];

    let currentY = gearStartY + 45;

    gearSlots.forEach((slot, index) => {
        const item = gearData.items[slot.key];

        if (item) {
            // Get proper item quality and color
            const quality = item.item_quality !== undefined && item.item_quality !== null ? item.item_quality : 3; // Default to rare only if undefined/null

            ctx.font = 'bold 40px Arial'; // Item text increased by 15pt

            // Check if this is a tier slot (head, shoulders, chest, hands, legs)
            const tierSlots = ['head', 'shoulder', 'chest', 'hands', 'legs'];
            const isTierSlot = tierSlots.includes(slot.key);
            const tierIndicator = isTierSlot ? ' [T]' : '';

            // Truncate item names to 20 characters max (accounting for tier indicator)
            let itemName = item.name;
            const maxLength = isTierSlot ? 17 : 20; // Leave room for [T] indicator
            if (itemName.length > maxLength) {
                itemName = itemName.substring(0, maxLength - 3) + '...';
            }

            // Draw slot name in white
            ctx.fillStyle = TEXT_COLOR; // White color
            ctx.fillText(`${slot.name}: `, gearStartX, currentY);

            // Measure the slot name width to position item name correctly
            const slotNameWidth = ctx.measureText(`${slot.name}: `).width;

            // Draw item name in quality color
            ctx.fillStyle = ITEM_QUALITY_COLORS[quality] || ITEM_QUALITY_COLORS[3];
            ctx.fillText(`${itemName}${tierIndicator}`, gearStartX + slotNameWidth, currentY);

            // Item level - moved even further right for better spacing
            ctx.fillStyle = ACCENT_COLOR;
            ctx.font = 'bold 35px Arial'; // Item level increased by 15pt
            ctx.textAlign = 'right';
            ctx.fillText(`${item.item_level}`, gearStartX + 800, currentY);
            ctx.textAlign = 'left';

        } else {
            // Empty slot - increased by 15pt
            ctx.fillStyle = '#666666';
            ctx.font = 'bold 31px Arial'; // Empty slot text increased by 15pt
            ctx.fillText(`${slot.name}: Empty`, gearStartX, currentY);
        }

        currentY += slotHeight;
    });
}

/**
 * Draws M+ runs section with dungeon runs and key levels
 * @param {CanvasRenderingContext2D} ctx - Canvas rendering context
 * @param {Object} characterData - Character data with M+ runs
 */
function drawMythicPlusRuns(ctx, characterData) {
    const sectionX = PADDING + 1000;
    const sectionY = PADDING + HEADER_HEIGHT + 40; // Just enough space for view mode buttons
    const sectionWidth = 930;
    const sectionHeight = 800;
    const runHeight = 90; // Much more vertical space between entries

    // Draw section container
    drawSectionContainer(ctx, sectionX, sectionY, sectionWidth, sectionHeight, 'Best M+ Runs');

    const runsStartX = sectionX + SECTION_PADDING;
    const runsStartY = sectionY + 45; // Account for title height

    const runs = characterData.mythic_plus_runs || [];

    if (runs.length === 0) {
        ctx.fillStyle = '#888888';
        ctx.font = '40px Arial'; // No-data text increased by 15pt
        ctx.fillText('No M+ runs found', runsStartX, runsStartY + 50);
        return;
    }

    let currentY = runsStartY + 60;
    const imageSize = 40; // Small icon size

    // Use cached dungeon images for faster rendering
    const displayRuns = runs.slice(0, 10);
    const dungeonImages = new Map();

    // Log all dungeon names we'll be processing
    logger.debug('Processing dungeon images for character runs', {
        characterName: characterData.name,
        dungeonNames: displayRuns.map(run => run.dungeon),
        runCount: displayRuns.length,
        cacheInitialized: imageCache.initialized
    });

    // Map dungeon names to cached images
    for (const run of displayRuns) {
        const dungeonName = run.dungeon;
        const simplifiedName = dungeonName.toLowerCase().replace(/[\s\-':.,]/g, '');

        // Check cache first
        if (imageCache.dungeonImages.has(simplifiedName)) {
            dungeonImages.set(dungeonName, imageCache.dungeonImages.get(simplifiedName));
            logger.debug('Using cached dungeon image', { dungeonName, simplifiedName });
        } else {
            logger.debug('Dungeon image not in cache', {
                dungeonName,
                simplifiedName,
                cacheKeys: Array.from(imageCache.dungeonImages.keys())
            });
        }
    }

    // Now draw the runs with their images
    displayRuns.forEach((run, index) => {
        const dungeonName = run.dungeon;
        const imageX = runsStartX;
        const imageY = currentY - imageSize + 5; // Align with text baseline
        let textX = runsStartX; // Default text position

        // Draw dungeon image if available
        if (dungeonImages.has(dungeonName)) {
            const image = dungeonImages.get(dungeonName);
            ctx.drawImage(image, imageX, imageY, imageSize, imageSize);
            textX = runsStartX + imageSize + 10; // 10px gap after image
        }

        ctx.fillStyle = TEXT_COLOR;
        ctx.font = 'bold 45px Arial'; // Dungeon name increased by 15pt
        ctx.fillText(dungeonName, textX, currentY);

        // Key level with timed indicator using getTimedSymbol from data-formatters
        const timedSymbol = getTimedSymbol(run.timed);
        const timedColor = run.timed > 0 ? '#4CAF50' : '#f44336';

        ctx.fillStyle = timedColor;
        ctx.font = 'bold 42px Arial'; // Key level increased by 15pt
        ctx.textAlign = 'right';
        ctx.fillText(`${timedSymbol}${run.mythic_level}`, runsStartX + 780, currentY);

        // Score - increased padding for better visual separation
        ctx.fillStyle = ACCENT_COLOR;
        ctx.font = 'bold 40px Arial'; // Score increased by 15pt
        ctx.fillText(`${Math.round(run.score)}`, runsStartX + 890, currentY);
        ctx.textAlign = 'left';

        // Draw separator line between entries (except after the last one) BEFORE moving to next position
        if (index < displayRuns.length - 1) {
            ctx.strokeStyle = '#666666'; // More visible gray line
            ctx.lineWidth = 5; // Very thick line for visibility
            ctx.beginPath();
            const lineY = currentY + (runHeight / 2) - 8; // Position line 8px higher for optimal visual balance
            ctx.moveTo(runsStartX, lineY); // Start from dungeon name area
            ctx.lineTo(runsStartX + sectionWidth - (SECTION_PADDING * 2), lineY); // Extend to section width
            ctx.stroke();
        }

        currentY += runHeight;
    });
}

/**
 * Draws stats summary section
 * @param {CanvasRenderingContext2D} ctx - Canvas rendering context
 * @param {Object} characterData - Character data
 * @param {Object} gearData - Gear data
 */
function drawStatsSection(ctx, characterData, gearData) {
    const sectionX = PADDING + 120;
    const sectionY = CANVAS_HEIGHT - 200;
    const sectionWidth = CANVAS_WIDTH - (PADDING * 2) - 240;
    const sectionHeight = 150;

    // Draw section container
    drawSectionContainer(ctx, sectionX, sectionY, sectionWidth, sectionHeight, 'Summary');

    const statsStartX = sectionX + SECTION_PADDING;
    const statsY = sectionY + 70; // Account for title height

    // Prepare the three main stats
    const stats = [];

    // 1. Highest Key
    if (characterData.mythic_plus_runs?.length) {
        const highestKey = Math.max(...characterData.mythic_plus_runs.map(run => run.mythic_level));
        stats.push(`Highest Key: +${highestKey}`);
    } else {
        stats.push('Highest Key: N/A');
    }

    // 2. Timed runs This week (using recent runs data if available)
    if (characterData.mythic_plus_runs?.length) {
        // Calculate weekly reset (last Tuesday)
        const now = new Date();
        const lastTuesday = new Date(now);
        const daysToTuesday = (now.getDay() + 5) % 7; // Days since last Tuesday
        lastTuesday.setDate(now.getDate() - daysToTuesday);
        lastTuesday.setHours(15, 0, 0, 0); // Reset time is 3 PM EST/PST

        // Count timed runs since last reset (if run has completed_at timestamp)
        const weeklyTimedRuns = characterData.mythic_plus_runs.filter(run => {
            if (run.completed_at) {
                const runDate = new Date(run.completed_at);
                return runDate >= lastTuesday && run.timed > 0;
            }
            return run.timed > 0; // Fallback to all timed if no timestamp
        }).length;

        stats.push(`Timed This Week: ${weeklyTimedRuns}`);
    } else {
        stats.push('Timed This Week: 0');
    }

    // 3. Average item level
    if (gearData?.item_level) {
        stats.push(`Avg iLvl: ${gearData.item_level}`);
    } else {
        stats.push('Avg iLvl: N/A');
    }

    // Display stats evenly spaced across the width
    ctx.fillStyle = TEXT_COLOR;
    ctx.font = 'bold 31px Arial'; // Stats text increased by 15pt

    const statsY2 = statsY + 50;
    const statSpacing = (sectionWidth - (SECTION_PADDING * 2)) / 3; // Divide into 3 equal sections

    stats.forEach((stat, index) => {
        const statsX = statsStartX + (index * statSpacing);
        ctx.fillText(stat, statsX, statsY2);
    });
}

/**
 * Draws compact view showing only essential information
 * @param {CanvasRenderingContext2D} ctx - Canvas rendering context
 * @param {Object} characterData - Character data
 * @param {Object} gearData - Gear data
 */
function drawCompactView(ctx, characterData, gearData) {
    // Compact view - only M+ dungeons, larger text, full canvas width
    const sectionX = PADDING + 120;
    const sectionY = PADDING + HEADER_HEIGHT + 40;
    const sectionWidth = CANVAS_WIDTH - (PADDING * 2) - 240;
    const sectionHeight = CANVAS_HEIGHT - sectionY - PADDING - 20;

    // Draw M+ section container
    drawSectionContainer(ctx, sectionX, sectionY, sectionWidth, sectionHeight, 'Best M+ Runs');

    const runsStartX = sectionX + SECTION_PADDING;
    const runsStartY = sectionY + 60; // Account for title height

    if (!characterData.mythic_plus_runs || characterData.mythic_plus_runs.length === 0) {
        ctx.fillStyle = '#888888';
        ctx.font = 'bold 40px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('No Mythic+ runs found', sectionX + sectionWidth / 2, runsStartY + 100);
        ctx.textAlign = 'left';
        return;
    }

    // Get the best runs (highest score first)
    const sortedRuns = [...characterData.mythic_plus_runs]
        .sort((a, b) => b.score - a.score);

    // Display more runs in compact view (up to 10 for better spacing with larger fonts)
    const displayRuns = sortedRuns.slice(0, 10);
    const runHeight = Math.max(100, (sectionHeight - 80) / displayRuns.length); // Increased minimum height for larger fonts

    let currentY = runsStartY;

    displayRuns.forEach((run, index) => {
        // Calculate center Y position for this entry
        const entryCenterY = currentY + (runHeight / 2);

        // Load dungeon image if available
        const dungeonKey = run.dungeon.toLowerCase().replace(/[\s\-':.,]/g, ''); // Added comma to removal
        const dungeonImage = imageCache.dungeonImages.get(dungeonKey); // No .jpg extension needed

        if (dungeonImage) {
            const iconSize = 70; // Even larger icon to match increased font size
            // Center the icon vertically in the entry area
            ctx.drawImage(dungeonImage, runsStartX, entryCenterY - iconSize/2, iconSize, iconSize);
        }

        // Dungeon name - even larger font for compact view
        ctx.fillStyle = TEXT_COLOR;
        ctx.font = 'bold 66px Arial'; // Increased by 30px (36 + 30)
        ctx.textAlign = 'left';
        const dungeonNameX = runsStartX + (dungeonImage ? 90 : 0); // More space for larger icon and font
        // Center text vertically by adding half font size to center position
        ctx.fillText(run.dungeon, dungeonNameX, entryCenterY + 22); // +22 is roughly half of 66px font

        // Key level with timed indicator
        const timedSymbol = getTimedSymbol(run.timed);
        const timedColor = run.timed > 0 ? '#4CAF50' : '#f44336';

        ctx.fillStyle = timedColor;
        ctx.font = 'bold 78px Arial'; // Increased by 30px (48 + 30)
        ctx.textAlign = 'right';
        ctx.fillText(`${timedSymbol}${run.mythic_level}`, runsStartX + sectionWidth - 350, entryCenterY + 26); // +26 is roughly half of 78px font

        // Score - larger font
        ctx.fillStyle = ACCENT_COLOR;
        ctx.font = 'bold 74px Arial'; // Increased by 30px (44 + 30)
        ctx.fillText(`${Math.round(run.score)}`, runsStartX + sectionWidth - 150, entryCenterY + 25); // +25 is roughly half of 74px font
        ctx.textAlign = 'left';

        // Draw separator line between entries (except after the last one)
        if (index < displayRuns.length - 1) {
            ctx.strokeStyle = '#666666';
            ctx.lineWidth = 3;
            ctx.beginPath();
            const lineY = currentY + runHeight - 10; // Position line near bottom of entry
            ctx.moveTo(runsStartX, lineY);
            ctx.lineTo(runsStartX + sectionWidth - (SECTION_PADDING * 2), lineY);
            ctx.stroke();
        }

        currentY += runHeight;
    });
}

/**
 * Draws comparison view for multiple characters (placeholder)
 * @param {CanvasRenderingContext2D} ctx - Canvas rendering context
 * @param {Object} characterData - Character data
 * @param {Object} gearData - Gear data
 */
function drawComparisonView(ctx, characterData, gearData) {
    // Placeholder for comparison view - would show side-by-side character stats
    const sectionX = PADDING + 120;
    const sectionY = PADDING + HEADER_HEIGHT + 60;
    const sectionWidth = CANVAS_WIDTH - (PADDING * 2) - 240;
    const sectionHeight = 300;

    drawSectionContainer(ctx, sectionX, sectionY, sectionWidth, sectionHeight, 'Character Comparison');

    const contentX = sectionX + SECTION_PADDING;
    const contentY = sectionY + 80;

    ctx.fillStyle = '#888888';
    ctx.font = '24px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Comparison view coming soon!', sectionX + sectionWidth / 2, contentY);
    ctx.fillText('This will show multiple characters side-by-side', sectionX + sectionWidth / 2, contentY + 40);
    ctx.textAlign = 'left';
}

/**
 * Generates a weekly M+ summary image showing all characters' weekly progress
 * @param {Array} mplusData - Array of character weekly M+ data
 * @param {Date} lastReset - Date of last weekly reset
 * @returns {Promise<Buffer>} PNG image buffer
 */
async function generateWeeklyMplusImage(mplusData, lastReset) {
    try {
        logger.info('Starting weekly M+ image generation', {
            characterCount: mplusData?.length || 0,
            lastReset: lastReset.toISOString()
        });

        // Create canvas with wider dimensions for weekly overview
        const canvas = createCanvas(CANVAS_WIDTH+100, CANVAS_HEIGHT+200);
        const ctx = canvas.getContext('2d');

        // Set up the background
        drawBackground(ctx);

        // Draw title and reset date at the top
        drawWeeklyMplusHeader(ctx, lastReset);

        // Draw character data organized by role
        await drawWeeklyMplusContent(ctx, mplusData, lastReset);

        logger.info('Weekly M+ image generation completed successfully');
        return canvas.toBuffer('image/png');

    } catch (error) {
        logger.error('Error generating weekly M+ image', {
            error: error.message,
            stack: error.stack,
            characterCount: mplusData?.length || 0
        });
        throw error;
    }
}

/**
 * Draws the header section for weekly M+ image
 * @param {CanvasRenderingContext2D} ctx - Canvas rendering context
 * @param {Date} lastReset - Date of last weekly reset
 */
function drawWeeklyMplusHeader(ctx, lastReset) {
    // Title
    ctx.fillStyle = ACCENT_COLOR;
    ctx.font = 'bold 48px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Weekly M+ Runs', CANVAS_WIDTH / 2, PADDING + 50);

    // Reset date subtitle
    ctx.fillStyle = TEXT_COLOR;
    ctx.font = 'bold 28px Arial';
    const resetText = `Since Tuesday Reset - ${lastReset.toLocaleDateString()}`;
    ctx.fillText(resetText, CANVAS_WIDTH / 2, PADDING + 90);

    ctx.textAlign = 'left'; // Reset alignment
}

/**
 * Draws the main content area with characters organized by role
 * @param {CanvasRenderingContext2D} ctx - Canvas rendering context
 * @param {Array} mplusData - Array of character weekly M+ data
 * @param {Date} lastReset - Date of last weekly reset
 */
async function drawWeeklyMplusContent(ctx, mplusData, lastReset) {
    if (!mplusData || mplusData.length === 0) {
        ctx.fillStyle = '#888888';
        ctx.font = 'bold 36px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('No M+ data available', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
        ctx.textAlign = 'left';
        return;
    }

    // Group characters by role
    const roleGroups = groupCharactersByRole(mplusData);

    // Sort characters within each role by weekly performance
    Object.keys(roleGroups).forEach(role => {
        roleGroups[role].sort((a, b) => {
            const aStats = calculateWeeklyStats(a.recent_runs || [], lastReset);
            const bStats = calculateWeeklyStats(b.recent_runs || [], lastReset);

            // Sort by ultra high level runs first, then high, mid, then total runs
            if (aStats.ultraHighTotal !== bStats.ultraHighTotal) return bStats.ultraHighTotal - aStats.ultraHighTotal;
            if (aStats.highTotal !== bStats.highTotal) return bStats.highTotal - aStats.highTotal;
            if (aStats.midTotal !== bStats.midTotal) return bStats.midTotal - aStats.midTotal;
            return bStats.allWeeklyRuns - aStats.allWeeklyRuns;
        });
    });

    // Layout configuration with proper spacing to avoid border overlap
    const contentStartY = PADDING + 130;
    const columnPadding = 30;
    const normalColumnWidth = (CANVAS_WIDTH - PADDING * 2 - (columnPadding * 3)) / 4; // Account for column padding
    let columnIndex = 0;

    // Draw TANK column
    if (roleGroups['TANK'] && roleGroups['TANK'].length > 0) {
        const columnX = PADDING + 15 + (columnIndex * (normalColumnWidth + columnPadding));
        await drawRoleColumn(ctx, 'TANK', roleGroups['TANK'], columnX, contentStartY, normalColumnWidth, lastReset);
        columnIndex++;
    }

    // Draw HEALING column
    if (roleGroups['HEALING'] && roleGroups['HEALING'].length > 0) {
        const columnX = PADDING + 30 + (columnIndex * (normalColumnWidth + columnPadding));
        await drawRoleColumn(ctx, 'HEALING', roleGroups['HEALING'], columnX, contentStartY, normalColumnWidth, lastReset);
        columnIndex++;
    }

    // Handle DPS in 2 columns
    if (roleGroups['DPS'] && roleGroups['DPS'].length > 0) {
        const dpsCharacters = roleGroups['DPS'];
        const midPoint = Math.ceil(dpsCharacters.length / 2);

        // First DPS column
        const dps1X = PADDING + 30 + (columnIndex * (normalColumnWidth + columnPadding));
        await drawRoleColumn(ctx, 'DPS', dpsCharacters.slice(0, midPoint), dps1X, contentStartY, normalColumnWidth, lastReset);

        // Second DPS column
        const dps2X = PADDING + 30 + ((columnIndex + 1) * (normalColumnWidth + columnPadding));
        await drawRoleColumn(ctx, 'DPS (cont.)', dpsCharacters.slice(midPoint), dps2X, contentStartY, normalColumnWidth, lastReset);
    }

    // Summary removed as requested - more space for character cards
}

/**
 * Draws a column for a specific role with character data
 * @param {CanvasRenderingContext2D} ctx - Canvas rendering context
 * @param {string} role - Role name (TANK, HEALING, DPS)
 * @param {Array} characters - Characters in this role
 * @param {number} x - Column X position
 * @param {number} y - Column Y position
 * @param {number} width - Column width
 * @param {Date} lastReset - Date of last weekly reset
 */
async function drawRoleColumn(ctx, role, characters, x, y, width, lastReset) {
    // Role header with icon
    const roleIcon = ROLE_ICONS[role] || '⚔️';
    ctx.fillStyle = ACCENT_COLOR;
    ctx.font = 'bold 40px Arial';

    // Ensure header fits within column width
    const headerText = `${roleIcon} ${role}`;
    const textMetrics = ctx.measureText(headerText);
    const headerX = Math.max(x + 10, x + (width - textMetrics.width) / 2);

    ctx.fillText(headerText, headerX, y + 40);

    let currentY = y + 80; // Spacing after header

    // Draw each character in this role
    for (const character of characters) {
        const stats = calculateWeeklyStats(character.recent_runs || [], lastReset);
        const characterHeight = drawCharacterWeeklyCard(ctx, character, stats, x, currentY, width);
        currentY += characterHeight + 40; // Doubled spacing between characters
    }
}

/**
 * Draws a character card showing weekly M+ progress
 * @param {CanvasRenderingContext2D} ctx - Canvas rendering context
 * @param {Object} character - Character data
 * @param {Object} stats - Weekly statistics
 * @param {number} x - Card X position
 * @param {number} y - Card Y position
 * @param {number} width - Card width
 * @returns {number} Height of the drawn card
 */
function drawCharacterWeeklyCard(ctx, character, stats, x, y, width) {
    // Calculate actual card height based on content to prevent overlaps
    let cardHeight = 90;
    let contentLines = 0;

    if (stats.allWeeklyRuns === 0) {
        cardHeight += 60;
    } else {
        // Count how many key level categories we need to display
        if (stats.ultraHighTotal > 0) contentLines++;
        if (stats.highTotal > 0) contentLines++;
        if (stats.midTotal > 0) contentLines++;
        if (stats.lowTotal > 0) contentLines++;

        // Add height for each line + vault info
        cardHeight += (contentLines * 55) + 70;
    }

    // Draw card background
    drawRoundedRect(ctx, x, y, width, cardHeight, 8, SECTION_BACKGROUND, SECTION_BORDER_COLOR, 2);

    // Character name with class color and class image
    const classColor = CLASS_COLORS[character.class] || TEXT_COLOR;

    ctx.font = 'bold 42px Arial'; // Character name font

    // Map class names to image file names
    const classImageMap = {
        'Death Knight': 'deathknight',
        'Demon Hunter': 'demonhunter',
        'Druid': 'druid',
        'Evoker': 'evoker',
        'Hunter': 'hunter',
        'Mage': 'mage',
        'Monk': 'monk',
        'Paladin': 'paladin',
        'Priest': 'priest',
        'Rogue': 'rogue',
        'Shaman': 'shaman',
        'Warlock': 'warlock',
        'Warrior': 'warrior'
    };

    // Draw class image if available, fallback to Unicode symbol
    const classImageKey = classImageMap[character.class];
    const classImage = classImageKey ? imageCache.classImages.get(classImageKey) : null;

    if (classImage) {
        // Draw class image icon
        const iconSize = 40; // Icon size
        ctx.drawImage(classImage, x + 15, y + 15, iconSize, iconSize);

        // Draw character name in class color with offset for image
        ctx.fillStyle = classColor;
        ctx.fillText(character.name, x + 70, y + 50);
    } else {
        // Fallback to Unicode symbol if image not available
        const classSymbol = CLASS_UNICODE[character.class] || '🏆';
        ctx.fillStyle = classColor;
        ctx.fillText(classSymbol, x + 15, y + 50);
        ctx.fillText(character.name, x + 70, y + 50);
    }

    if (stats.allWeeklyRuns === 0) {
        // No runs this week - larger text
        ctx.fillStyle = '#888888';
        ctx.font = 'bold 36px Arial'; // Increased from 24px to 36px
        ctx.fillText('No runs this week', x + 15, y + 110);
        return cardHeight;
    }

    let textY = y + 110;

    // Show key level categories with much larger text
    ctx.font = 'bold 38px Arial'; // Increased from 26px to 38px

    if (stats.ultraHighTotal > 0) {
        ctx.fillStyle = '#ff6b6b'; // Red for ultra high keys
        ctx.fillText(`≥13: ${stats.ultraHighTotal}`, x + 15, textY);
        textY += 55;
    }

    if (stats.highTotal > 0) {
        ctx.fillStyle = '#4ecdc4'; // Teal for high keys
        ctx.fillText(`12: ${stats.highTotal}`, x + 15, textY);
        textY += 55;
    }

    if (stats.midTotal > 0) {
        ctx.fillStyle = '#45b7d1'; // Blue for mid keys
        ctx.fillText(`10-11: ${stats.midTotal}`, x + 15, textY);
        textY += 55;
    }

    if (stats.lowTotal > 0) {
        ctx.fillStyle = '#96ceb4'; // Green for low keys
        ctx.fillText(`≤9: ${stats.lowTotal}`, x + 15, textY);
        textY += 55;
    }

    // Vault reward info - larger text
    if (stats.allWeeklyRuns > 0) {
        const emoji = stats.vaultKeyLevel >= 12 ? '✅' : '❌';
        ctx.fillStyle = stats.vaultKeyLevel >= 12 ? '#4CAF50' : '#f39c12';
        ctx.font = 'bold 40px Arial'; // Increased from 28px to 40px
        ctx.fillText(`${emoji} Vault: +${stats.vaultKeyLevel}`, x + 15, textY + 20);
    }

    return cardHeight;
}

/**
 * Draws the weekly summary statistics at the bottom
 * @param {CanvasRenderingContext2D} ctx - Canvas rendering context
 * @param {Object} roleGroups - Characters grouped by role
 * @param {Date} lastReset - Date of last weekly reset
 */
function drawWeeklySummary(ctx, roleGroups, lastReset) {
    const allCharacters = Object.values(roleGroups).flat();
    if (allCharacters.length === 0) return;

    let totalUltraHighRuns = 0;
    let totalHighRuns = 0;
    let totalMidRuns = 0;
    let totalLowRuns = 0;

    allCharacters.forEach(character => {
        const stats = calculateWeeklyStats(character.recent_runs || [], lastReset);
        totalUltraHighRuns += stats.ultraHighTotal;
        totalHighRuns += stats.highTotal;
        totalMidRuns += stats.midTotal;
        totalLowRuns += stats.lowTotal;
    });

    const summaryY = CANVAS_HEIGHT - 80;

    // Summary background
    drawRoundedRect(ctx, PADDING, summaryY - 20, CANVAS_WIDTH - (PADDING * 2), 60, 8, SECTION_BACKGROUND, ACCENT_COLOR, 2);

    // Summary title
    ctx.fillStyle = ACCENT_COLOR;
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Weekly Guild Summary', CANVAS_WIDTH / 2, summaryY + 5);

    // Summary stats
    const summaryLines = [];
    if (totalUltraHighRuns > 0) summaryLines.push(`≥13: ${totalUltraHighRuns}`);
    if (totalHighRuns > 0) summaryLines.push(`12: ${totalHighRuns}`);
    if (totalMidRuns > 0) summaryLines.push(`10-11: ${totalMidRuns}`);
    if (totalLowRuns > 0) summaryLines.push(`≤9: ${totalLowRuns}`);

    if (summaryLines.length > 0) {
        ctx.fillStyle = TEXT_COLOR;
        ctx.font = 'bold 20px Arial';
        ctx.fillText(summaryLines.join(' • '), CANVAS_WIDTH / 2, summaryY + 35);
    }

    ctx.textAlign = 'left'; // Reset alignment
}

module.exports = {
    generateCharacterImage,
    generateWeeklyMplusImage,
    initializeImageCache,
    VIEW_MODES,
    CANVAS_WIDTH,
    CANVAS_HEIGHT
};