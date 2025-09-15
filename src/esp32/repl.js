/**
 * ESP32 REPL Module
 * Provides interactive REPL functionality for MicroPython commands
 */

class ESP32REPL {
    constructor() {
        this.port = null;
        this.reader = null;
        this.writer = null;
        this.isConnected = false;
        this.commandHistory = [];
        this.historyIndex = -1;
    }

    /**
     * Open REPL connection to ESP32
     */
    async openREPL(device) {
        try {
            this.port = device.port;

            // Make sure port is open
            if (!this.port.readable) {
                await this.port.open({ baudRate: 115200 });
            }

            // Get reader and writer
            this.reader = this.port.readable.getReader();
            this.writer = this.port.writable.getWriter();

            this.isConnected = true;
            console.log('REPL connection opened');

            // Start reading from the port
            this.startReading();

            return true;
        } catch (error) {
            console.error('Error opening REPL:', error);
            throw error;
        }
    }

    /**
     * Start reading from the serial port
     */
    async startReading() {
        if (!this.reader) return;

        try {
            while (this.isConnected) {
                const { value, done } = await this.reader.read();

                if (done) {
                    console.log('REPL reader closed');
                    break;
                }

                if (value) {
                    // Convert Uint8Array to string
                    const text = new TextDecoder().decode(value);
                    this.onDataReceived(text);
                }
            }
        } catch (error) {
            console.error('Error reading from REPL:', error);
            this.isConnected = false;
        }
    }

    /**
     * Send command to ESP32
     */
    async sendCommand(command) {
        if (!this.isConnected || !this.writer) {
            throw new Error('REPL not connected');
        }

        try {
            // Add command to history
            this.addToHistory(command);

            // Convert command to Uint8Array and send
            const commandBytes = new TextEncoder().encode(command + '\r\n');
            await this.writer.write(commandBytes);

            console.log('Command sent:', command);
            return true;
        } catch (error) {
            console.error('Error sending command:', error);
            throw error;
        }
    }

    /**
     * Handle received data from ESP32
     */
    onDataReceived(data) {
        // This will be overridden by the UI
        console.log('Data received:', data);
    }

    /**
     * Add command to history
     */
    addToHistory(command) {
        if (command.trim()) {
            this.commandHistory.push(command);
            if (this.commandHistory.length > 50) {
                this.commandHistory.shift();
            }
            this.historyIndex = this.commandHistory.length;
        }
    }

    /**
     * Get previous command from history
     */
    getPreviousCommand() {
        if (this.historyIndex > 0) {
            this.historyIndex--;
            return this.commandHistory[this.historyIndex];
        }
        return '';
    }

    /**
     * Get next command from history
     */
    getNextCommand() {
        if (this.historyIndex < this.commandHistory.length - 1) {
            this.historyIndex++;
            return this.commandHistory[this.historyIndex];
        } else if (this.historyIndex === this.commandHistory.length - 1) {
            this.historyIndex++;
            return '';
        }
        return '';
    }

    /**
     * Close REPL connection
     */
    async closeREPL() {
        this.isConnected = false;

        try {
            if (this.reader) {
                await this.reader.cancel();
                this.reader.releaseLock();
                this.reader = null;
            }

            if (this.writer) {
                this.writer.releaseLock();
                this.writer = null;
            }

            console.log('REPL connection closed');
        } catch (error) {
            console.error('Error closing REPL:', error);
        }
    }

    /**
     * Check if REPL is connected
     */
    isREPLConnected() {
        return this.isConnected;
    }

    /**
     * Get connection status
     */
    getConnectionStatus() {
        return {
            isConnected: this.isConnected,
            port: this.port ? 'Connected' : 'Disconnected'
        };
    }

