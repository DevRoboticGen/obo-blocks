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

function getContainerRoot() {
  return document.querySelector(".container") || document.querySelector(".container-editing");
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
    initializeTerminal();
  }
  showNotification("Terminal cleared");
});

stopButton.addEventListener("click", () => {
  stopWorker();
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

// Terminal functionality
let commandHistory = [];
let historyIndex = -1;
let currentCommand = '';
let isWaitingForResponse = false;
let responseBuffer = '';

serialTerminal.addEventListener("keydown", async (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    await executeCommand();
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    navigateHistory(-1);
  } else if (event.key === "ArrowDown") {
    event.preventDefault();
    navigateHistory(1);
  } else if (event.key === "Backspace") {
    // Prevent backspace from deleting the prompt
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const promptNode = findPromptNode(range.startContainer);
      if (promptNode && range.startOffset <= promptNode.textContent.length) {
        event.preventDefault();
        return;
      }
    }
  }
});

// Prevent paste of formatted text
serialTerminal.addEventListener("paste", (event) => {
  event.preventDefault();
  const text = event.clipboardData.getData("text/plain");
  document.execCommand("insertText", false, text);
});

// Focus terminal when clicked
serialTerminal.addEventListener("click", () => {
  serialTerminal.focus();
  // Ensure scroll to bottom when clicked
  serialTerminal.scrollTop = serialTerminal.scrollHeight;
});

// Terminal helper functions
function findPromptNode(node) {
  while (node && node.nodeType !== Node.TEXT_NODE) {
    node = node.firstChild;
  }
  if (node && node.textContent.includes('>>>')) {
    return node;
  }
  return null;
}

function navigateHistory(direction) {
  if (commandHistory.length === 0) return;

  if (direction === -1 && historyIndex < commandHistory.length - 1) {
    historyIndex++;
  } else if (direction === 1 && historyIndex > 0) {
    historyIndex--;
  } else if (direction === 1 && historyIndex === 0) {
    historyIndex = -1;
    replaceCurrentLine('');
    return;
  }

  if (historyIndex >= 0) {
    replaceCurrentLine(commandHistory[commandHistory.length - 1 - historyIndex]);
  }
}

function replaceCurrentLine(text) {
  const selection = window.getSelection();
  if (selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);
    const promptNode = findPromptNode(range.startContainer);
    if (promptNode) {
      const promptText = promptNode.textContent;
      const promptEnd = promptText.lastIndexOf('>>>') + 3;
      const newText = promptText.substring(0, promptEnd) + ' ' + text;
      promptNode.textContent = newText;

      // Set cursor at end
      const newRange = document.createRange();
      newRange.setStart(promptNode, 1);
      newRange.setEnd(promptNode, 1);
      newRange.collapse(false);
      selection.removeAllRanges();
      selection.addRange(newRange);
    }
  }
}

function appendToTerminal(text, className = '') {
  const span = document.createElement('span');
  if (className) span.className = className;
  span.textContent = text;
  serialTerminal.appendChild(span);

  // Force scroll to bottom
  setTimeout(() => {
    serialTerminal.scrollTop = serialTerminal.scrollHeight;
  }, 0);
}

function appendOutput(text) {
  // Create a separate output span
  const outputSpan = document.createElement('span');
  outputSpan.className = 'output';
  outputSpan.textContent = text;
  serialTerminal.appendChild(outputSpan);

  // Force scroll to bottom
  setTimeout(() => {
    serialTerminal.scrollTop = serialTerminal.scrollHeight;
  }, 0);
}

function getCurrentCommand() {
  const selection = window.getSelection();
  if (selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);
    const promptNode = findPromptNode(range.startContainer);
    if (promptNode) {
      const promptText = promptNode.textContent;
      const promptEnd = promptText.lastIndexOf('>>>') + 3;
      return promptText.substring(promptEnd).trim();
    }
  }
  return '';
}

