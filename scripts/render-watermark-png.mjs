import sharp from "sharp";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const svgPath = path.resolve(process.cwd(), "public/watermark.svg");
const pngPath = path.resolve(process.cwd(), "public/watermark.png");

const svg = readFileSync(svgPath);
const png = await sharp(svg, { density: 600 })
  .resize({ width: 960 })
  .png({ compressionLevel: 9 })
  .toBuffer();
writeFileSync(pngPath, png);

const meta = await sharp(png).metadata();
console.log(
  `Wrote public/watermark.png  ${meta.width}x${meta.height}  ${png.length} bytes`,
);
