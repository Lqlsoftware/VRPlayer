const { ipcRenderer } = require('electron');

class VRPlayer {
    constructor() {
        this.currentVideo = null;
        this.videoList = [];
        this.currentIndex = 0;
        this.isPlaying = false;
        this.isVRMode = false;
        this.isVrAutoDetected = false;
        this.sharedVideoElement = null;
        this.isFullscreen = false;
        this.controlsHideTimer = null;
        this.controlsVisible = true;
        this.controlsHideDelay = 1000;
        this.settings = {
            loop: false,
            showPlaylist: false,
            mouseTracking: true,
            vrViewSensitivity: 20,
            vrZoomLevel: 100,
            language: 'zh-CN',
            theme: 'system'
        };
        this.vrFov = '180'; // VR field of view: '360' or '180'
        this.vrFormat = 'mono'; // VR format: 'mono', 'sbs', 'tb'

        this.init();
    }

    init() {
        this.bindEvents();
        this.loadSettings();
        this.updateUI();
        this.initSharedVideo();
        this.initLanguage();
        this.initPlatform();
        this.applyTheme(this.settings.theme);
    }

    initLanguage() {
        // Wait for i18n to be initialized
        if (window.i18n) {
            window.i18n.switchLanguage(this.settings.language);
        } else {
            // Retry after a short delay if i18n is not ready
            setTimeout(() => this.initLanguage(), 100);
        }
    }

    async initPlatform() {
        try {
            this.platform = await ipcRenderer.invoke('get-platform');
            this.applyPlatformStyles();
        } catch (error) {
            console.error('Failed to get platform:', error);
        }
    }

    applyPlatformStyles() {
        if (this.platform === 'darwin') {
            // Apply Mac-specific styles
            document.body.classList.add('mac-platform');

            // Hide minimize and close buttons on Mac
            const minimizeBtn = document.getElementById('minimize-btn');
            const closeBtn = document.getElementById('close-btn');

            if (minimizeBtn) {
                minimizeBtn.style.display = 'none';
            }
            if (closeBtn) {
                closeBtn.style.display = 'none';
            }
        }
    }

    initSharedVideo() {
        this.sharedVideoElement = document.getElementById('video-element');
        if (!this.sharedVideoElement) {
            console.error('Shared video element not found');
            return;
        }

        this.sharedVideoElement.addEventListener('loadedmetadata', () => this.onVideoLoaded());
        this.sharedVideoElement.addEventListener('timeupdate', () => this.updateProgress());
        this.sharedVideoElement.addEventListener('ended', () => this.onVideoEnded());
        this.sharedVideoElement.addEventListener('error', (e) => this.onVideoError(e));
        this.sharedVideoElement.addEventListener('play', () => {
            this.isPlaying = true;
            this.updatePlayButton();
        });
        this.sharedVideoElement.addEventListener('pause', () => {
            this.isPlaying = false;
            this.updatePlayButton();
        });
        this.sharedVideoElement.addEventListener('waiting', () => {
            console.log('Video buffering...');
        });
        this.sharedVideoElement.addEventListener('canplay', () => {
            console.log('Video can play');
        });

        this.sharedVideoElement.volume = 0.5;
        this.updateVolumeDisplay();

        console.log('Shared video element initialized');
    }