function addPrompt() {
  appendToTerminal('\n>>> ', 'prompt');
  serialTerminal.focus();

  // Set cursor at end
  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(serialTerminal);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

async function executeCommand() {
  const command = getCurrentCommand();
  if (!command) {
    addPrompt();
    return;
  }

  if (!esp32REPL.isREPLConnected()) {
    appendToTerminal('Error: REPL not connected\n', 'error');
    addPrompt();
    return;
  }

  // Add command to history
  if (command && !commandHistory.includes(command)) {
    commandHistory.push(command);
  }
  historyIndex = -1;

  // Set waiting flag
  isWaitingForResponse = true;
  responseBuffer = '';

  try {
    // Send command to ESP32
    await esp32REPL.sendCommand(command + '\n');

    // Set a timeout to add prompt if no response received
    setTimeout(() => {
      if (isWaitingForResponse) {
        appendToTerminal('\n>>> ', 'prompt');
        isWaitingForResponse = false;
        responseBuffer = '';
        serialTerminal.focus();
      }
    }, 2000); // 2 second timeout

  } catch (error) {
    console.error("Error executing command:", error);
    appendToTerminal(`Error: ${error.message}\n`, 'error');
    isWaitingForResponse = false;
    addPrompt();
  }
}

function initializeTerminal() {
  serialTerminal.innerHTML = '';
  appendToTerminal('MicroPython REPL Terminal\n', 'welcome');
  appendToTerminal('Type "help()" for more information.\n', 'welcome');
  appendToTerminal('\n>>> ', 'prompt');
  serialTerminal.focus();

  // Ensure scrolling is enabled
  serialTerminal.style.overflowY = 'scroll';
  serialTerminal.scrollTop = serialTerminal.scrollHeight;
}

// ESP32 Detection functionality
esp32DetectButton.addEventListener("click", async () => {
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

      // Update button text
      const esp32DetectText = document.getElementById("esp32-detect-text");
      esp32DetectText.textContent = `ESP32 (✓)`;

      // Show dropdown items (Flash, Erase, REPL) and change Connect to Disconnect
      esp32FlashButton.style.display = 'block';
      esp32EraseButton.style.display = 'block';
      esp32ReplButton.style.display = 'block';

      // Change Connect button to Disconnect
      esp32ConnectButton.innerHTML = '<i class="fa fa-unlink"></i> Disconnect';
      esp32ConnectButton.id = 'esp32-disconnect-button';

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

    // Reset connection state after successful flash
    currentESP32Device = null;
    const esp32DetectText = document.getElementById("esp32-detect-text");
    esp32DetectText.textContent = "ESP32";
    esp32FlashButton.style.display = 'none';
    esp32EraseButton.style.display = 'none';
    esp32ConnectButton.innerHTML = '<i class="fa fa-link"></i> Connect';
    esp32ConnectButton.id = 'esp32-connect-button';

  } catch (error) {
    console.error("Firmware flashing error:", error);

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

    // Reset connection state after successful erase
    currentESP32Device = null;
    const esp32DetectText = document.getElementById("esp32-detect-text");
    esp32DetectText.textContent = "ESP32";
    esp32FlashButton.style.display = 'none';
    esp32EraseButton.style.display = 'none';
    esp32ConnectButton.innerHTML = '<i class="fa fa-link"></i> Connect';
    esp32ConnectButton.id = 'esp32-connect-button';

  } catch (error) {
    console.error("Flash erase error:", error);

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
      if (esp32REPL.isREPLConnected()) {
        await esp32REPL.closeREPL();
      }

      // Close the port if it's open
      if (currentESP32Device.port && currentESP32Device.port.readable) {
        await currentESP32Device.port.close();
      }

      // Reset the UI
      const esp32DetectText = document.getElementById("esp32-detect-text");
      esp32DetectText.textContent = "ESP32";

      // Hide dropdown items
      esp32FlashButton.style.display = 'none';
      esp32EraseButton.style.display = 'none';
      esp32ReplButton.style.display = 'none';

      // Change Disconnect button back to Connect
      esp32ConnectButton.innerHTML = '<i class="fa fa-link"></i> Connect';
      esp32ConnectButton.id = 'esp32-connect-button';

      // Clear device reference
      currentESP32Device = null;

      // Log disconnect to device terminal
      deviceTerminal.value += `\nESP32 Device Disconnected\n`;
      deviceTerminal.value += `Status: Disconnected\n\n`;
      deviceTerminal.scrollTop = deviceTerminal.scrollHeight;

      // Switch to device output tab
      switchTab('device-output');

      showNotification("ESP32 device disconnected");

    } catch (error) {
      console.error("Disconnect error:", error);
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
      if (!responseBuffer.includes('>>>') && !isWaitingForResponse) {
        appendOutput(data);
        return;
      }

      // Buffer the response
      responseBuffer += data;

      // Check if we have a complete response (ends with >>> prompt)
      if (responseBuffer.includes('>>>')) {
        // Split by the last >>> to separate output from new prompt
        const parts = responseBuffer.split('>>>');
        const output = parts.slice(0, -1).join('>>>').trim();
        const newPrompt = parts[parts.length - 1];

        // Display the output
        if (output) {
          appendOutput(output + '\n');
        }

        // Add new prompt
        appendToTerminal('>>> ', 'prompt');

        // Reset waiting state
        isWaitingForResponse = false;
        responseBuffer = '';

        // Focus terminal
        serialTerminal.focus();

        // Set cursor at end
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(serialTerminal);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
      } else {
        // Partial response, just display what we have
        appendOutput(data);
      }
    };

    showNotification("REPL connection opened successfully!");

  } catch (error) {
    console.error("REPL error:", error);
    showNotification(`REPL failed: ${error.message}`);

    // Show error in terminal
    appendToTerminal(`Error: ${error.message}\n`, 'error');
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
});
