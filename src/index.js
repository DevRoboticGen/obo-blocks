import "./styles/index.css";

import "@fortawesome/fontawesome-free/js/fontawesome";
import "@fortawesome/fontawesome-free/js/solid";

import {
  editor,
  insertPythonSnippet,
  makeUneditable,
  saveAsPythonFile,
  loadModifiedCode,
  saveModifideCode,
  saveAsJsonFile,
} from "./editor/editor";

import * as Blockly from "blockly/core";
import { toolbox } from "./blocky/toolbox";
import { forBlock } from "./blocky/generator";
// import { pythonGenerator } from "blockly/python";
import { pythonGenerator } from "./micropython/setup";
import { blocks } from "./blocky/blocks";
import { OboCategory } from "./blocky/categories";
import { theme } from "./blocky/themes";
import { save, load, exportJson, importJson } from "./blocky/serialization";

import { worker, terminal, stopWorker } from "./pyodide/loader";

import { createPinButtonCallback, createADCButtonCallback, createPWMButtonCallback, createI2CButtonCallback } from "./micropython/callback";
import { pinCategoryFlyout, adcCategoryFlyout, pwmCategoryFlyout, i2cCategoryFlyout } from "./micropython/flyouts";

// ESP32 Detection and Flashing
import ESP32Detector from "./esp32/detection";
import ESP32Flasher from "./esp32/flash";
import ESP32REPL from "./esp32/repl";

let editable = false;
let ws;

// ESP32 Detection and Flashing
const esp32Detector = new ESP32Detector();
const esp32Flasher = new ESP32Flasher();
const esp32REPL = new ESP32REPL();
let currentESP32Device = null;

// ------------------ Elements -------------------------

const editbutton = document.getElementById("edit-button");
// const codeDiv = document.getElementById('generatedCode').firstChild;
const blocklyDiv = document.getElementById("editor");
const blocklyEditorPanel = document.getElementById("blocky-editor");
const imageEDit = document.getElementById("editing-image");
const copyButton = document.getElementById("copy-button");
const runcodeButton = document.getElementById("run-button");
const clearButton = document.getElementById("clear-button");
const stopButton = document.getElementById("stop-button");
const exportButton = document.getElementById("export-button");
const esp32DetectButton = document.getElementById("esp32-detect-button");
const esp32ConnectButton = document.getElementById("esp32-connect-button");
const esp32FlashButton = document.getElementById("esp32-flash-button");
const esp32EraseButton = document.getElementById("esp32-erase-button");
const esp32ReplButton = document.getElementById("esp32-repl-button");
const importJsonButton = document.getElementById("import-json-button");
const exportJsonButton = document.getElementById("export-json-button");
const collapseToggleButton = document.getElementById("collapse-toggle-button");

// Output tabs
const pythonOutputTab = document.getElementById("python-output-tab");
const deviceOutputTab = document.getElementById("device-output-tab");
const serialMonitorTab = document.getElementById("serial-monitor-tab");
const pythonOutputPanel = document.getElementById("python-output-panel");
const deviceOutputPanel = document.getElementById("device-output-panel");
const serialMonitorPanel = document.getElementById("serial-monitor-panel");
const deviceTerminal = document.getElementById("device-terminal-output");
const serialTerminal = document.getElementById("serial-terminal");
const collapseToggleText = document.getElementById("collapse-toggle-text");
const collapseToggleIcon = document.getElementById("collapse-toggle-icon");
const navCollapseToggleButton = document.getElementById("nav-collapse-toggle-button");
const navCollapseToggleText = document.getElementById("nav-collapse-toggle-text");
const navCollapseToggleIcon = document.getElementById("nav-collapse-toggle-icon");
const notification = document.getElementById("notification");
const notificationText = document.getElementById("notificationText");
const runButtonText = document.getElementById("run-text");
const editbuttonText = document.getElementById("edit-text");
const codeDiv = document.getElementById("code");
const outputDiv = document.getElementById("output");

// Initialize ESP32 dropdown items as hidden
esp32FlashButton.style.display = 'none';
esp32EraseButton.style.display = 'none';
esp32ReplButton.style.display = 'none';

// Get references to dropdown elements  
const esp32DropdownButton = esp32DetectButton.closest('.dropdown-button');
const esp32DropdownArrow = esp32DropdownButton?.querySelector('.dropdown-arrow');
const esp32DropdownContent = esp32DropdownButton?.querySelector('.dropdown-content');

// Initially hide only the dropdown arrow and content when no device is connected
if (esp32DropdownArrow) {
  esp32DropdownArrow.style.display = 'none';
}
if (esp32DropdownContent) {
  esp32DropdownContent.style.display = 'none';
}
// Add disabled class to prevent hover behavior
if (esp32DropdownButton) {
  esp32DropdownButton.classList.add('dropdown-disabled');
  esp32DropdownButton.classList.remove('dropdown-enabled');
}

function getContainerRoot() {
  return document.querySelector(".container") || document.querySelector(".container-editing");
}

// Helper function to properly close REPL and clean up terminal
async function closeAndCleanupREPL(disconnectionMessage = 'REPL connection closed.\nConnect to ESP32 and open REPL to start a new session.\n') {
  if (esp32REPL.isREPLConnected()) {
    await esp32REPL.closeREPL();

    // Clear terminal content and reset state
    terminalContent = '';
    serialTerminal.textContent = '';

    // Reset terminal state variables
    isWaitingForResponse = false;
    responseBuffer = '';
    lastSentCommand = '';
    isMultiLineMode = false;
    multiLineBuffer = [];
    currentIndentLevel = 0;
    commandHistory = [];
    historyIndex = -1;

    // Remove input field if it exists
    if (inputField) {
      inputField.remove();
      inputField = null;
    }

    // Add disconnection message to terminal
    serialTerminal.textContent = disconnectionMessage;
  }
}

