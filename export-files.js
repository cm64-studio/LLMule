const fs = require('fs');
const path = require('path');

const outputFilePath = path.join(__dirname, 'exported-files.txt');
const extensions = ['.js', 'package.json'];
const projectDir = __dirname;

function readFiles(dir) {
    const files = fs.readdirSync(dir);

    files.forEach((file) => {
        const filePath = path.join(dir, file);
        const stats = fs.statSync(filePath);

        //avoid this file
        if (file === 'export-files.js') {
            return;
        }

        // Skip `node_modules` and `.git`
        if (stats.isDirectory() && (file === 'node_modules' || file === '.git')) {
            return;
        }

        if (stats.isDirectory()) {
            readFiles(filePath);
        } else if (
            extensions.includes(path.extname(file)) || 
            extensions.includes(file) // For package.json
        ) {
            const content = fs.readFileSync(filePath, 'utf8');
            fs.appendFileSync(outputFilePath, `\n--- ${filePath} ---\n${content}\n`);
        }
    });
}

// Start reading files
fs.writeFileSync(outputFilePath, ''); // Clear or create the file
readFiles(projectDir);
console.log(`Exported files written to ${outputFilePath}`);