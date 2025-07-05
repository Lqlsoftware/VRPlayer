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
            autoplay: false,
            loop: false,
            showPlaylist: false,
            mouseTracking: true,
            mouseSensitivity: 20
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
    }

    initSharedVideo() {
        this.sharedVideoElement = document.getElementById('video-element');
        if (!this.sharedVideoElement) {
            console.error('Shared video element not found');
            return;
        }
        
        // Set up event listeners
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
        
        this.sharedVideoElement.volume = 0.5; // Default 50% volume
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
        document.getElementById('autoplay').addEventListener('change', (e) => this.updateSetting('autoplay', e.target.checked));
        document.getElementById('loop').addEventListener('change', (e) => this.updateSetting('loop', e.target.checked));
        document.getElementById('mouse-sensitivity').addEventListener('input', (e) => {
            this.updateSetting('mouseSensitivity', parseInt(e.target.value));
            document.getElementById('sensitivity-value').textContent = e.target.value;
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
        
        // 监听pointer lock状态变化
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
    }

    setupDragAndDrop() {
        const videoContainer = document.getElementById('video-container');
        
        videoContainer.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            videoContainer.style.border = '2px dashed #667eea';
        });

        videoContainer.addEventListener('dragleave', (e) => {
            e.preventDefault();
            e.stopPropagation();
            videoContainer.style.border = 'none';
        });

        videoContainer.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            videoContainer.style.border = 'none';
            
            const files = Array.from(e.dataTransfer.files);
            const videoFiles = files.filter(file => 
                /\.(mp4|webm|avi|mov|mkv|m4v)$/i.test(file.name)
            );
            
            if (videoFiles.length > 0) {
                if (videoFiles.length === 1) {
                    this.loadVideo(videoFiles[0].path);
                } else {
                    this.loadVideoFolder(videoFiles.map(f => f.path));
                }
            }
        });
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
                        // 如果在鼠标跟随模式，先退出跟随模式
                        this.toggleMouseTracking();
                    } else {
                        // 如果不在鼠标跟随模式，退出VR模式
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
                // Toggle mouse tracking in VR mode
                if (this.isVRMode) {
                    e.preventDefault();
                    this.toggleMouseTracking();
                }
                break;
            case 'KeyI':
                // Toggle 180/360 mode in VR
                if (this.isVRMode) {
                    e.preventDefault();
                    this.toggleVRMode180360();
                }
                break;

            case 'KeyC':
                // Center to middle position in VR mode
                if (this.isVRMode) {
                    e.preventDefault();
                    this.centerOnMiddle();
                }
                break;


        }
    }

    resetVRZoom() {
        this.updateVRScale(1.0);
        console.log('VR zoom reset');
    }

    resetVRView() {
        // Reset to left eye center view
        this.centerOnLeftEye();
    }

    // Center view on left eye (for Side-by-Side VR videos)
    centerOnLeftEye(showStatus = true) {
        const scene = document.querySelector('a-scene');
        if (scene) {
            const camera = scene.querySelector('a-camera');
            if (camera) {
                // For Side-by-Side VR videos, left eye is typically in left half
                // Rotate camera to -90 degrees (look left) to center left eye
                camera.setAttribute('rotation', '0 -90 0');
                console.log('VR view reset to left eye center');
                
                if (showStatus) {
                    this.showTrackingStatus('视角已重置到左眼中心');
                }
            }
        }
    }

    // Center view on right eye (for Side-by-Side VR videos)
    centerOnRightEye() {
        const scene = document.querySelector('a-scene');
        if (scene) {
            const camera = scene.querySelector('a-camera');
            if (camera) {
                // For Side-by-Side VR videos, right eye is typically in right half
                // Rotate camera to 90 degrees (look right) to center right eye
                camera.setAttribute('rotation', '0 90 0');
                console.log('VR view reset to right eye center');
                
                this.showTrackingStatus('视角已重置到右眼中心');
            }
        }
    }

    // Center view to middle position
    centerOnMiddle() {
        const scene = document.querySelector('a-scene');
        if (scene) {
            const camera = scene.querySelector('a-camera');
            if (camera) {
                // Reset to default center position
                camera.setAttribute('rotation', '0 0 0');
                console.log('VR view reset to center position');
                
                this.showTrackingStatus('视角已重置到中心位置');
            }
        }
    }

    toggleMouseTracking() {
        this.settings.mouseTracking = !this.settings.mouseTracking;
        this.saveSettings();
        
        // Initialize mouse movement variables
        window.isFirstMove = true;
        window.lastMouseX = 0;
        window.lastMouseY = 0;
        
        const vrScene = document.getElementById('vr-scene');
        const videoControls = document.getElementById('video-controls');
        
        if (this.settings.mouseTracking) {
            console.log('Mouse tracking enabled');
            this.showTrackingStatus('鼠标追踪: 开启');
            if (vrScene) {
                vrScene.style.cursor = 'none';
            }
            
            // Auto-enable pointer lock
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
                
                // Clear previous event listeners
                if (this.vrControlsMouseEnter) {
                    videoControls.removeEventListener('mouseenter', this.vrControlsMouseEnter);
                }
                if (this.vrControlsMouseLeave) {
                    videoControls.removeEventListener('mouseleave', this.vrControlsMouseLeave);
                }
                
                // Add new event listeners
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
            console.log('Mouse tracking disabled');
            this.showTrackingStatus('鼠标追踪: 关闭');
            if (vrScene) {
                vrScene.style.cursor = 'default';
            }
            
            // Auto-disable pointer lock
            if (document.pointerLockElement && document.exitPointerLock) {
                document.exitPointerLock();
            }
            if (videoControls && this.isVRMode) {
                videoControls.style.display = 'block';
                videoControls.style.visibility = 'visible';
                videoControls.style.pointerEvents = 'auto';
                videoControls.style.opacity = '1';
                videoControls.style.transition = 'opacity 0.3s ease';
                
                // Remove mouse enter/leave events
                if (this.vrControlsMouseEnter) {
                    videoControls.removeEventListener('mouseenter', this.vrControlsMouseEnter);
                }
                if (this.vrControlsMouseLeave) {
                    videoControls.removeEventListener('mouseleave', this.vrControlsMouseLeave);
                }
                
                // Add auto-hide control for non-tracking mode
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
        // Create status notification
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
        
        // Show animation
        setTimeout(() => {
            statusElement.style.opacity = '1';
        }, 10);
        
        // Auto-hide
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
        // Toggle 180/360 mode
        this.vrMode = this.vrMode === '360' ? '180' : '360';
        
        // Update videosphere geometry
        this.updateVRModeGeometry();
        
        // Show toggle notification
        this.showTrackingStatus(`VR 模式: ${this.vrMode}°`);
        
        // Auto-center to left eye for 180 mode
        if (this.vrMode === '180') {
            this.centerOnLeftEye(false);
        }
        
        this.saveSettings();
        
        console.log(`VR mode switched to: ${this.vrMode}°`);
    }



    updateVRModeGeometry() {
        const videosphere = document.querySelector('a-videosphere');
        if (!videosphere) {
            console.error('Videosphere element not found');
            return;
        }
        
        // Get current geometry settings
        const currentGeometry = videosphere.getAttribute('geometry') || {};
        const radius = currentGeometry.radius || 500;
        
        // Set geometry based on VR mode
        if (this.vrMode === '180') {
            // 180 mode: only show front hemisphere
            videosphere.setAttribute('geometry', {
                radius: radius,
                phiLength: 180,     // Horizontal coverage 180 degrees
                phiStart: -90,      // Start from -90 degrees (front center)
                thetaLength: 180,   // Vertical coverage 180 degrees
                thetaStart: 0       // Start from top
            });
        } else {
            // 360 mode: show full sphere
            videosphere.setAttribute('geometry', {
                radius: radius,
                phiLength: 360,     // Horizontal coverage 360 degrees
                phiStart: 0,        // Start from 0 degrees
                thetaLength: 180,   // Vertical coverage 180 degrees (full hemisphere)
                thetaStart: 0       // Start from top
            });
        }
        
        // Apply mono mode texture mapping (left half only for SBS format)
        setTimeout(() => {
            this.applyMonoMode(videosphere);
        }, 100);
        
        // Set basic material properties
        videosphere.setAttribute('material', {
            shader: 'flat'
        });
        
        this.updateVRModeStatus();
        
        // Auto-center to left eye for 180 mode
        if (this.vrMode === '180') {
            this.centerOnLeftEye(false);
        }
        
        console.log(`VR geometry updated to ${this.vrMode}° mode (mono display)`);
    }

    updateVRModeStatus() {
        const vrModeText = document.getElementById('vr-mode-text');
        const vrModeIndicator = document.querySelector('.vr-mode-indicator');
        
        if (vrModeText) {
            vrModeText.textContent = `${this.vrMode}° 单眼`;
        }
        
        if (vrModeIndicator) {
            // Remove all mode style classes
            vrModeIndicator.classList.remove('mode-180', 'mode-360', 'mode-mono', 'mode-sbs', 'mode-tb');
            
            // Add current mode style class
            if (this.vrMode === '180') {
                vrModeIndicator.classList.add('mode-180');
            } else {
                vrModeIndicator.classList.add('mode-360');
            }
            
            // Add mono mode style class
            vrModeIndicator.classList.add('mode-mono');
        }
    }





    async loadVideo(filePath) {
        console.log('Loading video:', filePath);
        
        if (!this.sharedVideoElement) {
            console.error('Shared video element not initialized');
            return;
        }
        
        try {
            this.currentVideo = filePath;
            this.sharedVideoElement.src = `file://${filePath}`;
            
            // Detect if it's a VR video by filename
            const isVRByName = this.isVRVideo(filePath);
            
            // Auto-enter VR mode if VR video detected by filename
            if (isVRByName) {
                console.log('VR video detected by filename, preparing to enter VR mode');
                
                // Auto-detect and set VR mode (180 or 360 degrees)
                const detectedMode = this.detectVRMode(filePath);
                this.vrMode = detectedMode;
                console.log(`Auto-set VR mode to: ${this.vrMode}°`);
                
                // Delay to ensure video loads
                setTimeout(() => {
                    if (!this.isVRMode) {
                        console.log('Auto-entering VR mode');
                        this.enterVRMode();
                    } else {
                        // If already in VR mode, update geometry
                        this.updateVRModeGeometry();
                    }
                }, 500);
            }
            
            // Check again after video metadata loads
            this.sharedVideoElement.addEventListener('loadedmetadata', () => {
                if (!isVRByName && this.checkVideoResolution()) {
                    console.log('VR video detected by resolution, preparing to enter VR mode');
                    // Use default VR mode settings for resolution-detected videos
                    setTimeout(() => {
                        if (!this.isVRMode) {
                            console.log('Auto-entering VR mode');
                            this.enterVRMode();
                        }
                    }, 100);
                }
            }, { once: true });
            
            // Update VR video source if in VR mode
            if (this.isVRMode) {
                this.updateVRVideoSource();
            }
            
            this.showVideoPlayer();
            this.addToPlaylist(filePath);
            
            // Auto-play
            this.play();
            
            console.log('Video loaded successfully');
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
        
        console.log('togglePlayPause called');
        console.log('VR mode:', this.isVRMode);
        console.log('Video paused state:', this.sharedVideoElement.paused);
        
        try {
            if (this.sharedVideoElement.paused) {
                console.log('Video paused, starting playback');
                this.play();
            } else {
                console.log('Video playing, pausing');
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
        
        console.log('play method called');
        console.log('VR mode:', this.isVRMode);
        
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
                // If no Promise returned, update state directly
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
        
        console.log('pause method called');
        console.log('VR mode:', this.isVRMode);
        
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
        
        console.log('stop method called');
        
        try {
            this.sharedVideoElement.pause();
            this.sharedVideoElement.currentTime = 0;
            this.isPlaying = false;
            this.updatePlayButton();
            this.updateProgress();
            
            // Return to main interface after stopping
            this.showPlaceholder();
            
            // Exit VR mode if currently in VR
            if (this.isVRMode) {
                this.exitVRMode();
            }
            
            console.log('Video stopped and returned to main interface');
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
                volumeDisplay.textContent = '静音';
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
        // Select container based on current mode
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

    // Handle fullscreen state changes
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

    // Start auto-hide controls
    startControlsAutoHide() {
        if (!this.isFullscreen && !this.isVRMode) return;
        
        // Clear previous timer
        this.clearControlsHideTimer();
        
        // Show controls
        this.showControls();
        
        // Set new timer
        this.controlsHideTimer = setTimeout(() => {
            this.hideControls();
        }, this.controlsHideDelay);
    }

    // Stop auto-hide controls
    stopControlsAutoHide() {
        this.clearControlsHideTimer();
    }

    // Clear hide timer
    clearControlsHideTimer() {
        if (this.controlsHideTimer) {
            clearTimeout(this.controlsHideTimer);
            this.controlsHideTimer = null;
        }
    }

    // Show controls
    showControls() {
        const videoControls = document.getElementById('video-controls');
        if (videoControls) {
            if (this.isVRMode) {
                // VR mode display logic
                videoControls.style.opacity = '1';
                videoControls.style.visibility = 'visible';
                videoControls.style.pointerEvents = 'auto';
                this.controlsVisible = true;
            } else {
                // Normal mode display logic
                videoControls.classList.remove('hidden');
                this.controlsVisible = true;
            }
        }
        
        // Show mouse cursor
        if (this.isFullscreen && !this.isVRMode) {
            document.body.style.cursor = 'default';
        } else if (this.isVRMode && !this.settings.mouseTracking) {
            document.body.style.cursor = 'default';
        }
    }

    // Hide controls
    hideControls() {
        if (!this.isFullscreen && !this.isVRMode) return;

        const videoControls = document.getElementById('video-controls');
        if (videoControls) {
            if (this.isVRMode) {
                // VR mode hide logic - completely hide regardless of tracking
                videoControls.style.opacity = '0'; // Completely hidden
                console.log('VR mode: Set controls to completely hidden (0)');
                this.controlsVisible = false;
            } else {
                // Normal fullscreen mode hide logic
                videoControls.classList.add('hidden');
                this.controlsVisible = false;
                console.log('Fullscreen mode: Added hidden class');
            }
        }
        
        // Hide mouse cursor
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

    // Handle mouse interaction events
    handleMouseInteraction(e) {
        // Handle mouse side buttons for seek forward/backward
        if (e.button === 4) { // Mouse back button (usually left side button)
            e.preventDefault();
            this.seekRelative(-10); // Seek backward 10 seconds
            console.log('Mouse back button: seeking backward 10 seconds');
            return;
        }
        if (e.button === 3) { // Mouse forward button (usually right side button)
            e.preventDefault();
            this.seekRelative(10); // Seek forward 10 seconds
            console.log('Mouse forward button: seeking forward 10 seconds');
            return;
        }
        
        if (!this.isFullscreen && !this.isVRMode) return;
        
        // Restart auto-hide timer
        this.startControlsAutoHide();
    }

    // Handle keyboard interaction events
    handleKeyInteraction(e) {
        if (!this.isFullscreen && !this.isVRMode) return;
        
        // Restart auto-hide timer
        this.startControlsAutoHide();
    }
    
    // Handle pointer lock state changes
    handlePointerLockChange() {
        // 当pointer lock状态改变时，同步鼠标跟随模式状态
        const isPointerLocked = document.pointerLockElement !== null;
        
        if (this.isVRMode && this.settings.mouseTracking && !isPointerLocked) {
            // 如果在VR模式且鼠标跟随模式开启，但pointer lock被退出了
            // 这通常发生在用户按ESC键时，浏览器自动退出pointer lock
            console.log('Pointer lock exited, disabling mouse tracking');
            this.settings.mouseTracking = false;
            this.saveSettings();
            this.showTrackingStatus('鼠标追踪: 关闭');
            
            // 恢复光标
            const vrScene = document.getElementById('vr-scene');
            if (vrScene) {
                vrScene.style.cursor = 'default';
            }
            
            // 重新配置控件事件
            const videoControls = document.getElementById('video-controls');
            if (videoControls) {
                // 移除之前的事件监听器
                if (this.vrControlsMouseEnter) {
                    videoControls.removeEventListener('mouseenter', this.vrControlsMouseEnter);
                }
                if (this.vrControlsMouseLeave) {
                    videoControls.removeEventListener('mouseleave', this.vrControlsMouseLeave);
                }
                
                // 为非跟踪模式添加事件监听器
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

    // Enter VR mode
    enterVRMode() {
        document.body.classList.add('vr-mode');
        this.isVRMode = true;
        
        // Use toggleMouseTracking to ensure all related functionality is activated
        this.settings.mouseTracking = false;
        this.toggleMouseTracking();

        // Hide specific main interface elements, but keep toolbar
        const videoContainer = document.getElementById('video-container');
        const fileList = document.getElementById('file-list');
        const settingsPanel = document.getElementById('settings-panel');
        
        if (videoContainer) {
            videoContainer.style.display = 'none';
        }
        if (fileList) {
            fileList.style.display = 'none';
        }
        if (settingsPanel) {
            settingsPanel.style.display = 'none';
        }
        
        // Show VR scene
        const vrScene = document.getElementById('vr-scene');
        if (vrScene) {
            vrScene.style.display = 'block';
        }
        
        // Ensure toolbar remains visible in VR mode
        const toolbar = document.querySelector('.toolbar');
        if (toolbar) {
            toolbar.style.display = 'flex';
        }
        
        // Force layout recalculation
        if (vrScene) {
            vrScene.offsetHeight; // Trigger reflow
        }
        
        // Initialize VR mode if not already initialized
        if (!window.vrScene) {
            console.log('Initializing VR mode...');
            initVRMode();
        }



        // Move controls to VR scene container
        const videoControls = document.getElementById('video-controls');
        const vrControlsContainer = document.getElementById('vr-controls-container');
        
        if (videoControls && vrControlsContainer) {
            // Move controls to VR container
            vrControlsContainer.appendChild(videoControls);
            console.log('Controls moved to VR scene container');
            
            // Always show controls, but adjust opacity and interaction based on tracking mode
            videoControls.style.display = 'block';
            videoControls.style.visibility = 'visible';
            videoControls.style.pointerEvents = 'auto';
            
            // Set basic display properties for VR mode
            videoControls.style.opacity = '1';
            videoControls.style.transition = 'opacity 0.3s ease';
            
            if (this.settings.mouseTracking) {
                // Tracking mode: create mouse enter/leave event listeners
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
                
                // Add mouse enter/leave events
                videoControls.addEventListener('mouseenter', this.vrControlsMouseEnter);
                videoControls.addEventListener('mouseleave', this.vrControlsMouseLeave);
                
                vrScene.style.cursor = 'none';
                console.log('Mouse tracking enabled, controls visible');
            } else {
                // Non-tracking mode: add auto-hide control
                this.vrControlsMouseEnter = () => {
                    this.stopControlsAutoHide();
                };
                this.vrControlsMouseLeave = () => {
                    this.startControlsAutoHide();
                };
                
                videoControls.addEventListener('mouseenter', this.vrControlsMouseEnter);
                videoControls.addEventListener('mouseleave', this.vrControlsMouseLeave);
                
                vrScene.style.cursor = 'default';
                console.log('Mouse tracking disabled, controls visible');
            }
            
            // Start auto-hide timer for VR mode
            console.log('VR mode: Starting auto-hide timer');
            this.startControlsAutoHide();
        }
        
        // Hide mouse focus in VR mode
        if (mouseFocusElement) {
            mouseFocusElement.style.display = 'none';
            console.log('Mouse focus hidden (VR mode)');
        }
        
        // Reset mouse state
        window.lastMouseX = 0;
        window.lastMouseY = 0;
        window.isFirstMove = true;
        
        // Ensure mouse events are bound
        console.log('Rebinding mouse events...');
        bindMouseEvents();
        
        // Update VR button state
        const vrBtn = document.getElementById('vr-btn');
        if (vrBtn) {
            vrBtn.classList.add('vr-active');
        }
        const exitVrBtn = document.getElementById('exit-vr-btn');
        if (exitVrBtn) {
            exitVrBtn.classList.add('vr-active');
        }
        
        // Update VR video source
        this.updateVRVideoSource();
        
        // Set up VR scene
        this.setupVRScene();
        
        // Start A-Frame scene
        const scene = document.querySelector('a-scene');
        if (scene && !scene.isPlaying) {
            console.log('Starting A-Frame scene...');
            scene.play();
        }
        
        // Optimize renderer settings
        if (scene && scene.renderer) {
            console.log('Configuring renderer...');
            scene.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
            scene.renderer.setSize(window.innerWidth, window.innerHeight);
            scene.renderer.shadowMap.enabled = false;
            scene.renderer.shadowMap.type = 0;
        }
        
        // Enable hardware acceleration
        this.enableHardwareAcceleration();
        
        // Force trigger VR scene rendering to ensure display
        setTimeout(() => {
            const scene = document.querySelector('a-scene');
            if (scene && scene.renderer) {
                console.log('Force triggering VR scene rendering...');
                scene.renderer.render(scene.object3D, scene.camera);
                
                // Trigger window resize event to force layout recalculation
                window.dispatchEvent(new Event('resize'));
            }
            
            // Force update progress display to ensure correct time display in VR mode
            this.updateProgress();
        }, 100);
        
        // Show VR mode entry notification
        this.showVRModeNotification();
        
        // Update VR mode status indicator
        this.updateVRModeStatus();
        
        // Immediately update progress display
        setTimeout(() => {
            console.log('VR mode entry complete, updating progress display');
            this.updateProgress();
            
            // If playlist is enabled, ensure VR playlist is also shown
            if (this.settings.showPlaylist && this.videoList.length > 0) {
                this.updateVRPlaylist();
            }
            
            // Auto-center to left eye view (without status notification)
            this.centerOnLeftEye(false);
        }, 200);
    }

    // Update VR video source
    updateVRVideoSource() {
        console.log('Updating VR video source...');
        
        if (!this.sharedVideoElement) {
            console.error('Shared video element not initialized');
            return;
        }
        
        // Now directly use main video element as VR video source, no additional sync needed
        console.log('VR video source updated - directly using main video element');
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
        
        if (isAutoEntered) {
            notification.innerHTML = `
                <div>🎯 检测到VR视频，已自动进入VR模式（单眼显示）</div>
                <div style="font-size: 12px; margin-top: 10px; opacity: 0.8;">
                    ESC 退出 | Enter 全屏 | K 追踪 | I 切换180/360° | 鼠标中键 缩放
                </div>
            `;
        } else {
            notification.innerHTML = `
                <div>VR 模式 (${this.vrMode}° 单眼)</div>
                <div style="font-size: 12px; margin-top: 10px; opacity: 0.8;">
                    ESC 退出 | Enter 全屏 | K 追踪 | I 切换180/360° | 鼠标中键 缩放
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
        console.log('=== Exiting VR mode ===');
        
        document.body.classList.remove('vr-mode');
        this.isVRMode = false;
        
        // Stop VR mode auto-hide timer
        this.stopControlsAutoHide();
        
        // Restore interface display
        const videoContainer = document.getElementById('video-container');
        if (videoContainer) {
            videoContainer.style.display = 'block';
        }
        
        const vrScene = document.getElementById('vr-scene');
        if (vrScene) {
            vrScene.style.display = 'none';
        }
        
        // Restore toolbar to normal style
        const toolbar = document.querySelector('.toolbar');
        if (toolbar) {
            // Keep toolbar visible, CSS will handle the styling
            toolbar.style.display = 'flex';
        }
        
        // Restore controls to normal mode state
        const videoControls = document.getElementById('video-controls');
        const videoPlayer = document.getElementById('video-player');
        
        if (videoControls && videoPlayer) {
            // Move controls back to original position
            videoPlayer.appendChild(videoControls);
            console.log('Controls moved back to video player');
            
            // Remove VR mode opacity settings
            videoControls.style.opacity = '';
            videoControls.style.transition = '';
            videoControls.style.visibility = '';
            videoControls.style.pointerEvents = '';
            videoControls.style.display = '';
            // Remove VR mode mouse event listeners
            if (this.vrControlsMouseEnter) {
                videoControls.removeEventListener('mouseenter', this.vrControlsMouseEnter);
            }
            if (this.vrControlsMouseLeave) {
                videoControls.removeEventListener('mouseleave', this.vrControlsMouseLeave);
            }
            console.log('Controls state restored to normal mode');
        }
        
        // Restore mouse focus when exiting VR mode (if needed)
        if (mouseFocusElement) {
            mouseFocusElement.style.display = 'none';
            console.log('Mouse focus hidden (exiting VR mode)');
        }
        
        // Exit pointer lock
        if (document.pointerLockElement && document.exitPointerLock) {
            document.exitPointerLock();
            console.log('Pointer lock released (exiting VR mode)');
        }
        
        // Update VR button state
        const vrBtn = document.getElementById('vr-btn');
        if (vrBtn) {
            vrBtn.classList.remove('vr-active');
        }
        const exitVrBtn = document.getElementById('exit-vr-btn');
        if (exitVrBtn) {
            exitVrBtn.classList.remove('vr-active');
        }
        
        // Now directly use main video element, no additional pause operations needed
        
        // If playlist is enabled, ensure normal playlist is also shown
        if (this.settings.showPlaylist && this.videoList.length > 0) {
            this.updatePlaylist();
        }
        
        console.log('=== VR mode exit complete ===');
    }



    setupVRScene() {
        console.log('Setting up VR scene...');
        
        try {
            // VR scene setup
            const scene = document.querySelector('a-scene');
            
            console.log('A-Frame scene:', scene);
            
            if (!scene) {
                console.error('A-Frame scene not found');
                return;
            }
            
            // Ensure A-Frame scene is started
            if (!scene.isPlaying) {
                console.log('Starting A-Frame scene...');
                scene.play();
            }
            
            // Enable hardware rendering optimization
            if (scene.renderer) {
                console.log('Configuring hardware rendering...');
                scene.renderer.setPixelRatio(window.devicePixelRatio);
                scene.renderer.setSize(window.innerWidth, window.innerHeight);
                
                // Enable hardware acceleration
                scene.renderer.capabilities.isWebGL2 = true;
                scene.renderer.shadowMap.enabled = false; // Disable shadows for better performance
                scene.renderer.shadowMap.type = 0; // No shadows
            }
            
            // Check A-Frame scene status
            if (scene.hasLoaded) {
                console.log('A-Frame scene loaded, checking videosphere');
                this.checkVideosphere();
            } else {
                scene.addEventListener('loaded', () => {
                    console.log('A-Frame scene loaded');
                    this.checkVideosphere();
                });
            }
            
            // Force trigger rendering once to ensure display
            setTimeout(() => {
                if (scene && scene.renderer) {
                    console.log('setupVRScene: Force triggering render...');
                    scene.renderer.render(scene.object3D, scene.camera);
                }
            }, 50);
            
        } catch (error) {
            console.error('Error setting up VR scene:', error);
        }
    }

    checkVideosphere() {
        console.log('Checking videosphere...');
        
        const videosphere = document.querySelector('a-videosphere');
        
        if (videosphere && this.sharedVideoElement) {
            // Ensure videosphere is correctly configured, directly use main video element
            videosphere.setAttribute('src', '#video-element');
            
            // Set loop playback
            if (this.settings.loop) {
                this.sharedVideoElement.loop = true;
            }
            
            // Apply current VR mode geometry settings
            this.updateVRModeGeometry();
            
            // Listen for video texture updates to ensure mono mode is correctly applied
            videosphere.addEventListener('materialtextureloaded', () => {
                console.log('Video texture loaded, applying mono mode');
                this.applyMonoMode(videosphere);
            });
            
            // If texture already exists, apply immediately
            setTimeout(() => {
                this.applyMonoMode(videosphere);
            }, 200);
        }
    }

    // Apply mono mode texture mapping
    applyMonoMode(videosphere) {
        try {
            const mesh = videosphere.getObject3D('mesh');
            if (mesh && mesh.material && mesh.material.map) {
                // Only show left half of texture (left eye for SBS format)
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
        document.getElementById('autoplay').checked = this.settings.autoplay;
        document.getElementById('loop').checked = this.settings.loop;
        
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
        // Update all play button states
        const buttons = [
            document.getElementById('play-pause-btn')
        ];
        
        buttons.forEach(btn => {
            if (btn) {
                if (this.isPlaying) {
                    // Playing state: show pause icon
                    btn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="white"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>';
                } else {
                    // Paused state: show play icon
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
            
            // Check if time values are valid
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
                // Show default values when time data is invalid
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
        // Check if input is a valid number
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

    playPrevious() {
        if (this.currentIndex > 0) {
            this.currentIndex--;
            this.loadVideo(this.videoList[this.currentIndex]);
        }
    }

    updateUI() {
        // Initialize UI state
        this.updatePlayButton();
        this.updateProgress();
        this.updateVolumeDisplay();
        
        // Update settings UI
        if (document.getElementById('autoplay')) {
                    document.getElementById('autoplay').checked = this.settings.autoplay;
        document.getElementById('loop').checked = this.settings.loop;
            document.getElementById('mouse-sensitivity').value = this.settings.mouseSensitivity;
            document.getElementById('sensitivity-value').textContent = this.settings.mouseSensitivity;
        }
    }

    // Detect if video is VR format
    isVRVideo(filePath) {
        if (!filePath) return false;
        
        const fileName = filePath.toLowerCase();
        
        // Check for VR keywords in filename
        const vrKeywords = [
            // Basic VR terms
            'vr', '360', '180', 'sbs', 'side-by-side', 'sidebyside',
            'tb', 'top-bottom', 'topbottom', 'ou', 'over-under',
            'stereo', '3d', 'cardboard', 'oculus', 'gear',
            'pano', 'panorama', 'spherical', 'equirectangular',
            // More VR formats
            'cubemap', 'fisheye', 'fulldome', 'immersive',
            'monoscopic', 'stereoscopic', 'dome', 'planetarium',
            // VR device brands
            'quest', 'vive', 'rift', 'pico', 'wmr', 'valve',
            'varjo', 'pimax', 'samsung', 'daydream', 'gopro',
            // Resolution related
            '4k360', '8k360', '4k180', '8k180', '6k', '8k', '360p', '180p',
            // Content descriptions
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

    // Detect VR video mode: 180 degrees or 360 degrees (default 180)
    detectVRMode(filePath) {
        if (!filePath) return '180';
        
        const fileName = filePath.toLowerCase();
        
        // 360 degree video keywords
        const keywords360 = [
            '360', '360°', 'full360', 'full-360',
            '4k360', '8k360', '360p', '360vr', 'vr360',
            'spherical', 'equirectangular', 'full-sphere'
        ];
        
        // 180 degree video keywords
        const keywords180 = [
            '180', '180°', 'half180', 'half-180',
            '4k180', '8k180', '180p', '180vr', 'vr180',
            'hemisphere', 'half-sphere', 'front180'
        ];
        
        // Check 180 degree keywords first
        for (const keyword of keywords180) {
            if (fileName.includes(keyword)) {
                console.log(`180 degree video detected: "${fileName}" contains keyword "${keyword}"`);
                return '180';
            }
        }
        
        // Then check 360 degree keywords
        for (const keyword of keywords360) {
            if (fileName.includes(keyword)) {
                console.log(`360 degree video detected: "${fileName}" contains keyword "${keyword}"`);
                return '360';
            }
        }
        
        // Default to 180 degree mode
        console.log(`No specific VR mode keywords detected, using default 180 degree mode: "${fileName}"`);
        return '180';
    }

    // Check if video resolution matches VR format
    checkVideoResolution() {
        if (!this.sharedVideoElement) return false;
        
        const video = this.sharedVideoElement;
        
        // Wait for video to load
        if (video.readyState < 2) return false;
        
        const width = video.videoWidth;
        const height = video.videoHeight;
        
        if (width === 0 || height === 0) return false;
        
        const aspectRatio = width / height;
        
        // Common VR video aspect ratios
        const vrAspectRatios = [
            // 360 degree panoramic video
            { ratio: 2.0, tolerance: 0.1, description: '360° panoramic video (2:1)' },
            // 180 degree video (different ratios)
            { ratio: 1.0, tolerance: 0.1, description: '180° video (1:1)' },
            { ratio: 16/9, tolerance: 0.05, description: '180° video (16:9)' },
            { ratio: 4/3, tolerance: 0.05, description: '180° video (4:3)' },
            // Side by Side stereo video
            { ratio: 32/9, tolerance: 0.2, description: 'SBS 16:9 stereo video' },
            { ratio: 8/3, tolerance: 0.2, description: 'SBS 4:3 stereo video' },
            { ratio: 4.0, tolerance: 0.2, description: 'SBS 2:1 stereo video' },
            // Top Bottom stereo video
            { ratio: 16/18, tolerance: 0.1, description: 'TB 16:9 stereo video' },
            { ratio: 4/6, tolerance: 0.1, description: 'TB 4:3 stereo video' },
            { ratio: 1.0, tolerance: 0.05, description: 'TB 1:1 stereo video' },
            // Other common VR formats
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

    // Hide playlist
    hidePlaylist() {
        const fileList = document.getElementById('file-list');
        const vrFileList = document.getElementById('vr-file-list');
        const playlistBtn = document.getElementById('playlist-btn');
        
        this.settings.showPlaylist = false;
        
        // Hide all playlists
        if (fileList) {
            fileList.style.display = 'none';
        }
        if (vrFileList) {
            vrFileList.style.display = 'none';
        }
        if (playlistBtn) {
            playlistBtn.classList.remove('playlist-active');
        }
        
        // Remove outside click event
        document.removeEventListener('click', this.handleOutsideClick);
        
        this.saveSettings();
    }

    // Toggle playlist
    togglePlaylist() {
        const fileList = document.getElementById('file-list');
        const vrFileList = document.getElementById('vr-file-list');
        const playlistBtn = document.getElementById('playlist-btn');
        
        // Check if any playlist is currently visible
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
            // Always show the main playlist (file-list) since toolbar is shared
            if (fileList) {
                fileList.style.display = 'block';
                fileList.classList.add('fade-in');
                this.updatePlaylist(); // Sync playlist content
            }
            
            // Hide VR playlist if it's visible
            if (vrFileList) {
                vrFileList.style.display = 'none';
            }
            
            if (playlistBtn) {
                playlistBtn.classList.add('playlist-active');
            }
            
            // Add outside click event
            setTimeout(() => {
                document.addEventListener('click', this.handleOutsideClick);
            }, 100);
        }
        
        this.saveSettings();
    }

    setupMouseWheelZoom() {
        // VR scene mouse wheel zoom
        const vrScene = document.getElementById('vr-scene');
        let currentScale = 1.0;
        const minScale = 0.5;
        const maxScale = 3.0;
        const scaleStep = 0.1;

        // Listen for VR scene wheel events
        vrScene.addEventListener('wheel', (e) => {
            if (this.isVRMode) {
                e.preventDefault();
                e.stopPropagation();
                
                // Adjust zoom based on wheel direction
                if (e.deltaY > 0) {
                    // Scroll down, zoom out
                    currentScale = Math.max(minScale, currentScale - scaleStep);
                } else {
                    // Scroll up, zoom in
                    currentScale = Math.min(maxScale, currentScale + scaleStep);
                }
                
                this.updateVRScale(currentScale);
            }
        });

        // Listen for document wheel events to ensure it works in fullscreen mode
        document.addEventListener('wheel', (e) => {
            if (this.isVRMode) {
                e.preventDefault();
                e.stopPropagation();
                
                // Adjust zoom based on wheel direction
                if (e.deltaY > 0) {
                    // Scroll down, zoom out
                    currentScale = Math.max(minScale, currentScale - scaleStep);
                } else {
                    // Scroll up, zoom in
                    currentScale = Math.min(maxScale, currentScale + scaleStep);
                }
                
                this.updateVRScale(currentScale);
            } else {
                // Control volume in normal mode
                e.preventDefault();
                e.stopPropagation();
                
                // Adjust volume based on wheel direction
                if (e.deltaY > 0) {
                    // Scroll down, decrease volume
                    this.adjustVolume(-0.05);
                } else {
                    // Scroll up, increase volume
                    this.adjustVolume(0.05);
                }
            }
        }, { passive: false });

        // Listen for A-Frame scene wheel events
        const scene = document.querySelector('a-scene');
        if (scene) {
            scene.addEventListener('wheel', (e) => {
                if (this.isVRMode) {
                    e.preventDefault();
                    e.stopPropagation();
                    
                    // Adjust zoom based on wheel direction
                    if (e.deltaY > 0) {
                        // Scroll down, zoom out
                        currentScale = Math.max(minScale, currentScale - scaleStep);
                } else {
                        // Scroll up, zoom in
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
                // Method 1: Adjust camera FOV for zoom
                const baseFOV = 80; // Base field of view
                const newFOV = baseFOV / scale; // Larger scale = smaller FOV
                camera.setAttribute('camera', `fov: ${newFOV}`);
                
                // Method 2: Adjust camera position
                const baseDistance = 1.6;
                const newDistance = baseDistance / scale;
                camera.setAttribute('position', `0 ${newDistance} 0`);
                
                // Method 3: Adjust videosphere radius while maintaining VR mode settings
                const baseRadius = 500;
                const newRadius = baseRadius * scale;
                
                // Set correct geometry parameters based on current VR mode
                if (this.vrMode === '180') {
                    videosphere.setAttribute('geometry', {
                        radius: newRadius,
                        phiLength: 180,     // Maintain 180 degree settings
                        phiStart: -90,      // Maintain 180 degree settings
                        thetaLength: 180,   
                        thetaStart: 0       
                    });
                } else {
                    videosphere.setAttribute('geometry', {
                        radius: newRadius,
                        phiLength: 360,     // Maintain 360 degree settings
                        phiStart: 0,        // Maintain 360 degree settings
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

// VR mode related variables
let vrScene = null;
let vrVideo = null;
let vrZoomLevel = null;
let vrZoomInfo = null;
let currentZoom = 100;
let mouseFocusElement = null;

// Initialize VR mode
function initVRMode() {
    console.log('Initializing VR mode...');
    
    try {
        vrScene = document.getElementById('vr-scene');
        vrVideo = document.getElementById('video-element');  // Now use main video element
        // Removed VR control bar element references, now use unified video-controls
        vrZoomLevel = document.getElementById('vr-zoom-level');
        vrZoomInfo = document.getElementById('vr-zoom-info');
        
        if (!vrScene) {
            console.error('VR scene element not found');
            return;
        }
        
        if (!vrVideo) {
            console.error('Main video element not found');
            return;
        }
        
        createMouseFocus();

        bindMouseEvents();
        
        console.log('VR mode initialization complete');
        
    } catch (error) {
        console.error('VR mode initialization failed:', error);
    }
}

// Format time
function formatTime(seconds) {
    // Check if input is a valid number
    if (typeof seconds !== 'number' || isNaN(seconds) || seconds < 0) {
        return '00:00:00';
    }
    
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// Create mouse focus element
function createMouseFocus() {
    mouseFocusElement = document.createElement('div');
    mouseFocusElement.className = 'mouse-focus';
    mouseFocusElement.style.display = 'none';
    document.body.appendChild(mouseFocusElement);
}

function bindMouseEvents() {
    window.isFirstMove = true;
    window.lastMouseX = 0;
    window.lastMouseY = 0;
    window.isMouseDown = false;
    
    // Remove previous event listeners
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

        if (player.settings.mouseTracking) {
            // Convert 0-100 range to 0-0.5 range (100 = 0.5)
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
        } else {
            if (window.isMouseDown) {
                if (window.isFirstMove) {
                    window.lastMouseX = e.clientX;
                    window.lastMouseY = e.clientY;
                    window.isFirstMove = false;
                    return;
                }
                // Convert 0-100 range to 0-0.5 range (100 = 0.5)
                const sensitivity = (player.settings.mouseSensitivity / 100) * 0.5;
                
                let deltaX, deltaY;
                if (document.pointerLockElement) {
                    deltaX = e.movementX || e.mozMovementX || e.webkitMovementX || 0;
                    deltaY = e.movementY || e.mozMovementY || e.webkitMovementY || 0;
                } else {
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
            console.log('Click in control area, allow button interaction');
            return;
        }
        
        // Check if any panels are open and close them first
        if (player && e.button === 0) {
            const fileList = document.getElementById('file-list');
            const settingsPanel = document.getElementById('settings-panel');
            const vrFileList = document.getElementById('vr-file-list');
            
            const anyPanelOpen = (fileList && fileList.style.display !== 'none') ||
                               (settingsPanel && settingsPanel.style.display !== 'none') ||
                               (vrFileList && vrFileList.style.display !== 'none');
            
            if (anyPanelOpen) {
                player.hideSettings();
                player.hidePlaylist();
                console.log('VR mode: Mousedown closing panels (non-tracking mode)');
                return; // Don't start view dragging if we're closing panels
            }
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
            // Only handle panel closing for tracking mode (non-tracking mode is handled in mousedown)
            if (player && player.settings.mouseTracking) {
                // Check if click should close panels (but not interfere with controls)
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
                    // Close any open panels when clicking on VR scene in tracking mode
                    const fileList = document.getElementById('file-list');
                    const settingsPanel = document.getElementById('settings-panel');
                    const vrFileList = document.getElementById('vr-file-list');
                    
                    if ((fileList && fileList.style.display !== 'none') ||
                        (settingsPanel && settingsPanel.style.display !== 'none') ||
                        (vrFileList && vrFileList.style.display !== 'none')) {
                        player.hideSettings();
                        player.hidePlaylist();
                        console.log('VR mode: Clicked on scene, closing panels via vrClickHandler (tracking mode)');
                    }
                }
            }
        }
    };
    document.addEventListener('click', window.vrClickHandler);
}

// Update mouse focus position
function updateMouseFocus(x, y) {
    if (mouseFocusElement) {
        mouseFocusElement.style.left = (x - 12) + 'px';
        mouseFocusElement.style.top = (y - 12) + 'px';
        console.log('Mouse focus position updated:', x, y);
    } else {
        console.log('Mouse focus element does not exist');
    }
}



// Check if VR mode is active
function isVRModeActive() {
    const isActive = player && player.isVRMode;
    console.log('VR mode status check:', isActive, 'player:', !!player, 'isVRMode:', player ? player.isVRMode : 'N/A');
    return isActive;
}

// Initialize application
let player = null;
document.addEventListener('DOMContentLoaded', () => {
    player = new VRPlayer();
}); 