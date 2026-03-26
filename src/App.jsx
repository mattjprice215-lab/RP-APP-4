import React, { useState, useMemo, useCallback } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from "recharts";

// ── Formatting ────────────────────────────────────────────────────────────────
const fmt  = (n) => new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:0}).format(n||0);
const fmtK = (n) => {
  if (!n || isNaN(n) || n < 0) return "$0";
  if (n >= 1e9) return `$${(n/1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n/1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n/1e3).toFixed(0)}K`;
  return fmt(n);
};
const pct = (n, d=1) => `${(+n||0).toFixed(d)}%`;
const cl  = (v, mn, mx) => Math.min(Math.max(+v||0, mn), mx);
const CY  = new Date().getFullYear();
let _uid = 0;
const uid = () => `i${++_uid}`;

// ── Brand (Equitable) ─────────────────────────────────────────────────────────
const N   = "#002677";
const B   = "#0047BB";
const S   = "#E8EDF8";
const BD  = "#D1D9ED";
const MU  = "#6B7A99";
const TX  = "#0D1B3E";
const GR  = "#059669";
const AM  = "#D97706";
const RD  = "#DC2626";
const PT  = "#0047BB";
const RT  = "#059669";
const TXC = "#D97706";
const PS  = "#7C3AED";
const SSC = "#0F766E";
const WMC = { retirement:"#1D4ED8", nonretire:"#059669", income:"#7C3AED", insurance:"#0F766E" };

// ── Account config ────────────────────────────────────────────────────────────
const ATYPES = {
  "401k": { label:"401k / 403b", hasMatch:true,  color:B   },
  rira:   { label:"Roth IRA",    hasMatch:false, color:RT  },
  tira:   { label:"Trad. IRA",   hasMatch:false, color:"#6366f1" },
  brok:   { label:"Brokerage",   hasMatch:false, color:AM  },
};

// ── Factories ─────────────────────────────────────────────────────────────────
function mkAcct(type, pid) {
  return {
    id:uid(), pid, type, label:ATYPES[type].label,
    taxType: type==="brok"?"taxable":type==="rira"?"roth":"pretax",
    balance:0,
    empPreTaxPct:4, empPreTaxDollar:400, empPreTaxMode:"pct",
    empRothPct:2,   empRothDollar:100,   empRothMode:"pct",
    erPct:50, erCap:6, erTax:"pretax",
    mode:"dollar", contribDollar:300, contribPct:5, growth:7,
  };
}
function mkPerson(n) {
  const p = { id:uid(), name:n===1?"You":`Person ${n}`, age:35, retireAge:65, lifeExp:90, salary:n===1?85000:72000, accounts:[] };
  p.accounts = [mkAcct("401k", p.id)];
  return p;
}

// ── Math ──────────────────────────────────────────────────────────────────────
function acctStreams(a, salary) {
  if (a.type === "401k") {
    const ms    = salary / 12;
    const ep    = a.empPreTaxMode==="pct" ? ms*(a.empPreTaxPct/100) : (a.empPreTaxDollar||0);
    const er    = a.empRothMode==="pct"   ? ms*(a.empRothPct/100)   : (a.empRothDollar||0);
    const tot   = ep + er;
    const cap   = ms * ((a.erCap||0)/100);
    const match = Math.min(tot, cap) * ((a.erPct||0)/100);
    const ept   = a.erTax === "pretax";
    return { pt:ep+(ept?match:0), rt:er+(ept?0:match), tx:0, total:tot+match };
  }
  const mc = a.mode==="pct" ? (salary/12)*(a.contribPct/100) : (a.contribDollar||0);
  return {
    pt: a.taxType==="pretax"  ? mc : 0,
    rt: a.taxType==="roth"    ? mc : 0,
    tx: a.taxType==="taxable" ? mc : 0,
    total: mc,
  };
}

function projectYears(bal, dep, rate, yrs) {
  const r = rate/100/12;
  let b = Math.max(0, bal||0);
  const out = [Math.round(b)];
  for (let y=1; y<=yrs; y++) {
    for (let m=0; m<12; m++) b = b*(1+r) + dep;
    out.push(Math.round(Math.max(0, b)));
  }
  return out;
}

function projectDrawdown(bal, wPct, gPct, yrs) {
  const r = gPct/100/12;
  let b = Math.max(0, bal||0);
  const out = [Math.round(b)];
  for (let y=1; y<=yrs; y++) {
    const mw = b*(wPct/100)/12;
    for (let m=0; m<12; m++) b = Math.max(0, b*(1+r) - mw);
    out.push(Math.round(b));
  }
  return out;
}

function requiredMonthlySaving(target, currentBal, annRate, years) {
  if (years <= 0) return 0;
  const r = annRate/100/12;
  const n = years * 12;
  const fv = currentBal * Math.pow(1+r, n);
  const gap = target - fv;
  if (gap <= 0) return 0;
  return gap * r / (Math.pow(1+r, n) - 1);
}

// ── Primitive UI components ───────────────────────────────────────────────────
function NI({ value, onChange, prefix, suffix, min=0, max, step=100, style }) {
  return (
    <div className="ni" style={style}>
      {prefix && <span className="ni-a">{prefix}</span>}
      <input type="number" value={value} min={min} max={max} step={step}
        onChange={e => onChange(Number(e.target.value))} />
      {suffix && <span className="ni-b">{suffix}</span>}
    </div>
  );
}

function SlN({ value, onChange, min, max, step, prefix, suffix, color }) {
  const c = color || B;
  const p = cl((value-min)/(max-min)*100, 0, 100).toFixed(1);
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
      <NI value={value} onChange={v=>onChange(cl(v,min,max))} prefix={prefix} suffix={suffix} min={min} max={max} step={step} />
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(cl(+e.target.value,min,max))}
        style={{ "--p":`${p}%`, "--c":c }} />
    </div>
  );
}

function Seg({ opts, val, onChange, sm }) {
  return (
    <div className="seg">
      {opts.map(o => (
        <button key={o.v}
          className={"sb" + (val===o.v ? " on" : "")}
          style={{ ...(val===o.v && o.c ? {background:o.c, borderColor:o.c} : {}), fontSize:sm?".68rem":".74rem" }}
          onClick={() => onChange(o.v)}>
          {o.l}
        </button>
      ))}
    </div>
  );
}

function Toggle({ on, onChange }) {
  return (
    <label style={{ position:"relative", display:"inline-block", width:38, height:21, flexShrink:0, cursor:"pointer" }}>
      <input type="checkbox" checked={on} onChange={e => onChange(e.target.checked)}
        style={{ opacity:0, width:0, height:0, position:"absolute" }} />
      <span style={{ position:"absolute", inset:0, borderRadius:11, background:on?B:BD, transition:"background .2s", border:`1px solid ${on?B:BD}` }}>
        <span style={{ position:"absolute", width:15, height:15, borderRadius:"50%", background:"#fff", top:2, left:on?19:2, transition:"left .2s", boxShadow:"0 1px 3px rgba(0,0,0,.2)" }} />
      </span>
    </label>
  );
}

function Card({ title, sub, children, accent, right }) {
  return (
    <div style={{ background:"#fff", border:`1px solid ${BD}`, borderRadius:12, marginBottom:"1.25rem", overflow:"hidden", boxShadow:"0 1px 4px rgba(0,38,119,.05)" }}>
      {title && (
        <div style={{ padding:"1rem 1.4rem", borderBottom:`1px solid ${BD}`, background:S, display:"flex", alignItems:"center", justifyContent:"space-between", gap:8, flexWrap:"wrap" }}>
          <div>
            <div style={{ fontWeight:700, fontSize:".9rem", color:N, display:"flex", alignItems:"center", gap:7 }}>
              {accent && <span style={{ width:3, height:16, background:accent, borderRadius:2, display:"inline-block" }} />}
              {title}
            </div>
            {sub && <div style={{ fontSize:".72rem", color:MU, marginTop:2 }}>{sub}</div>}
          </div>
          {right}
        </div>
      )}
      <div style={{ padding:"1.25rem 1.4rem" }}>{children}</div>
    </div>
  );
}

function ChartTip({ active, payload, label, isAge }) {
  if (!active || !payload?.length) return null;
  const hd    = isAge ? `Age ${label}` : `${CY + Number(label)}`;
  const items = payload.filter(p => (p.value||0) >= 50);
  const total = items.reduce((s,p) => s+(p.value||0), 0);
  return (
    <div style={{ background:"#fff", border:`1px solid ${BD}`, borderRadius:8, padding:"10px 14px", minWidth:200, fontSize:12, boxShadow:"0 4px 20px rgba(0,38,119,.12)" }}>
      <div style={{ fontWeight:700, fontSize:13, color:N, marginBottom:6 }}>{hd}</div>
      {items.map(p => (
        <div key={p.dataKey} style={{ display:"flex", alignItems:"center", gap:6, padding:"2px 0" }}>
          <span style={{ width:8, height:8, borderRadius:2, background:p.fill||p.color, flexShrink:0, display:"inline-block" }} />
          <span style={{ color:MU, flex:1, fontSize:11 }}>{p.name}</span>
          <span style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:600, color:TX }}>{fmtK(p.value)}</span>
        </div>
      ))}
      {items.length > 1 && (
        <div style={{ borderTop:`1px solid ${BD}`, marginTop:5, paddingTop:5, fontFamily:"'JetBrains Mono',monospace", fontWeight:700, color:N }}>
          Total: {fmtK(total)}
        </div>
      )}
    </div>
  );
}