// ------------------- Event Listners -----------------------------
// obo_blocks_logo.src = oboBlocksLogo
// academy_logo.src = academyLogo
// ------------------- Blockly Configuration -------------------------

Blockly.common.defineBlocks(blocks);
Object.assign(pythonGenerator.forBlock, forBlock);



Blockly.registry.register(
  Blockly.registry.Type.TOOLBOX_ITEM,
  Blockly.ToolboxCategory.registrationName,
  OboCategory,
  true
);

const options = {
  toolbox: toolbox,
  theme: theme,
  media: "media",
  collapse: true,
  trashcan: true,
  grid: {
    spacing: 20,
    length: 1,
    colour: "#888",
    snap: false,
  },
  zoom: {
    controls: true,
    startScale: 1,
    maxScale: 1.5,
    minScale: 0.7,
    scaleSpeed: 1.2,
  },
  renderer: "zelos",
};

// ----------------------- Function defintions --------------------------------
async function runcode() {
  try {
    runcodeButton.setAttribute("disabled", true);
    runButtonText.innerHTML = "Running";
    let code = editor.state.doc.toString();
    worker.postMessage({ code: code, command: "run" });
    runcodeButton.removeAttribute("disabled");
    runButtonText.innerHTML = "Run";
  } catch (err) {
    console.error("Error running code:", err);
  }
}

async function copyTextToClipboard(textToCopy) {
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(textToCopy);
    }
  } catch (err) {
    console.error("Error copying text to clipboard:", err);
  }
}

function showNotification(message) {
  notificationText.innerText = message;

  // Show the notification
  notification.classList.add("show");

  // Hide the notification after 2 seconds
  setTimeout(function () {
    notification.classList.remove("show");
  }, 1500);
}

function initBlokly(workspace) {
  workspace = Blockly.inject(blocklyDiv, options);
  workspace.registerToolboxCategoryCallback("PIN", pinCategoryFlyout);
  workspace.registerToolboxCategoryCallback("ADC", adcCategoryFlyout)
  workspace.registerToolboxCategoryCallback("PWM", pwmCategoryFlyout)
  workspace.registerToolboxCategoryCallback("I2C", i2cCategoryFlyout)

  workspace.registerButtonCallback("CREATE_PIN_VARIABLE", createPinButtonCallback);
  workspace.registerButtonCallback("CREATE_ADC_VARIABLE", createADCButtonCallback);
  workspace.registerButtonCallback("CREATE_PWM_VARIABLE", createPWMButtonCallback);
  workspace.registerButtonCallback("CREATE_I2C_VARIABLE", createI2CButtonCallback);


  workspace.updateToolbox(toolbox)
  workspace.addChangeListener((e) => {
    if (
      e.isUiEvent ||
      e.type == Blockly.Events.FINISHED_LOADING ||
      workspace.isDragging()
    ) {
      return;
    }
    save(workspace);
    const code = pythonGenerator.workspaceToCode(workspace);
    insertPythonSnippet(code);
  });
  return workspace;
}

let totalSizeWindowSizw =
  parseInt(codeDiv.getBoundingClientRect().height.toFixed(0)) +
  parseInt(outputDiv.getBoundingClientRect().height.toFixed(0));
let oldcodeSize = codeDiv.getBoundingClientRect().height.toFixed(0);
let newoutputSize = outputDiv.getBoundingClientRect().height.toFixed(0);

function resizeRightColumn() {
  let newcodeSize = codeDiv.getBoundingClientRect().height.toFixed(0);
  if (
    newcodeSize < 500 &&
    newcodeSize > 300 &&
    newcodeSize < totalSizeWindowSizw
  ) {
    let outputSize = totalSizeWindowSizw - newcodeSize; // Replace codeSize with newcodeSize
    console.log("Output Size: ", totalSizeWindowSizw);
    outputDiv.style.height = outputSize + "px";
    oldcodeSize = newcodeSize;
  }
}

if ("ResizeObserver" in window) {
  // Create a new ResizeObserver
  const resizeObserver = new ResizeObserver(resizeRightColumn);
  // Start observing the element
  resizeObserver.observe(codeDiv);
} else {
  console.log("Resize Observer not supported in this browser.");
}
// ------------------------ Initializations -----------------------------------------------------------

ws = initBlokly(ws);

// ------------------------ Event Listners -----------------------------------------------------------

editbutton.addEventListener("click", function () {
  editable = !editable;
  makeUneditable(editable);

  if (editable) {
    showNotification("Editing enabled");
    editbuttonText.innerHTML = "Editing";
    save(ws);
    loadModifiedCode();
    ws.dispose();
    blocklyDiv.style.display = "none";
    imageEDit.style.display = "block";
  } else {
    editbuttonText.innerHTML = "Edit";
    blocklyDiv.style.display = "block";
    imageEDit.style.display = "none";
    saveModifideCode();
    ws = initBlokly(ws);
    load(ws);
    const code = pythonGenerator.workspaceToCode(ws);
    insertPythonSnippet(code);
    showNotification("Editing disabled");
  }
});
copyButton.addEventListener("click", () => {
  let code = editor.state.doc.toString();
  if (code === "") {
    showNotification("No code to copy");
    return;
  }
  copyTextToClipboard(code);
  showNotification("Code copied to clipboard");
});

