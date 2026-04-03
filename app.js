const { useMemo, useState } = React;

const MM_PER_M = 1000;

const defaultProject = {
  staircase: {
    type: "straight",
    stepHeight: 180,
    stepDepth: 260,
    stairWidth: 900,
    stairwellWidth: 1050,
    steps: 12,
    landingDepth: 1000,
    landingWidth: 1000,
    handrailSide: "right",
    wallToHandrailClearance: 60,
    hasNarrowing: false,
    narrowingWidth: 0,
  },
  platformSetup: {
    repeatStandardModule: true,
    moduleCount: 2,
    layoutStyle: "flexible",
    preferredPattern: "3x3",
    customPatternX: 3,
    customPatternY: 4,
    topThickness: 18,
    frameWidth: 48,
    frameHeight: 73,
    legWidth: 48,
    legDepth: 73,
  },
  modules: [
    {
      id: "M1",
      name: "Module 1",
      width: 600,
      length: 900,
      pocketPattern: "3x3",
      pocketX: 3,
      pocketY: 3,
      crossMembers: 2,
      enabledInOverview: true,
      offsetAlongRun: 0,
      offsetAcross: 0,
    },
    {
      id: "M2",
      name: "Module 2",
      width: 600,
      length: 900,
      pocketPattern: "3x3",
      pocketX: 3,
      pocketY: 3,
      crossMembers: 2,
      enabledInOverview: true,
      offsetAlongRun: 850,
      offsetAcross: 0,
    },
  ],
  legSetup: {
    mode: "auto",
    grouping: "stepIncrements",
    manualHeightsText: "900:4\n1080:4\n1260:2",
    autoIncrementCount: 6,
    autoBaseHeight: 720,
  },
  hardware: {
    boltLength: 80,
    includeWashers: true,
    includeAntiSlip: true,
    includeGlue: true,
    screwPerPocketBlock: 2,
    screwsPerCrossMemberEnd: 2,
  },
};

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

function mmToM(mm) {
  return mm / MM_PER_M;
}

function suggestModuleSize(staircase) {
  const maxWidth = Math.max(300, staircase.stairWidth - 2 * staircase.wallToHandrailClearance);
  const width = clamp(Math.round(maxWidth * 0.65), 450, 800);
  const length = clamp(Math.round(staircase.stepDepth * 3.5), 700, 1200);
  return { width, length };
}

function patternToXY(pattern, customX, customY) {
  if (pattern === "3x3") return { x: 3, y: 3 };
  if (pattern === "4x4") return { x: 4, y: 4 };
  if (pattern === "3x4") return { x: 3, y: 4 };
  return { x: Math.max(2, customX), y: Math.max(2, customY) };
}

