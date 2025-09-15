/**
 * ESP32 File Utilities
 * Handles file upload and execution using REPL commands
 */

class ESP32FileUtils {
    constructor(replInstance) {
        this.repl = replInstance;
        this.originalDataHandler = null;
    }

    /**
     * Execute a command silently (without showing in main REPL UI)
     */
    async executeCommandSilently(command, timeout = 10000) {
        return new Promise((resolve, reject) => {
            if (!this.repl || !this.repl.isREPLConnected()) {
                reject(new Error('REPL not connected'));
                return;
            }

            let isResolved = false;
            let responseBuffer = '';

            // Set up timeout
            const timeoutHandle = setTimeout(() => {
                if (!isResolved) {
                    isResolved = true;
                    this.restoreDataHandler();
                    reject(new Error(`Command timeout: ${command}`));
                }
            }, timeout);

            // Temporarily hijack the data handler
            this.originalDataHandler = this.repl.onDataReceived;

            this.repl.onDataReceived = (data) => {
                responseBuffer += data;

                // Check for command completion or errors
                if (data.includes('>>> ') || data.includes('Traceback') || data.includes('Error:')) {
                    if (!isResolved) {
                        isResolved = true;
                        clearTimeout(timeoutHandle);
                        this.restoreDataHandler();

                        if (data.includes('Traceback') || data.includes('Error:')) {
                            reject(new Error(`Command failed: ${responseBuffer.trim()}`));
                        } else {
                            resolve(responseBuffer.trim());
                        }
                    }
                }
            };

            // Send the command (without adding to history for silent execution)
            const originalAddToHistory = this.repl.addToHistory;
            this.repl.addToHistory = () => { }; // Temporarily disable history

            this.repl.sendCommand(command).catch((error) => {
                if (!isResolved) {
                    isResolved = true;
                    clearTimeout(timeoutHandle);
                    this.restoreDataHandler();
                    this.repl.addToHistory = originalAddToHistory;
                    reject(error);
                }
            });

            this.repl.addToHistory = originalAddToHistory; // Restore history
        });
    }

    /**
     * Restore the original data handler
     */
    restoreDataHandler() {
        if (this.originalDataHandler) {
            this.repl.onDataReceived = this.originalDataHandler;
            this.originalDataHandler = null;
        }
    }

    /**
     * Execute multi-line code using paste mode (CTRL-E)
     * More reliable for complex Python code with proper indentation
     */
    async executePasteMode(code, timeout = 15000) {
        return new Promise((resolve, reject) => {
            if (!this.repl || !this.repl.isREPLConnected()) {
                reject(new Error('REPL not connected'));
                return;
            }

            let isResolved = false;
            let responseBuffer = '';
            let inPasteMode = false;

            // Set up timeout
            const timeoutHandle = setTimeout(() => {
                if (!isResolved) {
                    isResolved = true;
                    this.restoreDataHandler();
                    reject(new Error('Paste mode timeout'));
                }
            }, timeout);

            // Temporarily hijack the data handler
            this.originalDataHandler = this.repl.onDataReceived;

            this.repl.onDataReceived = (data) => {
                responseBuffer += data;

                // Check for paste mode entry
                if (data.includes('paste mode; Ctrl-C to cancel, Ctrl-D to finish')) {
                    inPasteMode = true;
                    // Send the code followed by CTRL-D to finish
                    this.sendRawData(code + '\x04');
                }

                // Check for completion after paste mode
                if (inPasteMode && (data.includes('>>> ') || data.includes('Traceback') || data.includes('Error:'))) {
                    if (!isResolved) {
                        isResolved = true;
                        clearTimeout(timeoutHandle);
                        this.restoreDataHandler();

                        if (data.includes('Traceback') || data.includes('Error:')) {
                            reject(new Error(`Paste mode failed: ${responseBuffer.trim()}`));
                        } else {
                            resolve(responseBuffer.trim());
                        }
                    }
                }
            };

            // Enter paste mode with CTRL-E
            this.sendRawData('\x05');
        });
    }

    /**
     * Send raw data to REPL without command processing
     */
    async sendRawData(data) {
        if (!this.repl || !this.repl.writer) {
            throw new Error('REPL writer not available');
        }

        const dataBytes = new TextEncoder().encode(data);
        await this.repl.writer.write(dataBytes);
    }

