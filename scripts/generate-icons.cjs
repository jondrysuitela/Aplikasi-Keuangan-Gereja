#!/usr/bin/env node
/**
 * Generate high-quality Windows icon from PNG source
 * Creates ICO file with multiple resolutions (16, 32, 48, 64, 128, 256)
 * for better appearance on taskbar, desktop, and installer
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const rootDir = path.join(__dirname, '..');
const publicDir = path.join(rootDir, 'frontend', 'public');
const sourcePng = path.join(publicDir, 'android-chrome-512x512.png');
const outputIco = path.join(publicDir, 'church-logo.ico');

async function generateIcons() {
  const sizes = [16, 32, 48, 64, 128, 256];

  try {
    if (!fs.existsSync(sourcePng)) {
      console.error(`❌ Source PNG not found: ${sourcePng}`);
      process.exit(1);
    }

    console.log('📦 Generating icon variants from source PNG...');

    const images = [];
    for (const size of sizes) {
      console.log(`  ✓ Creating ${size}x${size}...`);
      const buffer = await sharp(sourcePng)
        .resize(size, size, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 }
        })
        .png()
        .toBuffer();
      images.push({ size, buffer });
    }

    const header = Buffer.alloc(6);
    header.writeUInt16LE(0, 0); // reserved
    header.writeUInt16LE(1, 2); // type ICO
    header.writeUInt16LE(images.length, 4); // image count

    const entries = [];
    let offset = 6 + images.length * 16;

    for (const image of images) {
      const entry = Buffer.alloc(16);
      entry.writeUInt8(image.size === 256 ? 0 : image.size, 0); // width
      entry.writeUInt8(image.size === 256 ? 0 : image.size, 1); // height
      entry.writeUInt8(0, 2); // color count
      entry.writeUInt8(0, 3); // reserved
      entry.writeUInt16LE(1, 4); // color planes
      entry.writeUInt16LE(32, 6); // bit count
      entry.writeUInt32LE(image.buffer.length, 8); // bytes in resource
      entry.writeUInt32LE(offset, 12); // offset of image data
      entries.push(entry);
      offset += image.buffer.length;
    }

    const icoBuffer = Buffer.concat([header, ...entries, ...images.map((image) => image.buffer)]);
    fs.writeFileSync(outputIco, icoBuffer);

    console.log(`✅ Icon generated: ${outputIco}`);
    console.log(`   Resolutions: ${sizes.join(', ')} px\n`);
  } catch (error) {
    console.error('❌ Error generating icon:', error.message);
    process.exit(1);
  }
}

generateIcons();
