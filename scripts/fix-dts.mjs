import fs from 'node:fs';
import path from 'node:path';

const distDir = path.resolve('dist');

function walkDts(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkDts(full));
    } else if (entry.isFile() && entry.name.endsWith('.d.ts')) {
      results.push(full);
    }
  }
  return results;
}

function resolveRelativeTarget(fromFile, spec, targetExt) {
  if (!spec.startsWith('./') && !spec.startsWith('../')) return spec;
  if (/\.(js|mjs|cjs|json)$/i.test(spec)) return spec;

  const baseDir = path.dirname(fromFile);
  const candidate = path.resolve(baseDir, spec);
  if (fs.existsSync(candidate + '.d.ts')) {
    return spec + targetExt;
  }
  if (fs.existsSync(path.join(candidate, 'index.d.ts'))) {
    return spec.replace(/\/$/, '') + '/index' + targetExt;
  }
  return spec + targetExt;
}

function rewriteSpecifiers(content, filePath, targetExt) {
  // Handle static `from '...'` and `export ... from '...'`
  let updated = content.replace(
    /(\bfrom\s+)(['"])(\.\.?\/[^'"]+)\2/g,
    (_, prefix, quote, spec) => `${prefix}${quote}${resolveRelativeTarget(filePath, spec, targetExt)}${quote}`,
  );
  // Handle side-effect `import '...'`
  updated = updated.replace(
    /(\bimport\s+)(['"])(\.\.?\/[^'"]+)\2/g,
    (_, prefix, quote, spec) => `${prefix}${quote}${resolveRelativeTarget(filePath, spec, targetExt)}${quote}`,
  );
  // Handle `import('...')` type queries
  updated = updated.replace(
    /(\bimport\s*\(\s*)(['"])(\.\.?\/[^'"]+)\2(\s*\))/g,
    (_, prefix, quote, spec, suffix) => `${prefix}${quote}${resolveRelativeTarget(filePath, spec, targetExt)}${quote}${suffix}`,
  );
  return updated;
}

const dtsFiles = walkDts(distDir);
for (const file of dtsFiles) {
  const original = fs.readFileSync(file, 'utf8');
  const esmFixed = rewriteSpecifiers(original, file, '.js');
  if (esmFixed !== original) {
    fs.writeFileSync(file, esmFixed, 'utf8');
  }

  // Also emit paired .d.cts so CJS NodeNext consumers resolve cleanly
  const ctsPath = file.replace(/\.d\.ts$/, '.d.cts');
  const cjsFixed = rewriteSpecifiers(original, file, '.cjs');
  fs.writeFileSync(ctsPath, cjsFixed, 'utf8');
}

console.log(`[fix-dts] Processed ${dtsFiles.length} declaration files for ESM (.d.ts) and CJS (.d.cts) NodeNext compatibility.`);