    /**
     * Upload a text file using paste mode (more reliable for Python source)
     */
    async uploadTextFile(textContent, filename, progressCallback) {
        try {
            const targetPath = filename;

            if (progressCallback) {
                progressCallback(0, `Uploading text file ${filename}...`);
            }

            // Escape single quotes in the text content for Python string literal
            const escapedContent = textContent.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

            if (progressCallback) {
                progressCallback(30, 'Using paste mode for reliable transfer...');
            }

            // Use paste mode to upload the file creation script
            const fileUploadScript = `
# File upload script for ${filename}
import os

# Create the file content
content = '''${escapedContent}'''

# Write to file
with open('${targetPath}', 'w') as f:
    f.write(content)

print(f"File {filename} uploaded successfully")
`;

            await this.executePasteMode(fileUploadScript);

            if (progressCallback) {
                progressCallback(100, `✅ ${filename} uploaded successfully using paste mode`);
            }

            return {
                success: true,
                filename,
                targetPath,
                size: textContent.length,
                method: 'paste_mode'
            };

        } catch (error) {
            console.error('Error uploading text file:', error);
            if (progressCallback) {
                progressCallback(0, `❌ Text upload failed: ${error.message}`);
            }
            throw error;
        }
    }

    /**
     * Upload a binary file using base64 encoding
     */
    async uploadBinaryFile(fileData, filename, progressCallback) {
        try {
            const isLibraryFile = filename.endsWith('.mpy');
            const targetPath = isLibraryFile ? `/lib/${filename}` : filename;

            if (progressCallback) {
                progressCallback(0, `Uploading binary ${filename} to ${targetPath}...`);
            }

            // Create lib directory if needed (short paste snippet)
            if (isLibraryFile) {
                try {
                    await this.executePasteMode(`\nimport os\ntry:\n    os.mkdir('/lib')\nexcept Exception as _e:\n    pass\nprint('ok')\n`);
                } catch (error) {
                    console.log('Directory creation note:', error.message);
                }
            }

            if (progressCallback) {
                progressCallback(10, 'Setting up binary transfer...');
            }

            // Prefer chunked hex writer for .mpy to avoid paste timeouts
            if (isLibraryFile) {
                const bytes = fileData instanceof Uint8Array ? fileData : new Uint8Array(fileData.buffer || fileData);
                // Prepare short writer setup on device (paste mode, tiny payload)
                await this.executePasteMode(`\ntry:\n import binascii\n h=binascii.unhexlify\n h('')\nexcept:\n h=lambda s: bytes(int(s[i:i+2], 16) for i in range(0, len(s), 2))\nf=open('.obo_tmp','wb')\nw=lambda d: f.write(h(d))\no=f.write\nprint('ready')\n`);

                const chunkSize = 64;
                const total = bytes.byteLength;
                const hexlify = (arr) => Array.from(arr).map(x => x.toString(16).padStart(2, '0')).join('');
                const reprBytes = (arr) => {
                    let s = "b'";
                    for (const b of arr) {
                        if (b >= 32 && b <= 126) {
                            if (b === 92 || b === 39) s += '\\' + String.fromCharCode(b); else s += String.fromCharCode(b);
                        } else {
                            s += '\\x' + b.toString(16).padStart(2, '0');
                        }
                    }
                    return s + "'";
                };
                for (let i = 0; i < total; i += chunkSize) {
                    const chunk = bytes.slice(i, i + chunkSize);
                    const cmdHex = "w('" + hexlify(chunk) + "')";
                    const cmdRepr = "o(" + reprBytes(chunk) + ")";
                    const cmd = cmdHex.length < cmdRepr.length ? cmdHex : cmdRepr;
                    await this.executeCommandSilently(cmd, 10000);
                    if (progressCallback) {
                        const pct = 30 + Math.floor(((i + chunkSize) / total) * 60);
                        progressCallback(pct, `Uploading chunk ${Math.ceil((i + chunkSize) / chunkSize)}`);
                    }
                }

                // Finalize: rename temp to destination (paste mode, tiny payload)
                await this.executePasteMode(`\nimport os\ntry:\n    f.close()\nexcept: pass\ntry:\n    os.remove('${targetPath}')\nexcept: pass\nos.rename('.obo_tmp','${targetPath}')\nprint('done')\n`);
            } else {
                // Fallback: base64 paste for other binaries
                const base64Data = this.arrayBufferToBase64(fileData.buffer || fileData);
                const binaryUploadScript = `
# Binary file upload script for ${filename}
import binascii
base64_chunks = [
${this.splitIntoChunks(base64Data, 240).map(chunk => `    '${chunk}'`).join(',\n')}
]
base64_data = ''.join(base64_chunks)
binary_data = binascii.a2b_base64(base64_data)
with open('${targetPath}', 'wb') as f:
    f.write(binary_data)
print('ok')
`;

                if (progressCallback) {
                    progressCallback(30, 'Transferring binary data using paste mode...');
                }

                await this.executePasteMode(binaryUploadScript);
            }

            if (progressCallback) {
                progressCallback(100, `✅ ${filename} uploaded successfully to ${targetPath}`);
            }

            return {
                success: true,
                filename,
                targetPath,
                size: fileData.length || fileData.byteLength,
                method: 'paste_mode_binary'
            };

        } catch (error) {
            console.error('Error uploading binary file:', error);
            if (progressCallback) {
                progressCallback(0, `❌ Binary upload failed: ${error.message}`);
            }
            throw error;
        }
    }