runcodeButton.addEventListener("click", () => {
  runcode();
});

clearButton.addEventListener("click", () => {
  // Clear the active terminal
  if (pythonOutputPanel.classList.contains('active')) {
    terminal.value = "Python 3.10 \n>>> ";
  } else if (deviceOutputPanel.classList.contains('active')) {
    deviceTerminal.value = "";
  } else if (serialMonitorPanel.classList.contains('active')) {
    // Clear our state
    terminalContent = '';
    serialTerminal.textContent = '';
    lastSentCommand = ''; // Clear stored command when clearing terminal
    isMultiLineMode = false; // Exit multi-line mode
    multiLineBuffer = [];
    currentIndentLevel = 0;
    isWaitingForResponse = false;
    responseBuffer = '';

    // Send Ctrl+C to reset ESP32 state if connected, otherwise just add prompt
    try {
      if (esp32REPL.isREPLConnected()) {
        esp32REPL.sendCommand('\x03'); // Ctrl+C - ESP32 will respond with its own prompt
      } else {
        appendToTerminal('>>> '); // Only add prompt if not connected
      }
    } catch (error) {
      console.error("Error sending Ctrl+C:", error);
      appendToTerminal('>>> '); // Fallback - add prompt if Ctrl+C fails
    }

    if (inputField) {
      inputField.value = '';
      resetInputPlaceholder();
      inputField.focus();
    }
  }
  showNotification("Terminal cleared");
});

stopButton.addEventListener("click", async () => {
  // Check if we're in serial monitor (REPL) mode
  if (serialMonitorPanel.classList.contains('active') && esp32REPL.isREPLConnected()) {
    try {
      // Send Ctrl+D for soft reset in MicroPython
      await esp32REPL.sendCommand('\x04'); // EOT (End of Transmission) - Ctrl+D
      appendToTerminal('Soft reset...\n');
      showNotification("ESP32 soft reset sent");
    } catch (error) {
      console.error("Error sending soft reset:", error);
      appendToTerminal(`Error sending soft reset: ${error.message}\n`);
      showNotification("Failed to send soft reset");
    }
  } else {
    // Default behavior for Python execution
    stopWorker();
  }
});

exportButton.addEventListener("click", () => {
  const content = editor.state.doc.toString();
  if (content === "") {
    showNotification("No code to export");
    return;
  }
  saveAsPythonFile(content);
  showNotification("Code exported as script.py");
});

// Tab switching functionality
function switchTab(tabName) {
  // Remove active class from all tabs and panels
  document.querySelectorAll('.tab-button').forEach(tab => tab.classList.remove('active'));
  document.querySelectorAll('.output-panel').forEach(panel => panel.classList.remove('active'));

  // Add active class to selected tab and panel
  if (tabName === 'python-output') {
    pythonOutputTab.classList.add('active');
    pythonOutputPanel.classList.add('active');
  } else if (tabName === 'device-output') {
    deviceOutputTab.classList.add('active');
    deviceOutputPanel.classList.add('active');
  } else if (tabName === 'serial-monitor') {
    serialMonitorTab.classList.add('active');
    serialMonitorPanel.classList.add('active');
  }
}

// Tab event listeners
pythonOutputTab.addEventListener("click", () => switchTab('python-output'));
deviceOutputTab.addEventListener("click", () => switchTab('device-output'));
serialMonitorTab.addEventListener("click", () => switchTab('serial-monitor'));

// Terminal functionality - Simplified approach
let commandHistory = [];
let historyIndex = -1;
let isWaitingForResponse = false;
let responseBuffer = '';
let terminalContent = '';
let currentLine = '';
let lastSentCommand = '';
let isMultiLineMode = false;
let multiLineBuffer = [];
let currentIndentLevel = 0;

// Convert contentEditable to textarea for simpler management
serialTerminal.contentEditable = false;
serialTerminal.style.whiteSpace = 'pre-wrap';
serialTerminal.style.fontFamily = 'monospace';
serialTerminal.style.fontSize = '14px';
serialTerminal.style.color = '#00ff00';
serialTerminal.style.backgroundColor = '#000';
serialTerminal.style.padding = '10px';
serialTerminal.style.overflowY = 'scroll';

let inputField = null;

