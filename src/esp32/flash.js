/**
 * ESP32 Firmware Flashing Module
 * Downloads and flashes MicroPython firmware to ESP32 devices
 * Uses official esptool-js library for reliable flashing
 */

import { ESPLoader, Transport, HardReset } from 'esptool-js';

class ESP32Flasher {
    constructor() {
        this.firmwareInfo = {
            version: 'v1.26.0',
            date: '2025-08-09',
            url: 'firmware/esp32-GENERIC-20250809-v1.26.0.bin',
            offset: 0x1000
        };
    }

    /**
     * Get firmware info
     */
    getFirmwareInfo() {
        return this.firmwareInfo;
    }

    /**
     * Download firmware from local assets
     */
    async downloadFirmware(firmwareInfo) {
        try {
            console.log(`Loading MicroPython ${firmwareInfo.version} from local assets...`);

            // Try multiple possible paths
            const possiblePaths = [
                firmwareInfo.url,
                `/firmware/${firmwareInfo.url.split('/').pop()}`,
                `./firmware/${firmwareInfo.url.split('/').pop()}`,
                `../firmware/${firmwareInfo.url.split('/').pop()}`
            ];

            let response = null;
            let lastError = null;

            for (const path of possiblePaths) {
                try {
                    console.log(`Trying path: ${path}`);
                    response = await fetch(path);
                    if (response.ok) {
                        console.log(`Successfully loaded from: ${path}`);
                        break;
                    }
                } catch (error) {
                    lastError = error;
                    console.log(`Failed to load from ${path}:`, error.message);
                }
            }

            if (!response || !response.ok) {
                throw new Error(`Failed to load firmware from any path. Last error: ${lastError?.message || 'Unknown error'}. Please ensure the firmware file is placed in src/assets/firmware/`);
            }

            const firmwareData = await response.arrayBuffer();
            console.log(`Loaded ${firmwareData.byteLength} bytes`);

            if (firmwareData.byteLength < 1000000) { // Less than 1MB
                throw new Error('Firmware file appears to be too small. Please check if the file was downloaded correctly.');
            }

            // Convert to Uint8Array and ensure it's the right format
            const firmwareArray = new Uint8Array(firmwareData);
            console.log('Firmware data type:', typeof firmwareArray);
            console.log('Firmware data length:', firmwareArray.length);

            return firmwareArray;
        } catch (error) {
            console.error('Error loading firmware:', error);
            throw new Error(`Failed to load firmware: ${error.message}. Please download the firmware file from https://micropython.org/download/ESP32_GENERIC/ and place it in src/assets/firmware/`);
        }
    }

    /**
     * Flash firmware to ESP32 using official esptool-js
     */
    async flashFirmware(device, firmwareInfo, progressCallback) {
        try {
            // Download firmware first
            progressCallback(10, 'Downloading firmware...');
            const firmwareData = await this.downloadFirmware(firmwareInfo);

            // Create terminal for esptool-js that matches official demo output
            const terminal = {
                clean: () => {
                    console.log('Terminal clean');
                },
                writeLine: (data) => {
                    console.log(data);
                    // Update progress based on key messages
                    if (data.includes('Detecting chip type')) {
                        progressCallback(32, 'Detecting chip type...');
                    } else if (data.includes('Chip is ESP32')) {
                        progressCallback(33, 'Chip detected: ESP32');
                    } else if (data.includes('Uploading stub')) {
                        progressCallback(34, 'Uploading stub...');
                    } else if (data.includes('Running stub')) {
                        progressCallback(35, 'Running stub...');
                    } else if (data.includes('Stub running')) {
                        progressCallback(36, 'Stub running...');
                    } else if (data.includes('Erasing flash')) {
                        progressCallback(37, 'Erasing flash...');
                    } else if (data.includes('Chip erase completed')) {
                        progressCallback(38, 'Chip erase completed');
                    } else if (data.includes('Writing at 0x')) {
                        // Extract percentage from writing progress
                        const match = data.match(/\((\d+)%\)/);
                        if (match) {
                            const percent = parseInt(match[1]);
                            const flashProgress = 40 + Math.floor((percent / 100) * 45); // 40-85%
                            progressCallback(flashProgress, `Writing firmware... ${percent}%`);
                        }
                    } else if (data.includes('Wrote') && data.includes('bytes')) {
                        progressCallback(85, 'Firmware written successfully');
                    } else if (data.includes('Hash of data verified')) {
                        progressCallback(90, 'Hash verification successful');
                    } else if (data.includes('Leaving')) {
                        progressCallback(95, 'Leaving...');
                    } else if (data.includes('Hard resetting')) {
                        progressCallback(98, 'Hard resetting...');
                    }
                },
                write: (data) => {
                    console.log(data);
                }
            };

            // Initialize ESPLoader with the device port
            progressCallback(20, 'Initializing ESP32 connection...');

            // Check port state but don't open it manually
            console.log('Port state:', {
                readable: device.port.readable,
                writable: device.port.writable
            });

            // Create transport with proper configuration
            console.log('Creating transport...');
            const transport = new Transport(device.port);
            console.log('Creating ESPLoader...');
            const loader = new ESPLoader({
                transport: transport,
                baudrate: 115200,
                terminal: terminal
            });
            console.log('ESPLoader created successfully');

            // Connect to ESP32 (simplified like official demo)
            progressCallback(30, 'Connecting to ESP32...');
            console.log('Connecting...');

            const chip = await loader.connect();
            console.log('Connected to chip:', chip);

            // Flash the firmware (simplified like official demo)
            progressCallback(40, 'Flashing firmware...');
            const flashAddress = firmwareInfo.offset;

            // Ensure firmware data is in the correct format
            console.log('Firmware data before flash:', {
                type: typeof firmwareData,
                constructor: firmwareData.constructor.name,
                length: firmwareData.length,
                isArray: Array.isArray(firmwareData),
                isUint8Array: firmwareData instanceof Uint8Array
            });

            // Convert Uint8Array to string for esptool-js
            console.log('Converting firmware data to string...');
            const flashDataString = Array.from(firmwareData)
                .map(byte => String.fromCharCode(byte))
                .join('');
            console.log('Converted to string, length:', flashDataString.length);

            await loader.writeFlash({
                fileArray: [{
                    data: flashDataString,
                    address: flashAddress
                }],
                flashSize: 'keep',
                eraseAll: false, // Don't erase entire chip, just write firmware
                compress: true, // Enable compression like official demo
                reportProgress: (progress) => {
                    // Progress is handled by terminal.writeLine now
                }
            });

            // Reset device using HardReset class
            progressCallback(98, 'Hard resetting...');
            const hardReset = new HardReset(transport);
            await hardReset.reset();

            progressCallback(100, 'Firmware flashed successfully!');
            console.log('Firmware flashing completed successfully');

            return true;
        } catch (error) {
            console.error('Error flashing firmware:', error);
            throw error;
        }
    }

    /**
     * Get firmware info for display
     */
    getFirmwareInfoForDisplay() {
        return this.firmwareInfo;
    }
}

export default ESP32Flasher;