    /**
     * Upload a file to ESP32 (chooses best method based on file type)
     */
    async uploadFile(fileData, filename, progressCallback) {
        try {
            // Determine if this is a text file that can benefit from paste mode
            const isTextFile = filename.endsWith('.py') || filename.endsWith('.txt') || filename.endsWith('.json');

            if (isTextFile && typeof fileData === 'string') {
                // Use paste mode for text files
                return await this.uploadTextFile(fileData, filename, progressCallback);
            } else if (isTextFile && fileData instanceof Uint8Array) {
                // Convert Uint8Array to string for text files
                const textContent = new TextDecoder().decode(fileData);
                return await this.uploadTextFile(textContent, filename, progressCallback);
            } else {
                // Use base64 method for binary files (.mpy, etc.)
                return await this.uploadBinaryFile(fileData, filename, progressCallback);
            }

        } catch (error) {
            console.error('Error uploading file:', error);
            if (progressCallback) {
                progressCallback(0, `❌ Upload failed: ${error.message}`);
            }
            throw error;
        }
    }

    /**
     * Split string into chunks of specified size
     */
    splitIntoChunks(str, chunkSize) {
        const chunks = [];
        for (let i = 0; i < str.length; i += chunkSize) {
            chunks.push(str.slice(i, i + chunkSize));
        }
        return chunks;
    }