// Create input field for command entry
function createInputField() {
  if (inputField) return;

  inputField = document.createElement('input');
  inputField.type = 'text';
  inputField.style.position = 'absolute';
  inputField.style.bottom = '10px';
  inputField.style.left = '10px';
  inputField.style.right = '10px';
  inputField.style.height = '30px';
  inputField.style.backgroundColor = '#000';
  inputField.style.color = '#00ff00';
  inputField.style.border = '1px solid #00ff00';
  inputField.style.fontFamily = 'monospace';
  inputField.style.fontSize = '14px';
  inputField.style.padding = '5px';
  inputField.placeholder = 'Enter MicroPython command... (type help() for help)';

  // Position terminal container relatively
  serialTerminal.parentElement.style.position = 'relative';
  serialTerminal.style.paddingBottom = '50px';

  serialTerminal.parentElement.appendChild(inputField);

  inputField.addEventListener("keydown", async (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      await executeCommand();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      navigateHistory(-1);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      navigateHistory(1);
    } else if (event.key === "Escape") {
      // ESC to exit multi-line mode or recover from stuck state
      event.preventDefault();

      if (isMultiLineMode || serialTerminal.textContent.endsWith('... ')) {
        // Send Ctrl+C to interrupt and reset ESP32 REPL state
        try {
          esp32REPL.sendCommand('\x03'); // Ctrl+C - ESP32 will respond with KeyboardInterrupt and prompt
        } catch (error) {
          appendToTerminal('\n>>> '); // Only add prompt if Ctrl+C fails
        }
      }

      // Reset our state
      isMultiLineMode = false;
      multiLineBuffer = [];
      currentIndentLevel = 0;
      isWaitingForResponse = false;
      responseBuffer = '';
      clearInput();
      resetInputPlaceholder();
      inputField.focus();
    } else if (event.key === "Backspace" && isMultiLineMode) {
      // Handle dedenting in multi-line mode
      const currentValue = inputField.value;
      const cursorPos = inputField.selectionStart;

      // If cursor is at beginning and we have indentation, dedent by 4 spaces
      if (cursorPos <= currentIndentLevel && currentValue.startsWith(' '.repeat(currentIndentLevel))) {
        event.preventDefault();
        currentIndentLevel = Math.max(0, currentIndentLevel - 4);
        const newIndent = ' '.repeat(currentIndentLevel);
        inputField.value = newIndent + currentValue.substring(cursorPos);
        inputField.selectionStart = inputField.selectionEnd = currentIndentLevel;
      }
    }
  });

  inputField.focus();
}

// Focus input field when terminal is clicked
serialTerminal.addEventListener("click", () => {
  if (inputField) {
    inputField.focus();
  }
});

// Simplified terminal helper functions
function navigateHistory(direction) {
  if (commandHistory.length === 0 || !inputField) return;

  if (direction === -1 && historyIndex < commandHistory.length - 1) {
    historyIndex++;
  } else if (direction === 1 && historyIndex > 0) {
    historyIndex--;
  } else if (direction === 1 && historyIndex === 0) {
    historyIndex = -1;
    inputField.value = '';
    return;
  }

  if (historyIndex >= 0) {
    inputField.value = commandHistory[commandHistory.length - 1 - historyIndex];
  }
}

function appendToTerminal(text) {
  terminalContent += text;
  serialTerminal.textContent = terminalContent;
  scrollToBottom();
}

function scrollToBottom() {
  setTimeout(() => {
    serialTerminal.scrollTop = serialTerminal.scrollHeight;
  }, 0);
}

function getCurrentCommand() {
  return inputField ? inputField.value.trim() : '';
}

function clearInput() {
  if (inputField) {
    inputField.value = '';
  }
}

function resetInputPlaceholder() {
  if (inputField) {
    inputField.placeholder = 'Enter MicroPython command... (type help() for help)';
  }
}

async function executeCommand() {
  const command = getCurrentCommand();

  if (!esp32REPL.isREPLConnected()) {
    appendToTerminal('Error: REPL not connected\n');
    return;
  }

  // Handle multi-line mode
  if (isMultiLineMode) {
    if (command.trim() === '') {
      // Empty line in multi-line mode - send empty line to execute the block
      try {
        // Send empty line to MicroPython to execute the block
        await esp32REPL.sendCommand('\n');

        // Set waiting for response and exit multi-line mode
        isWaitingForResponse = true;
        responseBuffer = '';
        lastSentCommand = ''; // Clear this for multi-line execution
        isMultiLineMode = false;
        multiLineBuffer = [];
        currentIndentLevel = 0;
        clearInput();
        resetInputPlaceholder();

        // Set timeout in case no response
        setTimeout(() => {
          if (isWaitingForResponse) {
            appendToTerminal('>>> ');
            isWaitingForResponse = false;
            if (inputField) inputField.focus();
          }
        }, 3000);

      } catch (error) {
        console.error("Error executing multi-line block:", error);
        appendToTerminal(`Error: ${error.message}\n>>> `);
        isWaitingForResponse = false;
        isMultiLineMode = false;
        multiLineBuffer = [];
        currentIndentLevel = 0;
        if (inputField) {
          resetInputPlaceholder();
          inputField.focus();
        }
      }

      return;
    } else {
      // Send this line immediately to MicroPython
      multiLineBuffer.push(command);
      clearInput();

      // Check if we need to increase indent level
      if (command.trim().endsWith(':')) {
        currentIndentLevel += 4;
      }

      try {
        // Send the line to ESP32 immediately
        await esp32REPL.sendCommand(command + '\n');

        // Prepare input field with proper indentation for next line
        const indent = ' '.repeat(currentIndentLevel);
        if (inputField) {
          inputField.value = indent;
          inputField.placeholder = 'Continue block... (Enter on empty line to execute, ESC to cancel)';
          inputField.focus();
        }

      } catch (error) {
        console.error("Error sending line:", error);
        appendToTerminal(`Error: ${error.message}\n>>> `);
        isMultiLineMode = false;
        multiLineBuffer = [];
        currentIndentLevel = 0;
        if (inputField) {
          resetInputPlaceholder();
          inputField.focus();
        }
      }

      return;
    }
  }

  // Single line or start of multi-line
  if (!command) {
    // If no command but ESP32 might be stuck in multi-line mode
    if (serialTerminal.textContent.includes('... ')) {
      try {
        // Send empty line to try to execute any pending block
        await esp32REPL.sendCommand('\n');
        isWaitingForResponse = true;
        responseBuffer = '';
        setTimeout(() => {
          if (isWaitingForResponse) {
            appendToTerminal('>>> ');
            isWaitingForResponse = false;
            if (inputField) inputField.focus();
          }
        }, 2000);
      } catch (error) {
        console.error("Error sending empty line:", error);
      }
    }
    return;
  }

  // Check if this starts a multi-line block
  if (command.trim().endsWith(':') && (
    command.trim().startsWith('def ') ||
    command.trim().startsWith('class ') ||
    command.trim().startsWith('if ') ||
    command.trim().startsWith('elif ') ||
    command.trim().startsWith('else:') ||
    command.trim().startsWith('for ') ||
    command.trim().startsWith('while ') ||
    command.trim().startsWith('try:') ||
    command.trim().startsWith('except ') ||
    command.trim().startsWith('finally:') ||
    command.trim().startsWith('with ')
  )) {
    // Enter multi-line mode - send the first line to MicroPython
    isMultiLineMode = true;
    multiLineBuffer = [command];
    currentIndentLevel = 4; // Standard Python indentation
    clearInput();

    try {
      // Send the first line to ESP32 to start multi-line mode
      await esp32REPL.sendCommand(command + '\n');

      // Prepare input field with indentation for next line
      const indent = ' '.repeat(currentIndentLevel);
      if (inputField) {
        inputField.value = indent;
        inputField.placeholder = 'Continue block... (Enter on empty line to execute, ESC to cancel)';
        inputField.focus();
      }

    } catch (error) {
      console.error("Error starting multi-line mode:", error);
      appendToTerminal(`Error: ${error.message}\n>>> `);
      isMultiLineMode = false;
      multiLineBuffer = [];
      currentIndentLevel = 0;
      if (inputField) {
        resetInputPlaceholder();
        inputField.focus();
      }
      return;
    }

    return;
  }

  // Regular single-line command
  await executeFullCommand(command);
}