function computeModuleEngineering(module, setup) {
  const outerInset = setup.frameWidth;
  const insideX = Math.max(80, module.width - 2 * outerInset);
  const insideY = Math.max(120, module.length - 2 * outerInset);
  const spacingX = insideX / Math.max(1, module.pocketX - 1);
  const spacingY = insideY / Math.max(1, module.pocketY - 1);

  const minSpacing = Math.min(spacingX, spacingY);
  const practical = {
    spacingOk: minSpacing >= Math.max(setup.legWidth, setup.legDepth) + 12,
    narrowModule: module.width < 450,
    tooLarge: module.width > 900 || module.length > 1400,
  };

  const outerFrameLength = 2 * module.length + 2 * module.width;
  const crossMemberLength = Math.max(0, module.width - 2 * setup.frameWidth);
  const crossMembers = module.crossMembers;

  // Pocket model: each pocket side can be contributed by surrounding structural members.
  const pockets = [];
  let pocketGuideBlocks = 0;

  for (let ix = 0; ix < module.pocketX; ix += 1) {
    for (let iy = 0; iy < module.pocketY; iy += 1) {
      const x = outerInset + (module.pocketX === 1 ? insideX / 2 : ix * spacingX);
      const y = outerInset + (module.pocketY === 1 ? insideY / 2 : iy * spacingY);

      const sideByFrame = {
        left: ix === 0,
        right: ix === module.pocketX - 1,
        top: iy === 0,
        bottom: iy === module.pocketY - 1,
      };

      // If near one of the longitudinal cross-member y lines, let that member form one side.
      for (let c = 1; c <= crossMembers; c += 1) {
        const crossY = outerInset + (c * insideY) / (crossMembers + 1);
        if (Math.abs(y - crossY) < setup.frameWidth * 0.55) {
          if (y <= crossY) sideByFrame.bottom = true;
          else sideByFrame.top = true;
        }
      }

      const frameSides = Object.values(sideByFrame).filter(Boolean).length;
      const addedBlocks = Math.max(0, 4 - frameSides);
      pocketGuideBlocks += addedBlocks;

      const overlapsMember =
        Math.abs(x - setup.frameWidth) < setup.frameWidth / 2 ||
        Math.abs(x - (module.width - setup.frameWidth)) < setup.frameWidth / 2;

      pockets.push({
        ix,
        iy,
        x,
        y,
        sideByFrame,
        addedBlocks,
        overlapsMember,
      });
    }
  }

  const pocketsTooDense = pockets.length > 20 && module.width * module.length < 700000;
  const recommendedLegsInUse = clamp(Math.round(pockets.length * 0.45), 4, 6);

  const plywoodVolumeM3 = mmToM(module.width) * mmToM(module.length) * mmToM(setup.topThickness);
  const timberCrossSectionM2 = mmToM(setup.frameWidth) * mmToM(setup.frameHeight);
  const timberLengthM = mmToM(outerFrameLength + crossMemberLength * crossMembers);
  const timberVolumeM3 = timberCrossSectionM2 * timberLengthM;

  const densityPlywood = 430;
  const densityTimber = 500;

  const weightEstimateKg = plywoodVolumeM3 * densityPlywood + timberVolumeM3 * densityTimber;

  return {
    practical,
    outerFrameLength,
    crossMemberLength,
    crossMembers,
    pockets,
    pocketGuideBlocks,
    recommendedLegsInUse,
    spacingX,
    spacingY,
    pocketsTooDense,
    weightEstimateKg,
  };
}

function parseManualLegs(text) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [h, q] = line.split(":").map((v) => Number(v.trim()));
      return { height: h, qty: q };
    })
    .filter((x) => Number.isFinite(x.height) && Number.isFinite(x.qty) && x.height > 100 && x.qty > 0);
}

function suggestLegHeights(staircase, legSetup) {
  const step = staircase.stepHeight;
  const base = Math.max(step * 3, legSetup.autoBaseHeight);
  const entries = [];
  for (let i = 0; i < legSetup.autoIncrementCount; i += 1) {
    const h = base + i * step;
    const qty = i < 3 ? 4 : 2;
    entries.push({ height: h, qty });
  }
  return entries;
}

