import { readFile, writeFile } from 'fs/promises';

const pngPath = 'C:/Users/tony1/.gemini/antigravity/brain/384e5c12-2eca-4484-954e-180529e3c74f/camelot_logo_fox_castle_1775760235087.png';
const icoPath = 'h:/ai code/camelot.ico';

const pngData = await readFile(pngPath);
const size = pngData.length;

const header = Buffer.alloc(22);
// ICO Header
header.writeUInt16LE(0, 0); // Reserved
header.writeUInt16LE(1, 2); // Type (1=Icon)
header.writeUInt16LE(1, 4); // Count (1 image)

// Directory Entry
header.writeUInt8(0, 6);   // Width (256 -> 0)
header.writeUInt8(0, 7);   // Height (256 -> 0)
header.writeUInt8(0, 8);   // Palette
header.writeUInt8(0, 9);   // Reserved
header.writeUInt16LE(1, 10); // color planes
header.writeUInt16LE(32, 12); // bits per pixel
header.writeUInt32LE(size, 14); // image size
header.writeUInt32LE(22, 18);   // offset

const icoData = Buffer.concat([header, pngData]);
await writeFile(icoPath, icoData);
console.log('✅ Generated camelot.ico');