    /**
     * Check if a file exists on ESP32
     */
    async fileExists(filepath) {
        try {
            // Escape the filepath for Python string
            const escapedPath = filepath.replace(/'/g, "\\'");

            const result = await this.executeCommandSilently(
                `import os; ` +
                `try: ` +
                `print('${escapedPath}' in os.listdir('/' if '${escapedPath}'.startswith('/') else '.')); ` +
                `except: print(False)`
            );

            return result.includes('True');
        } catch (error) {
            console.error('Error checking file existence:', error);
            return false;
        }
    }

    /**
     * Run a Python file on ESP32
     */
    async runFile(filename, progressCallback) {
        try {
            const isLibraryFile = filename.endsWith('.mpy');
            const targetPath = isLibraryFile ? `/lib/${filename}` : filename;
            const moduleName = filename.replace(/\.(py|mpy)$/, '');

            if (progressCallback) {
                progressCallback(0, `Running ${filename}...`);
            }

            // Check if file exists
            if (progressCallback) {
                progressCallback(20, 'Checking file existence...');
            }

            const exists = await this.fileExists(targetPath);
            if (!exists) {
                throw new Error(`File ${targetPath} not found on ESP32`);
            }

            if (progressCallback) {
                progressCallback(50, 'Importing and executing...');
            }

            // For library files, just import them using paste mode for reliability
            if (isLibraryFile) {
                const importScript = `
# Import script for library ${moduleName}
import sys

# Add /lib to sys.path if not already there
if '/lib' not in sys.path:
    sys.path.append('/lib')
    print("Added /lib to sys.path")

# Import the module
try:
    import ${moduleName}
    print(f"✅ Library {moduleName} imported successfully")
except ImportError as e:
    print(f"❌ Failed to import {moduleName}: {e}")
    raise
except Exception as e:
    print(f"❌ Error importing {moduleName}: {e}")
    raise
`;

                await this.executePasteMode(importScript);

                if (progressCallback) {
                    progressCallback(100, `✅ Library ${moduleName} imported successfully using paste mode`);
                }

                return {
                    success: true,
                    filename,
                    type: 'library',
                    action: 'imported',
                    method: 'paste_mode'
                };
            } else {
                // For regular Python files, execute them using paste mode for better error handling
                const execScript = `
# Execute script ${filename}
try:
    exec(open('${filename}').read())
    print(f"✅ Script {filename} executed successfully")
except FileNotFoundError:
    print(f"❌ File {filename} not found")
    raise
except SyntaxError as e:
    print(f"❌ Syntax error in {filename}: {e}")
    raise
except Exception as e:
    print(f"❌ Error executing {filename}: {e}")
    raise
`;

                await this.executePasteMode(execScript);

                if (progressCallback) {
                    progressCallback(100, `✅ Script ${filename} executed successfully using paste mode`);
                }

                return {
                    success: true,
                    filename,
                    type: 'script',
                    action: 'executed',
                    method: 'paste_mode'
                };
            }

        } catch (error) {
            console.error('Error running file:', error);
            if (progressCallback) {
                progressCallback(0, `❌ Execution failed: ${error.message}`);
            }
            throw error;
        }
    }

    /**
     * List files on ESP32
     */
    async listFiles(directory = '/') {
        try {
            const result = await this.executeCommandSilently(
                `import os; ` +
                `try: [print(f) for f in os.listdir('${directory}')]; ` +
                `except Exception as e: print('Error:', str(e))`
            );

            // Parse the file list from the result
            const lines = result.split('\n').filter(line =>
                line.trim() &&
                !line.includes('>>>') &&
                !line.includes('Error:') &&
                line.trim() !== ''
            );

            return lines.map(line => line.trim());
        } catch (error) {
            console.error('Error listing files:', error);
            return [];
        }
    }

    /**
     * Delete a file from ESP32
     */
    async deleteFile(filepath, progressCallback) {
        try {
            if (progressCallback) {
                progressCallback(0, `Deleting ${filepath}...`);
            }

            // Check if file exists first
            const exists = await this.fileExists(filepath);
            if (!exists) {
                throw new Error(`File ${filepath} not found`);
            }

            if (progressCallback) {
                progressCallback(50, 'Removing file...');
            }

            await this.executeCommandSilently(`import os; os.remove('${filepath}'); print('File ${filepath} deleted')`);

            if (progressCallback) {
                progressCallback(100, `✅ ${filepath} deleted successfully`);
            }

            return {
                success: true,
                filename: filepath,
                action: 'deleted'
            };

        } catch (error) {
            console.error('Error deleting file:', error);
            if (progressCallback) {
                progressCallback(0, `❌ Delete failed: ${error.message}`);
            }
            throw error;
        }
    }

    /**
     * Get file information from ESP32
     */
    async getFileInfo(filepath) {
        try {
            const result = await this.executeCommandSilently(
                `import os; ` +
                `try: stat = os.stat('${filepath}'); print('Size:', stat[6]); print('Type:', 'file' if stat[0] & 0x8000 else 'directory'); ` +
                `except Exception as e: print('Error:', str(e))`
            );

            const lines = result.split('\n');
            const info = {};

            for (const line of lines) {
                if (line.includes('Size:')) {
                    info.size = parseInt(line.split(':')[1].trim());
                } else if (line.includes('Type:')) {
                    info.type = line.split(':')[1].trim();
                }
            }

            return info;
        } catch (error) {
            console.error('Error getting file info:', error);
            return null;
        }
    }

    /**
     * Convert ArrayBuffer to base64 string
     */
    arrayBufferToBase64(buffer) {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }

    /**
     * Delay helper
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

export default ESP32FileUtils;