function computeProject(project) {
  const staircase = project.staircase;
  const setup = project.platformSetup;
  const suggestedSize = suggestModuleSize(staircase);

  const modules = project.modules.slice(0, setup.moduleCount).map((m, idx) => {
    const target = setup.repeatStandardModule
      ? {
          ...m,
          width: suggestedSize.width,
          length: suggestedSize.length,
        }
      : m;

    const parsedPattern = patternToXY(target.pocketPattern, target.pocketX, target.pocketY);
    const normalized = {
      ...target,
      ...parsedPattern,
      id: target.id || `M${idx + 1}`,
      name: target.name || `Module ${idx + 1}`,
    };
    return { ...normalized, engineering: computeModuleEngineering(normalized, setup) };
  });

  const legEntries =
    project.legSetup.mode === "manual"
      ? parseManualLegs(project.legSetup.manualHeightsText)
      : suggestLegHeights(staircase, project.legSetup);

  const totalLegs = legEntries.reduce((sum, l) => sum + l.qty, 0);
  const totalLegTimberMm = legEntries.reduce((sum, l) => sum + l.height * l.qty, 0);

  const totalPockets = modules.reduce((sum, m) => sum + m.engineering.pockets.length, 0);
  const totalGuideBlocks = modules.reduce((sum, m) => sum + m.engineering.pocketGuideBlocks, 0);
  const totalCrossMembers = modules.reduce((sum, m) => sum + m.crossMembers, 0);

  const bolts = totalLegs;
  const threadedInserts = totalLegs;
  const washers = project.hardware.includeWashers ? bolts : 0;
  const antiSlipPads = project.hardware.includeAntiSlip ? totalLegs : 0;
  const screws =
    totalGuideBlocks * project.hardware.screwPerPocketBlock +
    totalCrossMembers * 2 * project.hardware.screwsPerCrossMemberEnd;

  const timberFrameMm = modules.reduce(
    (sum, m) =>
      sum + m.engineering.outerFrameLength + m.engineering.crossMemberLength * m.engineering.crossMembers,
    0
  );

  const plywoodAreaMm2 = modules.reduce((sum, m) => sum + m.width * m.length, 0);
  const plywoodSheets = Math.ceil(plywoodAreaMm2 / (1220 * 2440));

  const warnings = [];
  if (staircase.stairWidth < 700) {
    warnings.push("Very narrow staircase: verify module width and safe movement.");
  }
  modules.forEach((m) => {
    if (m.width > staircase.stairWidth) warnings.push(`${m.name}: width exceeds stair width.`);
    if (m.engineering.practical.tooLarge)
      warnings.push(`${m.name}: platform dimensions are likely too large for practical handling.`);
    if (!m.engineering.practical.spacingOk)
      warnings.push(`${m.name}: pocket spacing is tight for leg dimensions; reduce pattern density.`);
    if (m.engineering.pocketsTooDense)
      warnings.push(`${m.name}: too many pockets for platform size; simplify pocket pattern.`);
  });
  if (legEntries.some((e) => e.height < 300 || e.height > 2200)) {
    warnings.push("Some leg lengths look impractical; verify cut list and intended use.");
  }

  const totalWeightKg = modules.reduce((sum, m) => sum + m.engineering.weightEstimateKg, 0);

  return {
    modules,
    legEntries,
    totals: {
      totalLegs,
      totalLegTimberMm,
      totalPockets,
      totalGuideBlocks,
      bolts,
      threadedInserts,
      washers,
      antiSlipPads,
      screws,
      plywoodSheets,
      plywoodAreaMm2,
      timberFrameMm,
      totalWeightKg,
    },
    warnings,
    suggestedSize,
  };
}

function StairPlanSvg({ staircase, modules }) {
  const w = 540;
  const h = 280;
  const stairColor = "#d8dee9";
  const stroke = "#4c566a";

  const renderStairShape = () => {
    if (staircase.type === "straight") {
      return <rect x="30" y="90" width="480" height="100" fill={stairColor} stroke={stroke} strokeWidth="2" />;
    }
    if (staircase.type === "lshaped") {
      return (
        <path
          d="M30 150 L300 150 L300 60 L510 60 L510 160 L220 160 L220 240 L30 240 Z"
          fill={stairColor}
          stroke={stroke}
          strokeWidth="2"
        />
      );
    }
    return (
      <path
        d="M30 80 L250 80 L250 140 L120 140 L120 200 L510 200 L510 110 L360 110 L360 50 L30 50 Z"
        fill={stairColor}
        stroke={stroke}
        strokeWidth="2"
      />
    );
  };

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="diagram">
      {renderStairShape()}
      {modules
        .filter((m) => m.enabledInOverview)
        .map((m, i) => {
          const scale = 0.25;
          const px = 40 + m.offsetAlongRun * scale;
          const py = 100 + m.offsetAcross * scale;
          return (
            <rect
              key={m.id}
              x={px}
              y={py}
              width={m.length * scale}
              height={m.width * scale}
              fill={`hsla(${(i * 80) % 360}, 65%, 55%, 0.45)`}
              stroke="#2e3440"
              strokeWidth="1.5"
            />
          );
        })}
      <text x="12" y="20" className="svgLabel">
        Platform Module Overview ({staircase.type})
      </text>
    </svg>
  );
}

