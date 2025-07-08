/**
 * VR Detection Utility Class
 * Provide multiple VR video detection methods
 */
class VRDetector {
    /**
     * 1. Get VR field of view and format from filename
     * @param {string} filePath - video file path
     * @returns {Object|null} - detection result {isVR: boolean, fov: '180'|'360', format: 'mono'|'sbs'|'tb'}
     */
    static detectFromFilename(filePath) {
        if (!filePath) return null;

        // Extract only the filename from the path
        const fileName = filePath.split(/[/\\]/).pop().toLowerCase();
        let isVR = false;
        let fov = '180'; // default 180 degree
        let format = 'mono'; // default mono

        // Helper function to check if a keyword exists as a complete word in the filename
        const hasCompleteWord = (text, keyword) => {
            // Create regex pattern for complete word match
            // \b ensures word boundaries, handle special characters like hyphens and dots
            const pattern = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
            return pattern.test(text);
        };

        // VR related keywords
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

        // 360 degree keywords
        const keywords360 = [
            '360', '360°', 'full360', 'full-360',
            '4k360', '8k360', '360p', '360vr', 'vr360',
            'spherical', 'equirectangular', 'full-sphere'
        ];

        // 180 degree keywords
        const keywords180 = [
            '180', '180°', 'half180', 'half-180',
            '4k180', '8k180', '180p', '180vr', 'vr180',
            'hemisphere', 'half-sphere', 'front180'
        ];

        // Stereo format keywords
        const sbsKeywords = ['sbs', 'side-by-side', 'sidebyside', 'stereo'];
        const tbKeywords = ['tb', 'top-bottom', 'topbottom', 'ou', 'over-under'];

        // Check if it is a VR video
        const matchedVRKeyword = vrKeywords.find(keyword => hasCompleteWord(fileName, keyword));
        if (!matchedVRKeyword) {
            return null;
        }

        isVR = true;

        // Detect field of view angle
        for (const keyword of keywords180) {
            if (hasCompleteWord(fileName, keyword)) {
                fov = '180';
                break;
            }
        }

        for (const keyword of keywords360) {
            if (hasCompleteWord(fileName, keyword)) {
                fov = '360';
                break;
            }
        }

        // Detect stereo format
        for (const keyword of sbsKeywords) {
            if (hasCompleteWord(fileName, keyword)) {
                format = 'sbs';
                break;
            }
        }

        for (const keyword of tbKeywords) {
            if (hasCompleteWord(fileName, keyword)) {
                format = 'tb';
                break;
            }
        }

        console.log(`VR detected from filename: "${fileName}" - FOV: ${fov}°, Format: ${format.toUpperCase()}`);
        return { isVR, fov, format };
    }

    /**
     * 2. Guess VR field of view type and format from video resolution
     * @param {number} width - video width
     * @param {number} height - video height
     * @returns {Object|null} - detection result {isVR: boolean, fov: '180'|'360', format: 'mono'|'sbs'|'tb'}
     */
    static detectFromResolution(width, height) {
        if (!width || !height) return null;

        const aspectRatio = width / height;
        let isVR = false;

        // Typical aspect ratio configurations for VR videos
        const vrAspectRatios = [
            // 360 degree panoramic video
            { ratio: 2.0, tolerance: 0.12, fov: '360', format: 'mono', description: '360° panoramic video (2:1)' },
            { ratio: 4.0, tolerance: 0.2, fov: '360', format: 'sbs', description: '360° SBS stereo video (4:1)' },
            { ratio: 1.0, tolerance: 0.1, fov: '360', format: 'tb', description: '360° TB stereo video (1:1)' },

            // 180 degree hemisphere video
            { ratio: 1.0, tolerance: 0.1, fov: '180', format: 'mono', description: '180° video (1:1)' },
            { ratio: 32 / 9, tolerance: 0.2, fov: '180', format: 'sbs', description: '180° SBS stereo video (32:9)' },
            { ratio: 8 / 3, tolerance: 0.2, fov: '180', format: 'sbs', description: '180° SBS stereo video (8:3)' },
            { ratio: 16 / 18, tolerance: 0.1, fov: '180', format: 'tb', description: '180° TB stereo video (16:18)' },
            { ratio: 4 / 6, tolerance: 0.1, fov: '180', format: 'tb', description: '180° TB stereo video (4:6)' },

            // Other VR formats
            { ratio: 2.35, tolerance: 0.1, fov: '180', format: 'mono', description: 'Ultra-wide VR video' }
        ];

        // Find matching aspect ratio
        const matchedRatio = vrAspectRatios.find(({ ratio, tolerance }) =>
            Math.abs(aspectRatio - ratio) < tolerance
        );

        if (matchedRatio) {
            isVR = true;
            console.log(`VR detected from resolution: ${width}x${height} (${aspectRatio.toFixed(2)}:1) - ${matchedRatio.description}`);
            return { isVR };
        }

        return null;
    }

