const fs = require('fs');
const path = require('path');

class VideoUtils {
    /**
     * Check if file is a supported video format
     * @param {string} filePath - File path
     * @returns {boolean} - Whether it's a supported video format
     */
    static isSupportedVideoFormat(filePath) {
        const supportedFormats = ['.mp4', '.webm', '.avi', '.mov', '.mkv', '.m4v'];
        const ext = path.extname(filePath).toLowerCase();
        return supportedFormats.includes(ext);
    }

    /**
     * Get video file information
     * @param {string} filePath - File path
     * @returns {Object} - Video file information
     */
    static getVideoInfo(filePath) {
        try {
            const stats = fs.statSync(filePath);
            const ext = path.extname(filePath).toLowerCase();
            const fileName = path.basename(filePath);

            return {
                path: filePath,
                name: fileName,
                size: stats.size,
                sizeFormatted: this.formatFileSize(stats.size),
                extension: ext,
                lastModified: stats.mtime,
                isSupported: this.isSupportedVideoFormat(filePath)
            };
        } catch (error) {
            console.error('Error getting video info:', error);
            return null;
        }
    }

    /**
     * Format file size
     * @param {number} bytes - Bytes
     * @returns {string} - Formatted size
     */
    static formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';

        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));

        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    /**
     * Detect if video is 360-degree panoramic video
     * @param {string} filePath - File path
     * @returns {Promise<boolean>} - Whether it's a 360-degree video
     */
    static async is360Video(filePath) {
        // Simple detection based on filename and extension
        const fileName = path.basename(filePath).toLowerCase();
        const keywords = ['360', 'vr', 'panorama', 'spherical'];

        return keywords.some(keyword => fileName.includes(keyword));
    }

    /**
     * Get video duration (requires additional library support)
     * @param {string} filePath - File path
     * @returns {Promise<number>} - Video duration in seconds
     */
    static async getVideoDuration(filePath) {
        // Requires ffprobe or other video processing library
        // Returns 0 for now, needs implementation
        return 0;
    }

    /**
     * Scan directory for video files
     * @param {string} dirPath - Directory path
     * @returns {Array} - Video file list
     */
    static scanVideoFiles(dirPath) {
        const videoFiles = [];

        try {
            const files = fs.readdirSync(dirPath);

            files.forEach(file => {
                const filePath = path.join(dirPath, file);
                const stats = fs.statSync(filePath);

                if (stats.isFile() && this.isSupportedVideoFormat(filePath)) {
                    videoFiles.push(this.getVideoInfo(filePath));
                }
            });

            // Sort by filename
            videoFiles.sort((a, b) => a.name.localeCompare(b.name));

        } catch (error) {
            console.error('Error scanning directory:', error);
        }

        return videoFiles;
    }

    /**
     * Validate video file integrity
     * @param {string} filePath - File path
     * @returns {Promise<boolean>} - Whether file is complete
     */
    static async validateVideoFile(filePath) {
        try {
            const stats = fs.statSync(filePath);

            // Check if file size is reasonable (at least 1KB)
            if (stats.size < 1024) {
                return false;
            }

            // Check if file is readable
            const fd = fs.openSync(filePath, 'r');
            fs.closeSync(fd);

            return true;
        } catch (error) {
            console.error('Error validating video file:', error);
            return false;
        }
    }

    /**
     * Generate video thumbnail (requires additional library support)
     * @param {string} filePath - File path
     * @param {string} outputPath - Output path
     * @returns {Promise<string>} - Thumbnail path
     */
    static async generateThumbnail(filePath, outputPath) {
        // Requires ffmpeg or other video processing library
        // Returns empty string for now, needs implementation
        return '';
    }

    /**
     * Check system hardware acceleration support
     * @returns {Object} - Hardware acceleration support info
     */
    static getHardwareAccelerationInfo() {
        // Can add hardware acceleration detection logic
        return {
            h264: true,
            h265: false,
            vp9: true,
            av1: false
        };
    }
}

module.exports = VideoUtils; 