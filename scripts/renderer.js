const { ipcRenderer } = require('electron');

class VRPlayer {
    constructor() {
        this.currentVideo = null;
        this.videoList = [];
        this.currentIndex = 0;
        this.isPlaying = false;
        this.isVRMode = false;
        this.sharedVideoElement = null;
        this.isFullscreen = false;
        this.controlsHideTimer = null;
        this.controlsVisible = true;
        this.controlsHideDelay = 1000;
        this.settings = {
            loop: false,
            showPlaylist: false,
            mouseTracking: true,
            mouseSensitivity: 20,
            language: 'zh-CN'
        };
        this.vrMode = '180'; // VR mode: '360' or '180'
        this.monoMode = true; // Always show mono video to avoid compression
        
        this.init();
    }

    init() {
        this.bindEvents();
        this.loadSettings();
        this.updateUI();
        this.initSharedVideo();
        this.initLanguage();
        this.initPlatform();
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
        const volumeBar = document.getElementById('volume-bar');
        const volumeBtn = document.getElementById('volume-btn');
        const volumeDisplay = document.getElementById('volume-display');
        
        if (volumeBar) {
            volumeBar.addEventListener('input', (e) => this.setVolume(e.target.value));
            volumeBar.addEventListener('change', (e) => this.setVolume(e.target.value));
        }
        
        if (volumeBtn) {
            volumeBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.toggleMute();
            });
        }

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
        document.getElementById('loop').addEventListener('change', (e) => this.updateSetting('loop', e.target.checked));
        document.getElementById('mouse-sensitivity').addEventListener('input', (e) => {
            this.updateSetting('mouseSensitivity', parseInt(e.target.value));
            document.getElementById('sensitivity-value').textContent = e.target.value;
        });
        document.getElementById('language-select').addEventListener('change', (e) => {
            this.updateSetting('language', e.target.value);
            this.switchLanguage(e.target.value);
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
        switch(e.code) {
            case 'Space':
                e.preventDefault();
                this.togglePlayPause();
                break;
            case 'KeyF':
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    this.toggleFullscreen();
                }
                break;
            case 'F11':
                e.preventDefault();
                this.toggleVRMode();
                break;
            case 'ArrowUp':
                e.preventDefault();
                this.adjustVolume(0.1);
                break;
            case 'ArrowDown':
                e.preventDefault();
                this.adjustVolume(-0.1);
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
                    this.resetVRZoom();
                }
                break;
            case 'KeyV':
                if (this.isVRMode) {
                    e.preventDefault();
                    this.resetVRView();
                }
                break;
            case 'KeyK':
                if (this.isVRMode) {
                    e.preventDefault();
                    this.toggleMouseTracking();
                }
                break;
            case 'KeyI':
                if (this.isVRMode) {
                    e.preventDefault();
                    this.toggleVRMode180360();
                }
                break;

            case 'KeyC':
                if (this.isVRMode) {
                    e.preventDefault();
                    this.centerOnMiddle();
                }
                break;


        }
    }

    resetVRZoom() {
        this.updateVRScale(1.0);
    }

    resetVRView() {
        this.centerOnLeftEye();
    }

    centerOnLeftEye(showStatus = true) {
        const message = showStatus ? (window.i18n ? window.i18n.t('messages.center_left') : 'Centered on left eye') : null;
        this.setCameraRotation('0 -90 0', message);
    }

    centerOnRightEye() {
        const message = window.i18n ? window.i18n.t('messages.center_right') : 'Centered on right eye';
        this.setCameraRotation('0 90 0', message);
    }

    centerOnMiddle() {
        const message = window.i18n ? window.i18n.t('messages.center_middle') : 'Centered on middle';
        this.setCameraRotation('0 0 0', message);
    }

    setCameraRotation(rotation, statusMessage) {
        const scene = document.querySelector('a-scene');
        if (scene) {
            const camera = scene.querySelector('a-camera');
            if (camera) {
                camera.setAttribute('rotation', rotation);
                if (statusMessage) {
                    this.showTrackingStatus(statusMessage);
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
            this.showTrackingStatus(message);
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
            this.showTrackingStatus(message);
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

    showTrackingStatus(message) {
        const statusElement = document.createElement('div');
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
        `;
        statusElement.textContent = message;
        document.body.appendChild(statusElement);
        
        setTimeout(() => {
            statusElement.style.opacity = '1';
        }, 10);
        
        setTimeout(() => {
            statusElement.style.opacity = '0';
            setTimeout(() => {
                if (statusElement.parentNode) {
                    statusElement.parentNode.removeChild(statusElement);
                }
            }, 300);
        }, 2000);
    }

    toggleVRMode180360() {
        this.vrMode = this.vrMode === '360' ? '180' : '360';
        
        this.updateVRModeGeometry();
        
        const message = window.i18n ? window.i18n.t(`messages.mode_${this.vrMode}`) : `VR mode: ${this.vrMode}°`;
        this.showTrackingStatus(message);
        
        if (this.vrMode === '180') {
            this.centerOnLeftEye(false);
        }
        
        this.saveSettings();
    }



    updateVRModeGeometry() {
        const videosphere = document.querySelector('a-videosphere');
        if (!videosphere) {
            console.error('Videosphere element not found');
            return;
        }
        
        const currentGeometry = videosphere.getAttribute('geometry') || {};
        const radius = currentGeometry.radius || 500;
        
        if (this.vrMode === '180') {
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
            this.applyMonoMode(videosphere);
        }, 100);
        
        videosphere.setAttribute('material', {
            shader: 'flat'
        });
        
        this.updateVRModeStatus();
        
        if (this.vrMode === '180') {
            this.centerOnLeftEye(false);
        }
    }

    updateVRModeStatus() {
        const vrModeText = document.getElementById('vr-mode-text');
        const vrModeIndicator = document.querySelector('.vr-mode-indicator');
        
        if (vrModeText) {
            const monoText = window.i18n ? window.i18n.t('messages.mono_mode') : 'Mono';
            vrModeText.textContent = `${this.vrMode}° ${monoText}`;
        }
        
        if (vrModeIndicator) {
            vrModeIndicator.classList.remove('mode-180', 'mode-360', 'mode-mono', 'mode-sbs', 'mode-tb');
            
            if (this.vrMode === '180') {
                vrModeIndicator.classList.add('mode-180');
            } else {
                vrModeIndicator.classList.add('mode-360');
            }
            
            vrModeIndicator.classList.add('mode-mono');
        }
    }





    async loadVideo(filePath) {
        if (!this.sharedVideoElement) {
            console.error('Shared video element not initialized');
            return;
        }
        
        try {
            this.currentVideo = filePath;
            this.sharedVideoElement.src = `file://${filePath}`;
            
            const isVRByName = this.isVRVideo(filePath);
            
            if (isVRByName) {
                const detectedMode = this.detectVRMode(filePath);
                this.vrMode = detectedMode;
                
                setTimeout(() => {
                    if (!this.isVRMode) {
                        this.enterVRMode();
                    } else {
                        this.updateVRModeGeometry();
                    }
                }, 500);
            }
            
            this.sharedVideoElement.addEventListener('loadedmetadata', () => {
                if (!isVRByName && this.checkVideoResolution()) {
                    console.log('VR video detected by resolution, preparing to enter VR mode');
                    setTimeout(() => {
                        if (!this.isVRMode) {
                            console.log('Auto-entering VR mode');
                            this.enterVRMode();
                        }
                    }, 100);
                }
            }, { once: true });
            
            if (this.isVRMode) {
                this.updateVRVideoSource();
            }
            
            this.showVideoPlayer();
            this.addToPlaylist(filePath);
            
            this.play();
            
        } catch (error) {
            console.error('Error loading video:', error);
        }
    }

    loadVideoFolder(files) {
        this.videoList = files;
        this.currentIndex = 0;
        
        if (files.length > 0) {
            this.loadVideo(files[0]);
            this.updatePlaylist();
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
    }

    setVolume(value) {
        if (!this.sharedVideoElement) {
            console.error('Shared video element not initialized');
            return;
        }
        
        const volume = Math.max(0, Math.min(100, value)) / 100;
        this.sharedVideoElement.volume = volume;
        this.updateVolumeDisplay();
    }

    toggleMute() {
        if (!this.sharedVideoElement) {
            console.error('Shared video element not initialized');
            return;
        }
        
        this.sharedVideoElement.muted = !this.sharedVideoElement.muted;
        this.updateVolumeDisplay();
    }

    updateVolumeDisplay() {
        if (!this.sharedVideoElement) return;
        
        const volumeBar = document.getElementById('volume-bar');
        const volumeDisplay = document.getElementById('volume-display');
        const volumeBtn = document.getElementById('volume-btn');
        
        if (volumeBar) {
            volumeBar.value = this.sharedVideoElement.volume * 100;
        }
        
        if (volumeDisplay) {
            if (this.sharedVideoElement.muted) {
                const mutedText = window.i18n ? window.i18n.t('messages.muted') : 'Muted';
                volumeDisplay.textContent = mutedText;
            } else {
                volumeDisplay.textContent = Math.round(this.sharedVideoElement.volume * 100) + '%';
            }
        }
        
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
                console.log('VR mode: Set controls to completely hidden (0)');
                this.controlsVisible = false;
            } else {
                videoControls.classList.add('hidden');
                this.controlsVisible = false;
                console.log('Fullscreen mode: Added hidden class');
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
        
        // Debounce mechanism to avoid frequent timer resets
        const now = Date.now();
        if (this.lastMouseMoveTime && now - this.lastMouseMoveTime < 200) {
            return; // Ignore move events within 200ms
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
            this.showTrackingStatus(message);
            
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
        
        this.showVRModeNotification();
        this.updateVRModeStatus();
        
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

        // Check if auto-entered VR mode due to VR video detection
        const isAutoEntered = this.isVRVideo(this.currentVideo) || this.checkVideoResolution();
        
        const monoText = window.i18n ? window.i18n.t('messages.mono_mode') : 'Mono';
        const controlsHelp = window.i18n ? window.i18n.t('messages.vr_controls_help') : 'ESC Exit | Enter Fullscreen | K Tracking | I Toggle 180/360° | Mouse Wheel Zoom';
        
        if (isAutoEntered) {
            const autoDetectedText = window.i18n ? window.i18n.t('messages.vr_auto_detected') : '🎯 VR video detected, automatically entered VR mode (mono display)';
            notification.innerHTML = `
                <div>${autoDetectedText}</div>
                <div style="font-size: 12px; margin-top: 10px; opacity: 0.8;">
                    ${controlsHelp}
                </div>
            `;
        } else {
            notification.innerHTML = `
                <div>VR ${window.i18n ? window.i18n.t('messages.mode_' + this.vrMode) : 'mode'} (${monoText})</div>
                <div style="font-size: 12px; margin-top: 10px; opacity: 0.8;">
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
        
        if (document.pointerLockElement && document.exitPointerLock) {
            document.exitPointerLock();
        }
        
        this.updateVRButtonStates(false);
        
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
                this.applyMonoMode(videosphere);
            });
            
            setTimeout(() => {
                this.applyMonoMode(videosphere);
            }, 200);
        }
    }

    applyMonoMode(videosphere) {
        try {
            const mesh = videosphere.getObject3D('mesh');
            if (mesh && mesh.material && mesh.material.map) {
                mesh.material.map.repeat.set(0.5, 1);
                mesh.material.map.offset.set(0, 0);
                mesh.material.map.needsUpdate = true;
                console.log('Mono mode texture mapping applied: repeat(0.5, 1) offset(0, 0)');
            } else {
                console.log('Texture not ready yet, mono mode will be applied later');
            }
        } catch (error) {
            console.error('Error applying mono mode:', error);
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
        settingsPanel.style.display = 'block';
        settingsPanel.classList.add('fade-in');
        
        // Add outside click event
        setTimeout(() => {
            document.addEventListener('click', this.handleOutsideClick);
        }, 100);
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
        this.applySettings();
    }

    applySettings() {
        if (!this.sharedVideoElement) {
            return;
        }
        
        // Apply loop setting
        this.sharedVideoElement.loop = this.settings.loop;
    }

    loadSettings() {
        const saved = localStorage.getItem('vrPlayerSettings');
        if (saved) {
            const savedSettings = JSON.parse(saved);
            this.settings = { ...this.settings, ...savedSettings };
            
            // Load VR mode settings
            if (savedSettings.vrMode) {
                this.vrMode = savedSettings.vrMode;
            }
            
            // Handle legacy mouseSensitivity values (convert from 0-1 range to 0-100 range)
            if (savedSettings.mouseSensitivity !== undefined) {
                if (savedSettings.mouseSensitivity <= 1.0) {
                    // Old format: 0-1 range, convert to 0-100 range (0.5 = 100)
                    this.settings.mouseSensitivity = Math.round((savedSettings.mouseSensitivity / 0.5) * 100);
                    console.log(`Converted legacy sensitivity: ${savedSettings.mouseSensitivity} -> ${this.settings.mouseSensitivity}`);
                }
            }
        }
        
        // Update UI
        document.getElementById('loop').checked = this.settings.loop;
        
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
            ...this.settings,
            vrMode: this.vrMode
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
        
        // Update volume display for muted state
        this.updateVolumeDisplay();
        
        // Update any dynamic content that may need refreshing
        this.updatePlaylist();
        this.updateVRPlaylist();
    }

    addToPlaylist(filePath) {
        if (!this.videoList.includes(filePath)) {
            this.videoList.push(filePath);
            try {
                this.updatePlaylist();
                this.updateVRPlaylist();
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
        const timeDisplay = document.getElementById('time-display');
        const vrTimeDisplay = document.getElementById('vr-time-display');
        
        if (this.sharedVideoElement.readyState >= 2) {
            const currentTime = this.sharedVideoElement.currentTime;
            const duration = this.sharedVideoElement.duration;
            
            if (!isNaN(currentTime) && !isNaN(duration) && duration > 0) {
                const percentage = (currentTime / duration) * 100;
                
                if (progressBar) {
                    progressBar.value = percentage;
                }
                if (vrProgressBar) {
                    vrProgressBar.value = percentage;
                }
                
                const currentTimeText = this.formatTime(currentTime);
                const totalTimeText = this.formatTime(duration);
                const timeText = `${currentTimeText} / ${totalTimeText}`;
                
                if (timeDisplay) {
                    timeDisplay.textContent = timeText;
                }
                if (vrTimeDisplay) {
                    vrTimeDisplay.textContent = timeText;
                }
            } else {
                if (progressBar) {
                    progressBar.value = 0;
                }
                if (vrProgressBar) {
                    vrProgressBar.value = 0;
                }
                if (timeDisplay) {
                    timeDisplay.textContent = '00:00:00 / 00:00:00';
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
            document.getElementById('mouse-sensitivity').value = this.settings.mouseSensitivity;
            document.getElementById('sensitivity-value').textContent = this.settings.mouseSensitivity;
        }
    }

    isVRVideo(filePath) {
        if (!filePath) return false;
        
        const fileName = filePath.toLowerCase();
        
        const vrKeywords = [
            'vr', '360', '180', 'sbs', 'side-by-side', 'sidebyside',
            'tb', 'top-bottom', 'topbottom', 'ou', 'over-under',
            'stereo', '3d', 'cardboard', 'oculus', 'gear',
            'pano', 'panorama', 'spherical', 'equirectangular',
            'cubemap', 'fisheye', 'fulldome', 'immersive',
            'monoscopic', 'stereoscopic', 'dome', 'planetarium',
            'quest', 'vive', 'rift', 'pico', 'wmr', 'valve',
            'varjo', 'pimax', 'samsung', 'daydream', 'gopro',
            '4k360', '8k360', '4k180', '8k180', '6k', '8k', '360p', '180p',
            'virtual', 'reality', 'experience', 'immerse',
            'spatial', 'volumetric', 'ambisonics'
        ];
        
        const matchedKeyword = vrKeywords.find(keyword => fileName.includes(keyword));
        
        if (matchedKeyword) {
            console.log(`VR video detected by filename: "${fileName}" contains keyword "${matchedKeyword}"`);
            return true;
        }
        
        console.log(`No VR keywords found in filename: "${fileName}"`);
        return false;
    }

    detectVRMode(filePath) {
        if (!filePath) return '180';
        
        const fileName = filePath.toLowerCase();
        
        const keywords360 = [
            '360', '360°', 'full360', 'full-360',
            '4k360', '8k360', '360p', '360vr', 'vr360',
            'spherical', 'equirectangular', 'full-sphere'
        ];
        
        const keywords180 = [
            '180', '180°', 'half180', 'half-180',
            '4k180', '8k180', '180p', '180vr', 'vr180',
            'hemisphere', 'half-sphere', 'front180'
        ];
        
        for (const keyword of keywords180) {
            if (fileName.includes(keyword)) {
                console.log(`180 degree video detected: "${fileName}" contains keyword "${keyword}"`);
                return '180';
            }
        }
        
        for (const keyword of keywords360) {
            if (fileName.includes(keyword)) {
                console.log(`360 degree video detected: "${fileName}" contains keyword "${keyword}"`);
                return '360';
            }
        }
        
        console.log(`No specific VR mode keywords detected, using default 180 degree mode: "${fileName}"`);
        return '180';
    }

    checkVideoResolution() {
        if (!this.sharedVideoElement) return false;
        
        const video = this.sharedVideoElement;
        
        if (video.readyState < 2) return false;
        
        const width = video.videoWidth;
        const height = video.videoHeight;
        
        if (width === 0 || height === 0) return false;
        
        const aspectRatio = width / height;
        
        const vrAspectRatios = [
            { ratio: 2.0, tolerance: 0.1, description: '360° panoramic video (2:1)' },
            { ratio: 1.0, tolerance: 0.1, description: '180° video (1:1)' },
            { ratio: 16/9, tolerance: 0.05, description: '180° video (16:9)' },
            { ratio: 4/3, tolerance: 0.05, description: '180° video (4:3)' },
            { ratio: 32/9, tolerance: 0.2, description: 'SBS 16:9 stereo video' },
            { ratio: 8/3, tolerance: 0.2, description: 'SBS 4:3 stereo video' },
            { ratio: 4.0, tolerance: 0.2, description: 'SBS 2:1 stereo video' },
            { ratio: 16/18, tolerance: 0.1, description: 'TB 16:9 stereo video' },
            { ratio: 4/6, tolerance: 0.1, description: 'TB 4:3 stereo video' },
            { ratio: 1.0, tolerance: 0.05, description: 'TB 1:1 stereo video' },
            { ratio: 1.33, tolerance: 0.05, description: '4:3 VR video' },
            { ratio: 1.78, tolerance: 0.05, description: '16:9 VR video' },
            { ratio: 2.35, tolerance: 0.1, description: 'Ultra-wide VR video' }
        ];
        
        const matchedRatio = vrAspectRatios.find(({ ratio, tolerance }) => 
            Math.abs(aspectRatio - ratio) < tolerance
        );
        
        if (matchedRatio) {
            console.log(`VR video resolution detected: ${width}x${height} (${aspectRatio.toFixed(2)}:1) - ${matchedRatio.description}`);
            return true;
        }
        
        return false;
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
        let currentScale = 1.0;
        const minScale = 0.5;
        const maxScale = 3.0;
        const scaleStep = 0.1;

        vrScene.addEventListener('wheel', (e) => {
            if (this.isVRMode) {
                e.preventDefault();
                e.stopPropagation();
                
                if (e.deltaY > 0) {
                    currentScale = Math.max(minScale, currentScale - scaleStep);
                } else {
                    currentScale = Math.min(maxScale, currentScale + scaleStep);
                }
                
                this.updateVRScale(currentScale);
            }
        });

        document.addEventListener('wheel', (e) => {
            if (this.isVRMode) {
                e.preventDefault();
                e.stopPropagation();
                
                if (e.deltaY > 0) {
                    currentScale = Math.max(minScale, currentScale - scaleStep);
                } else {
                    currentScale = Math.min(maxScale, currentScale + scaleStep);
                }
                
                this.updateVRScale(currentScale);
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
                    
                    if (e.deltaY > 0) {
                        currentScale = Math.max(minScale, currentScale - scaleStep);
                } else {
                        currentScale = Math.min(maxScale, currentScale + scaleStep);
                    }
                    
                    this.updateVRScale(currentScale);
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
                
                if (this.vrMode === '180') {
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
                
                console.log(`VR zoom: ${scale}, FOV: ${newFOV}, distance: ${newDistance}, radius: ${newRadius}, mode: ${this.vrMode}°`);
            } catch (error) {
                console.error('Zoom setting failed:', error);
            }
        }
        
        if (zoomLevel) {
            const percentage = Math.round(scale * 100);
            zoomLevel.textContent = `${percentage}%`;
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
            const sensitivity = (player.settings.mouseSensitivity / 100) * 0.5;
            
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