async function executeFullCommand(command) {
  // Add command to history
  if (command && !commandHistory.includes(command)) {
    commandHistory.push(command);
  }
  historyIndex = -1;

  // Show the command with prompt first (if not already shown in multi-line mode)
  if (!isMultiLineMode) {
    appendToTerminal(`${command}\n`);
  }

  // Exit multi-line mode after execution
  isMultiLineMode = false;
  multiLineBuffer = [];
  currentIndentLevel = 0;

  clearInput();
  isWaitingForResponse = true;
  responseBuffer = '';
  lastSentCommand = command; // Store the command for filtering

  try {
    // Send command to ESP32
    await esp32REPL.sendCommand(command + '\n');

    // Set a timeout if no response received
    setTimeout(() => {
      if (isWaitingForResponse) {
        appendToTerminal('\n>>> '); // Ready for next command
        isWaitingForResponse = false;
        responseBuffer = '';
        lastSentCommand = ''; // Clear stored command on timeout
        isMultiLineMode = false;
        multiLineBuffer = [];
        currentIndentLevel = 0;
        if (inputField) {
          resetInputPlaceholder();
          inputField.focus();
        }
      }
    }, 2000); // 2 second timeout

  } catch (error) {
    console.error("Error executing command:", error);
    appendToTerminal(`Error: ${error.message}\n>>> `);
    isWaitingForResponse = false;
    lastSentCommand = ''; // Clear stored command on error
    isMultiLineMode = false;
    multiLineBuffer = [];
    currentIndentLevel = 0;
    if (inputField) {
      resetInputPlaceholder();
      inputField.focus();
    }
  }
}

function initializeTerminal() {
  terminalContent = '';
  appendToTerminal('MicroPython REPL Terminal\n');
  appendToTerminal('Type "help()" for more information.\n');
  appendToTerminal('\n');
  appendToTerminal('>>> ');

  // Create input field if it doesn't exist
  createInputField();

  // Clear any waiting state
  isWaitingForResponse = false;
  responseBuffer = '';
  lastSentCommand = '';
  isMultiLineMode = false;
  multiLineBuffer = [];
  currentIndentLevel = 0;
}