function GapMeter({ have, need, label }) {
  const filled = cl(need>0 ? (have/need)*100 : 100, 0, 100);
  const over   = have > need;
  const color  = over ? GR : filled > 66 ? AM : RD;
  return (
    <div style={{ marginBottom:".85rem" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:4 }}>
        <span style={{ fontSize:".73rem", color:MU, fontWeight:600, textTransform:"uppercase", letterSpacing:".04em" }}>{label}</span>
        <span style={{ fontSize:".73rem", fontFamily:"'JetBrains Mono',monospace", fontWeight:700, color }}>{over?"✓ ":""}{pct(filled,0)} funded</span>
      </div>
      <div style={{ height:8, background:BD, borderRadius:4, position:"relative" }}>
        <div style={{ height:"100%", width:`${filled}%`, background:color, borderRadius:4, transition:"width .5s" }}>
          {filled > 0 && filled <= 98 && (
            <span style={{ position:"absolute", right:-1, top:-4, width:16, height:16, borderRadius:"50%", background:color, border:"2px solid #fff", boxShadow:"0 1px 4px rgba(0,0,0,.15)" }} />
          )}
        </div>
      </div>
      <div style={{ display:"flex", justifyContent:"space-between", fontSize:".68rem", color:MU, marginTop:3 }}>
        <span>Have: {fmtK(have)}</span>
        <span>Need: {fmtK(need)}</span>
      </div>
    </div>
  );
}

// ── Wealth Map ────────────────────────────────────────────────────────────────
function WMCard({ label, sub, value, type }) {
  const bdr = WMC[type] || WMC.nonretire;
  return (
    <div style={{ border:`1.5px solid ${bdr}`, borderRadius:6, padding:"5px 9px", background:"#fff", minWidth:100, maxWidth:140, boxShadow:"0 1px 4px rgba(0,0,0,.06)", textAlign:"center" }}>
      <div style={{ fontSize:".6rem", fontWeight:700, color:bdr, lineHeight:1.2, marginBottom:2, textTransform:"uppercase", letterSpacing:".03em" }}>{label}</div>
      {sub && <div style={{ fontSize:".58rem", color:MU, marginBottom:3, lineHeight:1.2 }}>{sub}</div>}
      <div style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:700, fontSize:".8rem", color:bdr }}>{fmtK(Math.abs(value||0))}</div>
    </div>
  );
}

function PersonIcon({ name, color }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:4 }}>
      <svg width={44} height={58} viewBox="0 0 40 52" fill="none">
        <circle cx="20" cy="12" r="9" fill={color} opacity=".9" />
        <path d="M4 44c0-8.837 7.163-16 16-16s16 7.163 16 16" fill={color} opacity=".9" />
      </svg>
      <div style={{ fontSize:".7rem", fontWeight:700, color:TX, textAlign:"center", lineHeight:1.2 }}>{name}</div>
    </div>
  );
}

function WealthMap({ persons, allA, baseTotal, basePT, baseRT, baseTX, pension, pensionMo, ss, ssMo, totalNetAnnual }) {
  const totalBal = allA.reduce((s,a) => s+(a.balance||0), 0);
  const pColors  = [N, WMC.income, "#DB2777"];
  return (
    <div style={{ background:"#F8FAFF", border:`1px solid ${BD}`, borderRadius:12, padding:"1.1rem", overflowX:"auto" }}>
      <div style={{ display:"flex", gap:10, flexWrap:"wrap", marginBottom:".85rem", justifyContent:"center" }}>
        {[["Retirement Asset",WMC.retirement],["Non-Retirement",WMC.nonretire],["Income",WMC.income],["Gov't/Insurance",WMC.insurance]].map(([l,c]) => (
          <div key={l} style={{ display:"flex", alignItems:"center", gap:4, fontSize:".63rem", color:MU }}>
            <span style={{ width:9, height:9, border:`2px solid ${c}`, borderRadius:2, display:"inline-block", background:c+"22" }} />
            {l}
          </div>
        ))}
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr auto 1fr", gap:"1.25rem", alignItems:"center", minWidth:480 }}>
        {/* LEFT – Person 1 */}
        <div style={{ display:"flex", flexDirection:"column", gap:5, alignItems:"flex-end" }}>
          {persons.filter((_,i) => i===0).map(p => (
            <React.Fragment key={p.id}>
              <WMCard label={p.name} sub="Annual Salary" value={p.salary} type="income" />
              {p.accounts.map(a => (
                <WMCard key={a.id} label={a.label}
                  sub={a.taxType==="roth"?"Roth":a.taxType==="taxable"?"Taxable":"Pre-Tax"}
                  value={a.balance||0}
                  type={["401k","tira"].includes(a.type)?"retirement":a.type==="rira"?"retirement":"nonretire"} />
              ))}
            </React.Fragment>
          ))}
          <div style={{ fontSize:".7rem", color:MU, textAlign:"right", paddingTop:4, borderTop:`1px solid ${BD}`, width:"100%" }}>
            <span style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:700, color:WMC.income }}>{fmt(persons[0]?.salary||0)}/yr</span>
          </div>
        </div>
        {/* CENTER */}
        <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:8, minWidth:130 }}>
          <div style={{ fontSize:".6rem", color:MU, fontWeight:700, textTransform:"uppercase", letterSpacing:".05em" }}>Household</div>
          <div style={{ display:"flex", gap:16 }}>
            {persons.map((p,i) => <PersonIcon key={p.id} name={p.name} color={pColors[i%3]} />)}
          </div>
          <div style={{ background:N, color:"#fff", borderRadius:8, padding:"7px 14px", textAlign:"center", width:"100%" }}>
            <div style={{ fontSize:".58rem", fontWeight:600, textTransform:"uppercase", letterSpacing:".05em", opacity:.7 }}>Current Portfolio</div>
            <div style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:700, fontSize:".95rem", marginTop:1 }}>{fmtK(totalBal)}</div>
          </div>
          <div style={{ background:GR, color:"#fff", borderRadius:8, padding:"7px 14px", textAlign:"center", width:"100%" }}>
            <div style={{ fontSize:".58rem", fontWeight:600, textTransform:"uppercase", letterSpacing:".05em", opacity:.8 }}>At Retirement</div>
            <div style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:700, fontSize:".95rem", marginTop:1 }}>{fmtK(baseTotal)}</div>
            <div style={{ fontSize:".6rem", opacity:.8 }}>{fmt(totalNetAnnual/12)}/mo net</div>
          </div>
        </div>
        {/* RIGHT – Person 2 or Pension/SS */}
        <div style={{ display:"flex", flexDirection:"column", gap:5, alignItems:"flex-start" }}>
          {persons.length > 1 ? (
            persons.filter((_,i) => i>0).map(p => (
              <React.Fragment key={p.id}>
                <WMCard label={p.name} sub="Annual Salary" value={p.salary} type="income" />
                {p.accounts.map(a => (
                  <WMCard key={a.id} label={a.label}
                    sub={a.taxType==="roth"?"Roth":a.taxType==="taxable"?"Taxable":"Pre-Tax"}
                    value={a.balance||0}
                    type={["401k","tira"].includes(a.type)?"retirement":a.type==="rira"?"retirement":"nonretire"} />
                ))}
                <div style={{ fontSize:".7rem", color:MU, paddingTop:4, borderTop:`1px solid ${BD}`, width:"100%" }}>
                  <span style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:700, color:WMC.income }}>{fmt(p.salary)}/yr</span>
                </div>
              </React.Fragment>
            ))
          ) : (
            <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
              {pension.on && <WMCard label="Pension" sub={`${pension.cola}% COLA · Age ${pension.startAge}`} value={pensionMo*12} type="insurance" />}
              {ss.on      && <WMCard label="Social Security" sub={`${ss.cola}% COLA · Age ${ss.startAge}`}   value={ssMo*12}      type="insurance" />}
              {!pension.on && !ss.on && <div style={{ fontSize:".7rem", color:MU, fontStyle:"italic", padding:8 }}>Enable pension or SS to display here</div>}
            </div>
          )}
        </div>
      </div>
      <div style={{ borderTop:`1px solid ${BD}`, marginTop:"1rem", paddingTop:".75rem", display:"flex", justifyContent:"center", gap:"1.25rem", flexWrap:"wrap" }}>
        {[
          { l:"Household Income", v:fmt(persons.reduce((s,p)=>s+p.salary,0))+"/yr", c:WMC.income },
          { l:"Pre-Tax Balance",  v:fmtK(basePT),   c:WMC.retirement },
          { l:"Roth Balance",     v:fmtK(baseRT),   c:GR },
          { l:"Taxable Balance",  v:fmtK(baseTX),   c:AM },
          { l:"Total Balance",    v:fmtK(totalBal), c:N },
        ].map(s => (
          <div key={s.l} style={{ textAlign:"center" }}>
            <div style={{ fontSize:".6rem", color:MU, textTransform:"uppercase", letterSpacing:".04em" }}>{s.l}</div>
            <div style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:700, color:s.c, fontSize:".85rem", marginTop:2 }}>{s.v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── What-If row (top-level component — NOT nested inside App) ─────────────────
function WIHead() {
  return (
    <div style={{ display:"grid", gridTemplateColumns:"1.5fr 1.3fr 1.3fr .9fr .8fr", gap:".4rem", padding:".48rem .8rem", background:N, borderRadius:7, marginBottom:".35rem" }}>
      {["Scenario","Portfolio","Net Monthly","vs. Today","Goal?"].map(h => (
        <span key={h} style={{ fontSize:".63rem", fontWeight:700, color:"rgba(255,255,255,.8)", textTransform:"uppercase", letterSpacing:".04em" }}>{h}</span>
      ))}
    </div>
  );
}

function WIRow({ label, portfolio, income, isBase, baseIncome, mode, goalMonthly }) {
  const dInc      = income - baseIncome;
  const meetsGoal = mode==="backward" && goalMonthly>0 && income/12 >= goalMonthly;
  return (
    <div style={{
      display:"grid", gridTemplateColumns:"1.5fr 1.3fr 1.3fr .9fr .8fr",
      gap:".4rem", padding:".52rem .8rem", borderRadius:7, marginBottom:".3rem",
      background: isBase ? "#EFF6FF" : meetsGoal ? "#F0FDF4" : "#fff",
      border: `1px solid ${isBase ? B+"55" : meetsGoal ? GR+"44" : BD}`,
    }}>
      <span style={{ fontWeight:isBase?700:500, color:isBase?B:TX, fontSize:".78rem" }}>
        {label}
        {meetsGoal && <span style={{ marginLeft:5, fontSize:".62rem", color:GR, fontWeight:700 }}> ✓ GOAL</span>}
      </span>
      <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:".78rem", color:TX }}>{fmtK(portfolio)}</span>
      <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:".78rem", color:meetsGoal?GR:TX }}>{fmt(income/12)}/mo</span>
      <span style={{ fontSize:".73rem", fontWeight:700, color:isBase?MU:dInc>0?GR:RD }}>
        {isBase ? "—" : (dInc>0?"+":"")+fmt(dInc/12)+"/mo"}
      </span>
      <span style={{ fontSize:".7rem", color:meetsGoal?GR:MU }}>
        {mode==="backward" && goalMonthly>0
          ? meetsGoal ? "✓ Met" : "−"+fmt(goalMonthly - income/12)+"/mo"
          : "—"}
      </span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