    bindEvents() {
        // Control button events
        const playPauseBtn = document.getElementById('play-pause-btn');
        const fullscreenBtn = document.getElementById('fullscreen-btn');
        const vrBtn = document.getElementById('vr-btn');
        const exitVrBtn = document.getElementById('exit-vr-btn');

        if (playPauseBtn) {
            playPauseBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.togglePlayPause();
            });
        }

        const stopBtn = document.getElementById('stop-btn');
        if (stopBtn) {
            stopBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.stop();
            });
        }

        if (fullscreenBtn) {
            fullscreenBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.toggleFullscreen();
            });
        }

        if (vrBtn) {
            vrBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.enterVRMode();
            });
        }
        if (exitVrBtn) {
            exitVrBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.exitVRMode();
            });
        }

        // Progress bar events
        const progressBar = document.getElementById('progress-bar');
        if (progressBar) {
            progressBar.addEventListener('input', (e) => this.seek(e.target.value));
            progressBar.addEventListener('change', (e) => this.seek(e.target.value));
        }

        // Volume control events
        const volumeBtn = document.getElementById('volume-btn');

        if (volumeBtn) {
            volumeBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.toggleMute();
            });
        }

        // Setup control bar drag functionality
        this.setupControlBarDrag();

        // File operation buttons
        document.getElementById('open-file-btn').addEventListener('click', () => this.openFile());
        document.getElementById('open-folder-btn').addEventListener('click', () => this.openFolder());

        // Settings buttons
        document.getElementById('settings-btn').addEventListener('click', () => this.toggleSettings());
        document.getElementById('close-settings-btn').addEventListener('click', () => this.hideSettings());

        // Playlist toggle button
        document.getElementById('playlist-btn').addEventListener('click', () => this.togglePlaylist());

        // Window control events
        document.getElementById('minimize-btn').addEventListener('click', () => {
            ipcRenderer.send('minimize-window');
        });
        document.getElementById('maximize-btn').addEventListener('click', () => {
            ipcRenderer.send('maximize-window');
        });
        document.getElementById('close-btn').addEventListener('click', () => {
            ipcRenderer.send('close-window');
        });

        // Settings events
        document.getElementById('theme-select').addEventListener('change', (e) => {
            this.updateSetting('theme', e.target.value);
            this.applyTheme(e.target.value);
        });
        document.getElementById('loop').addEventListener('change', (e) => this.updateSetting('loop', e.target.checked));
        document.getElementById('mouse-sensitivity').addEventListener('input', (e) => {
            this.updateSetting('vrViewSensitivity', parseInt(e.target.value));
            document.getElementById('sensitivity-value').textContent = e.target.value;
        });
        document.getElementById('vr-zoom-sensitivity').addEventListener('input', (e) => {
            this.updateSetting('vrZoomLevel', parseInt(e.target.value));
            const multiplier = parseInt(e.target.value) / 100;
            document.getElementById('vr-zoom-value').textContent = `${multiplier.toFixed(1)}x`;

            if (this.isVRMode) {
                this.currentVRScale = multiplier;
                this.updateVRScale(this.currentVRScale);
                const message = window.i18n ? window.i18n.t('messages.vr_zoom') : 'VR Zoom';
                this.showNotification(`${message}: ${this.currentVRScale.toFixed(1)}x`);
            }
        });
        document.getElementById('language-select').addEventListener('change', (e) => {
            this.updateSetting('language', e.target.value);
            this.switchLanguage(e.target.value);
        });

        // VR FOV selection event listener
        document.getElementById('vr-fov-select').addEventListener('change', (e) => {
            this.vrFov = e.target.value;
            // Update VR mode geometry if currently in VR mode
            if (this.isVRMode) {
                this.updateVRModeGeometry();
            }
        });

        // VR Format selection event listener
        document.getElementById('vr-format-select').addEventListener('change', (e) => {
            this.vrFormat = e.target.value;
            // Update VR mode geometry if currently in VR mode
            if (this.isVRMode) {
                this.updateVRModeGeometry();
            }
        });

        // File list events
        document.getElementById('clear-list-btn').addEventListener('click', () => this.clearPlaylist());
        const vrClearListBtn = document.getElementById('vr-clear-list-btn');
        if (vrClearListBtn) {
            vrClearListBtn.addEventListener('click', () => this.clearPlaylist());
        }

        this.setupDragAndDrop();

        // Keyboard events
        document.addEventListener('keydown', (e) => {
            this.handleKeyPress(e);
            this.handleKeyInteraction(e);
        });

        this.setupMouseWheelZoom();

        // Fullscreen change events
        document.addEventListener('fullscreenchange', () => this.handleFullscreenChange());
        document.addEventListener('webkitfullscreenchange', () => this.handleFullscreenChange());
        document.addEventListener('mozfullscreenchange', () => this.handleFullscreenChange());
        document.addEventListener('MSFullscreenChange', () => this.handleFullscreenChange());

        // Mouse events for fullscreen mode
        document.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        document.addEventListener('mousedown', (e) => this.handleMouseInteraction(e));

        // Listen for pointer lock state changes
        document.addEventListener('pointerlockchange', () => this.handlePointerLockChange());
        document.addEventListener('mozpointerlockchange', () => this.handlePointerLockChange());
        document.addEventListener('webkitpointerlockchange', () => this.handlePointerLockChange());

        // Show control bar when clicking video area
        const videoElement = document.getElementById('video-element');
        if (videoElement) {
            videoElement.addEventListener('click', (e) => {
                if (this.isFullscreen || this.isVRMode) {
                    this.startControlsAutoHide();
                }
            });
        }

        // IPC events
        ipcRenderer.on('load-video', (event, filePath) => this.loadVideo(filePath));
        ipcRenderer.on('load-video-folder', (event, files) => this.loadVideoFolder(files));
        ipcRenderer.on('enter-vr-mode', () => this.enterVRMode());
        ipcRenderer.on('exit-vr-mode', () => this.exitVRMode());

        // Listen for system theme changes
        ipcRenderer.on('system-theme-updated', (event, shouldUseDarkColors) => {
            if (this.settings.theme === 'system') {
                const body = document.body;
                if (shouldUseDarkColors) {
                    body.classList.add('dark-theme');
                } else {
                    body.classList.remove('dark-theme');
                }
            }
        });

        // Language change event
        window.addEventListener('languageChanged', (event) => {
            this.onLanguageChanged(event.detail.language);
        });
    }

    setupDragAndDrop() {
        // Setup drag and drop for both normal and VR modes
        this.setupDragDropForElement('video-container');
        this.setupDragDropForElement('vr-scene');

        // Also setup for the whole document as a fallback
        document.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.showDragIndicator();
        });

        document.addEventListener('dragleave', (e) => {
            e.preventDefault();
            e.stopPropagation();
            // Only hide indicator if we're leaving the document
            if (e.clientX === 0 && e.clientY === 0) {
                this.hideDragIndicator();
            }
        });

        document.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.hideDragIndicator();
            this.handleFileDrop(e);
        });
    }

    setupDragDropForElement(elementId) {
        const element = document.getElementById(elementId);
        if (!element) return;

        element.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.showDragIndicator();
        });

        element.addEventListener('dragleave', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.hideDragIndicator();
        });

        element.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.hideDragIndicator();
            this.handleFileDrop(e);
        });
    }

    setupControlBarDrag() {
        const controlBar = document.querySelector('.control-bar');
        const videoControls = document.getElementById('video-controls');

        if (!controlBar || !videoControls) return;

        // Initialize position tracking
        this.controlBarDragData = {
            isDragging: false,
            startX: 0,
            startY: 0,
            offsetX: 0,
            offsetY: 0,
            initialTransform: null,
            currentX: 0,
            currentY: 0
        };

        controlBar.addEventListener('mousedown', (e) => {
            // Check if the click is on a button or input element
            const target = e.target;
            const isButton = target.tagName === 'BUTTON' ||
                target.tagName === 'INPUT' ||
                target.closest('.control-btn') ||
                target.closest('.progress-bar') ||
                target.closest('button') ||
                target.closest('input');

            // If clicking on a button, don't start dragging
            if (isButton) {
                return;
            }

            e.preventDefault();
            e.stopPropagation();

            this.controlBarDragData.isDragging = true;

            // Get current control bar position
            const rect = videoControls.getBoundingClientRect();

            // Calculate offset from mouse to control bar center
            this.controlBarDragData.startX = e.clientX;
            this.controlBarDragData.startY = e.clientY;
            this.controlBarDragData.offsetX = e.clientX - (rect.left + rect.width / 2);
            this.controlBarDragData.offsetY = e.clientY - (rect.top + rect.height / 2);

            // Store initial transform and current position
            this.controlBarDragData.initialTransform = videoControls.style.transform || '';

            // Parse current position from transform if it exists
            if (this.controlBarDragData.initialTransform) {
                // Handle both formats: "translateX(-50%) translate(x, y)" and "translate(x, y)"
                const translateMatches = this.controlBarDragData.initialTransform.match(/translate\(([^)]+)\)/g);
                if (translateMatches && translateMatches.length > 0) {
                    // Get the last translate() which should be the position offset
                    const lastTranslate = translateMatches[translateMatches.length - 1];
                    const values = lastTranslate.match(/translate\(([^)]+)\)/)[1].split(',').map(v => parseFloat(v.trim()));
                    this.controlBarDragData.currentX = values[0] || 0;
                    this.controlBarDragData.currentY = values[1] || 0;
                } else {
                    this.controlBarDragData.currentX = 0;
                    this.controlBarDragData.currentY = 0;
                }
            } else {
                this.controlBarDragData.currentX = 0;
                this.controlBarDragData.currentY = 0;
            }

            // Add dragging class
            controlBar.classList.add('dragging');

            // Prevent text selection
            document.body.style.userSelect = 'none';

            document.addEventListener('mousemove', this.handleControlBarDrag);
            document.addEventListener('mouseup', this.handleControlBarDragEnd);
        });

        // Store bound methods for cleanup
        this.handleControlBarDrag = this.handleControlBarDrag.bind(this);
        this.handleControlBarDragEnd = this.handleControlBarDragEnd.bind(this);
    }

    handleControlBarDrag(e) {
        if (!this.controlBarDragData.isDragging) return;

        e.preventDefault();
        e.stopPropagation();

        const videoControls = document.getElementById('video-controls');
        if (!videoControls) return;

        // Calculate where the control bar center should be (mouse position - offset)
        const targetCenterX = e.clientX - this.controlBarDragData.offsetX;
        const targetCenterY = e.clientY - this.controlBarDragData.offsetY;

        // Get viewport dimensions
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        // Get control bar dimensions
        const controlBar = videoControls.querySelector('.control-bar');
        const controlBarWidth = controlBar.offsetWidth;
        const controlBarHeight = controlBar.offsetHeight;

        // Calculate position constraints
        const margin = 20;
        const halfWidth = controlBarWidth / 2;
        const halfHeight = controlBarHeight / 2;

        // Constrain the target center position to viewport bounds
        const constrainedCenterX = Math.max(
            margin + halfWidth,
            Math.min(viewportWidth - margin - halfWidth, targetCenterX)
        );
        const constrainedCenterY = Math.max(
            margin + halfHeight,
            Math.min(viewportHeight - margin - halfHeight, targetCenterY)
        );

        // Calculate the offset from the original position based on mode
        let offsetX, offsetY;

        if (this.isVRMode) {
            // In VR mode, the parent container (vr-controls-container) already handles centering
            // So we just need to offset from the container's center position
            const containerRect = videoControls.parentElement.getBoundingClientRect();
            const containerCenterX = containerRect.left + containerRect.width / 2;
            const containerCenterY = containerRect.top + containerRect.height / 2;

            offsetX = constrainedCenterX - containerCenterX;
            offsetY = constrainedCenterY - containerCenterY;

            // Apply simple transform (parent container handles centering)
            videoControls.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
        } else if (this.isFullscreen) {
            // In fullscreen mode, control bar is centered horizontally at bottom
            const originalCenterX = viewportWidth / 2;
            const originalCenterY = viewportHeight - 60; // Bottom position

            offsetX = constrainedCenterX - originalCenterX;
            offsetY = constrainedCenterY - originalCenterY;

            // Apply transform maintaining the original centering
            videoControls.style.transform = `translateX(-50%) translate(${offsetX}px, ${offsetY}px)`;
        } else {
            // In normal mode, calculate offset from original position
            const containerRect = videoControls.parentElement.getBoundingClientRect();
            const originalCenterX = containerRect.left + containerRect.width / 2;
            const originalCenterY = containerRect.bottom - 60; // Default bottom position

            offsetX = constrainedCenterX - originalCenterX;
            offsetY = constrainedCenterY - originalCenterY;

            // Apply transform
            videoControls.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
        }

        // Update position tracking
        this.controlBarDragData.currentX = offsetX;
        this.controlBarDragData.currentY = offsetY;
    }

    handleControlBarDragEnd(e) {
        if (!this.controlBarDragData.isDragging) return;

        e.preventDefault();
        e.stopPropagation();

        this.controlBarDragData.isDragging = false;

        // Clean up
        const controlBar = document.querySelector('.control-bar');

        if (controlBar) {
            controlBar.classList.remove('dragging');
        }

        // Restore text selection
        document.body.style.userSelect = '';

        // Remove event listeners
        document.removeEventListener('mousemove', this.handleControlBarDrag);
        document.removeEventListener('mouseup', this.handleControlBarDragEnd);
    }

    // Reset control bar position when switching modes
    resetControlBarPosition() {
        const videoControls = document.getElementById('video-controls');
        if (videoControls) {
            videoControls.style.transform = '';
        }

        if (this.controlBarDragData) {
            this.controlBarDragData.currentX = 0;
            this.controlBarDragData.currentY = 0;
        }
    }

    showDragIndicator() {
        const videoContainer = document.getElementById('video-container');
        const vrScene = document.getElementById('vr-scene');

        const message = window.i18n ? window.i18n.t('messages.drop_video_here') : 'Drop video files here to play';

        if (this.isVRMode && vrScene) {
            // In VR mode, show indicator on VR scene
            vrScene.style.outline = '3px dashed #667eea';
            vrScene.style.outlineOffset = '-3px';
            this.showDragNotification(message);
        } else if (videoContainer) {
            // In normal mode, show indicator on video container
            videoContainer.style.border = '2px dashed #667eea';
            this.showDragNotification(message);
        }
    }

    hideDragIndicator() {
        const videoContainer = document.getElementById('video-container');
        const vrScene = document.getElementById('vr-scene');

        if (videoContainer) {
            videoContainer.style.border = 'none';
        }
        if (vrScene) {
            vrScene.style.outline = 'none';
        }
        this.hideDragNotification();
    }

    showDragNotification(message) {
        let notification = document.getElementById('drag-notification');
        if (!notification) {
            notification = document.createElement('div');
            notification.id = 'drag-notification';
            notification.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: rgba(0, 0, 0, 0.9);
                color: white;
                padding: 20px 30px;
                border-radius: 10px;
                font-size: 18px;
                z-index: 10002;
                text-align: center;
                pointer-events: none;
                border: 2px dashed #667eea;
                backdrop-filter: blur(10px);
            `;
            document.body.appendChild(notification);
        }

        // Check if video is currently playing
        if (this.currentVideo && this.isPlaying) {
            const currentFileName = this.currentVideo.split(/[\\/]/).pop();
            const replaceMessage = window.i18n ? window.i18n.t('messages.replace_current_video') : 'Will replace current playing video';
            notification.innerHTML = `
                <div style="font-size: 18px; margin-bottom: 10px;">${message}</div>
                <div style="font-size: 14px; opacity: 0.8; color: #ffd700;">
                    ${replaceMessage}: ${currentFileName}
                </div>
            `;
        } else {
            notification.textContent = message;
        }
        notification.style.display = 'block';
    }

    hideDragNotification() {
        const notification = document.getElementById('drag-notification');
        if (notification) {
            notification.style.display = 'none';
        }
    }

    handleFileDrop(e) {
        const files = Array.from(e.dataTransfer.files);
        const videoFiles = files.filter(file =>
            /\.(mp4|webm|avi|mov|mkv|m4v)$/i.test(file.name)
        );

        if (videoFiles.length === 0) {
            // Show error message for unsupported files
            this.showDropErrorMessage();
            return;
        }

        // Show loading message
        this.showDropLoadingMessage();

        // Load video(s) after a short delay to show the loading message
        setTimeout(() => {
            if (videoFiles.length === 1) {
                this.loadVideo(videoFiles[0].path);
            } else {
                this.loadVideoFolder(videoFiles.map(f => f.path));
            }
        }, 100);
    }

    showDropErrorMessage() {
        const errorMessage = window.i18n ? window.i18n.t('messages.unsupported_file_type') : 'Unsupported file type';
        const supportedMessage = window.i18n ? window.i18n.t('messages.supported_formats') : 'Supported formats: MP4, WebM, AVI, MOV, MKV, M4V';

        let notification = document.getElementById('drag-notification');
        if (!notification) {
            notification = document.createElement('div');
            notification.id = 'drag-notification';
            notification.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: rgba(220, 38, 38, 0.9);
                color: white;
                padding: 20px 30px;
                border-radius: 10px;
                font-size: 18px;
                z-index: 10002;
                text-align: center;
                pointer-events: none;
                border: 2px solid #dc2626;
                backdrop-filter: blur(10px);
            `;
            document.body.appendChild(notification);
        }

        notification.innerHTML = `
            <div style="font-size: 18px; margin-bottom: 10px;">${errorMessage}</div>
            <div style="font-size: 14px; opacity: 0.9;">${supportedMessage}</div>
        `;
        notification.style.display = 'block';

        // Auto-hide after 3 seconds
        setTimeout(() => {
            if (notification) {
                notification.style.display = 'none';
            }
        }, 3000);
    }

    showDropLoadingMessage() {
        const loadingMessage = window.i18n ? window.i18n.t('messages.loading_video') : 'Loading video...';

        let notification = document.getElementById('drag-notification');
        if (notification) {
            notification.innerHTML = `
                <div style="font-size: 18px;">
                    <div style="display: inline-block; margin-right: 10px;">⏳</div>
                    ${loadingMessage}
                </div>
            `;
            notification.style.background = 'rgba(0, 0, 0, 0.9)';
            notification.style.border = '2px solid #667eea';
            notification.style.display = 'block';
        }
    }

    handleKeyPress(e) {
        switch (e.code) {
            case 'Space':
                e.preventDefault();
                this.togglePlayPause();
                break;
            case 'F11':
                e.preventDefault();
                this.toggleVRMode();
                break;
            case 'ArrowUp':
                e.preventDefault();
                if ((e.ctrlKey || e.metaKey) && this.isVRMode) {
                    this.adjustVRZoomByKeyboard(1);
                } else {
                    this.adjustVolume(0.1);
                }
                break;
            case 'ArrowDown':
                e.preventDefault();
                if ((e.ctrlKey || e.metaKey) && this.isVRMode) {
                    this.adjustVRZoomByKeyboard(-1);
                } else {
                    this.adjustVolume(-0.1);
                }
                break;
            case 'KeyM':
                e.preventDefault();
                this.toggleMute();
                break;
            case 'Escape':
                if (this.isVRMode) {
                    e.preventDefault();
                    if (this.settings.mouseTracking) {
                        this.toggleMouseTracking();
                    } else {
                        this.exitVRMode();
                    }
                }
                break;
            case 'Enter':
                e.preventDefault();
                this.toggleFullscreen();
                break;
            case 'ArrowLeft':
                e.preventDefault();
                this.seekRelative(-10);
                break;
            case 'ArrowRight':
                e.preventDefault();
                this.seekRelative(10);
                break;
            case 'KeyR':
                if (this.isVRMode) {
                    e.preventDefault();
                    this.resetVRZoomAndView();
                }
                break;
            case 'KeyT':
                if (this.isVRMode) {
                    e.preventDefault();
                    this.toggleMouseTracking();
                }
                break;
            case 'KeyB':
                if (this.isVRMode) {
                    e.preventDefault();
                    this.toggleVRFormat();
                }
                break;
            case 'KeyV':
                if (this.isVRMode) {
                    e.preventDefault();
                    this.toggleVRFov();
                }
                break;
        }
    }

    resetVRZoom() {
        this.currentVRScale = this.settings.vrZoomLevel / 100;
        this.updateVRScale(this.currentVRScale);
        const message = window.i18n ? window.i18n.t('messages.vr_zoom_reset') : 'VR Zoom (Reset)';
        this.showNotification(`${message}: ${this.currentVRScale.toFixed(1)}x`, 'success');
    }

    resetVRView() {
        // Reset view to default position based on FOV mode
        const defaultRotation = this.vrFov === '180' ? '0 -90 0' : '0 0 0';
        this.setCameraRotation(defaultRotation);
    }

    resetVRZoomAndView() {
        // Reset VR zoom
        this.currentVRScale = this.settings.vrZoomLevel / 100;
        this.updateVRScale(this.currentVRScale);

        // Reset VR view based on FOV mode
        this.resetVRView();

        // Show combined notification
        const message = window.i18n ? window.i18n.t('messages.vr_zoom_view_reset') : 'VR Zoom & View Reset';
        this.showNotification(`${message}: ${this.currentVRScale.toFixed(1)}x`, 'success');
    }



    setCameraRotation(rotation, statusMessage) {
        const scene = document.querySelector('a-scene');
        if (scene) {
            const camera = scene.querySelector('a-camera');
            if (camera) {
                camera.setAttribute('rotation', rotation);
                if (statusMessage) {
                    this.showNotification(statusMessage, 'info');
                }
            }
        }
    }

    toggleMouseTracking() {
        this.settings.mouseTracking = !this.settings.mouseTracking;
        this.saveSettings();

        window.isFirstMove = true;
        window.lastMouseX = 0;
        window.lastMouseY = 0;

        const vrScene = document.getElementById('vr-scene');
        const videoControls = document.getElementById('video-controls');

        if (this.settings.mouseTracking) {
            const message = window.i18n ? window.i18n.t('messages.mouse_tracking_enabled') : 'Mouse tracking: enabled';
            this.showNotification(message, 'success');
            if (vrScene) {
                vrScene.style.cursor = 'none';
            }

            const canvas = document.querySelector('a-scene canvas') || document.body;
            if (canvas && canvas.requestPointerLock) {
                canvas.requestPointerLock();
            }
            if (videoControls && this.isVRMode) {
                videoControls.style.display = 'block';
                videoControls.style.visibility = 'visible';
                videoControls.style.pointerEvents = 'auto';
                videoControls.style.opacity = '1';
                videoControls.style.transition = 'opacity 0.3s ease';

                if (this.vrControlsMouseEnter) {
                    videoControls.removeEventListener('mouseenter', this.vrControlsMouseEnter);
                }
                if (this.vrControlsMouseLeave) {
                    videoControls.removeEventListener('mouseleave', this.vrControlsMouseLeave);
                }

                this.vrControlsMouseEnter = () => {
                    videoControls.style.opacity = '1';
                    this.stopControlsAutoHide();
                };
                this.vrControlsMouseLeave = () => {
                    if (this.controlsVisible) {
                        videoControls.style.opacity = '1';
                    } else {
                        videoControls.style.opacity = '0';
                    }
                    this.startControlsAutoHide();
                };

                videoControls.addEventListener('mouseenter', this.vrControlsMouseEnter);
                videoControls.addEventListener('mouseleave', this.vrControlsMouseLeave);

                this.startControlsAutoHide();
            }
        } else {
            const message = window.i18n ? window.i18n.t('messages.mouse_tracking_disabled') : 'Mouse tracking: disabled';
            this.showNotification(message, 'warning');
            if (vrScene) {
                vrScene.style.cursor = 'default';
            }

            if (document.pointerLockElement && document.exitPointerLock) {
                document.exitPointerLock();
            }
            if (videoControls && this.isVRMode) {
                videoControls.style.display = 'block';
                videoControls.style.visibility = 'visible';
                videoControls.style.pointerEvents = 'auto';
                videoControls.style.opacity = '1';
                videoControls.style.transition = 'opacity 0.3s ease';

                if (this.vrControlsMouseEnter) {
                    videoControls.removeEventListener('mouseenter', this.vrControlsMouseEnter);
                }
                if (this.vrControlsMouseLeave) {
                    videoControls.removeEventListener('mouseleave', this.vrControlsMouseLeave);
                }

                this.vrControlsMouseEnter = () => {
                    this.stopControlsAutoHide();
                };
                this.vrControlsMouseLeave = () => {
                    this.startControlsAutoHide();
                };

                videoControls.addEventListener('mouseenter', this.vrControlsMouseEnter);
                videoControls.addEventListener('mouseleave', this.vrControlsMouseLeave);

                this.startControlsAutoHide();
            }
        }
    }



    toggleVRFov() {
        this.vrFov = this.vrFov === '360' ? '180' : '360';

        this.updateVRModeGeometry();

        const message = window.i18n ? window.i18n.t(`messages.fov_${this.vrFov}`) : `VR FOV: ${this.vrFov}°`;
        this.showNotification(message, 'success');

        this.resetVRView();

        // Update VR mode selection in settings panel if it's open
        this.updateVRModeSelection();
    }

    toggleVRFormat() {
        const formats = ['mono', 'sbs', 'tb'];
        const currentIndex = formats.indexOf(this.vrFormat);
        const nextIndex = (currentIndex + 1) % formats.length;
        this.vrFormat = formats[nextIndex];

        this.updateVRModeGeometry();

        const message = window.i18n ? window.i18n.t(`settings.vr_format_${this.vrFormat}`) : `VR Format: ${this.vrFormat.toUpperCase()}`;
        this.showNotification(message, 'success');

        // Update VR mode selection in settings panel if it's open
        this.updateVRModeSelection();
    }

    updateVRModeGeometry() {
        const videosphere = document.querySelector('a-videosphere');
        if (!videosphere) {
            console.error('Videosphere element not found');
            return;
        }

        const currentGeometry = videosphere.getAttribute('geometry') || {};
        const radius = currentGeometry.radius || 500;

        if (this.vrFov === '180') {
            videosphere.setAttribute('geometry', {
                radius: radius,
                phiLength: 180,
                phiStart: -90,
                thetaLength: 180,
                thetaStart: 0
            });
        } else {
            videosphere.setAttribute('geometry', {
                radius: radius,
                phiLength: 360,
                phiStart: 0,
                thetaLength: 180,
                thetaStart: 0
            });
        }

        setTimeout(() => {
            this.applyVRFormat(videosphere);
        }, 100);

        videosphere.setAttribute('material', {
            shader: 'flat'
        });

        this.updateVRModeStatus();

        this.resetVRView();
    }

    updateVRModeStatus() {
        const vrModeText = document.getElementById('vr-mode-text');
        const vrModeIndicator = document.querySelector('.vr-mode-indicator');

        if (vrModeText) {
            const formatText = window.i18n ? window.i18n.t(`settings.vr_format_${this.vrFormat}`) : this.vrFormat.toUpperCase();
            vrModeText.textContent = `${this.vrFov}° ${formatText}`;
        }

        if (vrModeIndicator) {
            vrModeIndicator.classList.remove('mode-180', 'mode-360', 'mode-mono', 'mode-sbs', 'mode-tb');

            if (this.vrFov === '180') {
                vrModeIndicator.classList.add('mode-180');
            } else {
                vrModeIndicator.classList.add('mode-360');
            }

            vrModeIndicator.classList.add(`mode-${this.vrFormat}`);
        }
    }

    async loadVideo(filePath) {
        if (!this.sharedVideoElement) {
            console.error('Shared video element not initialized');
            return;
        }

        try {
            // Exit VR mode if currently in VR mode
            if (this.isVRMode) {
                this.exitVRMode();
            }

            // Reset VR states to default values when opening a new file
            this.isVRMode = false;
            this.isVrAutoDetected = false;
            this.vrFov = '180'; // Default to 180 degree
            this.vrFormat = 'mono'; // Default to mono format

            // Reset VR zoom to default
            this.currentVRScale = this.settings.vrZoomLevel / 100;

            // Reset camera rotation to default
            this.resetVRView();

            // Update VR mode selection UI to reflect default values
            this.updateVRModeSelection();

            this.currentVideo = filePath;
            this.sharedVideoElement.src = `file://${filePath}`;

            const vrDetectionResult = await this.detectVRVideo(filePath);

            if (vrDetectionResult.isVR) {
                this.isVrAutoDetected = true;
                this.vrFov = vrDetectionResult.fov;
                this.vrFormat = vrDetectionResult.format;

                this.updateVRModeSelection();

                if (!this.isVRMode) {
                    this.enterVRMode();
                } else {
                    this.updateVRModeGeometry();
                }
            }

            this.sharedVideoElement.addEventListener('loadedmetadata', () => {
                if (!vrDetectionResult.isVR) {
                    this.detectVRVideo(filePath).then(result => {
                        if (result.isVR) {
                            this.isVrAutoDetected = true;
                            this.vrFov = result.fov;
                            this.vrFormat = result.format;
                            this.updateVRModeSelection();

                            if (!this.isVRMode) {
                                this.enterVRMode();
                            } else {
                                this.updateVRModeGeometry();
                            }
                        }
                    });
                }
            }, { once: true });

            if (this.isVRMode) {
                this.updateVRVideoSource();
            }

            this.showVideoPlayer();
            this.addToPlaylist(filePath);

            // Hide playlist when loading a new video
            this.hidePlaylist();

            this.play();

        } catch (error) {
            console.error('Error loading video:', error);
        }
    }

    loadVideoFolder(files) {
        // Exit VR mode if currently in VR mode
        if (this.isVRMode) {
            this.exitVRMode();
        }

        // Reset VR states to default values when loading a folder
        this.isVRMode = false;
        this.isVrAutoDetected = false;
        this.vrFov = '180'; // Default to 180 degree
        this.vrFormat = 'mono'; // Default to mono format

        // Reset VR zoom to default
        this.currentVRScale = this.settings.vrZoomLevel / 100;

        // Reset camera rotation to default
        this.resetVRView();

        // Update VR mode selection UI to reflect default values
        this.updateVRModeSelection();

        this.videoList = files;
        this.currentIndex = 0;

        if (files.length > 0) {
            this.loadVideo(files[0]);
            // Hide playlist when loading a folder
            this.hidePlaylist();
        }
    }

    showVideoPlayer() {
        document.getElementById('video-placeholder').style.display = 'none';
        document.getElementById('video-player').style.display = 'block';
    }

    showPlaceholder() {
        document.getElementById('video-placeholder').style.display = 'flex';
        document.getElementById('video-player').style.display = 'none';
    }

    togglePlayPause() {
        if (!this.sharedVideoElement) {
            console.error('Shared video element not initialized');
            return;
        }

        try {
            if (this.sharedVideoElement.paused) {
                this.play();
            } else {
                this.pause();
            }
        } catch (error) {
            console.error('Error toggling play state:', error);
        }
    }

    play() {
        if (!this.sharedVideoElement) {
            console.error('Shared video element not initialized');
            return;
        }

        try {
            const playPromise = this.sharedVideoElement.play();
            if (playPromise) {
                playPromise.then(() => {
                    console.log('Video playback started');
                    this.isPlaying = true;
                    this.updatePlayButton();
                }).catch(err => {
                    console.error('Video playback failed:', err);
                    this.isPlaying = false;
                    this.updatePlayButton();
                });
            } else {
                this.isPlaying = true;
                this.updatePlayButton();
            }
        } catch (error) {
            console.error('Error playing video:', error);
            this.isPlaying = false;
            this.updatePlayButton();
        }
    }

    pause() {
        if (!this.sharedVideoElement) {
            console.error('Shared video element not initialized');
            return;
        }

        try {
            this.sharedVideoElement.pause();
            this.isPlaying = false;
            this.updatePlayButton();
        } catch (error) {
            console.error('Error pausing video:', error);
        }
    }

    stop() {
        if (!this.sharedVideoElement) {
            console.error('Shared video element not initialized');
            return;
        }

        try {
            this.sharedVideoElement.pause();
            this.sharedVideoElement.currentTime = 0;
            this.isPlaying = false;

            // Reset VR states to default values when stopping video
            this.isVrAutoDetected = false;
            this.vrFov = '180'; // Default to 180 degree
            this.vrFormat = 'mono'; // Default to mono format

            // Reset VR zoom to default
            this.currentVRScale = this.settings.vrZoomLevel / 100;

            // Update VR mode selection UI to reflect default values
            this.updateVRModeSelection();

            this.updatePlayButton();
            this.updateProgress();

            this.showPlaceholder();

            if (this.isVRMode) {
                this.exitVRMode();
            }

        } catch (error) {
            console.error('Error stopping video:', error);
        }
    }

    seek(value) {
        if (!this.sharedVideoElement) {
            console.error('Shared video element not initialized');
            return;
        }

        if (this.sharedVideoElement.duration) {
            const newTime = (value / 100) * this.sharedVideoElement.duration;
            this.sharedVideoElement.currentTime = newTime;
        }
    }

    seekRelative(seconds) {
        if (!this.sharedVideoElement) {
            console.error('Shared video element not initialized');
            return;
        }

        this.sharedVideoElement.currentTime += seconds;
    }

    adjustVolume(delta) {
        if (!this.sharedVideoElement) {
            console.error('Shared video element not initialized');
            return;
        }

        const newVolume = Math.max(0, Math.min(1, this.sharedVideoElement.volume + delta));
        this.sharedVideoElement.volume = newVolume;
        this.updateVolumeDisplay();

        // Show volume notification
        const volumePercent = Math.round(newVolume * 100);
        const volumeText = window.i18n ? window.i18n.t('controls.volume') : 'Volume';
        this.showNotification(`${volumeText}: ${volumePercent}%`, 'info', 1500);
    }

    toggleMute() {
        if (!this.sharedVideoElement) {
            console.error('Shared video element not initialized');
            return;
        }

        this.sharedVideoElement.muted = !this.sharedVideoElement.muted;
        this.updateVolumeDisplay();

        // Show mute/unmute notification
        const isMuted = this.sharedVideoElement.muted;
        const muteText = window.i18n ? window.i18n.t('controls.mute') : 'Mute';
        const unmuteText = window.i18n ? window.i18n.t('controls.unmute') : 'Unmute';
        const notificationText = isMuted ? muteText : unmuteText;
        this.showNotification(notificationText, 'info', 1500);
    }

    updateVolumeDisplay() {
        if (!this.sharedVideoElement) return;

        const volumeBtn = document.getElementById('volume-btn');

        if (volumeBtn) {
            if (this.sharedVideoElement.muted || this.sharedVideoElement.volume === 0) {
                volumeBtn.classList.add('muted');
                volumeBtn.innerHTML = `
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12,4L9.91,6.09L12,8.18M4.27,3L3,4.27L7.73,9H3V15H7L12,20V13.27L16.25,17.53C15.58,18.04 14.83,18.46 14,18.7V20.77C15.38,20.45 16.63,19.82 17.68,18.96L19.73,21L21,19.73L12,10.73M19,12C19,12.94 18.8,13.82 18.46,14.64L19.97,16.15C20.62,14.91 21,13.5 21,12C21,7.72 18,4.14 14,3.23V5.29C16.89,6.15 19,8.83 19,12M16.5,12C16.5,10.23 15.5,8.71 14,7.97V10.18L16.45,12.63C16.5,12.43 16.5,12.21 16.5,12Z"/>
                    </svg>
                `;
            } else {
                volumeBtn.classList.remove('muted');
                volumeBtn.innerHTML = `
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M14,3.23V5.29C16.89,6.15 19,8.83 19,12C19,15.17 16.89,17.85 14,18.71V20.77C18.01,19.86 21,16.28 21,12C21,7.72 18.01,4.14 14,3.23M16.5,12C16.5,10.23 15.5,8.71 14,7.97V16C15.5,15.29 16.5,13.76 16.5,12M3,9V15H7L12,20V4L7,9H3Z"/>
                    </svg>
                `;
            }
        }
    }

    toggleFullscreen() {
        let container;
        if (this.isVRMode) {
            container = document.getElementById('vr-scene');
        } else {
            container = document.getElementById('video-container');
        }

        if (!document.fullscreenElement) {
            container.requestFullscreen().catch(err => {
                console.error('Cannot enter fullscreen mode:', err);
            });
        } else {
            document.exitFullscreen().catch(err => {
                console.error('Cannot exit fullscreen mode:', err);
            });
        }
    }

    handleFullscreenChange() {
        const isFullscreen = !!(document.fullscreenElement ||
            document.webkitFullscreenElement ||
            document.mozFullScreenElement ||
            document.msFullscreenElement);

        this.isFullscreen = isFullscreen;

        if (this.isVRMode) {
            const vrScene = document.getElementById('vr-scene');
            const aScene = document.querySelector('a-scene');

            if (isFullscreen) {
                console.log('VR mode entering fullscreen');
                // Force recalculate VR scene size
                if (vrScene) {
                    vrScene.style.width = '100vw';
                    vrScene.style.height = '100vh';
                    vrScene.style.position = 'fixed';
                    vrScene.style.top = '0';
                    vrScene.style.left = '0';
                    vrScene.style.zIndex = '1000';
                }

                // Recalculate A-Frame scene size
                if (aScene && aScene.renderer) {
                    setTimeout(() => {
                        aScene.renderer.setSize(window.innerWidth, window.innerHeight);
                        aScene.renderer.render(aScene.object3D, aScene.camera);
                        console.log('A-Frame scene size recalculated');
                    }, 100);
                }
            } else {
                console.log('VR mode exiting fullscreen');
                // Restore VR scene size
                if (vrScene) {
                    vrScene.style.width = '100vw';
                    vrScene.style.height = '100vh';
                    vrScene.style.position = 'fixed';
                    vrScene.style.top = '0';
                    vrScene.style.left = '0';
                    vrScene.style.zIndex = '1000';
                }

                // Recalculate A-Frame scene size
                if (aScene && aScene.renderer) {
                    setTimeout(() => {
                        aScene.renderer.setSize(window.innerWidth, window.innerHeight);
                        aScene.renderer.render(aScene.object3D, aScene.camera);
                        console.log('A-Frame scene size recalculated');
                    }, 100);
                }
            }

            // Trigger window resize event
            window.dispatchEvent(new Event('resize'));
        } else {
            // Handle normal video mode fullscreen changes
            if (isFullscreen) {
                console.log('Normal video mode entering fullscreen');
                // Enter fullscreen
                document.body.style.overflow = 'hidden';

                // Make video container fill screen
                const videoContainer = document.getElementById('video-container');
                if (videoContainer) {
                    videoContainer.style.position = 'fixed';
                    videoContainer.style.top = '0';
                    videoContainer.style.left = '0';
                    videoContainer.style.width = '100vw';
                    videoContainer.style.height = '100vh';
                    videoContainer.style.zIndex = '9999';
                    videoContainer.style.background = '#000';
                }

                // Hide toolbar
                const toolbar = document.querySelector('.toolbar');
                if (toolbar) {
                    toolbar.style.display = 'none';
                }

                // Hide playlist
                const fileList = document.getElementById('file-list');
                if (fileList) {
                    fileList.style.display = 'none';
                }

                // Hide settings panel
                const settingsPanel = document.getElementById('settings-panel');
                if (settingsPanel) {
                    settingsPanel.style.display = 'none';
                }

                // Adjust video controls position (non-VR mode only)
                const videoControls = document.getElementById('video-controls');
                if (videoControls && !this.isVRMode) {
                    videoControls.classList.add('fullscreen-controls');
                }

                // Reset control bar position when entering fullscreen
                this.resetControlBarPosition();

                // Start auto-hide controls
                this.startControlsAutoHide();

            } else {
                console.log('Normal video mode exiting fullscreen');
                // Exit fullscreen
                document.body.style.overflow = 'auto';

                // Restore video container
                const videoContainer = document.getElementById('video-container');
                if (videoContainer) {
                    videoContainer.style.position = 'relative';
                    videoContainer.style.top = 'auto';
                    videoContainer.style.left = 'auto';
                    videoContainer.style.width = 'auto';
                    videoContainer.style.height = 'auto';
                    videoContainer.style.zIndex = 'auto';
                    videoContainer.style.background = '#000';
                }

                // Show toolbar
                const toolbar = document.querySelector('.toolbar');
                if (toolbar) {
                    toolbar.style.display = 'flex';
                }

                // Restore video controls position (non-VR mode only)
                const videoControls = document.getElementById('video-controls');
                if (videoControls && !this.isVRMode) {
                    videoControls.classList.remove('fullscreen-controls');
                    videoControls.classList.remove('hidden');
                }

                // Reset control bar position when exiting fullscreen
                this.resetControlBarPosition();

                // Stop auto-hide and show controls
                this.stopControlsAutoHide();
                this.showControls();
            }
        }
    }

    startControlsAutoHide() {
        if (!this.isFullscreen && !this.isVRMode) return;

        this.clearControlsHideTimer();

        this.showControls();

        this.controlsHideTimer = setTimeout(() => {
            this.hideControls();
        }, this.controlsHideDelay);
    }

    stopControlsAutoHide() {
        this.clearControlsHideTimer();
    }

    clearControlsHideTimer() {
        if (this.controlsHideTimer) {
            clearTimeout(this.controlsHideTimer);
            this.controlsHideTimer = null;
        }
    }

    showControls() {
        const videoControls = document.getElementById('video-controls');
        if (videoControls) {
            if (this.isVRMode) {
                videoControls.style.opacity = '1';
                videoControls.style.visibility = 'visible';
                videoControls.style.pointerEvents = 'auto';
                this.controlsVisible = true;
            } else {
                videoControls.classList.remove('hidden');
                this.controlsVisible = true;
            }
        }

        if (this.isFullscreen && !this.isVRMode) {
            document.body.style.cursor = 'default';
        } else if (this.isVRMode && !this.settings.mouseTracking) {
            document.body.style.cursor = 'default';
        }
    }

    hideControls() {
        if (!this.isFullscreen && !this.isVRMode) return;

        const videoControls = document.getElementById('video-controls');
        if (videoControls) {
            if (this.isVRMode) {
                videoControls.style.opacity = '0';
                this.controlsVisible = false;
            } else {
                videoControls.classList.add('hidden');
                this.controlsVisible = false;
            }
        }

        if (this.isFullscreen && !this.isVRMode) {
            document.body.style.cursor = 'none';
        } else if (this.isVRMode && this.settings.mouseTracking) {
            document.body.style.cursor = 'none';
        }
    }

    // Handle mouse move events
    handleMouseMove(e) {
        if (!this.isFullscreen && !this.isVRMode) return;

        // In VR mode with mouse tracking enabled, don't restart auto-hide timer
        // because mouse movement is used for camera control, not UI interaction
        if (this.isVRMode && this.settings.mouseTracking) {
            return;
        }

        // Debounce mechanism to avoid frequent timer resets
        const now = Date.now();
        if (this.lastMouseMoveTime && now - this.lastMouseMoveTime < 100) {
            return; // Ignore move events within 100ms
        }
        this.lastMouseMoveTime = now;

        // Limit debug output frequency to avoid console spam
        if (!this.lastMouseMoveLog || now - this.lastMouseMoveLog > 1000) {
            console.log('Mouse move event (valid)', { isFullscreen: this.isFullscreen, isVRMode: this.isVRMode });
            this.lastMouseMoveLog = now;
        }

        // Restart auto-hide timer
        this.startControlsAutoHide();
    }

    handleMouseInteraction(e) {
        if (e.button === 4) {
            e.preventDefault();
            this.seekRelative(-10);
            console.log('Mouse back button: seeking backward 10 seconds');
            return;
        }
        if (e.button === 3) {
            e.preventDefault();
            this.seekRelative(10);
            console.log('Mouse forward button: seeking forward 10 seconds');
            return;
        }

        if (!this.isFullscreen && !this.isVRMode) return;

        // In VR mode with mouse tracking enabled, only restart auto-hide timer
        // for left click (button 0) as it's used for UI interaction
        if (this.isVRMode && this.settings.mouseTracking && e.button !== 0) {
            return;
        }

        this.startControlsAutoHide();
    }

    handleKeyInteraction(e) {
        if (!this.isFullscreen && !this.isVRMode) return;

        this.startControlsAutoHide();
    }

    handlePointerLockChange() {
        const isPointerLocked = document.pointerLockElement !== null;

        if (this.isVRMode && this.settings.mouseTracking && !isPointerLocked) {
            console.log('Pointer lock exited, disabling mouse tracking');
            this.settings.mouseTracking = false;
            this.saveSettings();
            const message = window.i18n ? window.i18n.t('messages.mouse_tracking_disabled') : 'Mouse tracking: disabled';
            this.showNotification(message, 'warning');

            const vrScene = document.getElementById('vr-scene');
            if (vrScene) {
                vrScene.style.cursor = 'default';
            }

            const videoControls = document.getElementById('video-controls');
            if (videoControls) {
                if (this.vrControlsMouseEnter) {
                    videoControls.removeEventListener('mouseenter', this.vrControlsMouseEnter);
                }
                if (this.vrControlsMouseLeave) {
                    videoControls.removeEventListener('mouseleave', this.vrControlsMouseLeave);
                }

                this.vrControlsMouseEnter = () => {
                    this.stopControlsAutoHide();
                };
                this.vrControlsMouseLeave = () => {
                    this.startControlsAutoHide();
                };

                videoControls.addEventListener('mouseenter', this.vrControlsMouseEnter);
                videoControls.addEventListener('mouseleave', this.vrControlsMouseLeave);

                this.startControlsAutoHide();
            }
        }
    }

    toggleVRMode() {
        if (this.isVRMode) {
            this.exitVRMode();
        } else {
            this.enterVRMode();
        }
    }

    enterVRMode() {
        document.body.classList.add('vr-mode');
        this.isVRMode = true;

        this.settings.mouseTracking = false;
        this.toggleMouseTracking();

        this.hideMainInterface();

        const vrScene = document.getElementById('vr-scene');
        if (vrScene) {
            vrScene.style.display = 'block';
            vrScene.offsetHeight;
        }

        if (!window.vrScene) {
            initVRMode();
        }

        this.setupVRControls();

        // Reset control bar position when entering VR mode
        this.resetControlBarPosition();

        window.lastMouseX = 0;
        window.lastMouseY = 0;
        window.isFirstMove = true;

        bindMouseEvents();

        this.updateVRButtonStates(true);

        this.updateVRVideoSource();
        this.setupVRScene();

        const scene = document.querySelector('a-scene');
        if (scene && !scene.isPlaying) {
            scene.play();
        }

        if (scene && scene.renderer) {
            scene.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
            scene.renderer.setSize(window.innerWidth, window.innerHeight);
            scene.renderer.shadowMap.enabled = false;
            scene.renderer.shadowMap.type = 0;
        }

        this.enableHardwareAcceleration();

        setTimeout(() => {
            if (scene && scene.renderer) {
                scene.renderer.render(scene.object3D, scene.camera);
                window.dispatchEvent(new Event('resize'));
            }
            this.updateProgress();
        }, 100);

        this.currentVRScale = this.settings.vrZoomLevel / 100;
        this.updateVRScale(this.currentVRScale);

        this.showVRModeNotification();
        this.updateVRModeStatus();

        // Update VR mode selection in settings panel
        this.updateVRModeSelection();

        // Update VR settings visibility if settings panel is open
        const vrSettingsGroup = document.getElementById('vr-settings-group');
        if (vrSettingsGroup) {
            vrSettingsGroup.style.display = 'block';
        }

        setTimeout(() => {
            this.updateProgress();
            if (this.settings.showPlaylist && this.videoList.length > 0) {
                this.updateVRPlaylist();
            }
            this.centerOnLeftEye(false);
        }, 200);
    }

    hideMainInterface() {
        const elements = ['video-container', 'file-list', 'settings-panel'];
        elements.forEach(id => {
            const element = document.getElementById(id);
            if (element) element.style.display = 'none';
        });
    }

    setupVRControls() {
        const videoControls = document.getElementById('video-controls');
        const vrControlsContainer = document.getElementById('vr-controls-container');
        const vrScene = document.getElementById('vr-scene');

        if (videoControls && vrControlsContainer) {
            vrControlsContainer.appendChild(videoControls);

            videoControls.style.display = 'block';
            videoControls.style.visibility = 'visible';
            videoControls.style.pointerEvents = 'auto';
            videoControls.style.opacity = '1';
            videoControls.style.transition = 'opacity 0.3s ease';

            this.vrControlsMouseEnter = () => {
                if (this.settings.mouseTracking) {
                    videoControls.style.opacity = '1';
                    this.stopControlsAutoHide();
                } else {
                    this.stopControlsAutoHide();
                }
            };

            this.vrControlsMouseLeave = () => {
                if (this.settings.mouseTracking) {
                    videoControls.style.opacity = this.controlsVisible ? '1' : '0';
                }
                this.startControlsAutoHide();
            };

            videoControls.addEventListener('mouseenter', this.vrControlsMouseEnter);
            videoControls.addEventListener('mouseleave', this.vrControlsMouseLeave);

            if (vrScene) {
                vrScene.style.cursor = this.settings.mouseTracking ? 'none' : 'default';
            }

            this.startControlsAutoHide();
        }
    }

    updateVRButtonStates(isActive) {
        const vrBtn = document.getElementById('vr-btn');
        const exitVrBtn = document.getElementById('exit-vr-btn');

        if (vrBtn) {
            vrBtn.classList.toggle('vr-active', isActive);
        }
        if (exitVrBtn) {
            exitVrBtn.classList.toggle('vr-active', isActive);
        }
    }

    updateVRVideoSource() {
        if (!this.sharedVideoElement) {
            console.error('Shared video element not initialized');
            return;
        }
    }

    showVRModeNotification() {
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 60px;
            right: 20px;
            background: rgba(0, 0, 0, 0.9);
            color: white;
            padding: 20px 30px;
            border-radius: 10px;
            font-size: 16px;
            z-index: 10000;
            text-align: center;
        `;

        const formatText = window.i18n ? window.i18n.t(`settings.vr_format_${this.vrFormat}`) : this.vrFormat.toUpperCase();
        const controlsHelp = window.i18n ? window.i18n.t('messages.vr_controls_help') : 'ESC Exit | Enter Fullscreen | T Tracking | B Toggle 180/360° | V Toggle Format | Mouse Wheel Zoom';

        if (this.isVrAutoDetected) {
            const autoDetectedText = window.i18n ? window.i18n.t('messages.vr_auto_detected') : '🎯 VR video detected, automatically entered VR mode (mono display)';
            notification.innerHTML = `
                <div>${autoDetectedText}</div>
                <div style="font-size: 12px; margin-top: 10px; opacity: 0.5;">
                    ${controlsHelp}
                </div>
            `;
        } else {
            notification.innerHTML = `
                <div>VR ${window.i18n ? window.i18n.t(`messages.fov_${this.vrFov}`) : `${this.vrFov}°`} (${formatText})</div>
                <div style="font-size: 12px; margin-top: 10px; opacity: 0.5;">
                    ${controlsHelp}
                </div>
            `;
        }

        document.body.appendChild(notification);

        // Auto-remove after 3 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 3000);
    }

    exitVRMode() {
        document.body.classList.remove('vr-mode');
        this.isVRMode = false;

        // Reset VR zoom to default
        this.currentVRScale = this.settings.vrZoomLevel / 100;

        this.stopControlsAutoHide();

        const videoContainer = document.getElementById('video-container');
        if (videoContainer) {
            videoContainer.style.display = 'block';
        }

        const vrScene = document.getElementById('vr-scene');
        if (vrScene) {
            vrScene.style.display = 'none';
        }

        this.restoreNormalControls();

        // Reset control bar position when exiting VR mode
        this.resetControlBarPosition();

        if (document.pointerLockElement && document.exitPointerLock) {
            document.exitPointerLock();
        }

        this.updateVRButtonStates(false);

        // Hide VR settings if settings panel is open
        const vrSettingsGroup = document.getElementById('vr-settings-group');
        if (vrSettingsGroup) {
            vrSettingsGroup.style.display = 'none';
        }

        if (this.settings.showPlaylist && this.videoList.length > 0) {
            this.updatePlaylist();
        }
    }

    restoreNormalControls() {
        const videoControls = document.getElementById('video-controls');
        const videoPlayer = document.getElementById('video-player');

        if (videoControls && videoPlayer) {
            videoPlayer.appendChild(videoControls);

            videoControls.style.opacity = '';
            videoControls.style.transition = '';
            videoControls.style.visibility = '';
            videoControls.style.pointerEvents = '';
            videoControls.style.display = '';

            if (this.vrControlsMouseEnter) {
                videoControls.removeEventListener('mouseenter', this.vrControlsMouseEnter);
            }
            if (this.vrControlsMouseLeave) {
                videoControls.removeEventListener('mouseleave', this.vrControlsMouseLeave);
            }
        }
    }



    setupVRScene() {
        try {
            const scene = document.querySelector('a-scene');

            if (!scene) {
                console.error('A-Frame scene not found');
                return;
            }

            if (!scene.isPlaying) {
                scene.play();
            }

            if (scene.renderer) {
                scene.renderer.setPixelRatio(window.devicePixelRatio);
                scene.renderer.setSize(window.innerWidth, window.innerHeight);
                scene.renderer.capabilities.isWebGL2 = true;
                scene.renderer.shadowMap.enabled = false;
                scene.renderer.shadowMap.type = 0;
            }

            if (scene.hasLoaded) {
                this.checkVideosphere();
            } else {
                scene.addEventListener('loaded', () => {
                    this.checkVideosphere();
                });
            }

            setTimeout(() => {
                if (scene && scene.renderer) {
                    scene.renderer.render(scene.object3D, scene.camera);
                }
            }, 50);

        } catch (error) {
            console.error('Error setting up VR scene:', error);
        }
    }

    checkVideosphere() {
        const videosphere = document.querySelector('a-videosphere');

        if (videosphere && this.sharedVideoElement) {
            videosphere.setAttribute('src', '#video-element');

            if (this.settings.loop) {
                this.sharedVideoElement.loop = true;
            }

            this.updateVRModeGeometry();

            videosphere.addEventListener('materialtextureloaded', () => {
                this.applyVRFormat(videosphere);
            });

            setTimeout(() => {
                this.applyVRFormat(videosphere);
            }, 200);
        }
    }

    applyVRFormat(videosphere) {
        try {
            const mesh = videosphere.getObject3D('mesh');
            if (mesh && mesh.material && mesh.material.map) {
                switch (this.vrFormat) {
                    case 'mono':
                        mesh.material.map.repeat.set(1, 1);
                        mesh.material.map.offset.set(0, 0);
                        break;
                    case 'sbs':
                        mesh.material.map.repeat.set(0.5, 1);
                        mesh.material.map.offset.set(0, 0);
                        break;
                    case 'tb':
                        mesh.material.map.repeat.set(1, 0.5);
                        mesh.material.map.offset.set(0, 0);
                        break;
                }
                mesh.material.map.needsUpdate = true;
                console.log(`${this.vrFormat} format texture mapping applied`);
            } else {
                console.log('Texture not ready yet, VR format will be applied later');
            }
        } catch (error) {
            console.error('Error applying VR format:', error);
        }
    }

    enableHardwareAcceleration() {
        try {
            const scene = document.querySelector('a-scene');
            if (scene && scene.renderer) {
                scene.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
                scene.renderer.setSize(window.innerWidth, window.innerHeight);
                scene.renderer.shadowMap.enabled = false;
                scene.renderer.shadowMap.type = 0;
            }

            const vrVideoAsset = document.getElementById('vr-video-asset');
            if (vrVideoAsset) {
                vrVideoAsset.style.transform = 'translateZ(0)';
                vrVideoAsset.style.willChange = 'transform';
            }
        } catch (error) {
            console.error('Error enabling hardware acceleration:', error);
        }
    }

    toggleSettings() {
        const settingsPanel = document.getElementById('settings-panel');
        const isVisible = settingsPanel.style.display !== 'none';

        if (isVisible) {
            this.hideSettings();
        } else {
            this.showSettings();
        }
    }

    showSettings() {
        const settingsPanel = document.getElementById('settings-panel');
        const vrSettingsGroup = document.getElementById('vr-settings-group');

        settingsPanel.style.display = 'block';
        settingsPanel.classList.add('fade-in');

        // Show VR settings only in VR mode
        if (vrSettingsGroup) {
            vrSettingsGroup.style.display = this.isVRMode ? 'block' : 'none';
        }

        // Update VR zoom display when showing settings
        this.updateVRZoomDisplay();

        // Update VR mode selection to reflect current state
        this.updateVRModeSelection();

        // Add outside click event
        setTimeout(() => {
            document.addEventListener('click', this.handleOutsideClick);
        }, 100);

        // Update slider value displays
        this.updateSliderValueDisplays();
    }

    hideSettings() {
        const settingsPanel = document.getElementById('settings-panel');
        settingsPanel.style.display = 'none';

        // Remove outside click event
        document.removeEventListener('click', this.handleOutsideClick);
    }

    handleOutsideClick = (e) => {
        const settingsPanel = document.getElementById('settings-panel');
        const settingsBtn = document.getElementById('settings-btn');
        const fileList = document.getElementById('file-list');
        const vrFileList = document.getElementById('vr-file-list');
        const playlistBtn = document.getElementById('playlist-btn');

        // If clicked outside settings panel and not settings button, hide settings panel
        if (!settingsPanel.contains(e.target) && !settingsBtn.contains(e.target)) {
            this.hideSettings();
        }

        // If clicked outside playlist and not playlist button, hide playlist
        const isClickInsidePlaylist = (fileList && fileList.contains(e.target)) ||
            (vrFileList && vrFileList.contains(e.target));
        const isClickPlaylistButton = (playlistBtn && playlistBtn.contains(e.target));

        // Check if playlist is visible
        const isPlaylistVisible = (fileList && fileList.style.display !== 'none') ||
            (vrFileList && vrFileList.style.display !== 'none');

        if (!isClickInsidePlaylist && !isClickPlaylistButton && isPlaylistVisible) {
            this.hidePlaylist();
        }
    }

    updateSetting(key, value) {
        this.settings[key] = value;
        this.saveSettings();

        // Only apply settings that affect video playback or theme
        if (key === 'loop' || key === 'theme') {
            this.applySettings();
        }
    }

    applySettings() {
        if (!this.sharedVideoElement) {
            return;
        }

        // Apply loop setting
        this.sharedVideoElement.loop = this.settings.loop;

        // Apply theme setting
        this.applyTheme(this.settings.theme);
    }

    applyTheme(theme) {
        const body = document.body;

        // Remove existing theme classes
        body.classList.remove('dark-theme', 'light-theme');

        switch (theme) {
            case 'dark':
                body.classList.add('dark-theme');
                break;
            case 'light':
                // Light theme is the default, no additional class needed
                break;
            case 'system':
                // Follow system theme
                this.followSystemTheme();
                break;
        }
    }

    async followSystemTheme() {
        try {
            // Check if we're on Mac and can detect system theme
            const shouldUseDarkColors = await ipcRenderer.invoke('get-system-theme');
            const body = document.body;

            if (shouldUseDarkColors) {
                body.classList.add('dark-theme');
            } else {
                body.classList.remove('dark-theme');
            }
        } catch (error) {
            console.error('Failed to get system theme:', error);
            // Fallback to light theme
            document.body.classList.remove('dark-theme');
        }
    }

    loadSettings() {
        const saved = localStorage.getItem('vrPlayerSettings');
        if (saved) {
            const savedSettings = JSON.parse(saved);
            this.settings = { ...this.settings, ...savedSettings };

            // Handle legacy mouseSensitivity values (convert from 0-1 range to 0-100 range)
            if (savedSettings.mouseSensitivity !== undefined) {
                if (savedSettings.mouseSensitivity <= 1.0) {
                    // Old format: 0-1 range, convert to 0-100 range (0.5 = 100)
                    this.settings.vrViewSensitivity = Math.round((savedSettings.mouseSensitivity / 0.5) * 100);
                    console.log(`Converted legacy sensitivity: ${savedSettings.mouseSensitivity} -> ${this.settings.vrViewSensitivity}`);
                }
            }
        }

        // Update UI
        document.getElementById('loop').checked = this.settings.loop;

        // Set mouse sensitivity value
        const mouseSensitivity = document.getElementById('mouse-sensitivity');
        if (mouseSensitivity) {
            mouseSensitivity.value = this.settings.vrViewSensitivity;
        }

        // Set VR zoom sensitivity value
        const vrZoomLevel = document.getElementById('vr-zoom-sensitivity');
        if (vrZoomLevel) {
            vrZoomLevel.value = this.settings.vrZoomLevel;
        }

        // VR format is not persisted, so we don't set it from saved settings

        // Set theme select value
        const themeSelect = document.getElementById('theme-select');
        if (themeSelect) {
            themeSelect.value = this.settings.theme;
        }

        // Set language select value
        const languageSelect = document.getElementById('language-select');
        if (languageSelect) {
            languageSelect.value = this.settings.language;
        }

        // Set playlist default to closed
        if (this.settings.showPlaylist === undefined) {
            this.settings.showPlaylist = false;
        }

        // Initialize button states
        this.updateButtonStates();

        // Update slider value displays
        this.updateSliderValueDisplays();
    }

    // Update button states
    updateButtonStates() {
        const playlistBtn = document.getElementById('playlist-btn');
        const vrBtn = document.getElementById('vr-btn');
        const exitVrBtn = document.getElementById('exit-vr-btn');

        if (playlistBtn) {
            if (this.settings.showPlaylist) {
                playlistBtn.classList.add('playlist-active');
            } else {
                playlistBtn.classList.remove('playlist-active');
            }
        }

        if (vrBtn) {
            if (this.isVRMode) {
                vrBtn.classList.add('vr-active');
            } else {
                vrBtn.classList.remove('vr-active');
            }
        }
        if (exitVrBtn) {
            if (this.isVRMode) {
                exitVrBtn.classList.add('vr-active');
            } else {
                exitVrBtn.classList.remove('vr-active');
            }
        }
    }

    saveSettings() {
        const settingsToSave = {
            ...this.settings
        };
        localStorage.setItem('vrPlayerSettings', JSON.stringify(settingsToSave));
    }

    switchLanguage(language) {
        // Wait for i18n to be initialized
        if (window.i18n) {
            window.i18n.switchLanguage(language);
        }
    }

    onLanguageChanged(language) {
        // Update VR mode status text
        this.updateVRModeStatus();

        // Update language dropdown
        const languageSelect = document.getElementById('language-select');
        if (languageSelect) {
            languageSelect.value = language;
        }

        // Update VR mode selection to reflect current state
        this.updateVRModeSelection();

        // Update volume display for muted state
        this.updateVolumeDisplay();

        // Update any dynamic content that may need refreshing
        this.updatePlaylist();
        this.updateVRPlaylist();

        // Update slider value displays
        this.updateSliderValueDisplays();
    }

    addToPlaylist(filePath) {
        if (!this.videoList.includes(filePath)) {
            this.videoList.push(filePath);
            try {
                // Only update playlist display if it's currently visible
                if (this.settings.showPlaylist) {
                    this.updatePlaylist();
                    this.updateVRPlaylist();
                }
            } catch (error) {
                console.error('Error updating playlist:', error);
            }
        }
    }

    updatePlaylist() {
        const fileListContent = document.getElementById('file-list-content');
        const fileList = document.getElementById('file-list');

        if (!fileListContent || !fileList) {
            return;
        }

        if (this.videoList.length === 0) {
            fileList.style.display = 'none';
            return;
        }

        if (this.settings.showPlaylist) {
            fileList.style.display = 'block';
        }

        fileListContent.innerHTML = '';

        this.videoList.forEach((filePath, index) => {
            const fileName = filePath.split(/[\\/]/).pop();
            const fileItem = document.createElement('div');
            fileItem.className = `file-item ${index === this.currentIndex ? 'active' : ''}`;
            fileItem.innerHTML = `
                <div class="file-icon">🎬</div>
                <div class="file-info">
                    <div class="file-name">${fileName}</div>
                    <div class="file-duration">--:--</div>
                </div>
            `;

            fileItem.addEventListener('click', () => {
                this.currentIndex = index;
                this.loadVideo(filePath);
                this.updatePlaylist();
            });

            fileListContent.appendChild(fileItem);
        });
    }

    updateVRPlaylist() {
        const vrFileListContent = document.getElementById('vr-file-list-content');
        const vrFileList = document.getElementById('vr-file-list');

        if (!vrFileListContent || !vrFileList) {
            return;
        }

        if (this.videoList.length === 0) {
            vrFileList.style.display = 'none';
            return;
        }

        if (this.settings.showPlaylist) {
            vrFileList.style.display = 'block';
        }

        vrFileListContent.innerHTML = '';

        this.videoList.forEach((filePath, index) => {
            const fileName = filePath.split(/[\\/]/).pop();
            const fileItem = document.createElement('div');
            fileItem.className = `vr-file-item ${index === this.currentIndex ? 'active' : ''}`;
            fileItem.innerHTML = `
                <div class="vr-file-icon">🎬</div>
                <div class="vr-file-info">
                    <div class="vr-file-name">${fileName}</div>
                    <div class="vr-file-duration">--:--</div>
                </div>
            `;

            fileItem.addEventListener('click', () => {
                this.currentIndex = index;
                this.loadVideo(filePath);
                this.updateVRPlaylist();
                this.updatePlaylist();
            });

            vrFileListContent.appendChild(fileItem);
        });
    }

    clearPlaylist() {
        this.videoList = [];
        this.currentIndex = 0;
        this.currentVideo = null;

        // Exit VR mode if currently in VR mode
        if (this.isVRMode) {
            this.exitVRMode();
        }

        // Reset VR states to default values when clearing playlist
        this.isVRMode = false;
        this.isVrAutoDetected = false;
        this.vrFov = '180'; // Default to 180 degree
        this.vrFormat = 'mono'; // Default to mono format

        // Reset VR zoom to default
        this.currentVRScale = this.settings.vrZoomLevel / 100;

        // Reset camera rotation to default
        this.resetVRView();

        // Update VR mode selection UI to reflect default values
        this.updateVRModeSelection();

        this.updatePlaylist();
        this.updateVRPlaylist();
        this.showPlaceholder();
    }

    openFile() {
        // Trigger main process file selection dialog
        ipcRenderer.send('open-file-dialog');
    }

    openFolder() {
        // Trigger main process folder selection dialog
        ipcRenderer.send('open-folder-dialog');
    }

    updatePlayButton() {
        const buttons = [
            document.getElementById('play-pause-btn')
        ];

        buttons.forEach(btn => {
            if (btn) {
                if (this.isPlaying) {
                    btn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="white"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>';
                } else {
                    btn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>';
                }
            }
        });
    }

    updateProgress() {
        if (!this.sharedVideoElement) {
            return;
        }

        const progressBar = document.getElementById('progress-bar');
        const vrProgressBar = document.getElementById('vr-progress-bar');
        const currentTimeElement = document.getElementById('current-time');
        const totalTimeElement = document.getElementById('total-time');
        const vrTimeDisplay = document.getElementById('vr-time-display');

        if (this.sharedVideoElement.readyState >= 2) {
            const currentTime = this.sharedVideoElement.currentTime;
            const duration = this.sharedVideoElement.duration;

            if (!isNaN(currentTime) && !isNaN(duration) && duration > 0) {
                const percentage = (currentTime / duration) * 100;

                if (progressBar) {
                    progressBar.value = percentage;
                    progressBar.style.setProperty('--progress-value', percentage + '%');
                }
                if (vrProgressBar) {
                    vrProgressBar.value = percentage;
                }

                const currentTimeText = this.formatTime(currentTime);
                const totalTimeText = this.formatTime(duration);

                if (currentTimeElement) {
                    currentTimeElement.textContent = currentTimeText;
                }
                if (totalTimeElement) {
                    totalTimeElement.textContent = totalTimeText;
                }
                if (vrTimeDisplay) {
                    vrTimeDisplay.textContent = `${currentTimeText} / ${totalTimeText}`;
                }
            } else {
                if (progressBar) {
                    progressBar.value = 0;
                    progressBar.style.setProperty('--progress-value', '0%');
                }
                if (vrProgressBar) {
                    vrProgressBar.value = 0;
                }
                if (currentTimeElement) {
                    currentTimeElement.textContent = '00:00:00';
                }
                if (totalTimeElement) {
                    totalTimeElement.textContent = '00:00:00';
                }
                if (vrTimeDisplay) {
                    vrTimeDisplay.textContent = '00:00:00 / 00:00:00';
                }
            }
        }
    }

    formatTime(seconds) {
        if (typeof seconds !== 'number' || isNaN(seconds) || seconds < 0) {
            return '00:00:00';
        }

        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const remainingSeconds = Math.floor(seconds % 60);
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
    }

    onVideoLoaded() {
        this.updateProgress();
        this.updatePlaylist();
        this.updateVRPlaylist();
        this.updateVolumeDisplay();

        // Hide drag notification if it's still showing
        this.hideDragNotification();
    }

    onVideoEnded() {
        if (this.settings.loop) {
            this.play();
        } else if (this.videoList.length > 1) {
            this.playNext();
        }
    }

    onVideoError(e) {
        console.error('Video error:', e);
        alert('Video loading failed, please check if the file format is correct.');
    }

    playNext() {
        if (this.currentIndex < this.videoList.length - 1) {
            this.currentIndex++;

            // Exit VR mode if currently in VR mode
            if (this.isVRMode) {
                this.exitVRMode();
            }

            // Reset VR states to default values when playing next video
            this.isVRMode = false;
            this.isVrAutoDetected = false;
            this.vrFov = '180'; // Default to 180 degree
            this.vrFormat = 'mono'; // Default to mono format

            // Reset VR zoom to default
            this.currentVRScale = this.settings.vrZoomLevel / 100;

            // Reset camera rotation to default
            this.resetVRView();

            // Update VR mode selection UI to reflect default values
            this.updateVRModeSelection();

            this.loadVideo(this.videoList[this.currentIndex]);
        }
    }

    // playPrevious function removed - was unused

    updateUI() {
        this.updatePlayButton();
        this.updateProgress();
        this.updateVolumeDisplay();

        if (document.getElementById('loop')) {
            document.getElementById('loop').checked = this.settings.loop;
            document.getElementById('mouse-sensitivity').value = this.settings.vrViewSensitivity;
            document.getElementById('sensitivity-value').textContent = this.settings.vrViewSensitivity;
        }
    }

    /**
     * Detect VR video format
     * @param {string} filePath - video file path
     * @returns {Promise<Object>} - VR detection result
     */
    async detectVRVideo(filePath) {
        if (!window.VRDetector) {
            console.error('VRDetector not available');
            return { isVR: false, fov: '180', format: 'mono' };
        }

        try {
            const result = await window.VRDetector.detectVRVideo(filePath, this.sharedVideoElement);
            return result;
        } catch (error) {
            console.error('Error detecting VR video:', error);
            return { isVR: false, fov: '180', format: 'mono' };
        }
    }

    hidePlaylist() {
        const fileList = document.getElementById('file-list');
        const vrFileList = document.getElementById('vr-file-list');
        const playlistBtn = document.getElementById('playlist-btn');

        this.settings.showPlaylist = false;

        if (fileList) {
            fileList.style.display = 'none';
        }
        if (vrFileList) {
            vrFileList.style.display = 'none';
        }
        if (playlistBtn) {
            playlistBtn.classList.remove('playlist-active');
        }

        document.removeEventListener('click', this.handleOutsideClick);

        this.saveSettings();
    }

    togglePlaylist() {
        const fileList = document.getElementById('file-list');
        const vrFileList = document.getElementById('vr-file-list');
        const playlistBtn = document.getElementById('playlist-btn');

        const isVisible = (fileList && fileList.style.display !== 'none' && fileList.style.display !== '') ||
            (vrFileList && vrFileList.style.display !== 'none' && vrFileList.style.display !== '');

        if (isVisible) {
            this.hidePlaylist();
        } else {
            this.showPlaylist();
        }
    }

    showPlaylist() {
        const fileList = document.getElementById('file-list');
        const vrFileList = document.getElementById('vr-file-list');
        const playlistBtn = document.getElementById('playlist-btn');

        this.settings.showPlaylist = true;

        if (this.videoList.length > 0) {
            if (fileList) {
                fileList.style.display = 'block';
                fileList.classList.add('fade-in');
                this.updatePlaylist();
            }

            if (vrFileList) {
                vrFileList.style.display = 'none';
            }

            if (playlistBtn) {
                playlistBtn.classList.add('playlist-active');
            }

            setTimeout(() => {
                document.addEventListener('click', this.handleOutsideClick);
            }, 100);
        }

        this.saveSettings();
    }

    setupMouseWheelZoom() {
        const vrScene = document.getElementById('vr-scene');
        this.currentVRScale = 1.0;
        const minScale = 0.5;
        const maxScale = 4.0;

        vrScene.addEventListener('wheel', (e) => {
            if (this.isVRMode) {
                e.preventDefault();
                e.stopPropagation();

                const scaleStep = 0.1; // Fixed step size for mouse wheel

                if (e.deltaY > 0) {
                    this.currentVRScale = Math.max(minScale, this.currentVRScale - scaleStep);
                } else {
                    this.currentVRScale = Math.min(maxScale, this.currentVRScale + scaleStep);
                }

                this.updateVRScale(this.currentVRScale);
                const message = window.i18n ? window.i18n.t('messages.vr_zoom') : 'VR Zoom';
                this.showNotification(`${message}: ${this.currentVRScale.toFixed(1)}x`);
            }
        });

        document.addEventListener('wheel', (e) => {
            if (this.isVRMode) {
                e.preventDefault();
                e.stopPropagation();

                const scaleStep = 0.1; // Fixed step size for mouse wheel

                if (e.deltaY > 0) {
                    this.currentVRScale = Math.max(minScale, this.currentVRScale - scaleStep);
                } else {
                    this.currentVRScale = Math.min(maxScale, this.currentVRScale + scaleStep);
                }

                this.updateVRScale(this.currentVRScale);
                const message = window.i18n ? window.i18n.t('messages.vr_zoom') : 'VR Zoom';
                this.showNotification(`${message}: ${this.currentVRScale.toFixed(1)}x`);
            } else {
                e.preventDefault();
                e.stopPropagation();

                if (e.deltaY > 0) {
                    this.adjustVolume(-0.05);
                } else {
                    this.adjustVolume(0.05);
                }
            }
        }, { passive: false });

        const scene = document.querySelector('a-scene');
        if (scene) {
            scene.addEventListener('wheel', (e) => {
                if (this.isVRMode) {
                    e.preventDefault();
                    e.stopPropagation();

                    const scaleStep = 0.1; // Fixed step size for mouse wheel

                    if (e.deltaY > 0) {
                        this.currentVRScale = Math.max(minScale, this.currentVRScale - scaleStep);
                    } else {
                        this.currentVRScale = Math.min(maxScale, this.currentVRScale + scaleStep);
                    }

                    this.updateVRScale(this.currentVRScale);
                    const message = window.i18n ? window.i18n.t('messages.vr_zoom') : 'VR Zoom';
                    this.showNotification(`${message}: ${this.currentVRScale.toFixed(1)}x`);
                }
            });
        }
    }

    updateVRScale(scale) {
        const videosphere = document.querySelector('a-videosphere');
        const zoomLevel = document.getElementById('vr-zoom-level');
        const camera = document.querySelector('a-camera');

        if (videosphere && camera) {
            try {
                const baseFOV = 80;
                const newFOV = baseFOV / scale;
                camera.setAttribute('camera', `fov: ${newFOV}`);

                const baseDistance = 1.6;
                const newDistance = baseDistance / scale;
                camera.setAttribute('position', `0 ${newDistance} 0`);

                const baseRadius = 500;
                const newRadius = baseRadius * scale;

                if (this.vrFov === '180') {
                    videosphere.setAttribute('geometry', {
                        radius: newRadius,
                        phiLength: 180,
                        phiStart: -90,
                        thetaLength: 180,
                        thetaStart: 0
                    });
                } else {
                    videosphere.setAttribute('geometry', {
                        radius: newRadius,
                        phiLength: 360,
                        phiStart: 0,
                        thetaLength: 180,
                        thetaStart: 0
                    });
                }

                console.log(`VR zoom: ${scale}, FOV: ${newFOV}, distance: ${newDistance}, radius: ${newRadius}, mode: ${this.vrFov}°`);
            } catch (error) {
                console.error('Zoom setting failed:', error);
            }
        }

        if (zoomLevel) {
            zoomLevel.textContent = `${scale.toFixed(1)}x`;
        }

        // Update settings panel display if it's open
        if (document.getElementById('settings-panel')?.style.display === 'block') {
            this.updateVRZoomDisplay();
        }
    }

    adjustVRZoom(delta) {
        if (!this.isVRMode) return;

        // Get current scale if not initialized
        if (!this.currentVRScale) {
            this.currentVRScale = 1.0;
        }

        // Use fixed step size for mouse wheel
        const zoomStep = 0.1;

        const minScale = 0.5;
        const maxScale = 4.0;

        // Apply zoom adjustment
        this.currentVRScale += delta * zoomStep;
        this.currentVRScale = Math.max(minScale, Math.min(maxScale, this.currentVRScale));

        // Update the VR scale
        this.updateVRScale(this.currentVRScale);

        // Show zoom notification
        const message = window.i18n ? window.i18n.t('messages.vr_zoom') : 'VR Zoom';
        this.showNotification(`${message}: ${this.currentVRScale.toFixed(1)}x`);
    }

    adjustVRZoomByKeyboard(direction) {
        if (!this.isVRMode) return;

        // Initialize current scale value
        if (!this.currentVRScale) {
            this.currentVRScale = 1.0;
        }

        const minScale = 0.5;
        const maxScale = 4.0;
        const keyboardStep = 0.1; // Keyboard step set to 0.1x for fine control

        // Simple increase or decrease
        if (direction > 0) {
            this.currentVRScale = Math.min(maxScale, this.currentVRScale + keyboardStep);
        } else {
            this.currentVRScale = Math.max(minScale, this.currentVRScale - keyboardStep);
        }

        // Update the VR scale
        this.updateVRScale(this.currentVRScale);

        // Show zoom notification
        const message = window.i18n ? window.i18n.t('messages.vr_zoom') : 'VR Zoom';
        this.showNotification(`${message}: ${this.currentVRScale.toFixed(1)}x`);
    }

    // Update VR zoom display value in settings based on current scale
    updateVRZoomDisplay() {
        const vrZoomValue = document.getElementById('vr-zoom-value');
        const vrZoomSlider = document.getElementById('vr-zoom-sensitivity');

        if (vrZoomValue) {
            if (this.currentVRScale) {
                // Show actual current zoom level
                vrZoomValue.textContent = `${this.currentVRScale.toFixed(1)}x`;

                // Update slider to match current scale if needed
                if (vrZoomSlider) {
                    const sliderValue = Math.round(this.currentVRScale * 100);
                    if (parseInt(vrZoomSlider.value) !== sliderValue) {
                        vrZoomSlider.value = sliderValue;
                    }
                }
            } else {
                // Fallback to settings value
                const multiplier = this.settings.vrZoomLevel / 100;
                vrZoomValue.textContent = `${multiplier.toFixed(1)}x`;
            }
        }
    }

    // Update VR mode selection to reflect current state
    updateVRModeSelection() {
        const vrFovSelect = document.getElementById('vr-fov-select');
        const vrFormatSelect = document.getElementById('vr-format-select');

        if (vrFovSelect) {
            vrFovSelect.value = this.vrFov;
        }
        if (vrFormatSelect) {
            vrFormatSelect.value = this.vrFormat;
        }

        if (vrFormatSelect && !vrFormatSelect.hasEventListener) {
            vrFormatSelect.addEventListener('change', (e) => {
                this.vrFormat = e.target.value;
                if (this.isVRMode) {
                    this.updateVRModeGeometry();
                }
            });
            vrFormatSelect.hasEventListener = true;
        }
    }

    // Notification system
    showNotification(message, type = 'info', duration = 2000) {
        // Check for existing notification and update it instead of creating new one
        let statusElement = document.querySelector('.vr-notification');

        let borderColor;
        switch (type) {
            case 'success':
                borderColor = '#22c55e';
                break;
            case 'warning':
                borderColor = '#f59e0b';
                break;
            case 'error':
                borderColor = '#ef4444';
                break;
            default: // info
                borderColor = 'transparent';
        }

        if (statusElement) {
            // Update existing notification
            statusElement.textContent = message;
            statusElement.style.borderColor = borderColor;
            statusElement.style.opacity = '1';

            // Clear any existing timeout
            if (statusElement.hideTimeout) {
                clearTimeout(statusElement.hideTimeout);
            }
        } else {
            // Create new notification
            statusElement = document.createElement('div');
            statusElement.classList.add('vr-notification');

            statusElement.style.cssText = `
                position: fixed;
                top: 60px;
                right: 20px;
                background: rgba(0, 0, 0, 0.8);
                color: white;
                padding: 15px 25px;
                border-radius: 10px;
                font-size: 16px;
                z-index: 10000;
                pointer-events: none;
                opacity: 0;
                transition: opacity 0.3s ease;
                white-space: pre-line;
                border: 1px solid ${borderColor};
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            `;
            statusElement.textContent = message;
            document.body.appendChild(statusElement);

            setTimeout(() => {
                statusElement.style.opacity = '1';
            }, 10);
        }

        // Set new hide timeout
        statusElement.hideTimeout = setTimeout(() => {
            statusElement.style.opacity = '0';
            setTimeout(() => {
                if (statusElement.parentNode) {
                    statusElement.parentNode.removeChild(statusElement);
                }
            }, 300);
        }, duration);
    }

    // Legacy compatibility wrapper for tracking status
    showTrackingStatus(message) {
        this.showNotification(message, 'info');
    }

    // Helper to update slider value displays
    updateSliderValueDisplays() {
        const mouseSensitivity = document.getElementById('mouse-sensitivity');
        const sensitivityValue = document.getElementById('sensitivity-value');
        if (mouseSensitivity && sensitivityValue) {
            sensitivityValue.textContent = mouseSensitivity.value;
        }
        const vrZoomLevel = document.getElementById('vr-zoom-sensitivity');
        const vrZoomValue = document.getElementById('vr-zoom-value');
        if (vrZoomLevel && vrZoomValue) {
            const multiplier = parseInt(vrZoomLevel.value) / 100;
            vrZoomValue.textContent = `${multiplier.toFixed(1)}x`;
        }
    }
}

let vrScene = null;
let vrVideo = null;

function initVRMode() {
    try {
        vrScene = document.getElementById('vr-scene');
        vrVideo = document.getElementById('video-element');

        if (!vrScene || !vrVideo) {
            console.error('VR initialization failed: missing elements');
            return;
        }

        bindMouseEvents();

    } catch (error) {
        console.error('VR mode initialization failed:', error);
    }
}

function bindMouseEvents() {
    window.isFirstMove = true;
    window.lastMouseX = 0;
    window.lastMouseY = 0;
    window.isMouseDown = false;

    if (window.vrMouseMoveHandler) {
        document.removeEventListener('mousemove', window.vrMouseMoveHandler);
    }
    if (window.vrMouseDownHandler) {
        document.removeEventListener('mousedown', window.vrMouseDownHandler);
    }
    if (window.vrMouseUpHandler) {
        document.removeEventListener('mouseup', window.vrMouseUpHandler);
    }
    if (window.vrClickHandler) {
        document.removeEventListener('click', window.vrClickHandler);
    }

    window.vrMouseMoveHandler = (e) => {
        if (!isVRModeActive()) return;

        const target = e.target;
        if (
            target.closest('#video-controls') ||
            target.closest('.control-btn') ||
            target.closest('.progress-bar') ||
            target.closest('#vr-zoom-info') ||
            target.closest('.toolbar') ||
            target.closest('.toolbar-btn') ||
            target.closest('.toolbar-left') ||
            target.closest('.toolbar-right')
        ) {
            return;
        }

        const scene = document.querySelector('a-scene');
        if (!scene) return;
        const camera = scene.querySelector('a-camera');
        if (!camera || !player) return;

        if (player.settings.mouseTracking || window.isMouseDown) {
            const sensitivity = (player.settings.vrViewSensitivity / 100) * 0.5;

            let deltaX, deltaY;
            if (document.pointerLockElement) {
                deltaX = e.movementX || e.mozMovementX || e.webkitMovementX || 0;
                deltaY = e.movementY || e.mozMovementY || e.webkitMovementY || 0;
            } else {
                if (window.isFirstMove) {
                    window.lastMouseX = e.clientX;
                    window.lastMouseY = e.clientY;
                    window.isFirstMove = false;
                    return;
                }
                deltaX = e.clientX - window.lastMouseX;
                deltaY = e.clientY - window.lastMouseY;
                window.lastMouseX = e.clientX;
                window.lastMouseY = e.clientY;
            }

            const currentRotation = camera.getAttribute('rotation');
            const newYaw = currentRotation.y - deltaX * sensitivity;
            const newPitch = Math.max(-90, Math.min(90, currentRotation.x - deltaY * sensitivity));
            camera.setAttribute('rotation', `${newPitch} ${newYaw} 0`);
        }
    };
    document.addEventListener('mousemove', window.vrMouseMoveHandler);

    window.vrMouseDownHandler = (e) => {
        if (!isVRModeActive()) return;

        const target = e.target;
        const isInControlArea = target.closest('#video-controls') ||
            target.closest('.control-btn') ||
            target.closest('.progress-bar') ||
            target.closest('#vr-zoom-info') ||
            target.closest('.toolbar') ||
            target.closest('.toolbar-btn') ||
            target.closest('.toolbar-left') ||
            target.closest('.toolbar-right') ||
            target.closest('#file-list') ||
            target.closest('#settings-panel') ||
            target.closest('#vr-file-list');

        if (isInControlArea) {
            return;
        }

        if (player && e.button === 0 && closePanelsIfOpen()) {
            return;
        }

        if (!player.settings.mouseTracking && e.button === 0) {
            window.isMouseDown = true;
            window.isFirstMove = true;

            const canvas = document.querySelector('a-scene canvas') || document.body;
            if (canvas && canvas.requestPointerLock) {
                canvas.requestPointerLock();
            }
        }
    };
    document.addEventListener('mousedown', window.vrMouseDownHandler);

    window.vrMouseUpHandler = (e) => {
        if (!isVRModeActive()) return;
        if (!player.settings.mouseTracking && e.button === 0) {
            window.isMouseDown = false;

            if (document.pointerLockElement && document.exitPointerLock) {
                document.exitPointerLock();
            }
        }
    };
    document.addEventListener('mouseup', window.vrMouseUpHandler);

    window.vrClickHandler = (e) => {
        if (isVRModeActive()) {
            if (player && player.settings.mouseTracking) {
                const target = e.target;
                const isControlClick = target.closest('#video-controls') ||
                    target.closest('.control-btn') ||
                    target.closest('.progress-bar') ||
                    target.closest('#vr-zoom-info') ||
                    target.closest('.toolbar') ||
                    target.closest('.toolbar-btn') ||
                    target.closest('.toolbar-left') ||
                    target.closest('.toolbar-right') ||
                    target.closest('#file-list') ||
                    target.closest('#settings-panel') ||
                    target.closest('#vr-file-list');

                if (!isControlClick) {
                    closePanelsIfOpen();
                }
            }
        }
    };
    document.addEventListener('click', window.vrClickHandler);
}

function closePanelsIfOpen() {
    const fileList = document.getElementById('file-list');
    const settingsPanel = document.getElementById('settings-panel');
    const vrFileList = document.getElementById('vr-file-list');

    const anyPanelOpen = (fileList && fileList.style.display !== 'none') ||
        (settingsPanel && settingsPanel.style.display !== 'none') ||
        (vrFileList && vrFileList.style.display !== 'none');

    if (anyPanelOpen) {
        player.hideSettings();
        player.hidePlaylist();
        return true;
    }
    return false;
}

function isVRModeActive() {
    return player && player.isVRMode;
}

let player = null;
document.addEventListener('DOMContentLoaded', () => {
    player = new VRPlayer();
}); 