function ModuleUndersideSvg({ module, setup }) {
  const w = 500;
  const h = 350;
  const sx = w / module.length;
  const sy = h / module.width;

  const frame = setup.frameWidth;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="diagram">
      <rect x="0" y="0" width={w} height={h} fill="#fff" stroke="#2e3440" strokeWidth="2" />
      <rect x="0" y="0" width={w} height={frame * sy} fill="#8fbcbb" />
      <rect x="0" y={h - frame * sy} width={w} height={frame * sy} fill="#8fbcbb" />
      <rect x="0" y="0" width={frame * sx} height={h} fill="#8fbcbb" />
      <rect x={w - frame * sx} y="0" width={frame * sx} height={h} fill="#8fbcbb" />

      {Array.from({ length: module.crossMembers }).map((_, i) => {
        const y = ((i + 1) * h) / (module.crossMembers + 1);
        return <rect key={i} x={frame * sx} y={y - (frame * sy) / 2} width={w - 2 * frame * sx} height={frame * sy} fill="#88c0d0" />;
      })}

      {module.engineering.pockets.map((p, idx) => {
        const cx = (p.y / module.length) * w;
        const cy = (p.x / module.width) * h;
        const legW = setup.legDepth * sx;
        const legH = setup.legWidth * sy;

        const blockColor = "#d08770";
        const relief = 6;

        const drawBlock = (x, y, bw, bh, key) => (
          <polygon
            key={key}
            points={`${x},${y} ${x + bw},${y} ${x + bw - relief},${y + bh} ${x + relief},${y + bh}`}
            fill={blockColor}
            opacity="0.85"
          />
        );

        const blocks = [];
        if (!p.sideByFrame.top) blocks.push(drawBlock(cx - legW / 2, cy - legH / 2 - 8, legW, 6, `t-${idx}`));
        if (!p.sideByFrame.bottom) blocks.push(drawBlock(cx - legW / 2, cy + legH / 2 + 2, legW, 6, `b-${idx}`));
        if (!p.sideByFrame.left) blocks.push(drawBlock(cx - legW / 2 - 8, cy - legH / 2, 6, legH, `l-${idx}`));
        if (!p.sideByFrame.right) blocks.push(drawBlock(cx + legW / 2 + 2, cy - legH / 2, 6, legH, `r-${idx}`));

        return (
          <g key={idx}>
            <rect x={cx - legW / 2} y={cy - legH / 2} width={legW} height={legH} fill="#eceff4" stroke="#4c566a" strokeDasharray="3 2" />
            {blocks}
          </g>
        );
      })}

      <text x="10" y="18" className="svgLabel">
        Underside: frame (blue) + pocket blocks (orange with 45° relief)
      </text>
    </svg>
  );
}