export default function App() {
  const [mode,     setMode]     = useState("forward");
  const [persons,  setPersons]  = useState(() => [mkPerson(1)]);
  const [wRate,    setWRate]    = useState(4);
  const [taxRate,  setTaxRate]  = useState(22);
  const [ltcgRate, setLtcgRate] = useState(15);
  const [chartTab, setChartTab] = useState("accum");
  const [pension,  setPension]  = useState({ on:false, monthly:2000, startAge:65, cola:2 });
  const [ss,       setSS]       = useState({ on:false, monthly:1800, startAge:67, cola:2.5 });

  const [goalMode,      setGoalMode]      = useState("estimate");
  const [goalManual,    setGoalManual]    = useState(80000);
  const [goalHousing,   setGoalHousing]   = useState(1800);
  const [goalHealth,    setGoalHealth]    = useState(500);
  const [goalTravel,    setGoalTravel]    = useState(500);
  const [goalOther,     setGoalOther]     = useState(300);
  const [goalInflation, setGoalInflation] = useState(2.5);

  const [wiLumpSum, setWiLumpSum] = useState(25000);
  const [wiTab,     setWiTab]     = useState("monthly");

  // ── CRUD ──────────────────────────────────────────────────────────────────
  const updP = (id, p) => setPersons(ps => ps.map(x => x.id===id ? p : x));
  const delP = (id)    => setPersons(ps => ps.filter(x => x.id!==id));
  const addP = ()      => setPersons(ps => [...ps, mkPerson(ps.length+1)]);

  const updA = useCallback((pid, aid, a) =>
    setPersons(ps => ps.map(p => p.id!==pid ? p : { ...p, accounts:p.accounts.map(x => x.id===aid?a:x) })), []);
  const delA = useCallback((pid, aid) =>
    setPersons(ps => ps.map(p => p.id!==pid ? p : { ...p, accounts:p.accounts.filter(x => x.id!==aid) })), []);
  const addA = (pid, type) => {
    const a = mkAcct(type, pid);
    setPersons(ps => ps.map(p => p.id!==pid ? p : { ...p, accounts:[...p.accounts, a] }));
  };

  // ── Derived ───────────────────────────────────────────────────────────────
  const allA       = useMemo(() => persons.flatMap(p => p.accounts.map(a => ({ ...a, _p:p }))), [persons]);
  const totalSal   = persons.reduce((s,p) => s+p.salary, 0);
  const maxRetYrs  = Math.max(...persons.map(p => Math.max(p.retireAge-p.age, 1)));
  const maxLifeYrs = Math.max(...persons.map(p => Math.max(p.lifeExp-p.age, maxRetYrs+2)));
  const p0         = persons[0];

  const streams = useMemo(() => {
    let pt=0, rt=0, tx=0;
    allA.forEach(a => { const s=acctStreams(a,a._p.salary); pt+=s.pt; rt+=s.rt; tx+=s.tx; });
    return { pt, rt, tx, total:pt+rt+tx };
  }, [allA]);

  const savRate = totalSal > 0 ? (streams.total*12/totalSal)*100 : 0;

  // ── Accumulation rows ─────────────────────────────────────────────────────
  const accumRows = useMemo(() => {
    const N    = maxRetYrs;
    const rows = Array.from({ length:N+1 }, (_, y) => ({ year:y }));
    const ptY  = new Array(N+1).fill(0);
    const rtY  = new Array(N+1).fill(0);
    const txY  = new Array(N+1).fill(0);
    allA.forEach(a => {
      const s   = acctStreams(a, a._p.salary);
      const g   = a.growth || 7;
      const tot = Math.max(s.total, 0.001);
      const b   = a.balance || 0;
      const ptA = projectYears(b*(s.pt/tot),  s.pt,  g, N);
      const rtA = projectYears(b*(s.rt/tot),  s.rt,  g, N);
      const txA = projectYears(b*(s.tx/tot),  s.tx,  g, N);
      ptA.forEach((v,y) => { rows[y][`pt_${a.id}`]=v; ptY[y]+=v; });
      rtA.forEach((v,y) => { rows[y][`rt_${a.id}`]=v; rtY[y]+=v; });
      txA.forEach((v,y) => { rows[y][`tx_${a.id}`]=v; txY[y]+=v; });
    });
    rows.forEach((r, y) => { r.PT=ptY[y]; r.RT=rtY[y]; r.TX=txY[y]; r.TOT=ptY[y]+rtY[y]+txY[y]; });
    return rows;
  }, [allA, maxRetYrs]);

  const last      = accumRows[accumRows.length-1] || {};
  const basePT    = last.PT || 0;
  const baseRT    = last.RT || 0;
  const baseTX    = last.TX || 0;
  const baseTotal = last.TOT || 0;

  // ── Lifetime rows ─────────────────────────────────────────────────────────
  const lifeRows = useMemo(() => {
    if (!accumRows.length) return [];
    const retY = maxRetYrs;
    const totY = Math.max(maxLifeYrs, retY+2);
    const rows = [];
    for (let y=0; y<=retY; y++) {
      const r = accumRows[y] || {};
      rows.push({ age:p0.age+y, PT:r.PT||0, RT:r.RT||0, TX:r.TX||0, TOT:r.TOT||0 });
    }
    const dY  = totY - retY;
    const ptD = projectDrawdown(basePT, wRate*(basePT/Math.max(baseTotal,1)), 5, dY);
    const rtD = projectDrawdown(baseRT, wRate*(baseRT/Math.max(baseTotal,1)), 5, dY);
    const txD = projectDrawdown(baseTX, wRate*(baseTX/Math.max(baseTotal,1)), 5, dY);
    for (let k=1; k<=dY; k++) {
      rows.push({ age:p0.age+retY+k, PT:ptD[k]||0, RT:rtD[k]||0, TX:txD[k]||0, TOT:(ptD[k]||0)+(rtD[k]||0)+(txD[k]||0) });
    }
    return rows;
  }, [accumRows, p0, wRate, basePT, baseRT, baseTX, baseTotal, maxRetYrs, maxLifeYrs]);

  // ── Income ────────────────────────────────────────────────────────────────
  const pensionMo = pension.on ? pension.monthly * Math.pow(1+pension.cola/100, Math.max(0, pension.startAge-p0.age)) : 0;
  const ssMo      = ss.on      ? ss.monthly      * Math.pow(1+ss.cola/100,      Math.max(0, ss.startAge-p0.age))      : 0;

  const portIncome = useMemo(() => {
    const tot = baseTotal;
    if (!tot) return { pt:0, rt:0, tx:0, net:0 };
    const gPT = tot*(wRate/100)*(basePT/tot);
    const gRT = tot*(wRate/100)*(baseRT/tot);
    const gTX = tot*(wRate/100)*(baseTX/tot);
    const nPT = gPT*(1-taxRate/100);
    const nRT = gRT;
    const nTX = gTX*(1-ltcgRate/100);
    return { pt:nPT, rt:nRT, tx:nTX, net:nPT+nRT+nTX };
  }, [baseTotal, basePT, baseRT, baseTX, wRate, taxRate, ltcgRate]);

  const totalNetAnnual  = portIncome.net + pensionMo*12 + ssMo*12;
  const totalNetMonthly = totalNetAnnual / 12;

  // ── Goal income ───────────────────────────────────────────────────────────
  const goalEstimated = useMemo(() => {
    if (goalMode==="manual") return goalManual;
    const monthly   = goalHousing + goalHealth + goalTravel + goalOther;
    const annualNet = monthly * 12;
    return annualNet * Math.pow(1+goalInflation/100, maxRetYrs);
  }, [goalMode, goalManual, goalHousing, goalHealth, goalTravel, goalOther, goalInflation, maxRetYrs]);

  const blendedTax    = (basePT+baseTX > 0)
    ? ((basePT*taxRate/100 + baseTX*ltcgRate/100) / (basePT+baseTX+Math.max(baseRT,1)))*100
    : taxRate;
  const grossNeeded   = Math.max(0, goalEstimated - (pensionMo+ssMo)*12) / (1 - blendedTax/100*0.5);
  const reqPortfolio  = wRate > 0 ? grossNeeded/(wRate/100) : 0;
  const gap           = reqPortfolio - baseTotal;
  const onTrack       = gap <= 0;

  const currentBal       = allA.reduce((s,a) => s+(a.balance||0), 0);
  const reqMonthly       = requiredMonthlySaving(reqPortfolio, currentBal, 7, maxRetYrs);
  const additionalNeeded = Math.max(0, reqMonthly - streams.total);

  // ── What-If engine ────────────────────────────────────────────────────────
  const scenarioResult = useCallback((extraMonthly, lumpSum, growthAdj, retireAgeOverride) => {
    const yrs = retireAgeOverride ? Math.max(retireAgeOverride-p0.age, 1) : maxRetYrs;
    const g   = 7 + (growthAdj||0);
    const tot = Math.max(baseTotal, 1);
    const ptP = projectYears(basePT+lumpSum*(basePT/tot), streams.pt+extraMonthly*0.6, g, yrs);
    const rtP = projectYears(baseRT+lumpSum*(baseRT/tot), streams.rt+extraMonthly*0.3, g, yrs);
    const txP = projectYears(baseTX+lumpSum*(baseTX/tot), streams.tx+extraMonthly*0.1, g, yrs);
    const port = (ptP[yrs]||0) + (rtP[yrs]||0) + (txP[yrs]||0);
    const inc  = port*(wRate/100)*(1-blendedTax/100*0.5) + (pensionMo+ssMo)*12;
    return { portfolio:port, income:inc };
  }, [basePT, baseRT, baseTX, baseTotal, streams, maxRetYrs, wRate, blendedTax, pensionMo, ssMo, p0.age]);

  const baseScenario = useMemo(() => scenarioResult(0,0,0,null), [scenarioResult]);

  const whatIfMonthly = useMemo(() =>
    [0,100,200,300,500,750,1000,1500,2000].map(extra => {
      const r = scenarioResult(extra, 0, 0, null);
      return { extra, portfolio:r.portfolio, income:r.income };
    }), [scenarioResult]);

  const whatIfLumpSum = useMemo(() =>
    [0,5000,10000,25000,50000,100000,250000].map(lump => {
      const r = scenarioResult(0, lump, 0, null);
      return { lump, portfolio:r.portfolio, income:r.income };
    }), [scenarioResult]);

  const whatIfRetireAge = useMemo(() => {
    const base = p0.retireAge;
    return [base-5, base-2, base, base+2, base+5, base+8, base+10]
      .filter(a => a > p0.age)
      .map(age => {
        const r = scenarioResult(0, 0, 0, age);
        return { age, portfolio:r.portfolio, income:r.income };
      });
  }, [scenarioResult, p0.retireAge, p0.age]);

  const whatIfGrowth = useMemo(() =>
    [-2,-1,0,1,2,3].map(adj => {
      const r = scenarioResult(0, 0, adj, null);
      return { adj, rate:7+adj, portfolio:r.portfolio, income:r.income };
    }), [scenarioResult]);

  const whatIfCombined = useMemo(() =>
    [
      { label:"Current Plan",         extra:0,    lump:0     },
      { label:"+$200/mo",             extra:200,  lump:0     },
      { label:"Invest $10K cash",     extra:0,    lump:10000 },
      { label:"+$200/mo + $10K",      extra:200,  lump:10000 },
      { label:"+$500/mo",             extra:500,  lump:0     },
      { label:"Invest $25K cash",     extra:0,    lump:25000 },
      { label:"+$500/mo + $25K",      extra:500,  lump:25000 },
      { label:"+$1,000/mo + $50K",    extra:1000, lump:50000 },
    ].map(c => {
      const r = scenarioResult(c.extra, c.lump, 0, null);
      return { ...c, portfolio:r.portfolio, income:r.income };
    }), [scenarioResult]);

  // ── Chart ─────────────────────────────────────────────────────────────────
  const chartRows = chartTab==="accum" ? accumRows : lifeRows;
  const xKey      = chartTab==="accum" ? "year" : "age";
  const xFmt      = (v) => chartTab==="accum" ? `${CY+Number(v)}` : `Age ${v}`;
  const xInt      = Math.max(1, Math.floor((chartTab==="accum" ? maxRetYrs : maxLifeYrs)/8));

  // ── Shared what-if row props ───────────────────────────────────────────────
  const wiShared = { baseIncome:baseScenario.income, mode, goalMonthly:goalEstimated/12 };

  // ── CSS ───────────────────────────────────────────────────────────────────
  const css = `
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&family=JetBrains+Mono:wght@400;500;600&display=swap');
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    body{background:#EEF2FA;color:${TX};font-family:'DM Sans',sans-serif;font-size:15px;min-height:100vh}
    .app{max-width:1380px;margin:0 auto;padding:0 1.5rem 5rem}
    .topbar{background:${N};position:sticky;top:0;z-index:200;box-shadow:0 2px 16px rgba(0,38,119,.3)}
    .topbar-inner{max-width:1380px;margin:0 auto;padding:.7rem 1.5rem;display:flex;align-items:center;gap:1rem;justify-content:space-between;flex-wrap:wrap}
    .logo-box{display:flex;align-items:center;gap:.75rem}
    .logo-sq{width:34px;height:34px;background:#fff;border-radius:6px;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:14px;color:${N};flex-shrink:0}
    .logo-text{color:#fff;font-weight:700;font-size:1rem}
    .logo-sub{color:rgba(255,255,255,.5);font-size:.72rem;margin-top:1px}
    .mode-toggle{display:flex;background:rgba(255,255,255,.12);border-radius:8px;overflow:hidden;border:1px solid rgba(255,255,255,.2)}
    .mode-btn{background:none;border:none;color:rgba(255,255,255,.65);padding:.45rem 1.1rem;font-size:.82rem;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif;transition:all .15s;white-space:nowrap}
    .mode-btn.active{background:#fff;color:${N}}
    .layout{display:grid;grid-template-columns:400px 1fr;gap:1.5rem;margin-top:1.5rem;align-items:start}
    @media(max-width:1024px){.layout{grid-template-columns:1fr}}
    .left-col,.right-col{display:flex;flex-direction:column;gap:0}
    .ni{display:flex;align-items:stretch;background:#fff;border:1.5px solid ${BD};border-radius:7px;overflow:hidden;transition:border-color .15s}
    .ni:focus-within{border-color:${B}}
    .ni-a,.ni-b{padding:0 .55rem;background:${S};color:${MU};font-family:'JetBrains Mono',monospace;font-size:.75rem;display:flex;align-items:center;white-space:nowrap;flex-shrink:0}
    .ni-a{border-right:1.5px solid ${BD}}.ni-b{border-left:1.5px solid ${BD}}
    .ni input{background:transparent;border:none;outline:none;color:${TX};font-family:'JetBrains Mono',monospace;font-size:.88rem;padding:.42rem .55rem;width:100%;min-width:0;font-weight:500;-moz-appearance:textfield}
    .ni input::-webkit-outer-spin-button,.ni input::-webkit-inner-spin-button{-webkit-appearance:none}
    input[type=range]{-webkit-appearance:none;width:100%;height:4px;border-radius:2px;outline:none;cursor:pointer;background:linear-gradient(to right,var(--c,${B}) 0%,var(--c,${B}) var(--p,50%),${BD} var(--p,50%),${BD} 100%)}
    input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:16px;height:16px;border-radius:50%;background:var(--c,${B});border:2.5px solid #fff;box-shadow:0 0 0 2px var(--c,${B})44,0 1px 4px rgba(0,0,0,.1)}
    input[type=range]::-webkit-slider-thumb:hover{box-shadow:0 0 0 4px var(--c,${B})33}
    label.fld{display:flex;flex-direction:column;gap:.3rem;font-size:.7rem;color:${MU};font-weight:600;letter-spacing:.03em;text-transform:uppercase}
    .hint{font-size:.68rem;color:${MU};margin-top:.18rem;text-transform:none;letter-spacing:0}
    .seg{display:inline-flex;background:${S};border:1.5px solid ${BD};border-radius:7px;overflow:hidden}
    .sb{background:none;border:none;color:${MU};padding:.28rem .65rem;font-size:.74rem;cursor:pointer;font-family:'DM Sans',sans-serif;font-weight:500;transition:all .15s;white-space:nowrap}
    .sb.on{background:${N};color:#fff}
    .sb:not(.on):hover{background:#E8EDF8;color:${TX}}
    .btn-ghost{background:transparent;border:1.5px solid ${BD};color:${MU};border-radius:7px;padding:.35rem .75rem;font-size:.75rem;font-weight:500;cursor:pointer;font-family:'DM Sans',sans-serif;transition:all .15s}
    .btn-ghost:hover{border-color:${B};color:${B}}
    .btn-rm{background:transparent;border:1.5px solid #FECACA;color:${RD};border-radius:6px;padding:.2rem .6rem;font-size:.7rem;cursor:pointer;transition:all .15s;font-family:'DM Sans',sans-serif}
    .btn-rm:hover{background:#FEF2F2}
    .ac{background:#fff;border:1.5px solid ${BD};border-top:3px solid var(--c,${B});border-radius:10px;padding:1rem;transition:box-shadow .15s}
    .ac:hover{box-shadow:0 3px 12px rgba(0,38,119,.08)}
    .ac-top{display:flex;align-items:center;gap:.45rem;margin-bottom:.8rem;padding-bottom:.7rem;border-bottom:1px solid ${BD}}
    .ac-name{font-weight:700;font-size:.85rem;color:${N}}
    .ac-rm{background:none;border:none;color:${MU};cursor:pointer;font-size:.78rem;opacity:.4;transition:opacity .15s;padding:1px 4px;margin-left:auto}
    .ac-rm:hover{opacity:1;color:${RD}}
    .acf{display:grid;grid-template-columns:1fr 1fr;gap:.55rem}
    .full{grid-column:1/-1}
    .sb2{background:${S};border:1.5px solid ${BD};border-radius:8px;padding:.75rem}
    .sb2-hdr{display:flex;align-items:center;justify-content:space-between;margin-bottom:.55rem}
    .stat{background:#fff;border:1.5px solid ${BD};border-radius:9px;padding:.85rem 1rem}
    .sl{font-size:.67rem;color:${MU};text-transform:uppercase;letter-spacing:.05em;font-weight:600}
    .sv{font-family:'JetBrains Mono',monospace;font-size:1.15rem;font-weight:700;margin-top:.22rem;color:${TX}}
    .sbar2{height:3px;background:${BD};border-radius:2px;margin-top:.45rem;overflow:hidden}
    .sbar2f{height:100%;border-radius:2px;transition:width .4s}
    .chart-tabs{display:flex;background:${S};border:1.5px solid ${BD};border-radius:7px;overflow:hidden}
    .chart-tab{background:none;border:none;color:${MU};padding:.35rem .9rem;font-size:.76rem;cursor:pointer;font-family:'DM Sans',sans-serif;font-weight:500;transition:all .15s}
    .chart-tab.on{background:${N};color:#fff}
    .info{background:${S};border:1px solid ${BD};border-radius:8px;padding:.7rem 1rem;font-size:.76rem;color:${MU};line-height:1.6}
    .warn{background:#FEF2F2;border:1.5px solid #FECACA;border-radius:8px;padding:.7rem 1rem;font-size:.76rem;color:#991B1B;display:flex;gap:.45rem;line-height:1.5}
    .success{background:#F0FDF4;border:1.5px solid #BBF7D0;border-radius:8px;padding:.7rem 1rem;font-size:.76rem;color:#14532D;display:flex;gap:.45rem;line-height:1.5}
    .grand{background:${N};border-radius:12px;padding:1.25rem 1.5rem;display:grid;grid-template-columns:repeat(3,1fr);gap:1rem}
    @media(max-width:600px){.grand{grid-template-columns:1fr 1fr}}
    .gl{font-size:.67rem;color:rgba(255,255,255,.6);text-transform:uppercase;letter-spacing:.06em;font-weight:600}
    .gv{font-family:'JetBrains Mono',monospace;font-size:1.4rem;font-weight:700;color:#fff;margin-top:.2rem}
    .gs{font-size:.7rem;color:rgba(255,255,255,.45);margin-top:.15rem}
    .ib{border-radius:10px;padding:1rem 1.1rem;border:1.5px solid}
    .ib-l{font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em}
    .ib-g{font-size:.75rem;color:${MU};margin-top:.25rem}
    .ib-n{font-family:'JetBrains Mono',monospace;font-size:1.25rem;font-weight:700;margin-top:.1rem}
    .ib-s{font-size:.67rem;color:${MU};margin-top:.15rem}
    .eic{background:#fff;border:1.5px solid ${BD};border-radius:10px;padding:1rem}
    .eic-hdr{display:flex;align-items:center;gap:.7rem;margin-bottom:.75rem}
    .eic-f{display:grid;grid-template-columns:1fr 1fr 1fr;gap:.55rem}
    .psec{margin-bottom:1.2rem}
    .pname{font-weight:700;font-size:.88rem;color:${N};display:flex;align-items:center;gap:.4rem;margin-bottom:.65rem}
    .pdot{width:8px;height:8px;border-radius:50%}
    .pc-name{background:transparent;border:none;border-bottom:2px solid ${BD};color:${N};font-family:'DM Sans',sans-serif;font-size:1.1rem;font-weight:700;padding:.2rem 0;outline:none;flex:1;transition:border-color .2s;width:100%}
    .pc-name:focus{border-color:${B}}
    .pfields{display:grid;grid-template-columns:1fr 1fr;gap:.65rem;margin-top:.9rem}
    .add-row{display:flex;gap:.4rem;flex-wrap:wrap;margin-top:.65rem;align-items:center}
    .add-lbl{font-size:.68rem;color:${MU};text-transform:uppercase;letter-spacing:.04em;font-weight:600}
    .g2{display:grid;grid-template-columns:1fr 1fr;gap:.75rem}
    .gAuto{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:.85rem}
    @media(max-width:680px){.g2,.gAuto{grid-template-columns:1fr}}
    .wi-tabs{display:flex;gap:.3rem;flex-wrap:wrap;padding:.3rem;background:${S};border-radius:9px;border:1px solid ${BD};margin-bottom:1rem}
    .wi-tab{flex:1 1 auto;padding:.38rem .7rem;border-radius:7px;border:none;font-family:'DM Sans',sans-serif;font-weight:600;font-size:.74rem;cursor:pointer;transition:all .15s}
    .footer{text-align:center;color:${MU};font-size:.68rem;margin-top:1.5rem;padding:1.25rem;background:#fff;border:1px solid ${BD};border-radius:10px;line-height:1.8}
  `;

  return (
    <>
      <style>{css}</style>

      {/* Top Bar */}
      <div className="topbar">
        <div className="topbar-inner">
          <div className="logo-box">
            <div className="logo-sq">RP</div>
            <div>
              <div className="logo-text">Retirement Planner</div>
              <div className="logo-sub">All-in-one planning tool</div>
            </div>
          </div>
          <div className="mode-toggle">
            <button className={"mode-btn" + (mode==="forward"?" active":"")} onClick={() => setMode("forward")}>📈 What Can I Afford?</button>
            <button className={"mode-btn" + (mode==="backward"?" active":"")} onClick={() => setMode("backward")}>🎯 What Do I Need?</button>
          </div>
          <div style={{ color:"rgba(255,255,255,.4)", fontSize:".72rem", textAlign:"right" }}>Personal use only<br/>Not financial advice</div>
        </div>
      </div>

      <div style={{ background:"#EEF2FA", minHeight:"100vh", paddingBottom:"3rem" }}>
      <div className="app">

        {/* Mode banner */}
        <div style={{ background:"#fff", border:`1px solid ${BD}`, borderRadius:10, padding:".9rem 1.25rem", marginTop:"1.25rem", marginBottom:"-.25rem", display:"flex", alignItems:"center", gap:"1rem", flexWrap:"wrap" }}>
          <div style={{ flex:1 }}>
            <div style={{ fontWeight:700, fontSize:"1rem", color:N }}>
              {mode==="forward" ? "Forward Planning — What Can I Afford?" : "Backward Planning — What Do I Need?"}
            </div>
            <div style={{ fontSize:".78rem", color:MU, marginTop:2 }}>
              {mode==="forward"
                ? "Enter everything you have. See exactly what retirement looks like and what changes would mean."
                : "Start with your income goal. We show what it requires, what you have, and what to do differently."}
            </div>
          </div>
          <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
            <div className="stat" style={{ padding:".6rem 1rem", textAlign:"center" }}>
              <div className="sl">Projected Portfolio</div>
              <div className="sv" style={{ color:N, fontSize:"1.1rem" }}>{fmtK(baseTotal)}</div>
            </div>
            <div className="stat" style={{ padding:".6rem 1rem", textAlign:"center", borderColor:onTrack?GR+"55":RD+"55", background:onTrack?"#F0FDF4":"#FEF2F2" }}>
              <div className="sl">{mode==="forward" ? "Net Monthly Income" : "Gap"}</div>
              <div className="sv" style={{ color:onTrack?GR:RD, fontSize:"1.1rem" }}>
                {mode==="forward" ? fmt(totalNetMonthly) : onTrack ? "On Track" : "−"+fmtK(Math.abs(gap))}
              </div>
            </div>
          </div>
        </div>

        <div className="layout">

        {/* ═══ LEFT COLUMN ═══ */}
        <div className="left-col">

          {/* Profiles */}
          <Card title="Your Profile" accent={B}
            right={persons.length<3 && <button className="btn-ghost" style={{ fontSize:".72rem", padding:".25rem .65rem" }} onClick={addP}>+ Add Person</button>}>
            {persons.map((p, pi) => (
              <div key={p.id} style={{ marginBottom:pi<persons.length-1?"1rem":0 }}>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                  <input className="pc-name" value={p.name} onChange={e => updP(p.id, {...p, name:e.target.value})} />
                  {persons.length>1 && <button className="btn-rm" onClick={() => delP(p.id)}>✕</button>}
                </div>
                <div className="pfields">
                  <label className="fld">Age<NI value={p.age} min={18} max={79} step={1} onChange={v => updP(p.id, {...p, age:cl(v,18,79)})}/></label>
                  <label className="fld">Retire At<NI value={p.retireAge} min={p.age+1} max={80} step={1} suffix="yrs" onChange={v => updP(p.id, {...p, retireAge:cl(v,p.age+1,80)})}/></label>
                  <label className="fld">Life Expect.<NI value={p.lifeExp} min={p.retireAge+1} max={110} step={1} suffix="yrs" onChange={v => updP(p.id, {...p, lifeExp:cl(v,p.retireAge+1,110)})}/></label>
                  <label className="fld">Annual Salary<NI value={p.salary} min={0} step={1000} prefix="$" onChange={v => updP(p.id, {...p, salary:v})}/></label>
                </div>
              </div>
            ))}
          </Card>

          {/* Accounts */}
          <Card title="Investment Accounts" accent={PT}>
            {persons.map((p, pi) => (
              <div className="psec" key={p.id}>
                {persons.length>1 && (
                  <div className="pname">
                    <span className="pdot" style={{ background:[B,"#7C3AED","#EC4899"][pi%3] }}/>
                    {p.name}
                  </div>
                )}
                <div style={{ display:"flex", flexDirection:"column", gap:".75rem" }}>
                  {p.accounts.map(a => {
                    const cfg = ATYPES[a.type];
                    const s   = acctStreams(a, p.salary);
                    const empPT = a.empPreTaxMode==="pct" ? (p.salary/12)*(a.empPreTaxPct/100) : a.empPreTaxDollar;
                    const empRT = a.empRothMode==="pct"   ? (p.salary/12)*(a.empRothPct/100)   : a.empRothDollar;
                    const erAmt = (s.pt+s.rt) - empPT - empRT;
                    return (
                      <div className="ac" key={a.id} style={{ "--c":cfg.color }}>
                        <div className="ac-top">
                          <span style={{ width:8, height:8, borderRadius:2, background:cfg.color, flexShrink:0, display:"inline-block" }}/>
                          <span className="ac-name">{a.label}</span>
                          <button className="ac-rm" onClick={() => delA(p.id, a.id)}>✕</button>
                        </div>
                        {a.type==="401k" ? (
                          <div className="acf">
                            <label className="fld full">Balance<NI value={a.balance} min={0} step={1000} prefix="$" onChange={v => updA(p.id, a.id, {...a, balance:v})}/></label>
                            <div className="sb2 full">
                              <div className="sb2-hdr">
                                <span style={{ fontSize:".68rem", fontWeight:700, color:N, textTransform:"uppercase", letterSpacing:".04em" }}>Your Contributions</span>
                              </div>
                              <div className="g2">
                                <div>
                                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:".3rem" }}>
                                    <span style={{ fontSize:".65rem", fontWeight:700, color:PT, textTransform:"uppercase", letterSpacing:".04em", background:PT+"18", padding:"1px 6px", borderRadius:3 }}>Pre-Tax</span>
                                    <Seg opts={[{v:"pct",l:"%"},{v:"dollar",l:"$"}]} val={a.empPreTaxMode} onChange={v => updA(p.id, a.id, {...a, empPreTaxMode:v})} sm />
                                  </div>
                                  {a.empPreTaxMode==="pct"
                                    ? <SlN value={a.empPreTaxPct}    min={0} max={50}   step={.5} suffix="% sal"  color={PT} onChange={v => updA(p.id, a.id, {...a, empPreTaxPct:v})}/>
                                    : <SlN value={a.empPreTaxDollar} min={0} max={3000} step={25} prefix="$" suffix="/mo" color={PT} onChange={v => updA(p.id, a.id, {...a, empPreTaxDollar:v})}/>}
                                  <div className="hint">approx {fmt(empPT)}/mo</div>
                                </div>
                                <div>
                                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:".3rem" }}>
                                    <span style={{ fontSize:".65rem", fontWeight:700, color:RT, textTransform:"uppercase", letterSpacing:".04em", background:RT+"18", padding:"1px 6px", borderRadius:3 }}>Roth</span>
                                    <Seg opts={[{v:"pct",l:"%"},{v:"dollar",l:"$"}]} val={a.empRothMode} onChange={v => updA(p.id, a.id, {...a, empRothMode:v})} sm />
                                  </div>
                                  {a.empRothMode==="pct"
                                    ? <SlN value={a.empRothPct}    min={0} max={50}   step={.5} suffix="% sal"  color={RT} onChange={v => updA(p.id, a.id, {...a, empRothPct:v})}/>
                                    : <SlN value={a.empRothDollar} min={0} max={3000} step={25} prefix="$" suffix="/mo" color={RT} onChange={v => updA(p.id, a.id, {...a, empRothDollar:v})}/>}
                                  <div className="hint">approx {fmt(empRT)}/mo</div>
                                </div>
                              </div>
                              <div className="hint" style={{ marginTop:".4rem", paddingTop:".4rem", borderTop:`1px solid ${BD}` }}>
                                Total employee: <strong>{fmt(empPT+empRT)}/mo</strong>
                              </div>
                            </div>
                            <div className="sb2 full">
                              <div className="sb2-hdr">
                                <span style={{ fontSize:".68rem", fontWeight:700, color:N, textTransform:"uppercase", letterSpacing:".04em" }}>Employer Match</span>
                                <div style={{ display:"flex", gap:".35rem", alignItems:"center" }}>
                                  <span style={{ fontSize:".65rem", color:MU }}>Treat as:</span>
                                  <Seg opts={[{v:"pretax",l:"Pre-Tax"},{v:"roth",l:"Roth"}]} val={a.erTax} onChange={v => updA(p.id, a.id, {...a, erTax:v})} sm />
                                </div>
                              </div>
                              <div className="g2">
                                <label className="fld">Match Rate<NI value={a.erPct} min={0} max={200} step={5} suffix="%" onChange={v => updA(p.id, a.id, {...a, erPct:v})}/></label>
                                <label className="fld">Up to<NI value={a.erCap} min={0} max={20} step={.5} suffix="% sal" onChange={v => updA(p.id, a.id, {...a, erCap:v})}/></label>
                              </div>
                              <div className="hint" style={{ marginTop:".35rem" }}>approx <strong>{fmt(Math.max(0,erAmt))}/mo</strong> employer ({a.erTax==="pretax"?"Pre-Tax":"Roth"})</div>
                            </div>
                            <label className="fld">Expected Return<NI value={a.growth} min={0} max={20} step={.1} suffix="%/yr" onChange={v => updA(p.id, a.id, {...a, growth:v})}/></label>
                          </div>
                        ) : (
                          <div className="acf">
                            {a.type!=="brok" && (
                              <div className="full">
                                <div style={{ fontSize:".68rem", color:MU, textTransform:"uppercase", letterSpacing:".04em", fontWeight:600, marginBottom:".3rem" }}>Tax Treatment</div>
                                <Seg opts={[{v:"pretax",l:"Pre-Tax"},{v:"roth",l:"Roth"}]} val={a.taxType} onChange={v => updA(p.id, a.id, {...a, taxType:v})}/>
                              </div>
                            )}
                            <label className="fld full">Balance<NI value={a.balance} min={0} step={1000} prefix="$" onChange={v => updA(p.id, a.id, {...a, balance:v})}/></label>
                            <label className="fld full">
                              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                                <span>Contribution</span>
                                <Seg opts={[{v:"dollar",l:"$/mo"},{v:"pct",l:"% sal"}]} val={a.mode} onChange={v => updA(p.id, a.id, {...a, mode:v})} sm />
                              </div>
                              {a.mode==="dollar"
                                ? <SlN value={a.contribDollar} min={0} max={3000} step={25} prefix="$" suffix="/mo"    color={cfg.color} onChange={v => updA(p.id, a.id, {...a, contribDollar:v})}/>
                                : <SlN value={a.contribPct}    min={0} max={50}   step={.5}              suffix="% sal" color={cfg.color} onChange={v => updA(p.id, a.id, {...a, contribPct:v})}/>}
                            </label>
                            <label className="fld full">Expected Return<NI value={a.growth} min={0} max={20} step={.1} suffix="%/yr" onChange={v => updA(p.id, a.id, {...a, growth:v})}/></label>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="add-row">
                  <span className="add-lbl">Add:</span>
                  {Object.entries(ATYPES).map(([type, cfg]) => (
                    <button key={type} className="btn-ghost" style={{ fontSize:".7rem", padding:".25rem .6rem" }} onClick={() => addA(p.id, type)}>+ {cfg.label}</button>
                  ))}
                </div>
              </div>
            ))}
          </Card>

          {/* Pension & SS */}
          <Card title="Pension and Social Security" accent={PS}>
            <div style={{ display:"flex", flexDirection:"column", gap:".85rem" }}>
              <div className="eic">
                <div className="eic-hdr">
                  <Toggle on={pension.on} onChange={v => setPension(s => ({...s, on:v}))}/>
                  <span style={{ fontWeight:700, fontSize:".88rem", color:N, marginLeft:4 }}>Pension</span>
                  {pension.on && <span style={{ fontSize:".7rem", color:GR, marginLeft:"auto", fontWeight:600 }}>approx {fmt(pensionMo)}/mo at retirement</span>}
                </div>
                {pension.on && (
                  <div className="eic-f">
                    <label className="fld">Monthly Benefit<NI value={pension.monthly} min={0} step={50} prefix="$" onChange={v => setPension(s => ({...s, monthly:v}))}/></label>
                    <label className="fld">Starts Age<NI value={pension.startAge} min={40} max={80} step={1} onChange={v => setPension(s => ({...s, startAge:v}))}/></label>
                    <label className="fld">COLA<NI value={pension.cola} min={0} max={10} step={.1} suffix="%/yr" onChange={v => setPension(s => ({...s, cola:v}))}/></label>
                  </div>
                )}
              </div>
              <div className="eic">
                <div className="eic-hdr">
                  <Toggle on={ss.on} onChange={v => setSS(s => ({...s, on:v}))}/>
                  <span style={{ fontWeight:700, fontSize:".88rem", color:N, marginLeft:4 }}>Social Security</span>
                  {ss.on && <span style={{ fontSize:".7rem", color:GR, marginLeft:"auto", fontWeight:600 }}>approx {fmt(ssMo)}/mo at retirement</span>}
                </div>
                {ss.on && (
                  <div className="eic-f">
                    <label className="fld">Est. Monthly<NI value={ss.monthly} min={0} step={50} prefix="$" onChange={v => setSS(s => ({...s, monthly:v}))}/></label>
                    <label className="fld">Starts Age<NI value={ss.startAge} min={62} max={70} step={1} onChange={v => setSS(s => ({...s, startAge:v}))}/></label>
                    <label className="fld">COLA<NI value={ss.cola} min={0} max={5} step={.1} suffix="%/yr" onChange={v => setSS(s => ({...s, cola:v}))}/></label>
                  </div>
                )}
              </div>
            </div>
          </Card>

          {/* Tax and Withdrawal */}
          <Card title="Tax and Withdrawal Assumptions" accent={MU}>
            <div style={{ display:"flex", flexDirection:"column", gap:".85rem" }}>
              <div>
                <label className="fld" style={{ marginBottom:".4rem" }}>Marginal Tax Rate — Pre-Tax Withdrawals</label>
                <SlN value={taxRate} min={0} max={50} step={1} suffix="%" color={PT} onChange={setTaxRate}/>
                <div className="hint">Common: 12%, 22%, 24%. Most retirees 12–22%.</div>
              </div>
              <div>
                <label className="fld" style={{ marginBottom:".4rem" }}>Long-Term Capital Gains — Taxable Accounts</label>
                <SlN value={ltcgRate} min={0} max={25} step={1} suffix="%" color={TXC} onChange={setLtcgRate}/>
                <div className="hint">0% (under $47k income), 15% (most), 20% (high earners). Roth always 0%.</div>
              </div>
              <div>
                <label className="fld" style={{ marginBottom:".4rem" }}>Annual Withdrawal Rate</label>
                <SlN value={wRate} min={1} max={10} step={.1} suffix="%" color={wRate<=4?GR:wRate<=5.5?AM:RD} onChange={setWRate}/>
                <div style={{ display:"flex", gap:".4rem", flexWrap:"wrap", marginTop:".5rem" }}>
                  {[{v:3,l:"3%"},{v:4,l:"4% Classic"},{v:5,l:"5%"},{v:7,l:"7%"}].map(r => {
                    const c = r.v<=4?GR:r.v<=5?AM:RD;
                    return (
                      <button key={r.v} onClick={() => setWRate(r.v)}
                        style={{ fontSize:".7rem", padding:".22rem .6rem", borderRadius:5, border:`1.5px solid ${c}55`, background:c+"15", color:c, cursor:"pointer", fontFamily:"'DM Sans',sans-serif", fontWeight:600 }}>
                        {r.l}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </Card>

        </div>{/* end left-col */}

        {/* ═══ RIGHT COLUMN ═══ */}
        <div className="right-col">

          {/* Wealth Map */}
          <Card title="Wealth Map" sub="Your complete household financial picture" accent={N}>
            <WealthMap persons={persons} allA={allA} baseTotal={baseTotal}
              basePT={basePT} baseRT={baseRT} baseTX={baseTX}
              pension={pension} pensionMo={pensionMo} ss={ss} ssMo={ssMo}
              totalNetAnnual={totalNetAnnual} />
          </Card>

          {/* Goal Income — backward mode only */}
          {mode==="backward" && (
            <Card title="Goal Income" accent={GR} sub="What income do you want in retirement?">
              <div style={{ marginBottom:"1rem" }}>
                <Seg opts={[{v:"estimate",l:"Help Me Estimate"},{v:"manual",l:"I Know My Number"}]} val={goalMode} onChange={setGoalMode}/>
              </div>
              {goalMode==="manual" ? (
                <div>
                  <label className="fld" style={{ marginBottom:".5rem" }}>
                    Target Annual Income (today dollars)
                    <div className="hint">We inflate this to your retirement date automatically.</div>
                  </label>
                  <SlN value={goalManual} min={20000} max={500000} step={1000} prefix="$" suffix="/yr" color={GR} onChange={setGoalManual}/>
                  <div style={{ display:"flex", gap:".4rem", flexWrap:"wrap", marginTop:".6rem" }}>
                    {[{v:totalSal*.6,l:"60% of salary"},{v:totalSal*.8,l:"80% of salary"},{v:totalSal,l:"100% of salary"}].map(r => (
                      <button key={r.v} onClick={() => setGoalManual(Math.round(r.v))}
                        style={{ fontSize:".7rem", padding:".22rem .65rem", borderRadius:5, border:`1.5px solid ${B}44`, background:B+"15", color:B, cursor:"pointer", fontFamily:"'DM Sans',sans-serif", fontWeight:500 }}>
                        {r.l}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div style={{ display:"flex", flexDirection:"column", gap:".85rem" }}>
                  <div className="info">Estimate your monthly expenses in retirement. We total and inflate to retirement date.</div>
                  {[
                    { l:"Housing",                v:goalHousing, set:setGoalHousing, hint:"Paid off? Enter HOA/taxes/insurance only.", max:10000 },
                    { l:"Healthcare and Insurance",v:goalHealth,  set:setGoalHealth,  hint:"Medicare plus supplemental avg $500–800/mo.", max:5000 },
                    { l:"Travel and Leisure",      v:goalTravel,  set:setGoalTravel,  hint:"Vacations, hobbies, dining out.", max:5000 },
                    { l:"Food, Utilities, Other",  v:goalOther,   set:setGoalOther,   hint:"Groceries, utilities, subscriptions.", max:5000 },
                  ].map(f => (
                    <div key={f.l}>
                      <label className="fld" style={{ marginBottom:".3rem" }}>{f.l}</label>
                      <SlN value={f.v} min={0} max={f.max} step={50} prefix="$" suffix="/mo" color={GR} onChange={f.set}/>
                      <div className="hint">{f.hint}</div>
                    </div>
                  ))}
                  <div style={{ background:S, border:`1px solid ${BD}`, borderRadius:8, padding:".75rem 1rem" }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline" }}>
                      <span style={{ fontSize:".78rem", color:MU }}>Monthly today</span>
                      <span style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:700, color:TX }}>{fmt(goalHousing+goalHealth+goalTravel+goalOther)}/mo</span>
                    </div>
                    <label className="fld" style={{ marginTop:".65rem", marginBottom:".3rem" }}>
                      Inflation Rate
                      <div className="hint">Inflates today expenses to retirement date ({maxRetYrs} yrs away).</div>
                    </label>
                    <SlN value={goalInflation} min={0} max={6} step={.1} suffix="%/yr" color={AM} onChange={setGoalInflation}/>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", marginTop:".65rem", paddingTop:".65rem", borderTop:`1px solid ${BD}` }}>
                      <span style={{ fontSize:".78rem", color:MU, fontWeight:600 }}>Estimated at retirement</span>
                      <span style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:700, color:N, fontSize:"1rem" }}>{fmt(goalEstimated/12)}/mo</span>
                    </div>
                  </div>
                </div>
              )}
            </Card>
          )}

          {/* Gap Analysis — backward mode only */}
          {mode==="backward" && (
            <Card title="Gap Analysis" accent={onTrack?GR:RD} sub="What you have vs. what you need">
              <div style={{ borderRadius:10, padding:"1rem 1.25rem", marginBottom:"1rem",
                background:onTrack?"#F0FDF4":gap>reqPortfolio*.5?"#FEF2F2":"#FFFBEB",
                border:`1.5px solid ${onTrack?GR+"55":gap>reqPortfolio*.5?RD+"55":AM+"55"}` }}>
                <div style={{ display:"flex", alignItems:"flex-start", gap:".65rem" }}>
                  <span style={{ fontSize:"1.5rem", lineHeight:1 }}>{onTrack?"✅":"⚠️"}</span>
                  <div>
                    <div style={{ fontWeight:700, fontSize:".95rem", color:onTrack?"#14532D":gap>reqPortfolio*.5?"#7F1D1D":"#78350F" }}>
                      {onTrack
                        ? `On track! Projected surplus of ${fmtK(Math.abs(gap))}.`
                        : `Portfolio gap of ${fmtK(Math.abs(gap))} to fund your goal.`}
                    </div>
                    <div style={{ fontSize:".78rem", marginTop:4, color:MU }}>
                      {onTrack
                        ? `Your projected ${fmtK(baseTotal)} exceeds the ${fmtK(reqPortfolio)} needed to fund ${fmt(goalEstimated/12)}/mo.`
                        : `You need ${fmtK(reqPortfolio)} at retirement. You are projected to have ${fmtK(baseTotal)}.`}
                    </div>
                  </div>
                </div>
              </div>
              <GapMeter have={baseTotal}       need={reqPortfolio}   label="Portfolio Funded"/>
              <GapMeter have={totalNetAnnual}  need={goalEstimated}  label="Income Funded"/>
              {!onTrack && (
                <div style={{ marginTop:"1rem" }}>
                  <div style={{ fontWeight:700, fontSize:".82rem", color:N, marginBottom:".6rem" }}>To Close the Gap You Could…</div>
                  {[
                    { icon:"💰", label:`Save an extra ${fmt(additionalNeeded)}/mo`,   desc:`Bring total monthly savings to ${fmt(streams.total+additionalNeeded)}/mo` },
                    { icon:"📅", label:"Retire a few years later",                    desc:"More compounding time. Use the What-If Explorer below to find the right age." },
                    { icon:"🎯", label:`Reduce goal to ${fmt(totalNetAnnual/12)}/mo`, desc:"Match current trajectory — adjust lifestyle expectations." },
                    { icon:"📊", label:"Lower your withdrawal rate",                  desc:"Reduces monthly income but extends portfolio longevity significantly." },
                  ].map((a, i) => (
                    <div key={i} style={{ display:"flex", gap:".75rem", alignItems:"flex-start", padding:".75rem", background:i%2===0?S:"#fff", borderRadius:8, marginBottom:".4rem", border:`1px solid ${BD}` }}>
                      <span style={{ fontSize:"1.25rem", lineHeight:1, flexShrink:0 }}>{a.icon}</span>
                      <div>
                        <div style={{ fontWeight:600, fontSize:".82rem", color:TX }}>{a.label}</div>
                        <div style={{ fontSize:".72rem", color:MU, marginTop:2 }}>{a.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          {/* Savings Overview */}
          <Card title="Savings Overview" accent={B}>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(145px,1fr))", gap:".65rem" }}>
              {[
                { l:"Gross Income",      v:fmt(totalSal),           c:N },
                { l:"Monthly Saving",    v:fmt(streams.total)+"/mo", c:B },
                { l:"Pre-Tax Monthly",   v:fmt(streams.pt)+"/mo",    c:PT },
                { l:"Roth Monthly",      v:fmt(streams.rt)+"/mo",    c:RT },
                { l:"Savings Rate",      v:pct(savRate),             c:savRate>=15?GR:savRate>=10?AM:RD, bar:true },
                { l:"Pre-Tax at Retire", v:fmtK(basePT),             c:PT },
                { l:"Roth at Retire",    v:fmtK(baseRT),             c:RT },
                { l:"Taxable at Retire", v:fmtK(baseTX),             c:TXC },
                { l:"Total Portfolio",   v:fmtK(baseTotal),          c:N },
              ].map(s => (
                <div key={s.l} className="stat">
                  <div className="sl">{s.l}</div>
                  <div className="sv" style={{ color:s.c }}>{s.v}</div>
                  {s.bar && <div className="sbar2"><div className="sbar2f" style={{ width:`${cl(savRate*3,0,100)}%`, background:s.c }}/></div>}
                </div>
              ))}
            </div>
          </Card>

          {/* Growth Projection */}
          <Card title="Growth Projection"
            right={
              <div className="chart-tabs">
                <button className={"chart-tab"+(chartTab==="accum"?" on":"")} onClick={() => setChartTab("accum")}>To Retirement</button>
                <button className={"chart-tab"+(chartTab==="lifetime"?" on":"")} onClick={() => setChartTab("lifetime")}>Full Lifetime</button>
              </div>
            }>
            <div style={{ fontSize:".76rem", color:MU, marginBottom:".85rem" }}>
              {chartTab==="accum" ? (
                <>
                  {CY} to {CY+maxRetYrs} &nbsp;·&nbsp;
                  <strong style={{ color:PT }}>Pre-Tax {fmtK(basePT)}</strong> &nbsp;·&nbsp;
                  <strong style={{ color:RT }}>Roth {fmtK(baseRT)}</strong> &nbsp;·&nbsp;
                  <strong style={{ color:TXC }}>Taxable {fmtK(baseTX)}</strong> &nbsp;·&nbsp;
                  <strong style={{ color:N }}>Total {fmtK(baseTotal)}</strong>
                </>
              ) : (
                <>Accumulation plus drawdown at {wRate}% withdrawal through age {p0.lifeExp}</>
              )}
            </div>
            <ResponsiveContainer width="100%" height={320}>
              <AreaChart data={chartRows} margin={{ top:6, right:8, left:8, bottom:0 }}>
                <defs>
                  {[[PT,"PT"],[RT,"RT"],[TXC,"TX"]].map(([c,k]) => (
                    <linearGradient key={k} id={`g${k}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={c} stopOpacity={.2}/>
                      <stop offset="95%" stopColor={c} stopOpacity={.02}/>
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={BD}/>
                <XAxis dataKey={xKey} stroke={BD} tick={{ fill:MU, fontSize:11 }} tickFormatter={xFmt} interval={xInt}/>
                <YAxis stroke={BD} tick={{ fill:MU, fontSize:11 }} tickFormatter={fmtK} width={75}/>
                <Tooltip content={<ChartTip isAge={chartTab==="lifetime"}/>}/>
                <Legend wrapperStyle={{ fontSize:".72rem", paddingTop:"1rem" }}/>
                <Area type="monotone" dataKey="PT" name="Pre-Tax" stackId="1" stroke={PT}  fill="url(#gPT)" strokeWidth={2}/>
                <Area type="monotone" dataKey="RT" name="Roth"    stackId="1" stroke={RT}  fill="url(#gRT)" strokeWidth={2}/>
                <Area type="monotone" dataKey="TX" name="Taxable" stackId="1" stroke={TXC} fill="url(#gTX)" strokeWidth={2}/>
                {mode==="backward" && reqPortfolio>0 && chartTab==="accum" && (
                  <ReferenceLine y={reqPortfolio} stroke={GR} strokeDasharray="5 3"
                    label={{ value:"Goal", position:"insideTopRight", fill:GR, fontSize:11, fontWeight:700 }}/>
                )}
                {chartTab==="accum" && (
                  <ReferenceLine x={maxRetYrs} stroke={AM} strokeDasharray="5 3"
                    label={{ value:"Retire", position:"insideTopRight", fill:AM, fontSize:11, fontWeight:600 }}/>
                )}
                {chartTab==="lifetime" && (
                  <ReferenceLine x={p0.retireAge} stroke={AM} strokeDasharray="5 3"
                    label={{ value:"Retire", position:"insideTopRight", fill:AM, fontSize:11, fontWeight:600 }}/>
                )}
              </AreaChart>
            </ResponsiveContainer>
            {chartTab==="lifetime" && lifeRows.length>0 && lifeRows[lifeRows.length-1].TOT===0 && (
              <div className="warn" style={{ marginTop:".85rem" }}>
                Warning: Portfolio depletes before age {p0.lifeExp} at {wRate}% withdrawal. Consider reducing the rate or increasing savings.
              </div>
            )}
          </Card>

          {/* Income Breakdown */}
          <Card title="Retirement Income Breakdown" sub={`At ${wRate}% withdrawal — ${taxRate}% tax on pre-tax — ${ltcgRate}% LTCG on taxable`}>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(170px,1fr))", gap:".75rem", marginBottom:"1rem" }}>
              {[
                { l:"Pre-Tax Accounts",  g:portIncome.pt/(1-taxRate/100+.001), n:portIncome.pt, sub:`after ${taxRate}% tax`,    c:PT,  bg:"#EFF6FF" },
                { l:"Roth Accounts",     g:portIncome.rt,                      n:portIncome.rt, sub:"tax-free",                  c:RT,  bg:"#ECFDF5" },
                { l:"Taxable Brokerage", g:portIncome.tx/(1-ltcgRate/100+.001),n:portIncome.tx, sub:`after ${ltcgRate}% LTCG`,  c:TXC, bg:"#FFFBEB" },
                ...(pension.on ? [{ l:"Pension",        g:pensionMo*12, n:pensionMo*12, sub:`${pension.cola}% COLA, age ${pension.startAge}`, c:PS,  bg:"#F5F3FF" }] : []),
                ...(ss.on      ? [{ l:"Social Security", g:ssMo*12,     n:ssMo*12,      sub:`${ss.cola}% COLA, age ${ss.startAge}`,           c:SSC, bg:"#F0FDFA" }] : []),
              ].map(b => (
                <div key={b.l} className="ib" style={{ background:b.bg, borderColor:b.c+"44" }}>
                  <div className="ib-l" style={{ color:b.c }}>{b.l}</div>
                  <div className="ib-g">Gross: {fmt(b.g)}/yr</div>
                  <div className="ib-n" style={{ color:b.c }}>{fmt(b.n)}/yr</div>
                  <div className="ib-s">{fmt(b.n/12)}/mo — {b.sub}</div>
                </div>
              ))}
            </div>
            <div className="grand">
              <div><div className="gl">Total Annual (Net)</div><div className="gv">{fmt(totalNetAnnual)}</div><div className="gs">after all taxes</div></div>
              <div><div className="gl">Total Monthly (Net)</div><div className="gv">{fmt(totalNetMonthly)}</div><div className="gs">after all taxes</div></div>
              <div><div className="gl">Income Replacement</div><div className="gv">{totalSal>0?pct(totalNetAnnual/totalSal*100):"—"}</div><div className="gs">target 80% or more</div></div>
            </div>
          </Card>

          {/* What-If Explorer */}
          <Card title="What-If Explorer" sub="Model changes and see the retirement impact instantly">
            <div className="wi-tabs">
              {[
                { v:"monthly",  l:"💰 Save More Monthly"  },
                { v:"lumpsum",  l:"🏦 Invest Cash Now"    },
                { v:"retire",   l:"📅 Retire Earlier/Later"},
                { v:"growth",   l:"📈 Change Return Rate"  },
                { v:"combined", l:"⚡ Combined Scenarios"  },
              ].map(t => (
                <button key={t.v} className="wi-tab" onClick={() => setWiTab(t.v)}
                  style={{ background:wiTab===t.v?N:"transparent", color:wiTab===t.v?"#fff":MU }}>
                  {t.l}
                </button>
              ))}
            </div>

            {wiTab==="monthly" && (
              <div>
                <div className="info" style={{ marginBottom:".75rem" }}>Extra monthly savings split 60% pre-tax, 30% Roth, 10% taxable across your existing accounts.</div>
                <WIHead/>
                {whatIfMonthly.map(r => (
                  <WIRow key={r.extra} {...wiShared}
                    label={r.extra===0 ? "Current Plan" : `+${fmt(r.extra)}/mo more`}
                    portfolio={r.portfolio} income={r.income} isBase={r.extra===0}/>
                ))}
              </div>
            )}

            {wiTab==="lumpsum" && (
              <div>
                <div className="info" style={{ marginBottom:".75rem" }}>Invest a one-time lump sum today — savings, bonus, inheritance, or proceeds from selling an asset. Invested proportionally across your accounts.</div>
                <div style={{ display:"flex", gap:".5rem", alignItems:"center", marginBottom:".85rem", flexWrap:"wrap" }}>
                  <span style={{ fontSize:".72rem", color:MU, fontWeight:600 }}>Custom amount:</span>
                  <NI value={wiLumpSum} min={0} max={2000000} step={1000} prefix="$" onChange={setWiLumpSum} style={{ maxWidth:160 }}/>
                  <span style={{ fontSize:".72rem", color:GR, fontWeight:600 }}>
                    Portfolio: {fmtK(scenarioResult(0,wiLumpSum,0,null).portfolio)} — Income: {fmt(scenarioResult(0,wiLumpSum,0,null).income/12)}/mo
                  </span>
                </div>
                <WIHead/>
                {whatIfLumpSum.map(r => (
                  <WIRow key={r.lump} {...wiShared}
                    label={r.lump===0 ? "No extra cash" : `Invest ${fmtK(r.lump)} today`}
                    portfolio={r.portfolio} income={r.income} isBase={r.lump===0}/>
                ))}
              </div>
            )}

            {wiTab==="retire" && (
              <div>
                <div className="info" style={{ marginBottom:".75rem" }}>Working longer gives investments more time to compound and reduces the drawdown period. Retiring earlier does the opposite.</div>
                <WIHead/>
                {whatIfRetireAge.map(r => (
                  <WIRow key={r.age} {...wiShared}
                    label={r.age===p0.retireAge ? `Age ${r.age} (Current)` : `Retire at Age ${r.age}`}
                    portfolio={r.portfolio} income={r.income} isBase={r.age===p0.retireAge}/>
                ))}
              </div>
            )}

            {wiTab==="growth" && (
              <div>
                <div className="info" style={{ marginBottom:".75rem" }}>Different return rates model different portfolio strategies. Base: 7%/yr. Conservative (bond-heavy) near 5%. Aggressive (equity-heavy) near 9–10%.</div>
                <WIHead/>
                {whatIfGrowth.map(r => (
                  <WIRow key={r.adj} {...wiShared}
                    label={`${r.rate}%/yr${r.adj===0?" (Current)":r.adj<0?" (Conservative)":r.adj<=1?" (Moderate)":r.adj<=2?" (Strong)":" (Aggressive)"}`}
                    portfolio={r.portfolio} income={r.income} isBase={r.adj===0}/>
                ))}
              </div>
            )}

            {wiTab==="combined" && (
              <div>
                <div className="info" style={{ marginBottom:".75rem" }}>Combinations of extra monthly savings and a one-time lump sum — showing how these levers compound together over your time horizon.</div>
                <WIHead/>
                {whatIfCombined.map((r, i) => (
                  <WIRow key={i} {...wiShared}
                    label={r.label} portfolio={r.portfolio} income={r.income} isBase={i===0}/>
                ))}
              </div>
            )}

            {mode==="backward" && !onTrack && (
              <div className="success" style={{ marginTop:"1rem" }}>
                To hit {fmt(goalEstimated/12)}/mo you need approximately {fmt(additionalNeeded)}/mo more in contributions ({pct(additionalNeeded/Math.max(totalSal/12,1)*100)} of monthly salary). Use the tabs above to find your path.
              </div>
            )}
          </Card>

          <div className="footer">
            For personal educational use only. Projections use monthly compounding and do not account for inflation, RMDs, state taxes, Medicare premiums, or sequence-of-returns risk.<br/>
            Pension and Social Security shown in nominal dollars with COLA adjustments. This tool does not constitute financial advice. Consult a qualified financial planner.
          </div>

        </div>{/* end right-col */}
        </div>{/* end layout */}
      </div>
      </div>
    </>
  );
}
