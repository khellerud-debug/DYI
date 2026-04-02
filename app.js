const { useMemo, useState } = React;

/**
 * Stair Platform Configurator
 * Practical planning tool only, not structural approval.
 */

const PLYWOOD_DENSITY_KG_M3 = 450;
const TIMBER_DENSITY_KG_M3 = 430;
const STANDARD_PLYWOOD_SHEET_W = 1220;
const STANDARD_PLYWOOD_SHEET_L = 2440;

const defaultRepeatedPlatform = {
  id: 'platform-1',
  name: 'Standard platform',
  quantity: 1,
  width: 600,
  length: 900,
  topThickness: 18,
  frameWidth: 48,
  frameHeight: 73,
  legWidth: 48,
  legHeight: 73,
  layoutStyle: 'flexible-pockets',
  pocketPattern: '3x3',
  customRows: 3,
  customCols: 3,
};

const defaultProject = {
  staircase: {
    stepHeight: 180,
    treadDepth: 260,
    stairWidth: 900,
    stairwellWidth: 1800,
    numberOfSteps: 12,
    stairType: 'straight',
    uTurnStyle: 'landing',
    landingDepth: 900,
    landingWidth: 900,
    winderSteps: 3,
    winderInnerTread: 120,
    handrailPosition: 'right',
    wallToHandrailClearance: 40,
    narrowsAtPoint: false,
    narrowestWidth: 800,
    obstructionDepth: 0,
  },
  platformConfig: {
    mode: 'repeat',
    repeatedCount: 2,
    repeatedTemplate: defaultRepeatedPlatform,
    modules: [
      { ...defaultRepeatedPlatform, id: 'mixed-1', name: 'Lower module', quantity: 1 },
      { ...defaultRepeatedPlatform, id: 'mixed-2', name: 'Upper module', quantity: 1, width: 550, length: 900 },
    ],
  },
  legConfig: {
    mode: 'auto',
    grouping: 'step-increments',
    baseLegLength: 120,
    manualLegs: [
      { id: 'leg-1', label: 'Short', length: 120, quantity: 4 },
      { id: 'leg-2', label: 'Medium', length: 300, quantity: 4 },
      { id: 'leg-3', label: 'Tall', length: 480, quantity: 2 },
    ],
  },
  hardware: {
    boltLength: 90,
    includeWashers: true,
    includeAntiSlipPads: true,
    includeGlue: true,
    includeOptionalBracing: true,
  },
};

function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function roundTo(value, step) { return Math.round(value / step) * step; }
function sum(arr, picker) { return arr.reduce((acc, item) => acc + picker(item), 0); }
function formatMm(value) { return `${Math.round(value)} mm`; }
function formatMeters(valueMm) { return `${(valueMm / 1000).toFixed(2)} m`; }
function formatKg(value) { return `${value.toFixed(1)} kg`; }
function mm3ToKg(volumeMm3, densityKgM3) { return (volumeMm3 / 1_000_000_000) * densityKgM3; }
function mmAreaToM2(areaMm2) { return areaMm2 / 1_000_000; }
function uniqueId(prefix) { return `${prefix}-${Math.random().toString(36).slice(2, 9)}`; }

function getPatternRowsCols(module) {
  if (module.pocketPattern === '3x3') return { rows: 3, cols: 3 };
  if (module.pocketPattern === '4x4') return { rows: 4, cols: 4 };
  return { rows: clamp(module.customRows || 3, 2, 8), cols: clamp(module.customCols || 3, 2, 8) };
}

function getEffectivePlatforms(project) {
  if (project.platformConfig.mode === 'repeat') {
    return [{ ...project.platformConfig.repeatedTemplate, quantity: clamp(project.platformConfig.repeatedCount, 1, 20) }];
  }
  return project.platformConfig.modules.map((m) => ({ ...m, quantity: clamp(m.quantity || 1, 1, 20) }));
}

function getPocketInset(module) { return clamp(module.legWidth / 2 + 24, 44, 86); }

function getCrossMemberCenterlines(length, frameInset, crossMemberCount) {
  const innerLength = Math.max(40, length - frameInset * 2);
  const step = innerLength / (crossMemberCount + 1);
  return Array.from({ length: crossMemberCount }, (_, idx) => frameInset + step * (idx + 1));
}

function getClearYIntervals(length, frameInset, crossCenters, blockedHalfBand) {
  const blocks = crossCenters
    .map((center) => ({
      start: Math.max(frameInset, center - blockedHalfBand),
      end: Math.min(length - frameInset, center + blockedHalfBand),
    }))
    .sort((a, b) => a.start - b.start);

  const intervals = [];
  let cursor = frameInset;
  blocks.forEach((block) => {
    if (block.start > cursor + 20) intervals.push({ start: cursor, end: block.start });
    cursor = Math.max(cursor, block.end);
  });
  if (cursor < length - frameInset - 20) intervals.push({ start: cursor, end: length - frameInset });
  return intervals.length ? intervals : [{ start: frameInset, end: length - frameInset }];
}

function getEvenlySpacedPositions(start, end, count) {
  if (count <= 1) return [(start + end) / 2];
  const step = (end - start) / (count - 1);
  return Array.from({ length: count }, (_, idx) => start + idx * step);
}

function getNudgedPositionIntoIntervals(value, intervals) {
  for (const interval of intervals) if (value >= interval.start && value <= interval.end) return value;
  let closest = intervals[0]?.start || value;
  let minDistance = Infinity;
  intervals.forEach((interval) => {
    const candidate = value < interval.start ? interval.start : interval.end;
    const distance = Math.abs(candidate - value);
    if (distance < minDistance) {
      minDistance = distance;
      closest = candidate;
    }
  });
  return closest;
}

function distributePositionsAcrossIntervals(intervals, count) {
  if (count <= 1) {
    const totalStart = intervals[0]?.start || 0;
    const totalEnd = intervals[intervals.length - 1]?.end || 0;
    return [(totalStart + totalEnd) / 2];
  }
  const assignments = Array.from({ length: count }, (_, idx) => intervals.length === 1 ? 0 : Math.round((idx * (intervals.length - 1)) / (count - 1)));
  const totals = intervals.map((_, idx) => assignments.filter((entry) => entry === idx).length);
  const seen = intervals.map(() => 0);
  return assignments.map((intervalIndex) => {
    seen[intervalIndex] += 1;
    const interval = intervals[intervalIndex];
    const totalInInterval = totals[intervalIndex];
    const ratio = totalInInterval <= 1 ? 0.5 : seen[intervalIndex] / (totalInInterval + 1);
    return interval.start + (interval.end - interval.start) * ratio;
  });
}

function getPocketSupport(point, platform) {
  const support = {
    left: point.col === 0,
    right: point.col === platform.pocketCols - 1,
    top: point.row === 0,
    bottom: point.row === platform.pocketRows - 1,
  };
  const nearestCross = platform.crossMemberCenters.find((c) => Math.abs(c - point.y) < platform.module.frameWidth * 0.65);
  if (nearestCross) {
    if (point.y <= nearestCross) support.bottom = true;
    else support.top = true;
  }
  return support;
}

