# MicroPython Firmware File

This directory contains the MicroPython firmware file for ESP32 devices.

## Required File

Download the latest MicroPython firmware from [MicroPython ESP32 Downloads](https://micropython.org/download/ESP32_GENERIC/) and place it in this directory:

### Latest Version

- **File**: `esp32-GENERIC-20250809-v1.26.0.bin`
- **Version**: v1.26.0
- **Date**: 2025-08-09
- **Size**: ~1.5MB

## Download Instructions

1. Visit [https://micropython.org/download/ESP32_GENERIC/](https://micropython.org/download/ESP32_GENERIC/)
2. Download the latest `.bin` file (v1.26.0)
3. Rename the file to `esp32-GENERIC-20250809-v1.26.0.bin`
4. Place the file in this directory

## File Naming Convention

The firmware file must be named exactly as specified in the `flash.js` file:

- `esp32-GENERIC-20250809-v1.26.0.bin`

## Notes

- These are the official MicroPython firmware files for ESP32-GENERIC boards
- The firmware supports WiFi, BLE, and external flash
- Flash offset is 0x1000 (standard for ESP32)
- Works with most ESP32 development boards
