/**
 * ESP32 Detection Module
 * Uses Web Serial API to detect and identify ESP32 devices
 */

class ESP32Detector {
    constructor() {
        this.devices = [];
        this.isSupported = this.checkWebSerialSupport();
    }

    /**
     * Check if Web Serial API is supported in the current browser
     */
    checkWebSerialSupport() {
        return 'serial' in navigator && 'requestPort' in navigator.serial;
    }

    /**
     * Get list of previously authorized ports
     */
    async getAuthorizedPorts() {
        if (!this.isSupported) {
            throw new Error('Web Serial API is not supported in this browser');
        }

        try {
            const ports = await navigator.serial.getPorts();
            return ports;
        } catch (error) {
            console.error('Error getting authorized ports:', error);
            throw error;
        }
    }

    /**
     * Request user to select a serial port
     */
    async requestPort() {
        if (!this.isSupported) {
            throw new Error('Web Serial API is not supported in this browser');
        }

        try {
            // Filter for ESP32-related devices
            const port = await navigator.serial.requestPort({
                // Optional: Add filters for ESP32 devices
                // filters: [
                //   { usbVendorId: 0x10C4 }, // Silicon Labs CP210x
                //   { usbVendorId: 0x1A86 }, // CH340
                //   { usbVendorId: 0x303A }, // ESP32-S3
                // ]
            });

            return port;
        } catch (error) {
            if (error.name === 'NotFoundError') {
                throw new Error('No port selected by user');
            }
            console.error('Error requesting port:', error);
            throw error;
        }
    }

    /**
     * Get information about a serial port
     */
    async getPortInfo(port) {
        try {
            const info = port.getInfo();
            return {
                port: port,
                usbVendorId: info.usbVendorId,
                usbProductId: info.usbProductId,
                // Additional info will be available when port is opened
            };
        } catch (error) {
            console.error('Error getting port info:', error);
            return {
                port: port,
                error: error.message
            };
        }
    }

    /**
     * Detect ESP32 devices by checking port characteristics
     */
    async detectESP32Devices() {
        if (!this.isSupported) {
            throw new Error('Web Serial API is not supported in this browser');
        }

        const devices = [];

        try {
            // Get previously authorized ports
            const authorizedPorts = await this.getAuthorizedPorts();

            for (const port of authorizedPorts) {
                try {
                    const deviceInfo = await this.getPortInfo(port);

                    // Try to identify ESP32 by opening the port and checking characteristics
                    const isESP32 = await this.identifyESP32(port);

                    if (isESP32) {
                        devices.push({
                            ...deviceInfo,
                            name: this.getDeviceName(deviceInfo.usbVendorId, deviceInfo.usbProductId),
                            type: 'ESP32',
                            connected: false
                        });
                    }
                } catch (error) {
                    console.warn('Error checking port:', error);
                    // Continue with other ports
                }
            }

            this.devices = devices;
            return devices;
        } catch (error) {
            console.error('Error detecting ESP32 devices:', error);
            throw error;
        }
    }

    /**
     * Identify if a port is connected to an ESP32 device
     */
    async identifyESP32(port) {
        try {
            // Try to open the port with ESP32 common baud rates
            const baudRates = [115200, 921600, 460800, 230400];

            for (const baudRate of baudRates) {
                try {
                    await port.open({ baudRate });

                    // Try to detect ESP32 by sending a command and checking response
                    const isESP32 = await this.testESP32Connection(port);

                    await port.close();

                    if (isESP32) {
                        return true;
                    }
                } catch (error) {
                    // Try next baud rate
                    continue;
                }
            }

            return false;
        } catch (error) {
            console.warn('Error identifying ESP32:', error);
            return false;
        }
    }