function getPocketSupportSideCount(point, platform) {
  const support = getPocketSupport(point, platform);
  return Object.values(support).filter(Boolean).length;
}

function getEffectiveStairWidth(stair) {
  const handrailLoss = stair.handrailPosition === 'both' ? stair.wallToHandrailClearance * 2 : stair.handrailPosition === 'none' ? 0 : stair.wallToHandrailClearance;
  const baseWidth = stair.narrowsAtPoint ? Math.min(stair.stairWidth, stair.narrowestWidth) : stair.stairWidth;
  return Math.max(350, baseWidth - handrailLoss - stair.obstructionDepth);
}

function suggestPlatformSize(stair) {
  const effectiveStairWidth = getEffectiveStairWidth(stair);
  const maxWidth = clamp(effectiveStairWidth - 60, 350, 900);

  let suggestedLengthBase = 900;
  if (stair.stairType === 'straight') suggestedLengthBase = Math.min(900, stair.treadDepth * 3 + 120);
  if (stair.stairType === 'u-shaped') suggestedLengthBase = Math.min(900, Math.max(650, stair.landingDepth || 900));
  if (stair.stairType === 'l-shaped') suggestedLengthBase = Math.min(900, Math.max(650, Math.min(stair.landingDepth || 900, stair.stairwellWidth / 1.8)));

  const maximumLength = clamp(stair.stairType === 'straight' ? stair.treadDepth * 4 + 150 : Math.max(stair.landingDepth, 850), 650, 1300);

  return {
    recommendedWidth: roundTo(clamp(Math.min(maxWidth, 600), 450, maxWidth), 10),
    recommendedLength: roundTo(clamp(suggestedLengthBase, 650, maximumLength), 10),
    maximumWidth: roundTo(maxWidth, 10),
    maximumLength: roundTo(maximumLength, 10),
    effectiveStairWidth: roundTo(effectiveStairWidth, 10),
  };
}

function getCrossMemberCount(length) {
  if (length <= 750) return 1;
  if (length <= 1100) return 2;
  return 3;
}

function getPocketLayout(module) {
  const { rows, cols } = getPatternRowsCols(module);
  const frameInset = getPocketInset(module);
  const crossMemberCount = getCrossMemberCount(module.length);
  const crossMemberCenters = getCrossMemberCenterlines(module.length, frameInset, crossMemberCount);
  const blockedHalfBand = clamp(module.frameWidth / 2 + module.legWidth / 2 + 10, 30, 70);
  const clearYIntervals = getClearYIntervals(module.length, frameInset, crossMemberCenters, blockedHalfBand);

  const xPositions = getEvenlySpacedPositions(frameInset, module.width - frameInset, cols);
  const yPositions = module.layoutStyle === 'fixed-grid'
    ? getEvenlySpacedPositions(frameInset, module.length - frameInset, rows).map((y) => getNudgedPositionIntoIntervals(y, clearYIntervals))
    : distributePositionsAcrossIntervals(clearYIntervals, rows);

  const points = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) points.push({ x: xPositions[c], y: yPositions[r], row: r, col: c });
  return { rows, cols, points, crossMemberCenters };
}

function getRecommendedLegsUsed(module, pocketCount) {
  let recommended = 4;
  if (module.length > 950) recommended = 5;
  if (module.length > 1100 || module.width > 700) recommended = 6;
  if (module.width > 800 && module.length > 1100) recommended = 7;
  return clamp(recommended, 4, pocketCount);
}

function computePlatform(module, stair) {
  const suggestion = suggestPlatformSize(stair);
  const { rows, cols, points, crossMemberCenters } = getPocketLayout(module);
  const pocketCount = points.length;
  const recommendedLegsUsed = getRecommendedLegsUsed(module, pocketCount);
  const crossMemberCount = getCrossMemberCount(module.length);

  const topVolume = module.width * module.length * module.topThickness;
  const longRailsVolume = 2 * module.length * module.frameWidth * module.frameHeight;
  const shortRailLength = Math.max(0, module.width - module.frameWidth * 2);
  const shortRailsVolume = 2 * shortRailLength * module.frameWidth * module.frameHeight;
  const crossVolume = crossMemberCount * Math.max(0, module.width - module.frameWidth * 2) * module.frameWidth * module.frameHeight;

  const topWeightKg = mm3ToKg(topVolume, PLYWOOD_DENSITY_KG_M3);
  const frameWeightKg = mm3ToKg(longRailsVolume + shortRailsVolume + crossVolume, TIMBER_DENSITY_KG_M3);
  const estimatedTotalWeightKg = topWeightKg + frameWeightKg + recommendedLegsUsed * 0.3;

  const warnings = [];
  if (module.width > suggestion.maximumWidth) warnings.push('Platform width exceeds practical available stair width.');
  if (module.length > suggestion.maximumLength) warnings.push('Platform length appears large for this staircase geometry.');
  if (module.width < 400) warnings.push('Very narrow platform width may be impractical.');
  if (module.length < 600) warnings.push('Very short platform length may reduce usefulness.');

  const minXSpacing = cols > 1 ? (module.width - getPocketInset(module) * 2) / (cols - 1) : 999;
  const col0 = points.filter((pt) => pt.col === 0);
  const rowYSteps = [];
  for (let i = 1; i < col0.length; i++) rowYSteps.push(col0[i].y - col0[i - 1].y);
  const minYSpacing = rowYSteps.length ? Math.min(...rowYSteps) : 999;

  if (minXSpacing < module.legWidth + 18 || minYSpacing < module.legWidth + 18) {
    warnings.push('Too many pocket positions for selected platform size.');
  }

  return {
    module,
    pocketRows: rows,
    pocketCols: cols,
    pocketCount,
    recommendedLegsUsed,
    pocketPoints: points,
    crossMemberCount,
    crossMemberCenters,
    topWeightKg,
    frameWeightKg,
    estimatedTotalWeightKg,
    warnings,
  };
}

function getSuggestedLegHeights(project, platforms) {
  const stair = project.staircase;
  const rise = stair.stepHeight;
  const maxPlatformLength = Math.max(...platforms.map((p) => p.module.length), 900);
  const maxLevels = clamp(Math.floor(maxPlatformLength / Math.max(1, stair.treadDepth)) + 1, 2, 6);
  const supportsPerLevel = Math.max(2, Math.min(3, Math.round(Math.max(...platforms.map((p) => p.module.width), 600) / 350)));

  const heights = [];
  for (let i = 0; i < maxLevels; i++) {
    const legLength = project.legConfig.grouping === 'straight' ? project.legConfig.baseLegLength : project.legConfig.baseLegLength + i * rise;
    heights.push({ label: i === 0 ? 'Base leg' : `Base + ${i} rise`, length: legLength, quantity: supportsPerLevel });
  }

  const multiplier = sum(platforms, (p) => p.module.quantity);
  return heights.map((entry) => ({ ...entry, quantity: entry.quantity * multiplier }));
}

