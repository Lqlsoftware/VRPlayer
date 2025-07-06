const path = require('path');
const os = require('os');

class AppConfig {
    constructor() {
        this.config = {
            // Application basic information
            app: {
                name: 'VR Player',
                version: '1.0.0',
                author: 'VR Player Team',
                description: 'A VR video player built with Electron'
            },

            // Window settings
            window: {
                width: 1200,
                height: 800,
                minWidth: 800,
                minHeight: 600,
                show: false,
                titleBarStyle: 'default',
                webPreferences: {
                    nodeIntegration: true,
                    contextIsolation: false,
                    enableRemoteModule: true,
                    webSecurity: false
                }
            },

            // Video settings
            video: {
                supportedFormats: ['.mp4', '.webm', '.avi', '.mov', '.mkv', '.m4v'],
                defaultQuality: 'auto',
                loop: false,
                volume: 1.0,
                playbackRate: 1.0
            },

            // VR settings
            vr: {
                defaultMode: '360', // 360, 180, stereo
                enableControllers: true,
                enableHandTracking: false,
                fieldOfView: 75,
                nearPlane: 0.1,
                farPlane: 1000
            },

            // UI settings
            ui: {
                theme: 'system', // system, light, dark
                language: 'zh-CN',
                showFileList: true,
                showSettings: false,
                enableAnimations: true,
                enableTooltips: true
            },

            // Performance settings
            performance: {
                enableHardwareAcceleration: true,
                maxVideoResolution: '4K',
                enableVideoCaching: true,
                cacheSize: 100 * 1024 * 1024, // 100MB
                enableBackgroundProcessing: false
            },

            // File settings
            files: {
                recentFiles: [],
                maxRecentFiles: 10,
                defaultDirectory: path.join(os.homedir(), 'Videos'),
                enableFileWatcher: false,
                autoScanDirectories: []
            },

            // Keyboard shortcuts
            shortcuts: {
                playPause: 'Space',
                stop: 'Escape',
                fullscreen: 'F11',
                vrMode: 'F12',
                openFile: 'Ctrl+O',
                openFolder: 'Ctrl+Shift+O',
                settings: 'Ctrl+,',
                nextVideo: 'Ctrl+Right',
                previousVideo: 'Ctrl+Left',
                volumeUp: 'ArrowUp',
                volumeDown: 'ArrowDown',
                seekForward: 'ArrowRight',
                seekBackward: 'ArrowLeft'
            },

            // Development settings
            development: {
                enableDevTools: false,
                enableHotReload: false,
                enableLogging: true,
                logLevel: 'info' // debug, info, warn, error
            }
        };
    }

    /**
     * Get configuration value
     * @param {string} key - Configuration key path, separated by dots
     * @param {*} defaultValue - Default value
     * @returns {*} - Configuration value
     */
    get(key, defaultValue = undefined) {
        const keys = key.split('.');
        let value = this.config;
        
        for (const k of keys) {
            if (value && typeof value === 'object' && k in value) {
                value = value[k];
            } else {
                return defaultValue;
            }
        }
        
        return value;
    }

    /**
     * Set configuration value
     * @param {string} key - Configuration key path, separated by dots
     * @param {*} value - Configuration value
     */
    set(key, value) {
        const keys = key.split('.');
        let current = this.config;
        
        for (let i = 0; i < keys.length - 1; i++) {
            const k = keys[i];
            if (!(k in current) || typeof current[k] !== 'object') {
                current[k] = {};
            }
            current = current[k];
        }
        
        current[keys[keys.length - 1]] = value;
    }

    /**
     * Load configuration file
     * @param {string} configPath - Configuration file path
     */
    load(configPath) {
        try {
            const fs = require('fs');
            if (fs.existsSync(configPath)) {
                const configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                this.config = { ...this.config, ...configData };
            }
        } catch (error) {
            console.error('Error loading config:', error);
        }
    }

    /**
     * Save configuration file
     * @param {string} configPath - Configuration file path
     */
    save(configPath) {
        try {
            const fs = require('fs');
            const path = require('path');
            
            // Ensure directory exists
            const dir = path.dirname(configPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            
            fs.writeFileSync(configPath, JSON.stringify(this.config, null, 2));
        } catch (error) {
            console.error('Error saving config:', error);
        }
    }

    /**
     * Reset configuration to default values
     */
    reset() {
        this.config = new AppConfig().config;
    }

    /**
     * Get all configuration
     * @returns {Object} - Complete configuration object
     */
    getAll() {
        return { ...this.config };
    }

    /**
     * Validate configuration
     * @returns {Object} - Validation result
     */
    validate() {
        const errors = [];
        
        // Validate window settings
        if (this.config.window.width < this.config.window.minWidth) {
            errors.push('Window width cannot be less than minimum width');
        }
        
        if (this.config.window.height < this.config.window.minHeight) {
            errors.push('Window height cannot be less than minimum height');
        }
        
        // Validate video settings
        if (this.config.video.volume < 0 || this.config.video.volume > 1) {
            errors.push('Video volume must be between 0 and 1');
        }
        
        if (this.config.video.playbackRate < 0.1 || this.config.video.playbackRate > 4) {
            errors.push('Playback rate must be between 0.1 and 4');
        }
        
        return {
            isValid: errors.length === 0,
            errors: errors
        };
    }

    /**
     * Get user configuration path
     * @returns {string} - User configuration path
     */
    getUserConfigPath() {
        const os = require('os');
        const path = require('path');
        
        const platform = process.platform;
        let configDir;
        
        switch (platform) {
            case 'win32':
                configDir = path.join(process.env.APPDATA, 'VRPlayer');
                break;
            case 'darwin':
                configDir = path.join(os.homedir(), 'Library', 'Application Support', 'VRPlayer');
                break;
            default:
                configDir = path.join(os.homedir(), '.config', 'VRPlayer');
        }
        
        return path.join(configDir, 'config.json');
    }
}

module.exports = AppConfig; 