    /**
     * Test if the connected device responds like an ESP32
     */
    async testESP32Connection(port) {
        try {
            const writer = port.writable.getWriter();
            const reader = port.readable.getReader();

            // Send a soft reset command
            const resetCommand = new Uint8Array([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
            await writer.write(resetCommand);

            // Wait for response
            const { value, done } = await reader.read();

            writer.releaseLock();
            reader.releaseLock();

            // Check if response contains ESP32 bootloader signature
            if (value && value.length > 0) {
                // Look for common ESP32 bootloader responses
                const response = new TextDecoder().decode(value);
                return response.includes('ESP32') ||
                    response.includes('MicroPython') ||
                    response.includes('>>>');
            }

            return false;
        } catch (error) {
            console.warn('Error testing ESP32 connection:', error);
            return false;
        }
    }

    /**
 * Check if device is likely an ESP32 based on USB vendor/product IDs
 */
    isLikelyESP32(vendorId, productId) {
        // Common ESP32 USB vendor IDs
        const esp32Vendors = [
            0x10C4, // Silicon Labs CP210x
            0x1A86, // CH340
            0x303A, // ESP32-S3
            0x0403, // FTDI
            0x2341, // Arduino (some ESP32 boards)
            0x2E8A, // Raspberry Pi Pico (some ESP32 boards)
            0x0483, // STMicroelectronics (some ESP32 boards)
        ];

        return esp32Vendors.includes(vendorId);
    }

    /**
     * Get device name based on USB vendor and product IDs
     */
    getDeviceName(vendorId, productId) {
        const deviceMap = {
            // Silicon Labs CP210x (common ESP32 boards)
            0x10C4: {
                0xEA60: 'ESP32 DevKit (CP210x)',
                0xEA61: 'ESP32 DevKit (CP210x)',
                0xEA70: 'ESP32 DevKit (CP210x)',
                0xEA71: 'ESP32 DevKit (CP210x)',
                default: 'ESP32 (CP210x)'
            },
            // CH340 (common in many ESP32 boards)
            0x1A86: {
                0x7523: 'ESP32 DevKit (CH340)',
                0x7522: 'ESP32 DevKit (CH340)',
                default: 'ESP32 (CH340)'
            },
            // ESP32-S3 with native USB
            0x303A: {
                0x1001: 'ESP32-S3 DevKit',
                0x4004: 'ESP32-S3 DevKit',
                default: 'ESP32-S3'
            },
            // FTDI (less common but possible)
            0x0403: {
                0x6001: 'ESP32 (FTDI)',
                default: 'ESP32 (FTDI)'
            },
            // Arduino (some ESP32 boards)
            0x2341: {
                default: 'ESP32 (Arduino)'
            },
            // Raspberry Pi Pico (some ESP32 boards)
            0x2E8A: {
                default: 'ESP32 (Pico)'
            },
            // STMicroelectronics (some ESP32 boards)
            0x0483: {
                default: 'ESP32 (STMicro)'
            }
        };

        const vendor = deviceMap[vendorId];
        if (vendor) {
            return vendor[productId] || vendor.default || 'Unknown ESP32';
        }

        return 'Unknown Device';
    }

    /**
 * Request user to select an ESP32 device
 */
    async selectDevice() {
        try {
            const port = await this.requestPort();
            const deviceInfo = await this.getPortInfo(port);

            // Check if it's likely an ESP32 based on USB vendor/product IDs
            const isLikelyESP32 = this.isLikelyESP32(deviceInfo.usbVendorId, deviceInfo.usbProductId);

            if (!isLikelyESP32) {
                console.warn('Selected device may not be an ESP32, but proceeding anyway...');
                // Don't throw error, just warn and proceed
            }

            return {
                ...deviceInfo,
                name: this.getDeviceName(deviceInfo.usbVendorId, deviceInfo.usbProductId),
                type: 'ESP32',
                connected: false
            };
        } catch (error) {
            console.error('Error selecting device:', error);
            throw error;
        }
    }

    /**
     * Get current list of detected devices
     */
    getDevices() {
        return this.devices;
    }

    /**
     * Check if any ESP32 devices are available
     */
    hasDevices() {
        return this.devices.length > 0;
    }

    /**
     * Get browser compatibility information
     */
    getCompatibilityInfo() {
        return {
            webSerialSupported: this.isSupported,
            browser: navigator.userAgent,
            platform: navigator.platform,
            vendor: navigator.vendor
        };
    }
}

// Export the detector class
export default ESP32Detector;