function getActiveLegPlan(project, platforms) {
  if (project.legConfig.mode === 'manual') return project.legConfig.manualLegs.map((l) => ({ label: l.label, length: l.length, quantity: l.quantity }));
  return getSuggestedLegHeights(project, platforms);
}

function getCutList(platforms, legPlan, hardware) {
  const cuts = [];
  platforms.forEach((platform) => {
    const m = platform.module;
    const shortRailLength = Math.max(0, m.width - m.frameWidth * 2);
    const crossLength = Math.max(0, m.width - m.frameWidth * 2);
    const totalPocketBlocks = sum(platform.pocketPoints, (point) => Math.max(0, 4 - getPocketSupportSideCount(point, platform)));

    cuts.push({ part: 'Top plate', material: `${m.topThickness} mm plywood`, width: m.width, length: m.length, qty: m.quantity, platform: m.name });
    cuts.push({ part: 'Outer frame long rail', material: `${m.frameWidth} x ${m.frameHeight} timber`, width: m.frameWidth, length: m.length, qty: 2 * m.quantity, platform: m.name });
    cuts.push({ part: 'Outer frame short rail', material: `${m.frameWidth} x ${m.frameHeight} timber`, width: m.frameWidth, length: shortRailLength, qty: 2 * m.quantity, platform: m.name });
    cuts.push({ part: 'Cross-member / main beam', material: `${m.frameWidth} x ${m.frameHeight} timber`, width: m.frameWidth, length: crossLength, qty: platform.crossMemberCount * m.quantity, platform: m.name });
    cuts.push({ part: 'Pocket guide block, 45° relief', material: `${m.frameWidth} x ${m.frameHeight} timber`, width: m.frameWidth, length: 120, qty: totalPocketBlocks * m.quantity, platform: m.name });
  });

  const legMaterial = platforms[0] ? `${platforms[0].module.legWidth} x ${platforms[0].module.legHeight} timber` : '48 x 73 timber';
  const legWidth = platforms[0]?.module.legWidth || 48;

  legPlan.forEach((leg) => {
    cuts.push({ part: 'Leg', material: legMaterial, width: legWidth, length: leg.length, qty: leg.quantity, platform: 'All platforms' });
    if (hardware.includeOptionalBracing && leg.length >= 600) cuts.push({ part: 'Optional bracing piece', material: legMaterial, width: legWidth, length: 280, qty: leg.quantity * 2, platform: 'All platforms' });
  });

  return cuts;
}

function getBillOfMaterials(platforms, legPlan, cutList, hardware) {
  const items = [];
  const plywoodArea = sum(cutList.filter((c) => c.part === 'Top plate'), (c) => c.width * c.length * c.qty);
  const sheetArea = STANDARD_PLYWOOD_SHEET_W * STANDARD_PLYWOOD_SHEET_L;
  const plywoodSheets = Math.ceil(plywoodArea / sheetArea);
  items.push({ category: 'Sheet goods', name: 'Poplar plywood sheets', qty: Math.max(1, plywoodSheets), unit: 'sheets', notes: `Standard sheet: ${STANDARD_PLYWOOD_SHEET_W} x ${STANDARD_PLYWOOD_SHEET_L} mm` });

  const timberByMaterial = new Map();
  cutList.filter((c) => c.material.includes('timber')).forEach((c) => {
    timberByMaterial.set(c.material, (timberByMaterial.get(c.material) || 0) + c.length * c.qty);
  });

  Array.from(timberByMaterial.entries()).forEach(([material, totalLength]) => {
    items.push({ category: 'Timber', name: material, qty: Number((totalLength / 1000).toFixed(2)), unit: 'm', notes: 'Total raw length before stock optimization' });
  });

  const totalLegCount = sum(legPlan, (l) => l.quantity);
  const totalRecommendedLegsUsed = sum(platforms, (p) => p.recommendedLegsUsed * p.module.quantity);
  const boltCount = Math.max(totalLegCount, totalRecommendedLegsUsed);

  items.push({ category: 'Hardware', name: 'M8 threaded inserts', qty: totalLegCount, unit: 'pcs' });
  items.push({ category: 'Hardware', name: `M8 bolts (${hardware.boltLength} mm)`, qty: boltCount, unit: 'pcs' });
  if (hardware.includeWashers) items.push({ category: 'Hardware', name: 'M8 washers', qty: boltCount, unit: 'pcs' });

  const screwCount = Math.ceil(sum(platforms, (p) => {
    const pocketGuideBlocks = sum(p.pocketPoints, (point) => Math.max(0, 4 - getPocketSupportSideCount(point, p)));
    return (20 + p.crossMemberCount * 4 + pocketGuideBlocks * 2) * p.module.quantity;
  }));

  items.push({ category: 'Hardware', name: 'Wood screws', qty: screwCount, unit: 'pcs', notes: 'Rough estimate for frame, pocket blocks and top fastening' });
  if (hardware.includeGlue) items.push({ category: 'Consumables', name: 'Wood glue', qty: 1, unit: 'bottle' });
  if (hardware.includeAntiSlipPads) items.push({ category: 'Consumables', name: 'Anti-slip pads / feet', qty: totalLegCount, unit: 'pcs' });
  return items;
}

function getGlobalWarnings(stair, platforms, legPlan) {
  const warnings = [
    'This is a planning tool only. It does not provide structural approval.',
    'User must verify stability, bracing, fasteners and safe working conditions before use.',
    'Do not use without proper assembly, anti-slip measures and practical load assessment.',
    'Not a substitute for certified scaffolding or engineering approval.',
  ];
  if (stair.stepHeight <= 0 || stair.treadDepth <= 0 || stair.numberOfSteps <= 0) warnings.push('Stair geometry contains invalid values.');
  if (stair.stairWidth < 550) warnings.push('Very narrow staircase detected. Layout options are limited.');
  platforms.forEach((p) => warnings.push(...p.warnings));
  legPlan.forEach((leg) => {
    if (leg.length < 80) warnings.push(`Leg length ${leg.length} mm is probably too short.`);
    if (leg.length > 1200) warnings.push(`Leg length ${leg.length} mm is very tall and may require strong bracing.`);
  });
  return Array.from(new Set(warnings));
}

function NumberInput({ label, value, onChange, min, max, step = 1, suffix }) {
  return <label className="field"><span>{label}</span><div className="inputWrap"><input type="number" value={Number.isFinite(value) ? value : ''} min={min} max={max} step={step} onChange={(e) => onChange(Number(e.target.value))} />{suffix ? <em>{suffix}</em> : null}</div></label>;
}

function SelectInput({ label, value, onChange, options }) {
  return <label className="field"><span>{label}</span><select value={value} onChange={(e) => onChange(e.target.value)}>{options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>;
}

function ToggleInput({ label, checked, onChange }) {
  return <label className="toggle"><span>{label}</span><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} /></label>;
}

