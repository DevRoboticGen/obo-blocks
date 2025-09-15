/**
 * ESP32 Package Manager
 * Downloads and compiles MicroPython packages to .mpy bytecode
 */

// Use named exports from build API for reliable tree-shaking and availability
import { compile as buildCompile, compile_v6 as buildCompileV6 } from "@pybricks/mpy-cross-v6/build/index.js";

class ESP32PackageManager {
    constructor() {
        this.mpyCross = null;
    }

    /**
     * Fetch package information from MicroPython package index
     */
    async fetchPackageInfo(packageName) {
        try {
            // Fetch the official MicroPython package index
            const indexUrl = 'https://micropython.org/pi/v2/index.json';
            console.log(`Fetching package index from: ${indexUrl}`);

            const response = await fetch(indexUrl);
            if (!response.ok) {
                throw new Error(`Failed to fetch package index: ${response.status}`);
            }

            const indexData = await response.json();

            // Find the package in the index
            const packageInfo = indexData.packages.find(pkg => pkg.name === packageName);
            if (!packageInfo) {
                throw new Error(`Package '${packageName}' not found in MicroPython package index`);
            }

            console.log(`Found package ${packageName}:`, packageInfo);

            // Construct download URLs based on package path
            const baseUrls = {
                github: `https://raw.githubusercontent.com/micropython/micropython-lib/master/${packageInfo.path}`,
                jsdelivr: `https://cdn.jsdelivr.net/gh/micropython/micropython-lib@master/${packageInfo.path}`
            };

            // Check for main module file
            const filename = `${packageName}.py`;
            const fileUrl = `${baseUrls.jsdelivr}/${filename}`;

            return {
                name: packageInfo.name,
                version: packageInfo.version,
                description: packageInfo.description,
                path: packageInfo.path,
                filename,
                fileUrl
            };

        } catch (error) {
            console.error(`Error fetching package info for ${packageName}:`, error);
            throw error;
        }
    }

    // No separate init when using compile_v6 API with explicit wasm URL

    /**
     * Compile Python source to .mpy bytecode
     */
    async compilePythonToMpy(pythonSource, filename) {
        // Prefer explicit wasm URL served by the app for browser build
        const wasmUrlV6 = '/assets/micropython/mpy-cross-v6.wasm';

        // Use consistent flags tested in Node scripts
        const opts = ['-O3', '-march=xtensawin'];
        const compiler = (typeof buildCompileV6 === 'function') ? buildCompileV6 : (typeof buildCompile === 'function' ? buildCompile : null);
        if (!compiler) {
            throw new Error('mpy-cross build API not available');
        }
        const result = await compiler(filename, pythonSource, opts, wasmUrlV6);
        if (!result || result.status !== 0) {
            const stdout = result?.out?.join('\n') || '';
            const stderr = result?.err?.join('\n') || '';
            throw new Error(`mpy-cross failed\n${stdout}\n${stderr}`);
        }

        const mpyBytes = result.mpy;
        return {
            filename: filename.replace(/\.py$/, '.mpy'),
            data: mpyBytes,
            size: mpyBytes.length,
            originalSize: pythonSource.length,
            compressionRatio: (pythonSource.length / mpyBytes.length).toFixed(2)
        };
    }

    /**
     * Download and compile package file
     */
    async downloadAndCompile(packageInfo, progressCallback) {
        const { filename, fileUrl } = packageInfo;

        if (progressCallback) progressCallback(10, `Downloading ${filename}...`);

        const response = await fetch(fileUrl);
        if (!response.ok) {
            throw new Error(`Failed to download ${filename}: ${response.status}`);
        }

        const pythonSource = await response.text();
        if (progressCallback) progressCallback(30, `Downloaded ${pythonSource.length} bytes`);

        if (progressCallback) progressCallback(50, 'Compiling to .mpy...');
        const compiled = await this.compilePythonToMpy(pythonSource, filename);

        if (progressCallback) progressCallback(100, `✅ Compiled ${compiled.filename}`);

        return compiled;
    }

    /**
     * Get a MicroPython package (download + compile to .mpy)
     */
    async getPackage(packageName, progressCallback) {
        if (progressCallback) progressCallback(0, `Getting package: ${packageName}`);

        const packageInfo = await this.fetchPackageInfo(packageName);
        if (progressCallback) progressCallback(20, 'Package info fetched');

        const compiled = await this.downloadAndCompile(packageInfo, (percent, message) => {
            const scaledPercent = 20 + (percent * 0.8);
            if (progressCallback) progressCallback(Math.round(scaledPercent), message);
        });

        return {
            packageName,
            filename: compiled.filename,
            data: compiled.data,
            size: compiled.size,
            originalSize: compiled.originalSize,
            compressionRatio: compiled.compressionRatio
        };
    }

    /**
     * Get list of popular MicroPython packages
     */
    getPopularPackages() {
        return [
            {
                name: 'ssd1306',
                description: 'SSD1306 OLED display driver',
                category: 'Display'
            },
        ];
    }
}

export default ESP32PackageManager;
