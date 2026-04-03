const { useMemo, useState } = React;

/**
 * Modular Stair Work Platform Configurator
 * Practical planning tool only, not structural approval.
 */

const PLYWOOD_DENSITY_KG_M3 = 450;
const TIMBER_DENSITY_KG_M3 = 430;
const STANDARD_PLYWOOD_SHEET_W = 1220;
const STANDARD_PLYWOOD_SHEET_L = 2440;

const STAIR_TYPE_CARDS = [
  { id: 'straight', label: 'Straight staircase', family: 'straight', hasLanding: false },
  { id: 'l-shaped', label: 'L-shaped staircase', family: 'l', hasLanding: false },
  { id: 'l-shaped-landing', label: 'L-shaped staircase with landing', family: 'l', hasLanding: true },
  { id: 'u-shaped', label: 'U-shaped staircase', family: 'u', hasLanding: false },
  { id: 'return-landing', label: 'Staircase with landing / return', family: 'u', hasLanding: true },
  { id: 'spiral', label: 'Spiral staircase', family: 'spiral', hasLanding: false },
  { id: 'custom', label: 'Custom / irregular staircase', family: 'custom', hasLanding: false },
];

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
  designMode: 'stair-specific',
  staircase: {
    selectedTypeCard: 'straight',
    stepHeight: 180,
    treadDepth: 260,
    stairWidth: 900,
    stairwellWidth: 1800,
    numberOfSteps: 12,
    landingDepth: 900,
    landingWidth: 900,
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
    placements: [
      { id: 'place-1', moduleRef: 'platform-1', enabled: true, run: 'primary', along: 20, across: 50 },
      { id: 'place-2', moduleRef: 'platform-1', enabled: true, run: 'secondary', along: 25, across: 50 },
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
function getCrossMemberCount(length) { if (length <= 750) return 1; if (length <= 1100) return 2; return 3; }

function getPocketLayout(module) {
  const { rows, cols } = getPatternRowsCols(module);
  const frameInset = getPocketInset(module);
  const xStep = cols <= 1 ? 0 : (module.width - frameInset * 2) / (cols - 1);
  const yStep = rows <= 1 ? 0 : (module.length - frameInset * 2) / (rows - 1);
  const points = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) points.push({ x: frameInset + c * xStep, y: frameInset + r * yStep, row: r, col: c });
  return { rows, cols, points, crossMemberCount: getCrossMemberCount(module.length) };
}

function getStairTypeMeta(stair) {
  return STAIR_TYPE_CARDS.find((entry) => entry.id === stair.selectedTypeCard) || STAIR_TYPE_CARDS[0];
}

function getEffectiveStairWidth(stair) {
  const handrailLoss = stair.handrailPosition === 'both' ? stair.wallToHandrailClearance * 2 : stair.handrailPosition === 'none' ? 0 : stair.wallToHandrailClearance;
  const baseWidth = stair.narrowsAtPoint ? Math.min(stair.stairWidth, stair.narrowestWidth) : stair.stairWidth;
  return Math.max(350, baseWidth - handrailLoss - stair.obstructionDepth);
}

function suggestPlatformSize(stair) {
  const effectiveStairWidth = getEffectiveStairWidth(stair);
  const type = getStairTypeMeta(stair);
  const maxWidth = clamp(effectiveStairWidth - 60, 350, 900);
  let suggestedLengthBase = type.family === 'straight' ? Math.min(900, stair.treadDepth * 3 + 120) : 850;
  if (type.hasLanding) suggestedLengthBase = Math.min(900, Math.max(650, Math.min(stair.landingDepth, stair.landingWidth)));
  if (type.family === 'spiral') suggestedLengthBase = 700;
  if (type.family === 'custom') suggestedLengthBase = 780;
  const maximumLength = clamp(type.family === 'straight' ? stair.treadDepth * 4 + 150 : Math.max(stair.landingDepth, 850), 650, 1300);
  return {
    recommendedWidth: roundTo(clamp(Math.min(maxWidth, 600), 450, maxWidth), 10),
    recommendedLength: roundTo(clamp(suggestedLengthBase, 650, maximumLength), 10),
    maximumWidth: roundTo(maxWidth, 10),
    maximumLength: roundTo(maximumLength, 10),
    effectiveStairWidth: roundTo(effectiveStairWidth, 10),
  };
}

function computePlatform(module, stair) {
  const suggestion = suggestPlatformSize(stair);
  const layout = getPocketLayout(module);
  const topVolume = module.width * module.length * module.topThickness;
  const crossLen = Math.max(0, module.width - module.frameWidth * 2);
  const frameVolume = (2 * module.length + 2 * crossLen + layout.crossMemberCount * crossLen) * module.frameWidth * module.frameHeight;
  const weight = mm3ToKg(topVolume, PLYWOOD_DENSITY_KG_M3) + mm3ToKg(frameVolume, TIMBER_DENSITY_KG_M3);
  const warnings = [];
  if (module.width > suggestion.maximumWidth) warnings.push('Platform width exceeds practical available stair width.');
  if (module.length > suggestion.maximumLength) warnings.push('Platform length appears large for this staircase geometry.');
  return {
    module,
    pocketRows: layout.rows,
    pocketCols: layout.cols,
    pocketCount: layout.points.length,
    recommendedLegsUsed: clamp(4 + Math.round(module.length / 400), 4, layout.points.length),
    pocketPoints: layout.points,
    crossMemberCount: layout.crossMemberCount,
    crossMemberCenters: Array.from({ length: layout.crossMemberCount }, (_, i) => ((i + 1) * module.length) / (layout.crossMemberCount + 1)),
    estimatedTotalWeightKg: weight,
    warnings,
  };
}

function getSuggestedLegHeights(project, platforms) {
  const rise = project.staircase.stepHeight;
  const levels = clamp(Math.floor((Math.max(...platforms.map((p) => p.module.length), 900) / project.staircase.treadDepth)) + 1, 2, 6);
  const multiplier = Math.max(1, sum(platforms, (p) => p.module.quantity));
  return Array.from({ length: levels }, (_, i) => ({ label: i === 0 ? 'Base leg' : `Base + ${i} rise`, length: project.legConfig.baseLegLength + i * rise, quantity: multiplier * 2 }));
}

function getActiveLegPlan(project, platforms) {
  return project.legConfig.mode === 'manual'
    ? project.legConfig.manualLegs.map((l) => ({ label: l.label, length: l.length, quantity: l.quantity }))
    : getSuggestedLegHeights(project, platforms);
}

function getCutList(platforms, legPlan, hardware) {
  const cuts = [];
  platforms.forEach((platform) => {
    const m = platform.module;
    const shortRailLength = Math.max(0, m.width - m.frameWidth * 2);
    cuts.push({ part: 'Top plate', material: `${m.topThickness} mm plywood`, width: m.width, length: m.length, qty: m.quantity, platform: m.name });
    cuts.push({ part: 'Outer frame long rail', material: `${m.frameWidth} x ${m.frameHeight} timber`, width: m.frameWidth, length: m.length, qty: 2 * m.quantity, platform: m.name });
    cuts.push({ part: 'Outer frame short rail', material: `${m.frameWidth} x ${m.frameHeight} timber`, width: m.frameWidth, length: shortRailLength, qty: 2 * m.quantity, platform: m.name });
    cuts.push({ part: 'Cross-member', material: `${m.frameWidth} x ${m.frameHeight} timber`, width: m.frameWidth, length: shortRailLength, qty: platform.crossMemberCount * m.quantity, platform: m.name });
  });
  legPlan.forEach((leg) => {
    cuts.push({ part: 'Leg', material: '48 x 73 timber', width: 48, length: leg.length, qty: leg.quantity, platform: 'All modules' });
    if (hardware.includeOptionalBracing && leg.length >= 600) cuts.push({ part: 'Optional bracing piece', material: '48 x 73 timber', width: 48, length: 280, qty: leg.quantity * 2, platform: 'All modules' });
  });
  return cuts;
}

function getBillOfMaterials(platforms, legPlan, cutList, hardware) {
  const items = [];
  const plywoodArea = sum(cutList.filter((c) => c.part === 'Top plate'), (c) => c.width * c.length * c.qty);
  items.push({ category: 'Sheet goods', name: 'Poplar plywood sheets', qty: Math.ceil(plywoodArea / (STANDARD_PLYWOOD_SHEET_W * STANDARD_PLYWOOD_SHEET_L)), unit: 'sheets' });
  const timberLength = sum(cutList.filter((c) => c.material.includes('timber')), (c) => c.length * c.qty);
  items.push({ category: 'Timber', name: 'Mixed framing timber', qty: Number((timberLength / 1000).toFixed(2)), unit: 'm' });
  const totalLegCount = sum(legPlan, (l) => l.quantity);
  items.push({ category: 'Hardware', name: `M8 bolts (${hardware.boltLength} mm)`, qty: totalLegCount, unit: 'pcs' });
  if (hardware.includeWashers) items.push({ category: 'Hardware', name: 'M8 washers', qty: totalLegCount, unit: 'pcs' });
  if (hardware.includeAntiSlipPads) items.push({ category: 'Consumables', name: 'Anti-slip pads', qty: totalLegCount, unit: 'pcs' });
  if (hardware.includeGlue) items.push({ category: 'Consumables', name: 'Wood glue', qty: 1, unit: 'bottle' });
  return items;
}

function getGlobalWarnings(stair, platforms, designMode) {
  const warnings = [
    'This is a planning tool only. It does not provide structural approval.',
    'User must verify stability, bracing, fasteners and safe working conditions before use.',
  ];
  if (designMode === 'quick') warnings.push('Quick mode skips detailed staircase modeling. Validate platform fit manually.');
  if (stair.stepHeight <= 0 || stair.treadDepth <= 0 || stair.numberOfSteps <= 0) warnings.push('Stair geometry contains invalid values.');
  platforms.forEach((p) => warnings.push(...p.warnings));
  return Array.from(new Set(warnings));
}

function NumberInput({ label, value, onChange, min, max, step = 1, suffix }) {
  return <label className="field"><span>{label}</span><div className="inputWrap"><input type="number" value={Number.isFinite(value) ? value : ''} min={min} max={max} step={step} onChange={(e) => onChange(Number(e.target.value))} />{suffix ? <em>{suffix}</em> : null}</div></label>;
}
function SelectInput({ label, value, onChange, options }) { return <label className="field"><span>{label}</span><select value={value} onChange={(e) => onChange(e.target.value)}>{options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>; }
function ToggleInput({ label, checked, onChange }) { return <label className="toggle"><span>{label}</span><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} /></label>; }
function WarningList({ warnings }) { return <div className="warning"><h3>Warnings & safety notes</h3><ul>{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul></div>; }
function Table({ headers, rows }) { return <div className="tableWrap"><table><thead><tr>{headers.map((h) => <th key={h}>{h}</th>)}</tr></thead><tbody>{rows.map((row, idx) => <tr key={idx}>{row.map((cell, c) => <td key={c}>{cell}</td>)}</tr>)}</tbody></table></div>; }

function StairTypeIcon({ id }) {
  if (id === 'straight') return <svg viewBox="0 0 100 60"><rect x="10" y="20" width="80" height="20" fill="#e2e8f0" stroke="#0f172a"/></svg>;
  if (id === 'l-shaped' || id === 'l-shaped-landing') return <svg viewBox="0 0 100 60"><path d="M10 35h55v15h15V10H65v25H10z" fill="#e2e8f0" stroke="#0f172a"/></svg>;
  if (id === 'u-shaped' || id === 'return-landing') return <svg viewBox="0 0 100 60"><path d="M10 45h25V15h30v30h25V10H50v30H10z" fill="#e2e8f0" stroke="#0f172a"/></svg>;
  if (id === 'spiral') return <svg viewBox="0 0 100 60"><path d="M70 30a20 20 0 1 1-20-20" fill="none" stroke="#0f172a" strokeWidth="5"/><circle cx="50" cy="30" r="5" fill="#334155"/></svg>;
  return <svg viewBox="0 0 100 60"><path d="M10 45l25-25 20 10 20-15 15 30z" fill="#e2e8f0" stroke="#0f172a"/></svg>;
}

function StairTypeSelector({ selected, onSelect }) {
  return <div className="stairTypeGrid">{STAIR_TYPE_CARDS.map((type) => <button key={type.id} className={`stairTypeCard ${selected === type.id ? 'activeCard' : ''}`} onClick={() => onSelect(type.id)}><StairTypeIcon id={type.id} /><b>{type.label}</b></button>)}</div>;
}

function StairOverviewLayout({ stair, placements, modulesById }) {
  const w = 560, h = 300, pad = 18;
  const type = getStairTypeMeta(stair);
  const run = stair.numberOfSteps * stair.treadDepth;
  const stairW = stair.stairWidth;
  const scale = Math.min((w - pad * 2) / Math.max(run, stair.stairwellWidth), (h - pad * 2) / Math.max(stairW * 1.8, stair.stairwellWidth * 0.8));

  const drawPlacement = (p, lane) => {
    if (!p.enabled) return null;
    const mod = modulesById.get(p.moduleRef);
    if (!mod) return null;
    const ml = mod.length * scale * 0.35;
    const mw = mod.width * scale * 0.35;
    const x = lane.x + (lane.w - ml) * (p.along / 100);
    const y = lane.y + (lane.h - mw) * (p.across / 100);
    return <g key={p.id}><rect x={x} y={y} width={ml} height={mw} fill="#cbd5e1" stroke="#111"/><text x={x + 4} y={y + 12} className="svgTiny">{mod.name}</text></g>;
  };

  const primaryLane = { x: pad + 8, y: h / 2 - stairW * scale * 0.5, w: Math.max(90, run * scale * 0.75), h: Math.max(30, stairW * scale * 0.9) };
  const secondaryLane = { x: primaryLane.x + primaryLane.w - 30, y: primaryLane.y - primaryLane.h, w: Math.max(80, run * scale * 0.45), h: primaryLane.h };

  return <svg viewBox={`0 0 ${w} ${h}`} className="diagram">
    <text x={14} y={16} className="svgSmall">Stair Overview / Layout (top view)</text>
    {type.family === 'straight' && <rect x={primaryLane.x} y={primaryLane.y} width={primaryLane.w + 60} height={primaryLane.h} fill="#eef2f7" stroke="#111"/>}
    {type.family === 'l' && <g><rect x={primaryLane.x} y={primaryLane.y + primaryLane.h} width={primaryLane.w} height={primaryLane.h} fill="#eef2f7" stroke="#111"/><rect x={primaryLane.x + primaryLane.w - primaryLane.h} y={primaryLane.y - 10} width={primaryLane.h} height={primaryLane.h + 10} fill="#eef2f7" stroke="#111"/>{type.hasLanding && <rect x={primaryLane.x + primaryLane.w - primaryLane.h} y={primaryLane.y + primaryLane.h - 10} width={primaryLane.h} height={primaryLane.h} fill="#dbeafe" stroke="#111"/>}</g>}
    {type.family === 'u' && <g><rect x={primaryLane.x} y={primaryLane.y + primaryLane.h + 40} width={primaryLane.w} height={primaryLane.h} fill="#eef2f7" stroke="#111"/><rect x={primaryLane.x + primaryLane.w - primaryLane.h} y={primaryLane.y + 20} width={primaryLane.h} height={primaryLane.h + 20} fill="#eef2f7" stroke="#111"/><rect x={primaryLane.x + primaryLane.w - primaryLane.h * 2} y={primaryLane.y} width={primaryLane.w * 0.65} height={primaryLane.h} fill="#eef2f7" stroke="#111"/>{type.hasLanding && <rect x={primaryLane.x + primaryLane.w - primaryLane.h} y={primaryLane.y + primaryLane.h + 20} width={primaryLane.h} height={primaryLane.h} fill="#dbeafe" stroke="#111"/>}</g>}
    {type.family === 'spiral' && <g><circle cx={w / 2} cy={h / 2} r={80} fill="#eef2f7" stroke="#111"/><circle cx={w / 2} cy={h / 2} r={24} fill="#d1d5db" stroke="#111"/></g>}
    {type.family === 'custom' && <polyline points={`${pad + 20},${h - 40} ${pad + 100},${h - 120} ${pad + 210},${h - 90} ${pad + 290},${h - 150} ${w - 35},${h - 110}`} fill="none" stroke="#111" strokeWidth="28" strokeLinejoin="round" />}
    {placements.filter((p) => p.run !== 'secondary').map((p) => drawPlacement(p, primaryLane))}
    {placements.filter((p) => p.run === 'secondary').map((p) => drawPlacement(p, secondaryLane))}
  </svg>;
}

function App() {
  const [project, setProject] = useState(defaultProject);
  const [activeTab, setActiveTab] = useState('preview');

  const effectivePlatforms = useMemo(() => getEffectivePlatforms(project), [project]);
  const computedPlatforms = useMemo(() => effectivePlatforms.map((module) => computePlatform(module, project.staircase)), [effectivePlatforms, project.staircase]);
  const recommendedSize = useMemo(() => suggestPlatformSize(project.staircase), [project.staircase]);
  const legPlan = useMemo(() => getActiveLegPlan(project, computedPlatforms), [project, computedPlatforms]);
  const cutList = useMemo(() => getCutList(computedPlatforms, legPlan, project.hardware), [computedPlatforms, legPlan, project.hardware]);
  const billOfMaterials = useMemo(() => getBillOfMaterials(computedPlatforms, legPlan, cutList, project.hardware), [computedPlatforms, legPlan, cutList, project.hardware]);
  const warnings = useMemo(() => getGlobalWarnings(project.staircase, computedPlatforms, project.designMode), [project.staircase, computedPlatforms, project.designMode]);

  const totalTopAreaM2 = mmAreaToM2(sum(cutList.filter((c) => c.part === 'Top plate'), (c) => c.width * c.length * c.qty));
  const totalLegCount = sum(legPlan, (l) => l.quantity);
  const totalWeight = sum(computedPlatforms, (p) => p.estimatedTotalWeightKg * p.module.quantity);

  const updateStair = (key, value) => setProject((p) => ({ ...p, staircase: { ...p.staircase, [key]: value } }));
  const updateRepeatedTemplate = (key, value) => setProject((p) => ({ ...p, platformConfig: { ...p.platformConfig, repeatedTemplate: { ...p.platformConfig.repeatedTemplate, [key]: value } } }));
  const updateMixedModule = (id, key, value) => setProject((p) => ({ ...p, platformConfig: { ...p.platformConfig, modules: p.platformConfig.modules.map((m) => m.id === id ? { ...m, [key]: value } : m) } }));
  const updateHardware = (key, value) => setProject((p) => ({ ...p, hardware: { ...p.hardware, [key]: value } }));
  const updateLegConfig = (key, value) => setProject((p) => ({ ...p, legConfig: { ...p.legConfig, [key]: value } }));

  const moduleEditor = project.platformConfig.mode === 'repeat' ? [project.platformConfig.repeatedTemplate] : project.platformConfig.modules;
  const modulesById = useMemo(() => new Map(effectivePlatforms.map((m) => [m.id, m])), [effectivePlatforms]);

  const resetPlacements = () => {
    const first = effectivePlatforms[0];
    if (!first) return;
    setProject((p) => ({
      ...p,
      platformConfig: {
        ...p.platformConfig,
        placements: Array.from({ length: Math.max(1, first.quantity) }, (_, i) => ({ id: uniqueId('place'), moduleRef: first.id, enabled: true, run: i % 2 ? 'secondary' : 'primary', along: 10 + i * 12, across: 50 })),
      },
    }));
  };

  const updatePlacement = (id, key, value) => setProject((p) => ({ ...p, platformConfig: { ...p.platformConfig, placements: p.platformConfig.placements.map((place) => place.id === id ? { ...place, [key]: value } : place) } }));

  return <div className="app">
    <header className="hero">
      <h1>Modular Stair Work Platform Configurator · 1.7</h1>
      <p>Desktop-first workshop planner with optional stair modeling and live module placement context.</p>
      <div className="stats">
        <div><b>{sum(effectivePlatforms, (m) => m.quantity)}</b><span>Modules</span></div>
        <div><b>{totalTopAreaM2.toFixed(2)} m²</b><span>Top area</span></div>
        <div><b>{totalLegCount}</b><span>Legs</span></div>
        <div><b>{formatKg(totalWeight)}</b><span>Weight est.</span></div>
      </div>
    </header>

    <WarningList warnings={warnings} />

    <div className="layout">
      <main>
        <section className="card">
          <h2>0) Design mode (stair modeling is optional)</h2>
          <div className="btnRow">
            <button className={project.designMode === 'quick' ? 'active' : ''} onClick={() => setProject((p) => ({ ...p, designMode: 'quick' }))}>Quick platform design</button>
            <button className={project.designMode === 'stair-specific' ? 'active' : ''} onClick={() => setProject((p) => ({ ...p, designMode: 'stair-specific' }))}>Stair-specific design</button>
          </div>
          <p className="hint">Quick mode skips detailed stair archetype modeling; stair-specific mode drives a contextual staircase preview.</p>
        </section>

        <section className="card">
          <h2>1) Select the stair type that most closely matches your staircase</h2>
          <StairTypeSelector selected={project.staircase.selectedTypeCard} onSelect={(id) => updateStair('selectedTypeCard', id)} />
        </section>

        <section className="card">
          <h2>2) Stair dimensions</h2>
          <div className="grid2">
            <NumberInput label="Step height" value={project.staircase.stepHeight} onChange={(v) => updateStair('stepHeight', v)} suffix="mm" min={50} />
            <NumberInput label="Tread depth" value={project.staircase.treadDepth} onChange={(v) => updateStair('treadDepth', v)} suffix="mm" min={100} />
            <NumberInput label="Stair width" value={project.staircase.stairWidth} onChange={(v) => updateStair('stairWidth', v)} suffix="mm" min={300} />
            <NumberInput label="Total number of steps" value={project.staircase.numberOfSteps} onChange={(v) => updateStair('numberOfSteps', v)} min={1} />
            <NumberInput label="Landing depth (if relevant)" value={project.staircase.landingDepth} onChange={(v) => updateStair('landingDepth', v)} suffix="mm" min={0} />
            <NumberInput label="Landing width (if relevant)" value={project.staircase.landingWidth} onChange={(v) => updateStair('landingWidth', v)} suffix="mm" min={0} />
            <NumberInput label="Total stairwell width" value={project.staircase.stairwellWidth} onChange={(v) => updateStair('stairwellWidth', v)} suffix="mm" min={500} />
            <SelectInput label="Handrail / obstruction zone" value={project.staircase.handrailPosition} onChange={(v) => updateStair('handrailPosition', v)} options={[{ value: 'none', label: 'No handrail zone' }, { value: 'left', label: 'Left side zone' }, { value: 'right', label: 'Right side zone' }, { value: 'both', label: 'Both sides zone' }]} />
            <NumberInput label="Wall-handrail clearance" value={project.staircase.wallToHandrailClearance} onChange={(v) => updateStair('wallToHandrailClearance', v)} suffix="mm" min={0} />
            <NumberInput label="Obstruction depth" value={project.staircase.obstructionDepth} onChange={(v) => updateStair('obstructionDepth', v)} suffix="mm" min={0} />
            <ToggleInput label="Stair narrows at point" checked={project.staircase.narrowsAtPoint} onChange={(v) => updateStair('narrowsAtPoint', v)} />
            {project.staircase.narrowsAtPoint && <NumberInput label="Narrowest width" value={project.staircase.narrowestWidth} onChange={(v) => updateStair('narrowestWidth', v)} suffix="mm" min={300} />}
          </div>
        </section>

        <section className="card">
          <h2>3) Platform modules</h2>
          <div className="btnRow">
            <button className={project.platformConfig.mode === 'repeat' ? 'active' : ''} onClick={() => setProject((p) => ({ ...p, platformConfig: { ...p.platformConfig, mode: 'repeat' } }))}>Repeat one module</button>
            <button className={project.platformConfig.mode === 'mixed' ? 'active' : ''} onClick={() => setProject((p) => ({ ...p, platformConfig: { ...p.platformConfig, mode: 'mixed' } }))}>Mixed modules</button>
            <button className="secondary" onClick={resetPlacements}>Auto-generate placements</button>
          </div>
          <p className="hint">Recommended module: {recommendedSize.recommendedWidth} x {recommendedSize.recommendedLength} mm.</p>
          {moduleEditor.map((module) => {
            const isRepeat = project.platformConfig.mode === 'repeat';
            return <div key={module.id} className="moduleCard"><div className="grid2">
              {!isRepeat && <label className="field"><span>Module name</span><input value={module.name} onChange={(e) => updateMixedModule(module.id, 'name', e.target.value)} /></label>}
              {!isRepeat && <NumberInput label="Quantity" value={module.quantity} onChange={(v) => updateMixedModule(module.id, 'quantity', v)} min={1} max={20} />}
              <NumberInput label="Width" value={module.width} onChange={(v) => isRepeat ? updateRepeatedTemplate('width', v) : updateMixedModule(module.id, 'width', v)} suffix="mm" min={300} />
              <NumberInput label="Length" value={module.length} onChange={(v) => isRepeat ? updateRepeatedTemplate('length', v) : updateMixedModule(module.id, 'length', v)} suffix="mm" min={500} />
              <SelectInput label="Pocket pattern" value={module.pocketPattern} onChange={(v) => isRepeat ? updateRepeatedTemplate('pocketPattern', v) : updateMixedModule(module.id, 'pocketPattern', v)} options={[{ value: '3x3', label: '3 x 3' }, { value: '4x4', label: '4 x 4' }, { value: 'custom', label: 'Custom' }]} />
              {module.pocketPattern === 'custom' && <><NumberInput label="Custom rows" value={module.customRows} onChange={(v) => isRepeat ? updateRepeatedTemplate('customRows', v) : updateMixedModule(module.id, 'customRows', v)} min={2} max={8} /><NumberInput label="Custom cols" value={module.customCols} onChange={(v) => isRepeat ? updateRepeatedTemplate('customCols', v) : updateMixedModule(module.id, 'customCols', v)} min={2} max={8} /></>}
            </div></div>;
          })}
          <h3>Module placement in stair context</h3>
          {project.platformConfig.placements.map((place) => <div key={place.id} className="placementRow">
            <ToggleInput label={place.id} checked={place.enabled} onChange={(v) => updatePlacement(place.id, 'enabled', v)} />
            <SelectInput label="Module" value={place.moduleRef} onChange={(v) => updatePlacement(place.id, 'moduleRef', v)} options={effectivePlatforms.map((m) => ({ value: m.id, label: m.name }))} />
            <SelectInput label="Run" value={place.run} onChange={(v) => updatePlacement(place.id, 'run', v)} options={[{ value: 'primary', label: 'Primary run' }, { value: 'secondary', label: 'Secondary / return run' }]} />
            <NumberInput label="Along run" value={place.along} onChange={(v) => updatePlacement(place.id, 'along', clamp(v, 0, 100))} suffix="%" min={0} max={100} />
            <NumberInput label="Across width" value={place.across} onChange={(v) => updatePlacement(place.id, 'across', clamp(v, 0, 100))} suffix="%" min={0} max={100} />
          </div>)}
        </section>

        <section className="card">
          <h2>4) Legs and pockets</h2>
          <div className="btnRow"><button className={project.legConfig.mode === 'auto' ? 'active' : ''} onClick={() => updateLegConfig('mode', 'auto')}>Auto</button><button className={project.legConfig.mode === 'manual' ? 'active' : ''} onClick={() => updateLegConfig('mode', 'manual')}>Manual</button></div>
          <div className="grid2"><SelectInput label="Grouping" value={project.legConfig.grouping} onChange={(v) => updateLegConfig('grouping', v)} options={[{ value: 'step-increments', label: 'Step increments' }, { value: 'straight', label: 'Straight legs' }]} /><NumberInput label="Base leg length" value={project.legConfig.baseLegLength} onChange={(v) => updateLegConfig('baseLegLength', v)} suffix="mm" min={40} /></div>
          <div className="chips">{legPlan.map((l) => <span key={`${l.label}-${l.length}`}>{l.label}: {l.length} mm × {l.quantity}</span>)}</div>
        </section>

        <section className="card">
          <h2>5) Materials and cut list</h2>
          <Table headers={['Category', 'Item', 'Qty', 'Unit']} rows={billOfMaterials.map((i) => [i.category, i.name, i.qty, i.unit])} />
          <Table headers={['Part', 'Material', 'Width', 'Length', 'Qty', 'Platform']} rows={cutList.map((i) => [i.part, i.material, formatMm(i.width), formatMm(i.length), i.qty, i.platform || '—'])} />
        </section>
      </main>

      <aside>
        <section className="card">
          <h2>Live staircase + module preview</h2>
          <div className="btnRow"><button className={activeTab === 'preview' ? 'active' : ''} onClick={() => setActiveTab('preview')}>Stair Overview</button><button className={activeTab === 'report' ? 'active' : ''} onClick={() => setActiveTab('report')}>Build Summary</button><button className={activeTab === 'architecture' ? 'active' : ''} onClick={() => setActiveTab('architecture')}>Architecture</button></div>
          {activeTab === 'preview' && <StairOverviewLayout stair={project.staircase} placements={project.platformConfig.placements} modulesById={modulesById} />}
          {activeTab === 'report' && <div><p>Flow: 1) Stair type → 2) Stair dimensions → 3) Modules → 4) Legs/pockets → 5) Materials.</p><p>Stair archetype: <b>{getStairTypeMeta(project.staircase).label}</b>. Effective stair width: <b>{formatMm(recommendedSize.effectiveStairWidth)}</b>.</p><Table headers={['Module', 'Dims', 'Qty', 'Pockets', 'Weight']} rows={computedPlatforms.map((p) => [p.module.name, `${p.module.width} x ${p.module.length} mm`, p.module.quantity, `${p.pocketRows} x ${p.pocketCols}`, formatKg(p.estimatedTotalWeightKg * p.module.quantity)])} /></div>}
          {activeTab === 'architecture' && <div className="archNotes"><h3>Updated architecture overview</h3><ul><li>Staircase geometry is a dedicated model (`project.staircase`) and drives the live layout preview.</li><li>Platform modules are separate reusable objects (`project.platformConfig.repeatedTemplate` / `modules`).</li><li>Placement objects are independent (`project.platformConfig.placements`) and position modules relative to staircase runs.</li></ul><h3>Updated data model</h3><ul><li><b>designMode</b>: quick vs stair-specific flow.</li><li><b>staircase.selectedTypeCard</b>: archetype selector for straight/L/U/return/spiral/custom.</li><li><b>placements[]</b>: toggle, run selection, and % offsets for module fit testing.</li></ul><h3>Updated rendering logic</h3><ul><li>Stair Overview / Layout renders simplified top-view geometry per stair archetype.</li><li>Placements are drawn as movable overlays on primary/secondary runs.</li><li>Materials + cut list remain generated from module and leg models.</li></ul></div>}
        </section>
      </aside>
    </div>
  </div>;
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