function WarningList({ warnings }) {
  return <div className="warning"><h3>Warnings & safety notes</h3><ul>{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul></div>;
}

function Table({ headers, rows }) {
  return <div className="tableWrap"><table><thead><tr>{headers.map((h) => <th key={h}>{h}</th>)}</tr></thead><tbody>{rows.map((row, idx) => <tr key={idx}>{row.map((cell, c) => <td key={c}>{cell}</td>)}</tr>)}</tbody></table></div>;
}

function TopViewDiagram({ platform }) {
  const w = 360, h = 220, pad = 24;
  const scale = Math.min((w - pad * 2) / platform.module.width, (h - pad * 2) / platform.module.length);
  const rw = platform.module.width * scale, rh = platform.module.length * scale;
  const x = (w - rw) / 2, y = (h - rh) / 2;
  return <svg viewBox={`0 0 ${w} ${h}`} className="diagram"><rect x={x} y={y} width={rw} height={rh} fill="#ddd" stroke="#111" strokeWidth="2" /><text x={w/2} y={h-8} textAnchor="middle" className="svgSmall">Top view {platform.module.width}x{platform.module.length} mm</text></svg>;
}

function UndersideDiagram({ platform }) {
  const w = 360, h = 240, pad = 28;
  const scale = Math.min((w - pad * 2) / platform.module.width, (h - pad * 2) / platform.module.length);
  const rw = platform.module.width * scale, rh = platform.module.length * scale;
  const x = (w - rw) / 2, y = (h - rh) / 2;
  const frameThickness = Math.max(8, platform.module.frameWidth * scale * 0.7);
  const pocketSide = Math.max(12, platform.module.legWidth * scale * 0.7);
  const guideDepth = Math.max(8, pocketSide * 0.55);

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="diagram">
      <rect x={x} y={y} width={rw} height={rh} fill="#fafafa" stroke="#111" strokeWidth="2" />
      <rect x={x} y={y} width={rw} height={frameThickness} fill="#64748b" />
      <rect x={x} y={y + rh - frameThickness} width={rw} height={frameThickness} fill="#64748b" />
      <rect x={x} y={y} width={frameThickness} height={rh} fill="#64748b" />
      <rect x={x + rw - frameThickness} y={y} width={frameThickness} height={rh} fill="#64748b" />
      {platform.crossMemberCenters.map((center, idx) => <rect key={idx} x={x + frameThickness} y={y + center * scale - frameThickness/2} width={rw-frameThickness*2} height={frameThickness*0.9} fill="#94a3b8" />)}
      {platform.pocketPoints.map((pt, idx) => {
        const px = x + pt.x * scale, py = y + pt.y * scale;
        const left = px - pocketSide / 2, right = px + pocketSide / 2, top = py - pocketSide / 2, bottom = py + pocketSide / 2;
        const support = getPocketSupport(pt, platform);
        return <g key={idx}>
          {!support.top && <polygon points={`${left+2},${top-guideDepth} ${right-2},${top-guideDepth} ${right-8},${top-2} ${left+8},${top-2}`} fill="#d97706"/>}
          {!support.bottom && <polygon points={`${left+8},${bottom+2} ${right-8},${bottom+2} ${right-2},${bottom+guideDepth} ${left+2},${bottom+guideDepth}`} fill="#d97706"/>}
          {!support.left && <polygon points={`${left-guideDepth},${top+2} ${left-2},${top+8} ${left-2},${bottom-8} ${left-guideDepth},${bottom-2}`} fill="#d97706"/>}
          {!support.right && <polygon points={`${right+2},${top+8} ${right+guideDepth},${top+2} ${right+guideDepth},${bottom-2} ${right+2},${bottom-8}`} fill="#d97706"/>}
          <rect x={left} y={top} width={pocketSide} height={pocketSide} fill="#111" opacity="0.8" />
        </g>;
      })}
      <text x={w/2} y={h-8} textAnchor="middle" className="svgSmall">Underside with frame-integrated pockets + relief blocks</text>
    </svg>
  );
}

function SideViewDiagram({ stair, legPlan, platform }) {
  const w = 420, h = 260, leftPad = 30, bottomPad = 28, topPad = 18;
  const usableW = w - leftPad - 20, usableH = h - topPad - bottomPad;
  const visibleSteps = clamp(Math.ceil(platform.module.length / stair.treadDepth) + 1, 3, 7);
  const totalRun = visibleSteps * stair.treadDepth, totalRise = visibleSteps * stair.stepHeight;
  const scale = Math.min(usableW / totalRun, usableH / Math.max(totalRise, 500));

  const stairPath = [];
  let currentX = leftPad, currentY = h - bottomPad;
  stairPath.push(`M ${currentX} ${currentY}`);
  for (let i = 0; i < visibleSteps; i++) {
    currentX += stair.treadDepth * scale; stairPath.push(`L ${currentX} ${currentY}`);
    currentY -= stair.stepHeight * scale; stairPath.push(`L ${currentX} ${currentY}`);
  }

  const sortedLegs = [...legPlan].sort((a, b) => b.length - a.length).slice(0, Math.min(4, legPlan.length));
  const firstStepY = h - bottomPad;
  const platformBottomY = firstStepY - (sortedLegs[0]?.length || 120) * scale;
  const platformX = leftPad + 25;
  const platformW = platform.module.length * scale * 0.82;
  const platformH = (platform.module.frameHeight + platform.module.topThickness) * scale;
  const platformY = platformBottomY - platformH;
  const legVisualWidth = Math.max(12, platform.module.legWidth * scale * 0.45);

  return <svg viewBox={`0 0 ${w} ${h}`} className="diagram"><path d={stairPath.join(' ')} fill="none" stroke="#111" strokeWidth="3"/><rect x={platformX} y={platformY} width={platformW} height={platformH} fill="#ddd" stroke="#111"/>{sortedLegs.map((leg, idx)=>{const treadIndex=clamp(idx,0,visibleSteps-1); const treadY=h-bottomPad-treadIndex*stair.stepHeight*scale; const lx=platformX+36+idx*(platformW/Math.max(4,sortedLegs.length)); const ly=platformY+platformH; const vh=Math.max(0,treadY-ly); return <g key={idx}><rect x={lx} y={ly} width={legVisualWidth} height={vh} fill="#666"/><text x={lx+legVisualWidth/2} y={Math.min(h-8,treadY+14)} textAnchor="middle" className="svgTiny">{leg.length}</text></g>})}<text x={w/2} y={h-8} textAnchor="middle" className="svgSmall">Side view: long legs left → short right</text></svg>;
}