// ESP32 Detection functionality
esp32DetectButton.addEventListener("click", async () => {
  // If already connected, don't initiate connection - let dropdown handle operations
  if (currentESP32Device) {
    // Connection exists, dropdown should handle the click
    return;
  }

  try {
    showNotification("Selecting ESP32 device...");

    // Check browser compatibility first
    const compatibility = esp32Detector.getCompatibilityInfo();
    if (!compatibility.webSerialSupported) {
      showNotification("Web Serial API not supported in this browser. Please use Chrome/Edge.");
      return;
    }

    // Directly request device selection - simpler and more reliable
    try {
      const selectedDevice = await esp32Detector.selectDevice();
      currentESP32Device = selectedDevice;

      // Update button text - keep it clickable for dropdown functionality
      const esp32DetectText = document.getElementById("esp32-detect-text");
      esp32DetectText.textContent = `ESP32`;

      // Show dropdown items (Flash, Erase, REPL) and change Connect to Disconnect
      esp32FlashButton.style.display = 'block';
      esp32EraseButton.style.display = 'block';
      esp32ReplButton.style.display = 'block';

      // Change Connect button to Disconnect
      esp32ConnectButton.innerHTML = '<i class="fa fa-unlink"></i> Disconnect';
      esp32ConnectButton.id = 'esp32-disconnect-button';

      // Show the ESP32 dropdown arrow when device is connected
      if (esp32DropdownArrow) {
        esp32DropdownArrow.style.display = 'inline';
      }
      // Enable dropdown hover behavior (don't force content to always show)
      if (esp32DropdownButton) {
        esp32DropdownButton.classList.remove('dropdown-disabled');
        esp32DropdownButton.classList.add('dropdown-enabled');
      }
      // Remove any forced display style from dropdown content to let CSS hover handle it
      if (esp32DropdownContent) {
        esp32DropdownContent.style.display = '';
      }

      // Log device info to device terminal
      deviceTerminal.value += `\nESP32 Device Selected:\n`;
      deviceTerminal.value += `Name: ${selectedDevice.name}\n`;
      deviceTerminal.value += `Vendor ID: 0x${selectedDevice.usbVendorId?.toString(16).toUpperCase()}\n`;
      deviceTerminal.value += `Product ID: 0x${selectedDevice.usbProductId?.toString(16).toUpperCase()}\n`;
      deviceTerminal.value += `Status: Connected\n\n`;
      deviceTerminal.scrollTop = deviceTerminal.scrollHeight;

      // Switch to device output tab
      switchTab('device-output');

      showNotification(`ESP32 device connected: ${selectedDevice.name}`);
    } catch (error) {
      if (error.message === 'No port selected by user') {
        showNotification("No device selected");
      } else {
        showNotification(`Error: ${error.message}`);
      }
      deviceTerminal.value += `\nESP32 Detection Error: ${error.message}\n\n`;
      deviceTerminal.scrollTop = deviceTerminal.scrollHeight;
      switchTab('device-output');
    }
  } catch (error) {
    console.error("ESP32 detection error:", error);
    showNotification(`ESP32 detection failed: ${error.message}`);
    deviceTerminal.value += `\nESP32 Detection Error: ${error.message}\n\n`;
    deviceTerminal.scrollTop = deviceTerminal.scrollHeight;
    switchTab('device-output');
  }
});

// ESP32 Flashing functionality
esp32FlashButton.addEventListener("click", async () => {
  if (!currentESP32Device) {
    showNotification("No ESP32 device connected");
    return;
  }

  try {
    showNotification("Starting MicroPython firmware flash...");

    // Switch to device output tab
    switchTab('device-output');

    // Get firmware info
    const firmwareInfo = esp32Flasher.getFirmwareInfo();

    deviceTerminal.value += `\nStarting MicroPython Firmware Flash:\n`;
    deviceTerminal.value += `Version: ${firmwareInfo.version}\n`;
    deviceTerminal.value += `Date: ${firmwareInfo.date}\n`;
    deviceTerminal.value += `Source: Local firmware file\n\n`;
    deviceTerminal.scrollTop = deviceTerminal.scrollHeight;

    // Progress callback function
    const updateProgress = (percentage, message) => {
      deviceTerminal.value += `[${percentage}%] ${message}\n`;
      deviceTerminal.scrollTop = deviceTerminal.scrollHeight;
    };

    // Flash the firmware
    await esp32Flasher.flashFirmware(currentESP32Device, firmwareInfo, updateProgress);

    deviceTerminal.value += `\n✅ MicroPython firmware flashed successfully!\n`;
    deviceTerminal.value += `ESP32 is now ready for MicroPython development.\n`;
    deviceTerminal.value += `Note: Device has been reset. You may need to reconnect if you want to perform more operations.\n\n`;
    deviceTerminal.scrollTop = deviceTerminal.scrollHeight;

    showNotification("MicroPython firmware flashed successfully!");

    // Close REPL connection if open before resetting
    await closeAndCleanupREPL('Device flashed and disconnected.\nConnect to ESP32 and open REPL to start a new session.\n');

    // Reset connection state after successful flash
    currentESP32Device = null;
    const esp32DetectText = document.getElementById("esp32-detect-text");
    esp32DetectText.textContent = "ESP32";

    // ESP32 button remains clickable (no need to restore since it was never disabled)

    // Hide the ESP32 dropdown arrow and content after flash
    if (esp32DropdownArrow) {
      esp32DropdownArrow.style.display = 'none';
    }
    if (esp32DropdownContent) {
      esp32DropdownContent.style.display = 'none';
    }
    // Disable dropdown hover behavior
    if (esp32DropdownButton) {
      esp32DropdownButton.classList.add('dropdown-disabled');
      esp32DropdownButton.classList.remove('dropdown-enabled');
    }

    esp32FlashButton.style.display = 'none';
    esp32EraseButton.style.display = 'none';
    esp32ConnectButton.innerHTML = '<i class="fa fa-link"></i> Connect';
    esp32ConnectButton.id = 'esp32-connect-button';

  } catch (error) {
    console.error("Firmware flashing error:", error);

    // Clean up REPL on flash error too
    await closeAndCleanupREPL('Flash failed. Device may be disconnected.\nConnect to ESP32 and open REPL to start a new session.\n');

    deviceTerminal.value += `\n❌ Firmware flashing failed: ${error.message}\n`;
    deviceTerminal.value += `Make sure ESP32 is in download mode (hold BOOT button while connecting).\n\n`;
    deviceTerminal.scrollTop = deviceTerminal.scrollHeight;

    showNotification(`Firmware flashing failed: ${error.message}`);
  }
});