function SideViewSvg({ staircase, legEntries }) {
  const sorted = [...legEntries].sort((a, b) => b.height - a.height);
  const maxH = Math.max(1000, ...sorted.map((l) => l.height));
  const w = 540;
  const h = 240;
  const stepW = 40;
  const riseScale = (h - 40) / (staircase.stepHeight * staircase.steps);

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="diagram">
      {Array.from({ length: staircase.steps }).map((_, i) => {
        const x = i * stepW;
        const y = h - 20 - staircase.stepHeight * (i + 1) * riseScale;
        return <rect key={i} x={x} y={y} width={stepW} height={staircase.stepHeight * (i + 1) * riseScale} fill="#e5e9f0" stroke="#d8dee9" />;
      })}

      <line x1="30" y1="35" x2={w - 20} y2="35" stroke="#2e3440" strokeWidth="3" />

      {sorted.slice(0, 8).map((leg, i) => {
        const x = 40 + i * 55;
        const legPx = (leg.height / maxH) * 150;
        return (
          <g key={`${leg.height}-${i}`}>
            <rect x={x} y={35} width="16" height={legPx} fill="#a3be8c" stroke="#2e3440" />
            <text x={x - 8} y={35 + legPx + 12} className="svgTiny">
              {leg.height}mm
            </text>
          </g>
        );
      })}
      <text x="10" y="18" className="svgLabel">
        Side view (left → right descending leg heights)
      </text>
    </svg>
  );
}