function StairTopViewDiagram({ stair, platforms, showPlatforms }) {
  const w = 520, h = 280, pad = 20;
  const modules = platforms.flatMap((p) => Array.from({ length: p.module.quantity }, (_, idx) => ({ id: `${p.module.id}-${idx}`, name: p.module.name, length: p.module.length, width: p.module.width })));

  const drawModulesOnRun = (startX, startY, runLengthPx, runWidthPx, horizontal = true) => {
    if (!showPlatforms) return null;
    let cursor = 10;
    return modules.map((m, idx) => {
      const ml = Math.min(runLengthPx * 0.42, (m.length / (stair.numberOfSteps * stair.treadDepth || 1)) * runLengthPx * 1.2);
      const mw = Math.min(runWidthPx - 10, (m.width / (stair.stairWidth || 1)) * runWidthPx);
      const x = horizontal ? startX + cursor : startX + (runWidthPx - mw) / 2;
      const y = horizontal ? startY + (runWidthPx - mw) / 2 : startY + cursor;
      cursor += ml + 8;
      return <rect key={m.id} x={x} y={y} width={horizontal ? ml : mw} height={horizontal ? mw : ml} fill={idx % 2 ? '#e5e7eb' : '#cbd5e1'} stroke="#111" />;
    });
  };

  if (stair.stairType === 'straight') {
    const run = stair.numberOfSteps * stair.treadDepth;
    const scale = Math.min((w - pad * 2) / run, (h - pad * 2) / stair.stairWidth);
    const runPx = run * scale, widthPx = stair.stairWidth * scale;
    const x = pad, y = (h - widthPx) / 2;
    return <svg viewBox={`0 0 ${w} ${h}`} className="diagram">
      <rect x={x} y={y} width={runPx} height={widthPx} fill="#eef2f7" stroke="#111" strokeWidth="2" />
      {Array.from({ length: stair.numberOfSteps }).map((_, i) => <line key={i} x1={x + i * stair.treadDepth * scale} y1={y} x2={x + i * stair.treadDepth * scale} y2={y + widthPx} stroke="#94a3b8" />)}
      {drawModulesOnRun(x, y, runPx, widthPx, true)}
      <text x={w / 2} y={h - 8} textAnchor="middle" className="svgSmall">Top view with explicit treads ({stair.stairType})</text>
    </svg>;
  }

  if (stair.stairType === 'l-shaped') {
    const stepsA = Math.ceil(stair.numberOfSteps / 2);
    const stepsB = stair.numberOfSteps - stepsA;
    const runA = stepsA * stair.treadDepth;
    const runB = stepsB * stair.treadDepth;
    const landing = Math.max(stair.landingDepth, stair.stairWidth);
    const scale = Math.min((w - pad * 2) / (runA + landing), (h - pad * 2) / (runB + landing));
    const widthPx = stair.stairWidth * scale;
    const x = pad, y = h - pad - (runB + landing) * scale;
    const runAPx = runA * scale, runBPx = runB * scale, landingPx = landing * scale;
    return <svg viewBox={`0 0 ${w} ${h}`} className="diagram">
      <rect x={x} y={y + runBPx} width={runAPx} height={widthPx} fill="#eef2f7" stroke="#111" />
      {Array.from({ length: stepsA }).map((_, i) => <line key={`a-${i}`} x1={x + i * stair.treadDepth * scale} y1={y + runBPx} x2={x + i * stair.treadDepth * scale} y2={y + runBPx + widthPx} stroke="#94a3b8" />)}
      <rect x={x + runAPx} y={y + runBPx} width={landingPx} height={landingPx} fill="#e2e8f0" stroke="#111" />
      <rect x={x + runAPx} y={y} width={widthPx} height={runBPx} fill="#eef2f7" stroke="#111" />
      {Array.from({ length: stepsB }).map((_, i) => <line key={`b-${i}`} x1={x + runAPx} y1={y + i * stair.treadDepth * scale} x2={x + runAPx + widthPx} y2={y + i * stair.treadDepth * scale} stroke="#94a3b8" />)}
      {drawModulesOnRun(x, y + runBPx, runAPx, widthPx, true)}
      <text x={w / 2} y={h - 8} textAnchor="middle" className="svgSmall">Top view with turn landing ({stair.stairType})</text>
    </svg>;
  }

  const stepsRun = Math.floor((stair.numberOfSteps - (stair.uTurnStyle === 'winder' ? stair.winderSteps : 0)) / 2);
  const winderSteps = stair.uTurnStyle === 'winder' ? clamp(stair.winderSteps, 3, 6) : 0;
  const run = stepsRun * stair.treadDepth;
  const landing = Math.max(stair.landingDepth, stair.stairWidth);
  const shapeW = run + landing + stair.stairWidth;
  const shapeH = run + landing + stair.stairWidth;
  const scale = Math.min((w - pad * 2) / shapeW, (h - pad * 2) / shapeH);
  const widthPx = stair.stairWidth * scale;
  const runPx = run * scale;
  const cx = pad + runPx + widthPx / 2;
  const cy = pad + runPx + widthPx / 2;

  const startX = pad;
  const startY = h - pad - widthPx;

  return <svg viewBox={`0 0 ${w} ${h}`} className="diagram">
    <rect x={startX} y={startY} width={runPx} height={widthPx} fill="#eef2f7" stroke="#111" />
    {Array.from({ length: stepsRun }).map((_, i) => <line key={`u-a-${i}`} x1={startX + i * stair.treadDepth * scale} y1={startY} x2={startX + i * stair.treadDepth * scale} y2={startY + widthPx} stroke="#94a3b8" />)}
    {stair.uTurnStyle === 'landing' ? (
      <rect x={startX + runPx} y={startY - landing * scale + widthPx} width={landing * scale} height={landing * scale} fill="#e2e8f0" stroke="#111" />
    ) : (
      <g>
        {Array.from({ length: winderSteps }).map((_, i) => {
          const a0 = Math.PI + (i * Math.PI) / winderSteps;
          const a1 = Math.PI + ((i + 1) * Math.PI) / winderSteps;
          const rIn = (stair.winderInnerTread / Math.PI) * winderSteps * scale;
          const rOut = rIn + widthPx;
          const p1 = `${cx + Math.cos(a0) * rIn},${cy + Math.sin(a0) * rIn}`;
          const p2 = `${cx + Math.cos(a1) * rIn},${cy + Math.sin(a1) * rIn}`;
          const p3 = `${cx + Math.cos(a1) * rOut},${cy + Math.sin(a1) * rOut}`;
          const p4 = `${cx + Math.cos(a0) * rOut},${cy + Math.sin(a0) * rOut}`;
          return <polygon key={`w-${i}`} points={`${p1} ${p2} ${p3} ${p4}`} fill={i % 2 ? '#e2e8f0' : '#eef2f7'} stroke="#111" />;
        })}
      </g>
    )}
    <rect x={startX + runPx + landing * scale} y={startY - runPx} width={widthPx} height={runPx} fill="#eef2f7" stroke="#111" />
    {Array.from({ length: stepsRun }).map((_, i) => <line key={`u-b-${i}`} x1={startX + runPx + landing * scale} y1={startY - i * stair.treadDepth * scale} x2={startX + runPx + landing * scale + widthPx} y2={startY - i * stair.treadDepth * scale} stroke="#94a3b8" />)}
    {drawModulesOnRun(startX, startY, runPx, widthPx, true)}
    <text x={w / 2} y={h - 8} textAnchor="middle" className="svgSmall">Top view ({stair.uTurnStyle === 'winder' ? 'winder turn' : 'square landing turn'})</text>
  </svg>;
}