// ESP32 Erase functionality
esp32EraseButton.addEventListener("click", async () => {
  if (!currentESP32Device) {
    showNotification("No ESP32 device connected");
    return;
  }

  try {
    showNotification("Starting ESP32 flash erase...");

    // Switch to device output tab
    switchTab('device-output');

    deviceTerminal.value += `\nStarting ESP32 Flash Erase:\n`;
    deviceTerminal.value += `This will erase ALL data from the ESP32 flash memory.\n`;
    deviceTerminal.value += `This action cannot be undone!\n\n`;
    deviceTerminal.scrollTop = deviceTerminal.scrollHeight;

    // Progress callback function
    const updateProgress = (percentage, message) => {
      deviceTerminal.value += `[${percentage}%] ${message}\n`;
      deviceTerminal.scrollTop = deviceTerminal.scrollHeight;
    };

    // Erase the flash
    await esp32Flasher.eraseFlash(currentESP32Device, updateProgress);

    deviceTerminal.value += `\n✅ ESP32 flash erased successfully!\n`;
    deviceTerminal.value += `All data has been removed from the device.\n`;
    deviceTerminal.value += `Note: Device has been reset. You may need to reconnect if you want to perform more operations.\n\n`;
    deviceTerminal.scrollTop = deviceTerminal.scrollHeight;

    showNotification("ESP32 flash erased successfully!");

    // Close REPL connection if open before resetting
    await closeAndCleanupREPL('Device erased and disconnected.\nConnect to ESP32 and open REPL to start a new session.\n');

    // Reset connection state after successful erase
    currentESP32Device = null;
    const esp32DetectText = document.getElementById("esp32-detect-text");
    esp32DetectText.textContent = "ESP32";

    // ESP32 button remains clickable (no need to restore since it was never disabled)

    // Hide the ESP32 dropdown arrow and content after erase
    if (esp32DropdownArrow) {
      esp32DropdownArrow.style.display = 'none';
    }
    if (esp32DropdownContent) {
      esp32DropdownContent.style.display = 'none';
    }
    // Disable dropdown hover behavior
    if (esp32DropdownButton) {
      esp32DropdownButton.classList.add('dropdown-disabled');
      esp32DropdownButton.classList.remove('dropdown-enabled');
    }

    esp32FlashButton.style.display = 'none';
    esp32EraseButton.style.display = 'none';
    esp32ConnectButton.innerHTML = '<i class="fa fa-link"></i> Connect';
    esp32ConnectButton.id = 'esp32-connect-button';

  } catch (error) {
    console.error("Flash erase error:", error);

    // Clean up REPL on erase error too
    await closeAndCleanupREPL('Erase failed. Device may be disconnected.\nConnect to ESP32 and open REPL to start a new session.\n');

    deviceTerminal.value += `\n❌ Flash erase failed: ${error.message}\n`;
    deviceTerminal.value += `Make sure ESP32 is in download mode (hold BOOT button while connecting).\n\n`;
    deviceTerminal.scrollTop = deviceTerminal.scrollHeight;

    showNotification(`Flash erase failed: ${error.message}`);
  }
});

// ESP32 Connect/Disconnect functionality
esp32ConnectButton.addEventListener("click", async () => {
  if (currentESP32Device) {
    // Disconnect mode
    try {
      // Close REPL connection if open
      await closeAndCleanupREPL();

      // Close the port if it's open
      if (currentESP32Device.port && currentESP32Device.port.readable) {
        await currentESP32Device.port.close();
      }

      // Reset the UI
      const esp32DetectText = document.getElementById("esp32-detect-text");
      esp32DetectText.textContent = "ESP32";

      // ESP32 button remains clickable (no need to restore since it was never disabled)

      // Hide dropdown items
      esp32FlashButton.style.display = 'none';
      esp32EraseButton.style.display = 'none';
      esp32ReplButton.style.display = 'none';

      // Change Disconnect button back to Connect
      esp32ConnectButton.innerHTML = '<i class="fa fa-link"></i> Connect';
      esp32ConnectButton.id = 'esp32-connect-button';

      // Clear device reference
      currentESP32Device = null;

      // Hide the ESP32 dropdown arrow and content when device is disconnected
      if (esp32DropdownArrow) {
        esp32DropdownArrow.style.display = 'none';
      }
      if (esp32DropdownContent) {
        esp32DropdownContent.style.display = 'none';
      }
      // Disable dropdown hover behavior
      if (esp32DropdownButton) {
        esp32DropdownButton.classList.add('dropdown-disabled');
        esp32DropdownButton.classList.remove('dropdown-enabled');
      }

      // Log disconnect to device terminal
      deviceTerminal.value += `\nESP32 Device Disconnected\n`;
      deviceTerminal.value += `Status: Disconnected\n\n`;
      deviceTerminal.scrollTop = deviceTerminal.scrollHeight;

      // Switch to device output tab
      switchTab('device-output');

      showNotification("ESP32 device disconnected");

    } catch (error) {
      console.error("Disconnect error:", error);
      // Try to clean up REPL even if disconnect fails
      await closeAndCleanupREPL('Disconnect error occurred. REPL may be in unstable state.\nConnect to ESP32 and open REPL to start a new session.\n');
      showNotification(`Disconnect failed: ${error.message}`);
    }
  } else {
    // Connect mode - trigger the ESP32 detection
    esp32DetectButton.click();
  }
});