    /**
     * 3. Check if there is a clear horizontal/vertical line in the middle of the frame to determine VR format
     * @param {HTMLVideoElement} videoElement - video element
     * @returns {Promise<Object|null>} - detection result {isVR: boolean, fov: '180'|'360', format: 'mono'|'sbs'|'tb'}
     */
    static async detectFromFrameContent(videoElement) {
        if (!videoElement) {
            return null;
        }

        // Wait for the video to load to the stage where metadata can be accessed
        if (videoElement.readyState < 2) {
            console.log('Video not ready, current readyState:', videoElement.readyState);
            console.log('Video src:', videoElement.src);

            try {
                await new Promise((resolve, reject) => {
                    const timeout = setTimeout(() => {
                        reject(new Error('Video loading timeout (10s)'));
                    }, 10000);

                    const onLoadedMetadata = () => {
                        console.log('Video metadata loaded, readyState:', videoElement.readyState);
                        clearTimeout(timeout);
                        videoElement.removeEventListener('loadedmetadata', onLoadedMetadata);
                        videoElement.removeEventListener('error', onError);
                        resolve();
                    };

                    const onError = (error) => {
                        console.error('Video loading error:', error);
                        clearTimeout(timeout);
                        videoElement.removeEventListener('loadedmetadata', onLoadedMetadata);
                        videoElement.removeEventListener('error', onError);
                        reject(new Error('Video loading failed'));
                    };

                    videoElement.addEventListener('loadedmetadata', onLoadedMetadata);
                    videoElement.addEventListener('error', onError);

                    // If the video hasn't started loading yet, trigger loading
                    if (videoElement.readyState === 0 && videoElement.src) {
                        console.log('Triggering video load...');
                        videoElement.load();
                    }
                });
            } catch (error) {
                console.error('Failed to load video metadata:', error);
                return null;
            }
        } else {
            console.log('Video already ready, readyState:', videoElement.readyState);
        }

        try {
            // Create canvas to analyze video frame
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');

            const width = videoElement.videoWidth;
            const height = videoElement.videoHeight;

            if (!width || !height) {
                return null;
            }

            canvas.width = width;
            canvas.height = height;

            // Get the frame at the middle of the video
            const seekTime = videoElement.duration / 2;
            console.log('Seeking to time:', seekTime, 'duration:', videoElement.duration);
            videoElement.currentTime = seekTime;

            // Wait for video seek to complete
            await new Promise((resolve) => {
                const onSeeked = () => {
                    console.log('Video seeked to:', videoElement.currentTime);
                    videoElement.removeEventListener('seeked', onSeeked);
                    resolve();
                };
                videoElement.addEventListener('seeked', onSeeked);
            });

            // Draw video frame to canvas
            ctx.drawImage(videoElement, 0, 0, width, height);
            const imageData = ctx.getImageData(0, 0, width, height);
            const data = imageData.data;

            // Analyze frame content
            const result = this.analyzeFrameForVRFormat(data, width, height);

            if (result.isVR) {
                console.log(`VR detected from frame content: ${result.description}`);
            }

            return result;

        } catch (error) {
            console.error('Error analyzing frame content:', error);
            return null;
        }
    }

