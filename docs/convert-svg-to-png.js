// Simple script to convert SVG to PNG using Node.js
// Requires: npm install sharp
// Usage: node convert-svg-to-png.js input.svg output.png

const fs = require('fs');
const path = require('path');

async function convertSvgToPng(svgPath, pngPath) {
  try {
    // Try using sharp if available
    const sharp = require('sharp');
    await sharp(svgPath)
      .png()
      .toFile(pngPath);
    console.log(`✓ Converted ${svgPath} to ${pngPath}`);
  } catch (error) {
    if (error.code === 'MODULE_NOT_FOUND') {
      console.log('Sharp not found. Install with: npm install sharp');
      console.log('Alternatively, you can:');
      console.log('1. Use an online SVG to PNG converter');
      console.log('2. Use ImageMagick: convert qodo-logo.svg qodo-logo.png');
      console.log('3. Use Inkscape: inkscape qodo-logo.svg --export-filename=qodo-logo.png');
    } else {
      console.error('Error converting:', error.message);
    }
  }
}

const svgFile = process.argv[2] || 'qodo-logo.svg';
const pngFile = process.argv[3] || 'qodo-logo.png';

if (!fs.existsSync(svgFile)) {
  console.log(`SVG file not found: ${svgFile}`);
  console.log('Please provide the SVG file path as the first argument.');
  process.exit(1);
}

convertSvgToPng(svgFile, pngFile);