// ESP32 REPL functionality
esp32ReplButton.addEventListener("click", async () => {
  if (!currentESP32Device) {
    showNotification("No ESP32 device connected");
    return;
  }

  try {
    showNotification("Opening REPL connection...");

    // Switch to serial monitor tab
    switchTab('serial-monitor');

    // Initialize terminal
    initializeTerminal();

    // Open REPL connection
    await esp32REPL.openREPL(currentESP32Device);

    // Set up data receiver
    esp32REPL.onDataReceived = (data) => {
      // Handle initial boot messages (before first prompt)
      if (!isWaitingForResponse) {
        appendToTerminal(data);
        return;
      }

      // In multi-line mode, show ESP32's natural output
      if (isMultiLineMode) {
        // Show everything from ESP32 during multi-line mode
        appendToTerminal(data);
        return;
      }

      // Buffer the response
      responseBuffer += data;

      // Check if we have a complete response (ends with >>> prompt)
      if (responseBuffer.includes('>>> ')) {
        // Filter out the echoed command
        let cleanResponse = responseBuffer;

        // Remove the echoed command if it appears at the start of the response
        if (lastSentCommand && cleanResponse.startsWith(lastSentCommand)) {
          cleanResponse = cleanResponse.substring(lastSentCommand.length);
          // Remove any leading newlines or carriage returns after the command
          cleanResponse = cleanResponse.replace(/^[\r\n]+/, '');
        }

        // Remove the final >>> prompt since we handle our own
        cleanResponse = cleanResponse.replace(/>>> $/, '').trim();

        // Show the clean output
        if (cleanResponse) {
          appendToTerminal(cleanResponse + '\n');
        }

        // Add our own prompt for next command
        appendToTerminal('>>> ');

        // Reset waiting state
        isWaitingForResponse = false;
        responseBuffer = '';
        lastSentCommand = ''; // Clear the stored command

        // Focus input field
        if (inputField) {
          resetInputPlaceholder();
          inputField.focus();
        }
      }
      // Continue buffering until we get the complete response with >>>
    };

    showNotification("REPL connection opened successfully!");

  } catch (error) {
    console.error("REPL error:", error);
    showNotification(`REPL failed: ${error.message}`);

    // Show error in terminal
    appendToTerminal(`Error: ${error.message}\n`);
  }
});

importJsonButton.addEventListener("click", () => {
  let inputElement = document.createElement("input");
  inputElement.type = "file";
  inputElement.accept = ".json";
  inputElement.click();
  inputElement.addEventListener("change", (e) => {
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = (e) => {
      const json = JSON.parse(e.target.result);
      try {
        let imported = importJson(ws, json);
        if (imported) {
          showNotification("Workspace imported");
          const code = pythonGenerator.workspaceToCode(ws);
          insertPythonSnippet(code);
        } else {
          showNotification("Error importing JSON");
        }
      } catch (err) {
        console.error("Error importing JSON:", err);
        showNotification("Error importing JSON");
      }
    };
    reader.readAsText(file);
  });

  inputElement.remove();
});

exportJsonButton.addEventListener("click", () => {
  const json = exportJson(ws);
  saveAsJsonFile(JSON.stringify(json));
  showNotification("Workspace exported as workspace.json");
});

collapseToggleButton.addEventListener("click", () => {
  if (!ws || !blocklyEditorPanel || !getContainerRoot()) return;
  const panelCurrentlyVisible = blocklyEditorPanel.style.display !== "none";
  const blocks = ws.getAllBlocks(false);

  Blockly.Events.setGroup(true);
  try {
    if (panelCurrentlyVisible) {
      // Hide entire Visual Blocks panel and collapse all blocks
      for (const block of blocks) {
        block.setCollapsed(true);
      }
      blocklyEditorPanel.style.display = "none";
      getContainerRoot().className = "container-editing";
      collapseToggleText.textContent = "Expand";
      collapseToggleIcon.classList.remove("fa-compress");
      collapseToggleIcon.classList.add("fa-expand");
      if (navCollapseToggleButton) {
        navCollapseToggleButton.style.display = "flex";
        navCollapseToggleText.textContent = "Expand Blocks";
        navCollapseToggleIcon.classList.remove("fa-compress");
        navCollapseToggleIcon.classList.add("fa-expand");
      }
      showNotification("Collapsed Visual Blocks");
    } else {
      // Show panel again and expand all blocks
      getContainerRoot().className = "container";
      blocklyEditorPanel.style.display = "flex";
      for (const block of blocks) {
        block.setCollapsed(false);
      }
      // Ensure layout has applied before resize
      setTimeout(() => ws.resize(), 0);
      collapseToggleText.textContent = "Collapse";
      collapseToggleIcon.classList.remove("fa-expand");
      collapseToggleIcon.classList.add("fa-compress");
      if (navCollapseToggleButton) {
        navCollapseToggleButton.style.display = "none";
      }
      showNotification("Expanded Visual Blocks");
    }
  } finally {
    Blockly.Events.setGroup(false);
  }
});

if (navCollapseToggleButton) {
  navCollapseToggleButton.addEventListener("click", () => {
    collapseToggleButton?.click();
  });
}
document.addEventListener("DOMContentLoaded", () => {
  makeUneditable(editable);
  notification.style.transition = "opacity 0.5s ease-in-out";
  ws.resize();

  // Ensure dropdown arrow is hidden on page load
  if (esp32DropdownArrow) {
    esp32DropdownArrow.style.display = 'none';
  }
  if (esp32DropdownContent) {
    esp32DropdownContent.style.display = 'none';
  }
  if (esp32DropdownButton) {
    esp32DropdownButton.classList.add('dropdown-disabled');
    esp32DropdownButton.classList.remove('dropdown-enabled');
  }
});