function App() {
  const [project, setProject] = useState(defaultProject);

  const computed = useMemo(() => computeProject(project), [project]);

  const setStair = (key, val) => setProject((p) => ({ ...p, staircase: { ...p.staircase, [key]: val } }));
  const setSetup = (key, val) => setProject((p) => ({ ...p, platformSetup: { ...p.platformSetup, [key]: val } }));
  const setLeg = (key, val) => setProject((p) => ({ ...p, legSetup: { ...p.legSetup, [key]: val } }));
  const setHardware = (key, val) => setProject((p) => ({ ...p, hardware: { ...p.hardware, [key]: val } }));

  const setModule = (index, key, value) => {
    setProject((p) => {
      const next = [...p.modules];
      next[index] = { ...next[index], [key]: value };
      return { ...p, modules: next };
    });
  };

  const syncModuleCount = (count) => {
    setProject((p) => {
      const n = Number(count);
      const next = [...p.modules];
      while (next.length < n) {
        next.push({
          id: `M${next.length + 1}`,
          name: `Module ${next.length + 1}`,
          width: 600,
          length: 900,
          pocketPattern: p.platformSetup.preferredPattern,
          pocketX: 3,
          pocketY: 3,
          crossMembers: 2,
          enabledInOverview: true,
          offsetAlongRun: next.length * 850,
          offsetAcross: 0,
        });
      }
      return {
        ...p,
        platformSetup: { ...p.platformSetup, moduleCount: n },
        modules: next,
      };
    });
  };

  return (
    <div className="appShell">
      <header>
        <h1>Modular Stair Work Platform Configurator</h1>
        <p className="muted">
          Practical planning tool for indoor renovation platforms. Not structural certification.
        </p>
      </header>

      <section className="warningBox">
        <strong>Safety notice:</strong> This is a planning tool only. User must verify stability and safety before use.
        Do not use without proper bracing and secure assembly. Not a substitute for certified scaffolding or
        engineering approval.
      </section>

      <div className="grid twoCol">
        <section className="card">
          <h2>1) Staircase Input</h2>
          <div className="formGrid">
            <label>
              Stair type
              <select value={project.staircase.type} onChange={(e) => setStair("type", e.target.value)}>
                <option value="straight">Straight</option>
                <option value="lshaped">L-shaped</option>
                <option value="ushaped">U-shaped</option>
              </select>
            </label>
            <label>
              Step height (mm)
              <input type="number" value={project.staircase.stepHeight} onChange={(e) => setStair("stepHeight", Number(e.target.value))} />
            </label>
            <label>
              Step depth (mm)
              <input type="number" value={project.staircase.stepDepth} onChange={(e) => setStair("stepDepth", Number(e.target.value))} />
            </label>
            <label>
              Stair width (mm)
              <input type="number" value={project.staircase.stairWidth} onChange={(e) => setStair("stairWidth", Number(e.target.value))} />
            </label>
            <label>
              Stairwell width (mm)
              <input type="number" value={project.staircase.stairwellWidth} onChange={(e) => setStair("stairwellWidth", Number(e.target.value))} />
            </label>
            <label>
              Number of steps
              <input type="number" value={project.staircase.steps} onChange={(e) => setStair("steps", Number(e.target.value))} />
            </label>
            <label>
              Landing depth (mm)
              <input type="number" value={project.staircase.landingDepth} onChange={(e) => setStair("landingDepth", Number(e.target.value))} />
            </label>
            <label>
              Wall to handrail clearance (mm)
              <input
                type="number"
                value={project.staircase.wallToHandrailClearance}
                onChange={(e) => setStair("wallToHandrailClearance", Number(e.target.value))}
              />
            </label>
          </div>
        </section>

        <section className="card">
          <h2>2) Platform Setup</h2>
          <div className="formGrid">
            <label>
              Repeat standard module
              <input type="checkbox" checked={project.platformSetup.repeatStandardModule} onChange={(e) => setSetup("repeatStandardModule", e.target.checked)} />
            </label>
            <label>
              Number of modules
              <input type="number" min="1" max="6" value={project.platformSetup.moduleCount} onChange={(e) => syncModuleCount(e.target.value)} />
            </label>
            <label>
              Layout style
              <select value={project.platformSetup.layoutStyle} onChange={(e) => setSetup("layoutStyle", e.target.value)}>
                <option value="grid">Fixed grid</option>
                <option value="flexible">Flexible local pockets</option>
              </select>
            </label>
            <label>
              Preferred pocket pattern
              <select value={project.platformSetup.preferredPattern} onChange={(e) => setSetup("preferredPattern", e.target.value)}>
                <option value="3x3">3x3</option>
                <option value="4x4">4x4</option>
                <option value="3x4">3x4</option>
                <option value="custom">Custom</option>
              </select>
            </label>
            <label>
              Top thickness (mm)
              <input type="number" value={project.platformSetup.topThickness} onChange={(e) => setSetup("topThickness", Number(e.target.value))} />
            </label>
            <label>
              Frame timber (mm)
              <div className="splitInline">
                <input type="number" value={project.platformSetup.frameWidth} onChange={(e) => setSetup("frameWidth", Number(e.target.value))} />
                <span>x</span>
                <input type="number" value={project.platformSetup.frameHeight} onChange={(e) => setSetup("frameHeight", Number(e.target.value))} />
              </div>
            </label>
            <label>
              Leg timber (mm)
              <div className="splitInline">
                <input type="number" value={project.platformSetup.legWidth} onChange={(e) => setSetup("legWidth", Number(e.target.value))} />
                <span>x</span>
                <input type="number" value={project.platformSetup.legDepth} onChange={(e) => setSetup("legDepth", Number(e.target.value))} />
              </div>
            </label>
          </div>
          <p className="infoLine">
            Recommended module size (auto): {computed.suggestedSize.width} x {computed.suggestedSize.length} mm
            (editable in module table).
          </p>
        </section>
      </div>

      <section className="card">
        <h2>3) Module Editor</h2>
        <table>
          <thead>
            <tr>
              <th>Module</th>
              <th>Width (mm)</th>
              <th>Length (mm)</th>
              <th>Pocket pattern</th>
              <th>Cross-members</th>
              <th>Overview visible</th>
            </tr>
          </thead>
          <tbody>
            {project.modules.slice(0, project.platformSetup.moduleCount).map((m, i) => (
              <tr key={m.id}>
                <td>{m.name}</td>
                <td><input type="number" value={m.width} onChange={(e) => setModule(i, "width", Number(e.target.value))} disabled={project.platformSetup.repeatStandardModule} /></td>
                <td><input type="number" value={m.length} onChange={(e) => setModule(i, "length", Number(e.target.value))} disabled={project.platformSetup.repeatStandardModule} /></td>
                <td>
                  <select value={m.pocketPattern} onChange={(e) => setModule(i, "pocketPattern", e.target.value)}>
                    <option value="3x3">3x3</option>
                    <option value="4x4">4x4</option>
                    <option value="3x4">3x4</option>
                    <option value="custom">Custom</option>
                  </select>
                </td>
                <td><input type="number" min="0" max="5" value={m.crossMembers} onChange={(e) => setModule(i, "crossMembers", Number(e.target.value))} /></td>
                <td><input type="checkbox" checked={m.enabledInOverview} onChange={(e) => setModule(i, "enabledInOverview", e.target.checked)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="grid twoCol">
        <section className="card">
          <h2>4) Leg Setup</h2>
          <div className="formGrid">
            <label>
              Leg mode
              <select value={project.legSetup.mode} onChange={(e) => setLeg("mode", e.target.value)}>
                <option value="auto">Auto suggest by stair rise</option>
                <option value="manual">Manual</option>
              </select>
            </label>
            <label>
              Grouping
              <select value={project.legSetup.grouping} onChange={(e) => setLeg("grouping", e.target.value)}>
                <option value="stepIncrements">Grouped by step increments</option>
                <option value="straight">Standard straight legs</option>
              </select>
            </label>
            <label>
              Auto increments
              <input type="number" value={project.legSetup.autoIncrementCount} onChange={(e) => setLeg("autoIncrementCount", Number(e.target.value))} />
            </label>
            <label>
              Auto base height (mm)
              <input type="number" value={project.legSetup.autoBaseHeight} onChange={(e) => setLeg("autoBaseHeight", Number(e.target.value))} />
            </label>
            {project.legSetup.mode === "manual" && (
              <label className="fullWidth">
                Manual legs (height:qty per line)
                <textarea value={project.legSetup.manualHeightsText} onChange={(e) => setLeg("manualHeightsText", e.target.value)} rows="6" />
              </label>
            )}
          </div>
        </section>

        <section className="card">
          <h2>5) Hardware Options</h2>
          <div className="formGrid">
            <label>
              M8 bolt length (mm)
              <input type="number" value={project.hardware.boltLength} onChange={(e) => setHardware("boltLength", Number(e.target.value))} />
            </label>
            <label>
              Include washers
              <input type="checkbox" checked={project.hardware.includeWashers} onChange={(e) => setHardware("includeWashers", e.target.checked)} />
            </label>
            <label>
              Include anti-slip pads
              <input type="checkbox" checked={project.hardware.includeAntiSlip} onChange={(e) => setHardware("includeAntiSlip", e.target.checked)} />
            </label>
            <label>
              Include glue
              <input type="checkbox" checked={project.hardware.includeGlue} onChange={(e) => setHardware("includeGlue", e.target.checked)} />
            </label>
          </div>
        </section>
      </div>

      <section className="card">
        <h2>6) Live Visual Preview</h2>
        <div className="grid twoCol">
          <div>
            <h3>Platform Module Overview</h3>
            <StairPlanSvg staircase={project.staircase} modules={project.modules.slice(0, project.platformSetup.moduleCount)} />
          </div>
          <div>
            <h3>Simplified Side View</h3>
            <SideViewSvg staircase={project.staircase} legEntries={computed.legEntries} />
          </div>
        </div>
        {computed.modules[0] && (
          <div>
            <h3>Underside Pocket Construction ({computed.modules[0].name})</h3>
            <ModuleUndersideSvg module={computed.modules[0]} setup={project.platformSetup} />
          </div>
        )}
      </section>

      <section className="card">
        <h2>7) Materials, BOM & Cut List</h2>
        <div className="grid twoCol">
          <div>
            <h3>Platform Summary</h3>
            <ul>
              {computed.modules.map((m) => (
                <li key={m.id}>
                  <strong>{m.name}:</strong> {m.width}x{m.length} mm, top {project.platformSetup.topThickness} mm plywood, pockets {m.engineering.pockets.length},
                  recommended legs in use {m.engineering.recommendedLegsInUse}, est. weight {m.engineering.weightEstimateKg.toFixed(1)} kg.
                </li>
              ))}
            </ul>

            <h3>Leg Summary</h3>
            <ul>
              {computed.legEntries.map((l, i) => (
                <li key={i}>{l.height} mm x {l.qty}</li>
              ))}
            </ul>
            <p>Total leg timber: {(computed.totals.totalLegTimberMm / 1000).toFixed(2)} m</p>
          </div>

          <div>
            <h3>Bill of Materials</h3>
            <ul>
              <li>Plywood sheets (1220x2440): {computed.totals.plywoodSheets}</li>
              <li>Frame timber 48x73 (or configured): {(computed.totals.timberFrameMm / 1000).toFixed(2)} m</li>
              <li>Leg timber 48x73 (or configured): {(computed.totals.totalLegTimberMm / 1000).toFixed(2)} m</li>
              <li>M8 threaded inserts: {computed.totals.threadedInserts}</li>
              <li>M8 bolts ({project.hardware.boltLength} mm): {computed.totals.bolts}</li>
              <li>Washers: {computed.totals.washers}</li>
              <li>Screws: {computed.totals.screws}</li>
              <li>Glue: {project.hardware.includeGlue ? "1 bottle (optional)" : "not included"}</li>
              <li>Anti-slip pads: {computed.totals.antiSlipPads}</li>
            </ul>
          </div>
        </div>

        <h3>Cut List</h3>
        <table>
          <thead>
            <tr>
              <th>Part</th>
              <th>Qty</th>
              <th>Width (mm)</th>
              <th>Length (mm)</th>
              <th>Material</th>
            </tr>
          </thead>
          <tbody>
            {computed.modules.map((m) => (
              <React.Fragment key={m.id}>
                <tr><td>{m.name} top plate</td><td>1</td><td>{m.width}</td><td>{m.length}</td><td>{project.platformSetup.topThickness} mm plywood</td></tr>
                <tr><td>{m.name} outer frame - long</td><td>2</td><td>{project.platformSetup.frameWidth}</td><td>{m.length}</td><td>Timber</td></tr>
                <tr><td>{m.name} outer frame - short</td><td>2</td><td>{project.platformSetup.frameWidth}</td><td>{m.width}</td><td>Timber</td></tr>
                <tr><td>{m.name} cross-members</td><td>{m.crossMembers}</td><td>{project.platformSetup.frameWidth}</td><td>{Math.round(m.engineering.crossMemberLength)}</td><td>Timber</td></tr>
                <tr><td>{m.name} pocket guide blocks</td><td>{m.engineering.pocketGuideBlocks}</td><td>~30</td><td>~70</td><td>Timber offcuts (45° relief optional)</td></tr>
              </React.Fragment>
            ))}
            {computed.legEntries.map((l, i) => (
              <tr key={`leg-${i}`}><td>Leg</td><td>{l.qty}</td><td>{project.platformSetup.legWidth}</td><td>{l.height}</td><td>Timber + M8 insert</td></tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card printable">
        <h2>8) Printable Summary Report</h2>
        <p>Project: stair {project.staircase.type}, {project.staircase.steps} steps ({project.staircase.stepHeight} mm rise).</p>
        <p>Modules: {computed.modules.length}, total estimated platform weight {computed.totals.totalWeightKg.toFixed(1)} kg.</p>
        <p>Pockets: {computed.totals.totalPockets}, guide blocks: {computed.totals.totalGuideBlocks}.</p>
        <p>Fasteners: inserts {computed.totals.threadedInserts}, bolts {computed.totals.bolts}, washers {computed.totals.washers}.</p>
      </section>

      {computed.warnings.length > 0 && (
        <section className="warningBox">
          <h3>Warnings / Validation Checks</h3>
          <ul>
            {computed.warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </section>
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