    /**
     * Analyze frame content to detect VR format
     * @param {Uint8ClampedArray} imageData - image data
     * @param {number} width - image width
     * @param {number} height - image height
     * @returns {Object} - detection result
     */
    static analyzeFrameForVRFormat(imageData, width, height) {
        let isVR = true;
        let fov = '180';
        let format = 'mono';
        let description = '';

        // Detect SBS (left/right split) format
        const sbsScore = this.detectSBSFormat(imageData, width, height);
        console.log('SBS score:', sbsScore);

        // Detect TB (top/bottom split) format
        const tbScore = this.detectTBFormat(imageData, width, height);
        console.log('TB score:', tbScore);

        if (sbsScore > 0.3) {
            format = 'sbs';
        } else if (tbScore > 0.3) {
            format = 'tb';
        } else {
            format = 'mono';
        }

        // Detect 360 degree panoramic features
        const is360Score = this.detect360Features(imageData, width, height, format);
        console.log('360 score:', is360Score);

        if (is360Score > 0.5) {
            fov = '360';
        } else {
            fov = '180';
        }

        if (format === 'sbs') {
            description = `${fov}° SBS stereo video detected from frame analysis`;
        } else if (format === 'tb') {
            description = `${fov}° TB stereo video detected from frame analysis`;
        } else {
            description = `${fov}° panoramic video detected from frame analysis`;
        }

        return { isVR, fov, format, description };
    }

    /**
     * Detect SBS (left/right split) format
     * @param {Uint8ClampedArray} imageData - image data
     * @param {number} width - image width
     * @param {number} height - image height
     * @returns {number} - detection score (0-1)
     */
    static detectSBSFormat(imageData, width, height) {
        const centerX = Math.floor(width / 2);
        let verticalLineScore = 0;
        let sampleCount = 0;

        // Sample multiple points on the vertical center line
        for (let y = 0; y < height; y += Math.max(1, Math.floor(height / 50))) {
            const index = (y * width + centerX) * 4;

            // Check pixel differences on both sides of the center line
            const leftIndex = Math.max(0, (y * width + centerX - 1) * 4);
            const rightIndex = Math.min(imageData.length - 4, (y * width + centerX + 1) * 4);

            // Calculate RGB differences
            const leftDiff = Math.abs(imageData[index] - imageData[leftIndex]) +
                Math.abs(imageData[index + 1] - imageData[leftIndex + 1]) +
                Math.abs(imageData[index + 2] - imageData[leftIndex + 2]);

            const rightDiff = Math.abs(imageData[index] - imageData[rightIndex]) +
                Math.abs(imageData[index + 1] - imageData[rightIndex + 1]) +
                Math.abs(imageData[index + 2] - imageData[rightIndex + 2]);

            // If there is a significant color difference on the center line, increase the score
            if (leftDiff > 20 || rightDiff > 20) {
                verticalLineScore++;
            }

            sampleCount++;
        }

        return sampleCount > 0 ? verticalLineScore / sampleCount : 0;
    }

    /**
     * Detect TB (top/bottom split) format
     * @param {Uint8ClampedArray} imageData - image data
     * @param {number} width - image width
     * @param {number} height - image height
     * @returns {number} - detection score (0-1)
     */
    static detectTBFormat(imageData, width, height) {
        const centerY = Math.floor(height / 2);
        let horizontalLineScore = 0;
        let sampleCount = 0;

        // Sample multiple points on the horizontal center line
        for (let x = 0; x < width; x += Math.max(1, Math.floor(width / 50))) {
            const index = (centerY * width + x) * 4;

            // Check pixel differences on both sides of the center line
            const topIndex = Math.max(0, ((centerY - 1) * width + x) * 4);
            const bottomIndex = Math.min(imageData.length - 4, ((centerY + 1) * width + x) * 4);

            // Calculate RGB differences
            const topDiff = Math.abs(imageData[index] - imageData[topIndex]) +
                Math.abs(imageData[index + 1] - imageData[topIndex + 1]) +
                Math.abs(imageData[index + 2] - imageData[topIndex + 2]);

            const bottomDiff = Math.abs(imageData[index] - imageData[bottomIndex]) +
                Math.abs(imageData[index + 1] - imageData[bottomIndex + 1]) +
                Math.abs(imageData[index + 2] - imageData[bottomIndex + 2]);

            // If there is a significant color difference on the center line, increase the score
            if (topDiff > 20 || bottomDiff > 20) {
                horizontalLineScore++;
            }

            sampleCount++;
        }

        return sampleCount > 0 ? horizontalLineScore / sampleCount : 0;
    }