    /**
     * Execute Python code via paste mode (CTRL-E)
     * Perfect for running editor code directly on ESP32
     */
    async executePythonCode(pythonCode, options = {}) {
        if (!this.isConnected || !this.writer) {
            throw new Error('REPL not connected');
        }

        const timeout = options.timeout || 30000; // 30 seconds for code execution
        const showInREPL = options.showInREPL !== false; // Default to showing in REPL
        const debug = options.debug !== false; // Default to showing debug info

        return new Promise((resolve, reject) => {
            let isResolved = false;
            let responseBuffer = '';
            let inPasteMode = false;
            let originalDataHandler = null;

            // Set up timeout
            const timeoutHandle = setTimeout(() => {
                if (!isResolved) {
                    isResolved = true;
                    this.restoreDataHandler(originalDataHandler);
                    reject(new Error('Python code execution timeout'));
                }
            }, timeout);

            // If we want to hide from REPL UI, temporarily hijack data handler
            if (!showInREPL) {
                originalDataHandler = this.onDataReceived;
                this.onDataReceived = (data) => {
                    responseBuffer += data;
                    this.handlePasteModeResponse(data, resolve, reject, timeoutHandle, originalDataHandler, debug);
                };
            } else {
                // For visible execution, we need to track paste mode state differently
                originalDataHandler = this.onDataReceived;
                this.onDataReceived = (data) => {
                    // Still show in REPL but also track our execution
                    if (originalDataHandler) {
                        originalDataHandler(data);
                    }
                    responseBuffer += data;
                    this.handlePasteModeResponse(data, resolve, reject, timeoutHandle, originalDataHandler, debug);
                };
            }

            // Enter paste mode with CTRL-E
            this.sendRawData('\x05').then(() => {
                // Wait a bit for paste mode to be ready
                setTimeout(() => {
                    // Clean the Python code and send followed by CTRL-D
                    const cleanCode = this.cleanPythonCode(pythonCode);

                    // Debug: Log what we're actually sending (if debug enabled)
                    if (debug) {
                        console.log('Sending Python code via paste mode:', {
                            originalLength: pythonCode.length,
                            cleanedLength: cleanCode.length,
                            firstLine: cleanCode.split('\n')[0],
                            preview: cleanCode.substring(0, 50) + (cleanCode.length > 50 ? '...' : '')
                        });
                    }

                    this.sendRawData(cleanCode + '\x04').catch((error) => {
                        if (!isResolved) {
                            isResolved = true;
                            clearTimeout(timeoutHandle);
                            this.restoreDataHandler(originalDataHandler);
                            reject(error);
                        }
                    });
                }, 100);
            }).catch((error) => {
                if (!isResolved) {
                    isResolved = true;
                    clearTimeout(timeoutHandle);
                    this.restoreDataHandler(originalDataHandler);
                    reject(error);
                }
            });
        });
    }

    /**
     * Handle paste mode response data
     */
    handlePasteModeResponse(data, resolve, reject, timeoutHandle, originalDataHandler, debug = true) {
        // Debug: Log raw data received (if debug enabled)
        if (debug) {
            console.log('Paste mode response data:', {
                data: data,
                includes_paste_mode: data.includes('paste mode; Ctrl-C to cancel, Ctrl-D to finish'),
                includes_prompt: data.includes('>>> '),
                includes_error: data.includes('Traceback') || data.includes('Error:')
            });
        }

        // Check for paste mode entry
        if (data.includes('paste mode; Ctrl-C to cancel, Ctrl-D to finish')) {
            return; // Wait for more data
        }

        // Check for completion after paste mode
        if (data.includes('>>> ') || data.includes('Traceback') || data.includes('Error:')) {
            clearTimeout(timeoutHandle);
            this.restoreDataHandler(originalDataHandler);

            if (data.includes('Traceback') || data.includes('Error:')) {
                reject(new Error('Python execution failed - check REPL output for details'));
            } else {
                resolve({
                    success: true,
                    output: data,
                    message: 'Python code executed successfully'
                });
            }
        }
    }

    /**
     * Restore original data handler
     */
    restoreDataHandler(originalHandler) {
        if (originalHandler) {
            this.onDataReceived = originalHandler;
        }
    }

    /**
     * Clean Python code for reliable paste mode transmission
     */
    cleanPythonCode(pythonCode) {
        // Remove any BOM or invisible characters that might cause issues
        let cleaned = pythonCode.replace(/^\uFEFF/, ''); // Remove BOM

        // Normalize line endings to Unix style (\n)
        cleaned = cleaned.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

        // Remove any trailing whitespace but preserve the code structure
        cleaned = cleaned.split('\n').map(line => line.trimEnd()).join('\n');

        // Ensure the code ends with a single newline
        cleaned = cleaned.replace(/\n+$/, '') + '\n';

        return cleaned;
    }

    /**
     * Send raw data to REPL without command processing
     */
    async sendRawData(data) {
        if (!this.writer) {
            throw new Error('REPL writer not available');
        }

        // Ensure data is clean for transmission
        const cleanData = typeof data === 'string' ? data : String(data);
        const dataBytes = new TextEncoder().encode(cleanData);
        await this.writer.write(dataBytes);
    }

    /**
     * Quick execute - run Python code with minimal setup
     * Ideal for editor integration
     */
    async runPythonCode(code, silent = false) {
        try {
            const result = await this.executePythonCode(code, {
                showInREPL: !silent,
                timeout: 100000
            });

            return {
                success: true,
                platform: 'ESP32',
                result: result.output
            };
        } catch (error) {
            return {
                success: false,
                platform: 'ESP32',
                error: error.message
            };
        }
    }

    /**
     * Check if ESP32 execution is available
     */
    canExecuteOnESP32() {
        return this.isConnected && this.writer;
    }
}

export default ESP32REPL;
