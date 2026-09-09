const fs = require('fs');
const path = require('path');

const dir = __dirname;
const patterns = [
    /^preview_.*\.png$/,
    /^production_verified_.*\.png$/,
    /^gate_preview\.png$/,
    /^screenshot\.png$/,
    /^test_.*\.cjs$/,
    /^capture_.*\.cjs$/
];

function clean() {
    console.log('Cleaning up temporary files...');
    // Clean files in root directory
    const files = fs.readdirSync(dir);
    let deletedCount = 0;
    
    for (const file of files) {
        if (patterns.some(regex => regex.test(file))) {
            const filePath = path.join(dir, file);
            try {
                fs.unlinkSync(filePath);
                console.log(`Deleted: ${file}`);
                deletedCount++;
            } catch (err) {
                console.error(`Failed to delete ${file}:`, err.message);
            }
        }
    }
    
    // Delete temp_assets directory
    const tempAssetsDir = path.join(dir, 'temp_assets');
    if (fs.existsSync(tempAssetsDir)) {
        try {
            fs.rmSync(tempAssetsDir, { recursive: true, force: true });
            console.log('Deleted: temp_assets/');
            deletedCount++;
        } catch (err) {
            console.error('Failed to delete temp_assets:', err.message);
        }
    }

    // Clean Google Drive desktop.ini in public and dist directories
    const publicDesktopIni = path.join(dir, 'public', 'desktop.ini');
    if (fs.existsSync(publicDesktopIni)) {
        try {
            fs.unlinkSync(publicDesktopIni);
            console.log('Deleted: public/desktop.ini');
            deletedCount++;
        } catch (err) {}
    }
    const distDesktopIni = path.join(dir, 'dist', 'desktop.ini');
    if (fs.existsSync(distDesktopIni)) {
        try {
            fs.unlinkSync(distDesktopIni);
            console.log('Deleted: dist/desktop.ini');
            deletedCount++;
        } catch (err) {}
    }
    
    if (deletedCount === 0) {
        console.log('No temporary files found to clean.');
    } else {
        console.log('Cleanup complete.');
    }
}

clean();
