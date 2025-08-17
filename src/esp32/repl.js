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
}

export default ESP32REPL;