    /**
     * Detect 360 degree panoramic features
     * @param {Uint8ClampedArray} imageData - image data
     * @param {number} width - image width
     * @param {number} height - image height
     * @param {string} format - image format
     * @returns {number} - detection score (0-1)
     */
    static detect360Features(imageData, width, height, format) {
        let score = 0;
        let sampleCount = 0;

        // if format is sbs or tb, need to check the image in single eye view
        if (format === 'sbs') {
            width /= 2;
        } else if (format === 'tb') {
            height /= 2;
        }

        // Check the continuity of the image edges (360 degree panoramic features)
        // Sample on the left and right edges of the image and check color similarity
        for (let y = 0; y < height; y += Math.max(1, Math.floor(height / 20))) {
            const leftIndex = (y * width + 0) * 4;
            const rightIndex = (y * width + width - 1) * 4;

            // Calculate RGB differences on the left and right edges
            const diff = Math.abs(imageData[leftIndex] - imageData[rightIndex]) +
                Math.abs(imageData[leftIndex + 1] - imageData[rightIndex + 1]) +
                Math.abs(imageData[leftIndex + 2] - imageData[rightIndex + 2]);

            // If the edges have similar colors, it may be a 360 degree panoramic image
            if (diff < 20) {
                score++;
            }

            sampleCount++;
        }

        return sampleCount > 0 ? score / sampleCount : 0;
    }

    /**
     * Detect VR video
     * @param {string} filePath - video file path
     * @param {HTMLVideoElement} videoElement - video element
     * @returns {Promise<Object>} - detection result
     */
    static async detectVRVideo(filePath, videoElement) {
        const results = {
            isVR: false,
            fov: '180',
            format: 'mono',
            detectionMethods: [],
            confidence: 0
        };

        // Method 1: filename detection
        const filenameResult = this.detectFromFilename(filePath);
        if (filenameResult && filenameResult.isVR) {
            results.isVR = true;
            results.fov = filenameResult.fov;
            results.format = filenameResult.format;
            results.detectionMethods.push('filename');
            results.confidence += 0.4;
        }
        console.log('**** File name detection result:', filenameResult);

        // Method 2: frame content detection
        if (videoElement) {
            try {
                const frameResult = await this.detectFromFrameContent(videoElement);
                if (frameResult) {
                    results.fov = frameResult.fov;
                    results.format = frameResult.format;
                    results.detectionMethods.push('frame');
                    results.confidence += 0.3;
                }
                console.log('**** Frame content detection result:', frameResult);
            } catch (error) {
                console.warn('Frame content detection failed:', error);
            }
        }

        // Method 3: resolution detection
        if (videoElement && videoElement.videoWidth && videoElement.videoHeight) {
            const resolutionResult = this.detectFromResolution(videoElement.videoWidth, videoElement.videoHeight);
            if (resolutionResult && resolutionResult.isVR) {
                results.isVR = true;
                results.detectionMethods.push('resolution');
                results.confidence += 0.3;
            }
            console.log('**** Resolution detection result:', resolutionResult);
        }

        // Output detection results
        if (results.isVR) {
            console.log(`VR video detected with ${results.confidence.toFixed(2)} confidence using methods: ${results.detectionMethods.join(', ')}`);
            console.log(`Final result: ${results.fov}° ${results.format.toUpperCase()}`);
        }

        return results;
    }
}

// If in Node.js environment, export module
if (typeof module !== 'undefined' && module.exports) {
    module.exports = VRDetector;
}

// If in browser environment, add to global object
if (typeof window !== 'undefined') {
    window.VRDetector = VRDetector;
} 