function Stair3DPreview({ stair }) {
  const w = 520, h = 220;
  const n = clamp(stair.numberOfSteps, 3, 18);
  const rise = 10;
  const tread = 22;
  const depth = 26;
  const ox = 30;
  const oy = h - 25;

  const face = (x, y, wFace, hFace, fill, stroke = '#334155') => <rect x={x} y={y} width={wFace} height={hFace} fill={fill} stroke={stroke} />;
  return <svg viewBox={`0 0 ${w} ${h}`} className="diagram">
    {Array.from({ length: n }).map((_, i) => {
      const x = ox + i * tread;
      const y = oy - (i + 1) * rise;
      return <g key={i}>
        {face(x, y, tread, rise, '#94a3b8')}
        <polygon points={`${x},${y + rise} ${x + tread},${y + rise} ${x + tread + depth},${y + rise + depth * 0.35} ${x + depth},${y + rise + depth * 0.35}`} fill="#64748b" stroke="#334155" />
      </g>;
    })}
    <text x={w / 2} y={16} textAnchor="middle" className="svgSmall">3D stair preview (parametric, simplified). For L/U turns this is an indicative massing view.</text>
  </svg>;
}

function App() {
  const [project, setProject] = useState(defaultProject);
  const [activeTab, setActiveTab] = useState('preview');
  const [showPlatformsInStairView, setShowPlatformsInStairView] = useState(true);

  const recommendedSize = useMemo(() => suggestPlatformSize(project.staircase), [project.staircase]);
  const effectivePlatforms = useMemo(() => getEffectivePlatforms(project), [project]);
  const computedPlatforms = useMemo(() => effectivePlatforms.map((module) => computePlatform(module, project.staircase)), [effectivePlatforms, project.staircase]);
  const legPlan = useMemo(() => getActiveLegPlan(project, computedPlatforms), [project, computedPlatforms]);
  const cutList = useMemo(() => getCutList(computedPlatforms, legPlan, project.hardware), [computedPlatforms, legPlan, project.hardware]);
  const billOfMaterials = useMemo(() => getBillOfMaterials(computedPlatforms, legPlan, cutList, project.hardware), [computedPlatforms, legPlan, cutList, project.hardware]);
  const warnings = useMemo(() => getGlobalWarnings(project.staircase, computedPlatforms, legPlan), [project.staircase, computedPlatforms, legPlan]);

  const totalTopAreaM2 = mmAreaToM2(sum(cutList.filter((c) => c.part === 'Top plate'), (c) => c.width * c.length * c.qty));
  const totalLegCount = sum(legPlan, (l) => l.quantity);
  const totalWeight = sum(computedPlatforms, (p) => p.estimatedTotalWeightKg * p.module.quantity);

  const updateStair = (key, value) => setProject((p) => ({ ...p, staircase: { ...p.staircase, [key]: value } }));
  const updateRepeatedTemplate = (key, value) => setProject((p) => ({ ...p, platformConfig: { ...p.platformConfig, repeatedTemplate: { ...p.platformConfig.repeatedTemplate, [key]: value } } }));
  const updateMixedModule = (id, key, value) => setProject((p) => ({ ...p, platformConfig: { ...p.platformConfig, modules: p.platformConfig.modules.map((m) => m.id === id ? { ...m, [key]: value } : m) } }));
  const updateHardware = (key, value) => setProject((p) => ({ ...p, hardware: { ...p.hardware, [key]: value } }));
  const updateLegConfig = (key, value) => setProject((p) => ({ ...p, legConfig: { ...p.legConfig, [key]: value } }));

  const addMixedModule = () => setProject((p) => ({ ...p, platformConfig: { ...p.platformConfig, modules: [...p.platformConfig.modules, { ...p.platformConfig.repeatedTemplate, id: uniqueId('module'), name: `Module ${p.platformConfig.modules.length + 1}`, quantity: 1 }] } }));
  const duplicateMixedModule = (id) => setProject((p) => {
    const source = p.platformConfig.modules.find((m) => m.id === id);
    if (!source) return p;
    return { ...p, platformConfig: { ...p.platformConfig, modules: [...p.platformConfig.modules, { ...source, id: uniqueId('module'), name: `${source.name} copy` }] } };
  });
  const removeMixedModule = (id) => setProject((p) => ({ ...p, platformConfig: { ...p.platformConfig, modules: p.platformConfig.modules.filter((m) => m.id !== id) } }));
  const addManualLeg = () => setProject((p) => ({ ...p, legConfig: { ...p.legConfig, manualLegs: [...p.legConfig.manualLegs, { id: uniqueId('manual-leg'), label: 'Custom leg', length: 120, quantity: 2 }] } }));
  const updateManualLeg = (id, key, value) => setProject((p) => ({ ...p, legConfig: { ...p.legConfig, manualLegs: p.legConfig.manualLegs.map((l) => l.id === id ? { ...l, [key]: value } : l) } }));
  const removeManualLeg = (id) => setProject((p) => ({ ...p, legConfig: { ...p.legConfig, manualLegs: p.legConfig.manualLegs.filter((l) => l.id !== id) } }));

  const moduleEditor = project.platformConfig.mode === 'repeat' ? [project.platformConfig.repeatedTemplate] : project.platformConfig.modules;

  return (
    <div className="app">
      <header className="hero">
        <h1>Modular Stair Work Platform Configurator</h1>
        <p>Workshop-focused planning tool for modular platforms, legs, pockets, BOM and cut list.</p>
        <div className="stats">
          <div><b>{sum(effectivePlatforms, (m) => m.quantity)}</b><span>Modules</span></div>
          <div><b>{totalTopAreaM2.toFixed(2)} m²</b><span>Top area</span></div>
          <div><b>{totalLegCount}</b><span>Legs</span></div>
          <div><b>{formatKg(totalWeight)}</b><span>Weight est.</span></div>
        </div>
      </header>

      <WarningList warnings={warnings.slice(0, 4)} />

      <div className="layout">
        <main>
          <section className="card">
            <h2>1) Staircase Input</h2>
            <div className="grid2">
              <NumberInput label="Step height" value={project.staircase.stepHeight} onChange={(v) => updateStair('stepHeight', v)} suffix="mm" min={50} />
              <NumberInput label="Step depth" value={project.staircase.treadDepth} onChange={(v) => updateStair('treadDepth', v)} suffix="mm" min={100} />
              <NumberInput label="Stair width" value={project.staircase.stairWidth} onChange={(v) => updateStair('stairWidth', v)} suffix="mm" min={300} />
              <NumberInput label="Stairwell width" value={project.staircase.stairwellWidth} onChange={(v) => updateStair('stairwellWidth', v)} suffix="mm" min={500} />
              <NumberInput label="Number of steps" value={project.staircase.numberOfSteps} onChange={(v) => updateStair('numberOfSteps', v)} min={1} />
              <SelectInput label="Stair type" value={project.staircase.stairType} onChange={(v) => updateStair('stairType', v)} options={[{ value: 'straight', label: 'Straight' }, { value: 'u-shaped', label: 'U-shaped' }, { value: 'l-shaped', label: 'L-shaped' }]} />
              {project.staircase.stairType === 'u-shaped' && <SelectInput label="U-turn type" value={project.staircase.uTurnStyle} onChange={(v) => updateStair('uTurnStyle', v)} options={[{ value: 'landing', label: 'Square landing' }, { value: 'winder', label: 'Winder (angled steps)' }]} />}
              {project.staircase.stairType === 'u-shaped' && project.staircase.uTurnStyle === 'winder' && <NumberInput label="Winder steps in turn" value={project.staircase.winderSteps} onChange={(v) => updateStair('winderSteps', v)} min={3} max={6} />}
              {project.staircase.stairType === 'u-shaped' && project.staircase.uTurnStyle === 'winder' && <NumberInput label="Inner winder tread (walk-line proxy)" value={project.staircase.winderInnerTread} onChange={(v) => updateStair('winderInnerTread', v)} suffix="mm" min={60} max={260} />}
              <NumberInput label="Landing depth" value={project.staircase.landingDepth} onChange={(v) => updateStair('landingDepth', v)} suffix="mm" min={0} />
              <NumberInput label="Landing width" value={project.staircase.landingWidth} onChange={(v) => updateStair('landingWidth', v)} suffix="mm" min={0} />
              <SelectInput label="Handrail" value={project.staircase.handrailPosition} onChange={(v) => updateStair('handrailPosition', v)} options={[{ value: 'none', label: 'None' }, { value: 'left', label: 'Left' }, { value: 'right', label: 'Right' }, { value: 'both', label: 'Both' }]} />
              <NumberInput label="Wall-handrail clearance" value={project.staircase.wallToHandrailClearance} onChange={(v) => updateStair('wallToHandrailClearance', v)} suffix="mm" min={0} />
              <NumberInput label="Obstruction depth" value={project.staircase.obstructionDepth} onChange={(v) => updateStair('obstructionDepth', v)} suffix="mm" min={0} />
              <ToggleInput label="Stair narrows at point" checked={project.staircase.narrowsAtPoint} onChange={(v) => updateStair('narrowsAtPoint', v)} />
            </div>
            {project.staircase.narrowsAtPoint && <div className="grid2"><NumberInput label="Narrowest width" value={project.staircase.narrowestWidth} onChange={(v) => updateStair('narrowestWidth', v)} suffix="mm" min={300} /></div>}
            {project.staircase.stairType === 'u-shaped' && project.staircase.uTurnStyle === 'winder' && (
              <p className="hint">For winders, <b>step depth</b> is treated as the straight-run tread depth, while the turn uses angled steps sized by “inner winder tread”.</p>
            )}
          </section>

          <section className="card">
            <h2>2) Platform Setup</h2>
            <div className="btnRow">
              <button className={project.platformConfig.mode === 'repeat' ? 'active' : ''} onClick={() => setProject((p) => ({ ...p, platformConfig: { ...p.platformConfig, mode: 'repeat' } }))}>One standard platform repeated</button>
              <button className={project.platformConfig.mode === 'mixed' ? 'active' : ''} onClick={() => setProject((p) => ({ ...p, platformConfig: { ...p.platformConfig, mode: 'mixed' } }))}>Multiple different platforms</button>
            </div>
            <p className="hint">Recommended module: {recommendedSize.recommendedWidth} x {recommendedSize.recommendedLength} mm (editable).</p>
            {project.platformConfig.mode === 'repeat' ? (
              <div className="grid2">
                <NumberInput label="Repeated module count" value={project.platformConfig.repeatedCount} onChange={(v) => setProject((p) => ({ ...p, platformConfig: { ...p.platformConfig, repeatedCount: v } }))} min={1} max={20} />
                <button className="secondary" onClick={() => { updateRepeatedTemplate('width', recommendedSize.recommendedWidth); updateRepeatedTemplate('length', recommendedSize.recommendedLength); }}>Use recommended size</button>
              </div>
            ) : <button className="secondary" onClick={addMixedModule}>+ Add module</button>}

            {moduleEditor.map((module) => {
              const isRepeat = project.platformConfig.mode === 'repeat';
              return <div key={module.id} className="moduleCard">
                <div className="moduleHead"><b>{isRepeat ? 'Standard repeated module' : module.name}</b>{!isRepeat && <span><button onClick={() => duplicateMixedModule(module.id)}>Duplicate</button><button onClick={() => removeMixedModule(module.id)}>Remove</button></span>}</div>
                <div className="grid2">
                  {!isRepeat && <label className="field"><span>Module name</span><input value={module.name} onChange={(e) => updateMixedModule(module.id, 'name', e.target.value)} /></label>}
                  {!isRepeat && <NumberInput label="Quantity" value={module.quantity} onChange={(v) => updateMixedModule(module.id, 'quantity', v)} min={1} max={20} />}
                  <NumberInput label="Module width" value={module.width} onChange={(v) => isRepeat ? updateRepeatedTemplate('width', v) : updateMixedModule(module.id, 'width', v)} suffix="mm" min={300} />
                  <NumberInput label="Module length" value={module.length} onChange={(v) => isRepeat ? updateRepeatedTemplate('length', v) : updateMixedModule(module.id, 'length', v)} suffix="mm" min={500} />
                  <NumberInput label="Top thickness" value={module.topThickness} onChange={(v) => isRepeat ? updateRepeatedTemplate('topThickness', v) : updateMixedModule(module.id, 'topThickness', v)} suffix="mm" min={9} />
                  <NumberInput label="Frame timber width" value={module.frameWidth} onChange={(v) => isRepeat ? updateRepeatedTemplate('frameWidth', v) : updateMixedModule(module.id, 'frameWidth', v)} suffix="mm" min={20} />
                  <NumberInput label="Frame timber height" value={module.frameHeight} onChange={(v) => isRepeat ? updateRepeatedTemplate('frameHeight', v) : updateMixedModule(module.id, 'frameHeight', v)} suffix="mm" min={20} />
                  <NumberInput label="Leg timber width" value={module.legWidth} onChange={(v) => isRepeat ? updateRepeatedTemplate('legWidth', v) : updateMixedModule(module.id, 'legWidth', v)} suffix="mm" min={20} />
                  <NumberInput label="Leg timber height" value={module.legHeight} onChange={(v) => isRepeat ? updateRepeatedTemplate('legHeight', v) : updateMixedModule(module.id, 'legHeight', v)} suffix="mm" min={20} />
                  <SelectInput label="Layout style" value={module.layoutStyle} onChange={(v) => isRepeat ? updateRepeatedTemplate('layoutStyle', v) : updateMixedModule(module.id, 'layoutStyle', v)} options={[{ value: 'fixed-grid', label: 'Fixed grid' }, { value: 'flexible-pockets', label: 'Flexible local pockets' }]} />
                  <SelectInput label="Leg position pattern" value={module.pocketPattern} onChange={(v) => isRepeat ? updateRepeatedTemplate('pocketPattern', v) : updateMixedModule(module.id, 'pocketPattern', v)} options={[{ value: '3x3', label: '3 x 3' }, { value: '4x4', label: '4 x 4' }, { value: 'custom', label: 'Custom' }]} />
                  {module.pocketPattern === 'custom' && <><NumberInput label="Custom rows" value={module.customRows} onChange={(v) => isRepeat ? updateRepeatedTemplate('customRows', v) : updateMixedModule(module.id, 'customRows', v)} min={2} max={8} /><NumberInput label="Custom cols" value={module.customCols} onChange={(v) => isRepeat ? updateRepeatedTemplate('customCols', v) : updateMixedModule(module.id, 'customCols', v)} min={2} max={8} /></>}
                </div>
              </div>;
            })}
          </section>

          <section className="card">
            <h2>3) Leg Setup</h2>
            <div className="btnRow"><button className={project.legConfig.mode === 'auto' ? 'active' : ''} onClick={() => updateLegConfig('mode', 'auto')}>Auto</button><button className={project.legConfig.mode === 'manual' ? 'active' : ''} onClick={() => updateLegConfig('mode', 'manual')}>Manual</button></div>
            <div className="grid2"><SelectInput label="Grouping" value={project.legConfig.grouping} onChange={(v) => updateLegConfig('grouping', v)} options={[{ value: 'step-increments', label: 'Step increments' }, { value: 'straight', label: 'Straight legs' }]} /><NumberInput label="Base leg length" value={project.legConfig.baseLegLength} onChange={(v) => updateLegConfig('baseLegLength', v)} suffix="mm" min={40} /></div>
            {project.legConfig.mode === 'auto' ? <div className="chips">{legPlan.map((l) => <span key={`${l.label}-${l.length}`}>{l.label}: {l.length} mm × {l.quantity}</span>)}</div> : <div>{project.legConfig.manualLegs.map((leg) => <div key={leg.id} className="grid4"><label className="field"><span>Label</span><input value={leg.label} onChange={(e)=>updateManualLeg(leg.id,'label',e.target.value)} /></label><NumberInput label="Length" value={leg.length} onChange={(v)=>updateManualLeg(leg.id,'length',v)} suffix="mm" min={40} /><NumberInput label="Quantity" value={leg.quantity} onChange={(v)=>updateManualLeg(leg.id,'quantity',v)} min={1} /><button onClick={()=>removeManualLeg(leg.id)}>Remove</button></div>)}<button className="secondary" onClick={addManualLeg}>+ Add leg entry</button></div>}
          </section>

          <section className="card">
            <h2>4) Hardware Options</h2>
            <div className="grid2">
              <NumberInput label="Bolt length" value={project.hardware.boltLength} onChange={(v)=>updateHardware('boltLength', v)} suffix="mm" min={20} />
              <ToggleInput label="Include washers" checked={project.hardware.includeWashers} onChange={(v)=>updateHardware('includeWashers', v)} />
              <ToggleInput label="Include anti-slip pads" checked={project.hardware.includeAntiSlipPads} onChange={(v)=>updateHardware('includeAntiSlipPads', v)} />
              <ToggleInput label="Include wood glue" checked={project.hardware.includeGlue} onChange={(v)=>updateHardware('includeGlue', v)} />
              <ToggleInput label="Include optional bracing" checked={project.hardware.includeOptionalBracing} onChange={(v)=>updateHardware('includeOptionalBracing', v)} />
            </div>
          </section>
        </main>

        <aside>
          <section className="card">
            <h2>5) Live Preview & Outputs</h2>
            <div className="btnRow"><button className={activeTab==='preview'?'active':''} onClick={()=>setActiveTab('preview')}>Preview</button><button className={activeTab==='materials'?'active':''} onClick={()=>setActiveTab('materials')}>Materials</button><button className={activeTab==='report'?'active':''} onClick={()=>setActiveTab('report')}>Report</button></div>
            {activeTab==='preview' && <div>{computedPlatforms.map((p)=><div key={p.module.id} className="moduleCard"><h3>{p.module.name} · {p.module.width} x {p.module.length} mm · qty {p.module.quantity}</h3><div className="chips"><span>Pockets: {p.pocketCount}</span><span>Recommended legs in use: {p.recommendedLegsUsed}</span><span>Weight: {formatKg(p.estimatedTotalWeightKg)}</span></div><div className="diagramGrid"><TopViewDiagram platform={p} /><UndersideDiagram platform={p} /><SideViewDiagram stair={project.staircase} legPlan={legPlan} platform={p} /></div></div>)}<div className="moduleCard"><div className="toggle"><span>Show platforms in stair overview</span><input type="checkbox" checked={showPlatformsInStairView} onChange={(e)=>setShowPlatformsInStairView(e.target.checked)} /></div><StairTopViewDiagram stair={project.staircase} platforms={computedPlatforms} showPlatforms={showPlatformsInStairView} /><Stair3DPreview stair={project.staircase} /></div></div>}
            {activeTab==='materials' && <div><h3>Bill of Materials</h3><Table headers={['Category','Item','Qty','Unit','Notes']} rows={billOfMaterials.map((i)=>[i.category,i.name,i.qty,i.unit,i.notes||'—'])} /><h3>Cut list</h3><Table headers={['Part','Material','Width','Length','Qty','Platform']} rows={cutList.map((i)=>[i.part,i.material,formatMm(i.width),formatMm(i.length),i.qty,i.platform||'—'])} /></div>}
            {activeTab==='report' && <div><h3>Printable summary</h3><p>Stair type: {project.staircase.stairType}{project.staircase.stairType === 'u-shaped' ? ` (${project.staircase.uTurnStyle})` : ''}, step height: {formatMm(project.staircase.stepHeight)}, straight-run step depth: {formatMm(project.staircase.treadDepth)}.</p><p>Effective stair width: {formatMm(recommendedSize.effectiveStairWidth)}; total legs: {totalLegCount}; total top area: {totalTopAreaM2.toFixed(2)} m².</p><p>Total leg timber: {formatMeters(sum(legPlan, (leg) => leg.length * leg.quantity))}. Tool is planning-only, not engineering certification.</p><Table headers={['Platform','Dimensions','Top','Frame','Pockets','Legs in use','Weight']} rows={computedPlatforms.map((p)=>[`${p.module.name} (${p.module.quantity}x)`,`${p.module.width} x ${p.module.length} mm`,`${p.module.topThickness} mm plywood`,`${p.module.frameWidth} x ${p.module.frameHeight}`,`${p.pocketRows} x ${p.pocketCols} (${p.pocketCount})`,p.recommendedLegsUsed,formatKg(p.estimatedTotalWeightKg)])} /></div>}
          </section>
        </aside>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
