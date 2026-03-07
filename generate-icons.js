const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const iconsDir = path.join(__dirname, 'geolocate-app/public/icons');

// Assicurati che la directory esista
if (!fs.existsSync(iconsDir)) {
    fs.mkdirSync(iconsDir, { recursive: true });
}

const theme_color = '#1976D2';
const background_color = '#FFFFFF';

// SVG con circle e location pin (semplice ma efficace)
const svg = `<svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">
  <rect width="512" height="512" fill="${background_color}"/>
  <circle cx="256" cy="256" r="240" fill="${theme_color}"/>
  <g transform="translate(256, 210)">
    <!-- Location pin -->
    <path d="M 0 -80 C -44 -80 -80 -44 -80 0 C -80 60 0 140 0 140 C 0 140 80 60 80 0 C 80 -44 44 -80 0 -80 Z" 
          fill="white" opacity="0.95"/>
    <!-- Inner circle on pin -->
    <circle cx="0" cy="-20" r="20" fill="${theme_color}"/>
  </g>
  <text x="256" y="420" font-family="Arial, sans-serif" font-size="36" font-weight="bold" 
        fill="${theme_color}" text-anchor="middle" letter-spacing="2">LOCALI</text>
</svg>`;

async function generateIcons() {
    try {
        // Generate 192x192
        await sharp(Buffer.from(svg))
            .resize(192, 192, {
                fit: 'contain',
                background: { r: 255, g: 255, b: 255, alpha: 1 }
            })
            .png()
            .toFile(path.join(iconsDir, 'icon-192x192.png'));
        
        console.log('✓ Generated icon-192x192.png');

        // Generate 512x512
        await sharp(Buffer.from(svg))
            .resize(512, 512, {
                fit: 'contain',
                background: { r: 255, g: 255, b: 255, alpha: 1 }
            })
            .png()
            .toFile(path.join(iconsDir, 'icon-512x512.png'));
        
        console.log('✓ Generated icon-512x512.png');

        // Generate favicon (192x192 same as small icon)
        await sharp(Buffer.from(svg))
            .resize(192, 192, {
                fit: 'contain',
                background: { r: 255, g: 255, b: 255, alpha: 1 }
            })
            .png()
            .toFile(path.join(iconsDir, 'favicon.png'));
        
        console.log('✓ Generated favicon.png');

        console.log('\n✅ All icons generated successfully!');
        console.log(`📁 Icons saved to: ${iconsDir}`);

    } catch (error) {
        console.error('❌ Error generating icons:', error.message);
        process.exit(1);
    }
}

generateIcons();
