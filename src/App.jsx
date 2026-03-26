import React, { useState, useMemo, useCallback } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

const fmt = (n) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n || 0);

const fmtK = (n) => {
  if (!n || isNaN(n) || n < 0) return "$0";
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return fmt(n);
};

const pct = (n, d = 1) => `${(+n || 0).toFixed(d)}%`;
const cl = (v, mn, mx) => Math.min(Math.max(+v || 0, mn), mx);
const CY = new Date().getFullYear();
let _id = 0;
const uid = () => `i${++_id}`;

const N = "#002677";
const B = "#0047BB";
const S = "#E8EDF8";
const BD = "#D1D9ED";
const MU = "#6B7A99";
const TX = "#0D1B3E";
const GR = "#059669";
const AM = "#D97706";
const RD = "#DC2626";
const PT = "#0047BB";
const RT = "#059669";
const TXC = "#D97706";
const PS = "#7C3AED";
const SS = "#0F766E";

const ATYPES = {
  "401k": { label: "401k / 403b", hasMatch: true, color: B },
  rira: { label: "Roth IRA", hasMatch: false, color: RT },
  tira: { label: "Trad. IRA", hasMatch: false, color: "#6366f1" },
  brok: { label: "Brokerage", hasMatch: false, color: AM },
};

function mkAcct(type, pid) {
  return {
    id: uid(),
    pid,
    type,
    label: ATYPES[type].label,
    taxType: type === "brok" ? "taxable" : type === "rira" ? "roth" : "pretax",
    balance: 0,
    empPreTaxPct: 4,
    empPreTaxDollar: 400,
    empPreTaxMode: "pct",
    empRothPct: 2,
    empRothDollar: 100,
    empRothMode: "pct",
    erPct: 50,
    erCap: 6,
    erTax: "pretax",
    mode: "dollar",
    contribDollar: 300,
    contribPct: 5,
    growth: 7,
  };
}

function mkPerson(n) {
  const p = {
    id: uid(),
    name: n === 1 ? "You" : `Person ${n}`,
    age: 35,
    retireAge: 65,
    lifeExp: 90,
    salary: n === 1 ? 85000 : 72000,
    accounts: [],
  };
  const a = mkAcct("401k", p.id);
  p.accounts = [a];
  return p;
}

function acctStreams(a, salary) {
  if (a.type === "401k") {
    const ms = salary / 12;
    const ep =
      a.empPreTaxMode === "pct"
        ? ms * (a.empPreTaxPct / 100)
        : a.empPreTaxDollar || 0;
    const er =
      a.empRothMode === "pct"
        ? ms * (a.empRothPct / 100)
        : a.empRothDollar || 0;
    const tot = ep + er;
    const cap = ms * ((a.erCap || 0) / 100);
    const match = Math.min(tot, cap) * ((a.erPct || 0) / 100);
    const ept = a.erTax === "pretax";
    return {
      pt: ep + (ept ? match : 0),
      rt: er + (ept ? 0 : match),
      tx: 0,
      total: tot + match,
    };
  }

  const mc =
    a.mode === "pct" ? (salary / 12) * (a.contribPct / 100) : a.contribDollar || 0;

  return {
    pt: a.taxType === "pretax" ? mc : 0,
    rt: a.taxType === "roth" ? mc : 0,
    tx: a.taxType === "taxable" ? mc : 0,
    total: mc,
  };
}

function projectYears(bal, dep, rate, yrs) {
  const r = rate / 100 / 12;
  let b = Math.max(0, bal || 0);
  const out = [Math.round(b)];
  for (let y = 1; y <= yrs; y++) {
    for (let m = 0; m < 12; m++) b = b * (1 + r) + dep;
    out.push(Math.round(Math.max(0, b)));
  }
  return out;
}

function drawdown(bal, wPct, gPct, yrs) {
  const r = gPct / 100 / 12;
  let b = Math.max(0, bal || 0);
  const out = [Math.round(b)];
  for (let y = 1; y <= yrs; y++) {
    const mw = (b * (wPct / 100)) / 12;
    for (let m = 0; m < 12; m++) b = Math.max(0, b * (1 + r) - mw);
    out.push(Math.round(b));
  }
  return out;
}

function requiredMonthlySaving(target, currentBal, annRate, years) {
  if (years <= 0) return 0;
  const r = annRate / 100 / 12;
  const n = years * 12;
  const fvExisting = currentBal * Math.pow(1 + r, n);
  const gap = target - fvExisting;
  if (gap <= 0) return 0;
  return (gap * r) / (Math.pow(1 + r, n) - 1);
}

function NI({ value, onChange, prefix, suffix, min = 0, max, step = 100, style, wide }) {
  return (
    <div className="ni" style={style}>
      {prefix && <span className="ni-a">{prefix}</span>}
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        style={wide ? { minWidth: 80 } : {}}
      />
      {suffix && <span className="ni-b">{suffix}</span>}
    </div>
  );
}

function SlN({ value, onChange, min, max, step, prefix, suffix, color = B }) {
  const p = cl(((value - min) / (max - min)) * 100, 0, 100).toFixed(1);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <NI
        value={value}
        onChange={(v) => onChange(cl(v, min, max))}
        prefix={prefix}
        suffix={suffix}
        min={min}
        max={max}
        step={step}
      />
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(cl(+e.target.value, min, max))}
        style={{ "--p": `${p}%`, "--c": color }}
      />
    </div>
  );
}

function Seg({ opts, val, onChange, sm }) {
  return (
    <div className="seg">
      {opts.map((o) => (
        <button
          key={o.v}
          className={"sb" + (val === o.v ? " on" : "")}
          style={{
            ...(val === o.v && o.c ? { background: o.c, borderColor: o.c } : {}),
            fontSize: sm ? ".68rem" : ".74rem",
          }}
          onClick={() => onChange(o.v)}
        >
          {o.l}
        </button>
      ))}
    </div>
  );
}

function Toggle({ on, onChange, label }) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        cursor: "pointer",
        userSelect: "none",
      }}
    >
      <span
        style={{
          position: "relative",
          display: "inline-block",
          width: 38,
          height: 21,
          flexShrink: 0,
        }}
      >
        <input
          type="checkbox"
          checked={on}
          onChange={(e) => onChange(e.target.checked)}
          style={{ opacity: 0, width: 0, height: 0, position: "absolute" }}
        />
        <span
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: 11,
            background: on ? B : BD,
            transition: "background .2s",
            border: `1px solid ${on ? B : BD}`,
          }}
        >
          <span
            style={{
              position: "absolute",
              width: 15,
              height: 15,
              borderRadius: "50%",
              background: "#fff",
              top: 2,
              left: on ? 19 : 2,
              transition: "left .2s",
              boxShadow: "0 1px 3px rgba(0,0,0,.2)",
            }}
          />
        </span>
      </span>
      {label && (
        <span style={{ fontSize: ".82rem", color: TX, fontWeight: 500 }}>{label}</span>
      )}
    </label>
  );
}

function Tip({ active, payload, label, isAge }) {
  if (!active || !payload?.length) return null;
  const hd = isAge ? `Age ${label}` : `${CY + Number(label)}`;
  const items = payload.filter((p) => (p.value || 0) >= 50);
  const total = items.reduce((s, p) => s + (p.value || 0), 0);
  return (
    <div
      style={{
        background: "#fff",
        border: `1px solid ${BD}`,
        borderRadius: 8,
        padding: "10px 14px",
        minWidth: 200,
        fontSize: 12,
        boxShadow: "0 4px 20px rgba(0,38,119,.12)",
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 13, color: N, marginBottom: 6 }}>{hd}</div>
      {items.map((p) => (
        <div
          key={p.dataKey}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 0" }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: 2,
              background: p.fill || p.color,
              flexShrink: 0,
              display: "inline-block",
            }}
          />
          <span style={{ color: MU, flex: 1, fontSize: 11 }}>{p.name}</span>
          <span
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontWeight: 600,
              color: TX,
            }}
          >
            {fmtK(p.value)}
          </span>
        </div>
      ))}
      {items.length > 1 && (
        <div
          style={{
            borderTop: `1px solid ${BD}`,
            marginTop: 5,
            paddingTop: 5,
            fontFamily: "'JetBrains Mono', monospace",
            fontWeight: 700,
            color: N,
          }}
        >
          Total: {fmtK(total)}
        </div>
      )}
    </div>
  );
}

function Card({ title, sub, children, accent, right, id }) {
  return (
    <div
      id={id}
      style={{
        background: "#fff",
        border: `1px solid ${BD}`,
        borderRadius: 12,
        marginBottom: "1.25rem",
        overflow: "hidden",
        boxShadow: "0 1px 4px rgba(0,38,119,.05)",
      }}
    >
      {title && (
        <div
          style={{
            padding: "1rem 1.4rem",
            borderBottom: `1px solid ${BD}`,
            background: S,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <div>
            <div
              style={{
                fontWeight: 700,
                fontSize: ".9rem",
                color: N,
                letterSpacing: "-.01em",
                display: "flex",
                alignItems: "center",
                gap: 7,
              }}
            >
              {accent && (
                <span
                  style={{
                    width: 3,
                    height: 16,
                    background: accent,
                    borderRadius: 2,
                    display: "inline-block",
                  }}
                />
              )}
              {title}
            </div>
            {sub && <div style={{ fontSize: ".72rem", color: MU, marginTop: 2 }}>{sub}</div>}
          </div>
          {right}
        </div>
      )}
      <div style={{ padding: "1.25rem 1.4rem" }}>{children}</div>
    </div>
  );
}

const WMC = {
  retirement: "#1D4ED8",
  nonretire: "#059669",
  income: "#7C3AED",
  liability: "#DC2626",
  insurance: "#0F766E",
};

function WMCard({ label, sub, value, type, negative }) {
  const bdr = WMC[type] || WMC.nonretire;
  return (
    <div
      style={{
        border: `1.5px solid ${bdr}`,
        borderRadius: 6,
        padding: "5px 9px",
        background: "#fff",
        minWidth: 100,
        maxWidth: 138,
        boxShadow: "0 1px 4px rgba(0,0,0,.06)",
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontSize: ".6rem",
          fontWeight: 700,
          color: bdr,
          lineHeight: 1.2,
          marginBottom: 2,
          textTransform: "uppercase",
          letterSpacing: ".03em",
        }}
      >
        {label}
      </div>
      {sub && (
        <div style={{ fontSize: ".58rem", color: MU, marginBottom: 3, lineHeight: 1.2 }}>
          {sub}
        </div>
      )}
      <div
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontWeight: 700,
          fontSize: ".8rem",
          color: negative ? WMC.liability : bdr,
        }}
      >
        {negative && "("}
        {fmtK(Math.abs(value || 0))}
        {negative && ")"}
      </div>
    </div>
  );
}

function PersonIcon({ name, color, size = 48 }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <svg width={size} height={size + 14} viewBox="0 0 40 52" fill="none">
        <circle cx="20" cy="12" r="9" fill={color} opacity=".9" />
        <path d="M4 44c0-8.837 7.163-16 16-16s16 7.163 16 16" fill={color} opacity=".9" />
      </svg>
      <div
        style={{
          fontSize: ".7rem",
          fontWeight: 700,
          color: TX,
          textAlign: "center",
          lineHeight: 1.2,
        }}
      >
        {name}
      </div>
    </div>
  );
}

function WealthMap({
  persons,
  allA,
  baseTotal,
  basePT,
  baseRT,
  baseTX,
  pension,
  pensionMo,
  ss,
  ssMo,
  totalNetAnnual,
}) {
  const totalBal = allA.reduce((s, a) => s + (a.balance || 0), 0);
  return (
    <div
      style={{
        background: "#F8FAFF",
        border: `1px solid ${BD}`,
        borderRadius: 12,
        padding: "1.1rem",
        overflowX: "auto",
      }}
    >
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: ".85rem", justifyContent: "center" }}>
        {[
          ["Retirement Asset", WMC.retirement],
          ["Non-Retirement", WMC.nonretire],
          ["Income", WMC.income],
          ["Gov’t/Insurance", WMC.insurance],
          ["Liability", WMC.liability],
        ].map(([l, c]) => (
          <div key={l} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: ".63rem", color: MU }}>
            <span
              style={{
                width: 9,
                height: 9,
                border: `2px solid ${c}`,
                borderRadius: 2,
                display: "inline-block",
                background: c + "22",
              }}
            />
            {l}
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: "1.25rem", alignItems: "center", minWidth: 480 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 5, alignItems: "flex-end" }}>
          {persons.filter((_, i) => i === 0).map((p) => (
            <React.Fragment key={p.id}>
              <WMCard label={p.name} sub="Annual Salary" value={p.salary} type="income" />
              {p.accounts.map((a) => (
                <WMCard
                  key={a.id}
                  label={a.label}
                  sub={a.taxType === "roth" ? "Roth" : a.taxType === "taxable" ? "Taxable" : "Pre-Tax"}
                  value={a.balance || 0}
                  type={["401k", "tira"].includes(a.type) ? "retirement" : a.type === "rira" ? "retirement" : "nonretire"}
                />
              ))}
            </React.Fragment>
          ))}
          <div style={{ fontSize: ".7rem", color: MU, textAlign: "right", paddingTop: 4, borderTop: `1px solid ${BD}`, width: "100%" }}>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: WMC.income }}>
              {fmt(persons[0]?.salary || 0)}/yr
            </span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, minWidth: 130 }}>
          <div style={{ fontSize: ".6rem", color: MU, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em" }}>
            Household
          </div>
          <div style={{ display: "flex", gap: 16, justifyContent: "center" }}>
            {persons.map((p, i) => (
              <PersonIcon key={p.id} name={p.name} color={[N, WMC.income, "#DB2777"][i % 3]} size={44} />
            ))}
          </div>
          <div style={{ background: N, color: "#fff", borderRadius: 8, padding: "7px 14px", textAlign: "center", width: "100%" }}>
            <div style={{ fontSize: ".58rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".05em", opacity: 0.7 }}>
              Current Portfolio
            </div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: ".95rem", marginTop: 1 }}>
              {fmtK(totalBal)}
            </div>
          </div>
          <div style={{ background: GR, color: "#fff", borderRadius: 8, padding: "7px 14px", textAlign: "center", width: "100%" }}>
            <div style={{ fontSize: ".58rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".05em", opacity: 0.8 }}>
              At Retirement
            </div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: ".95rem", marginTop: 1 }}>
              {fmtK(baseTotal)}
            </div>
            <div style={{ fontSize: ".6rem", opacity: 0.8 }}>{fmt(totalNetAnnual / 12)}/mo net</div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 5, alignItems: "flex-start" }}>
          {persons.length > 1 ? (
            persons.filter((_, i) => i > 0).map((p) => (
              <React.Fragment key={p.id}>
                <WMCard label={p.name} sub="Annual Salary" value={p.salary} type="income" />
                {p.accounts.map((a) => (
                  <WMCard
                    key={a.id}
                    label={a.label}
                    sub={a.taxType === "roth" ? "Roth" : a.taxType === "taxable" ? "Taxable" : "Pre-Tax"}
                    value={a.balance || 0}
                    type={["401k", "tira"].includes(a.type) ? "retirement" : a.type === "rira" ? "retirement" : "nonretire"}
                  />
                ))}
                <div style={{ fontSize: ".7rem", color: MU, paddingTop: 4, borderTop: `1px solid ${BD}`, width: "100%" }}>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: WMC.income }}>
                    {fmt(p.salary)}/yr
                  </span>
                </div>
              </React.Fragment>
            ))
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {pension.on && <WMCard label="Pension" sub={`${pension.cola}% COLA · Age ${pension.startAge}`} value={pension.monthly * 12} type="insurance" />}
              {ss.on && <WMCard label="Social Security" sub={`${ss.cola}% COLA · Age ${ss.startAge}`} value={ss.monthly * 12} type="insurance" />}
              {!pension.on && !ss.on && (
                <div style={{ fontSize: ".7rem", color: MU, fontStyle: "italic", padding: 8 }}>
                  Enable pension or SS
                  <br />
                  to display here
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div
        style={{
          borderTop: `1px solid ${BD}`,
          marginTop: "1rem",
          paddingTop: ".75rem",
          display: "flex",
          justifyContent: "center",
          gap: "1.25rem",
          flexWrap: "wrap",
        }}
      >
        {[
          { l: "Household Income", v: fmt(persons.reduce((s, p) => s + p.salary, 0)) + "/yr", c: WMC.income },
          { l: "Pre-Tax Balance", v: fmtK(basePT), c: WMC.retirement },
          { l: "Roth Balance", v: fmtK(baseRT), c: GR },
          { l: "Taxable Balance", v: fmtK(baseTX), c: AM },
          { l: "Total Balance", v: fmtK(totalBal), c: N },
        ].map((s) => (
          <div key={s.l} style={{ textAlign: "center" }}>
            <div style={{ fontSize: ".6rem", color: MU, textTransform: "uppercase", letterSpacing: ".04em" }}>
              {s.l}
            </div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: s.c, fontSize: ".85rem", marginTop: 2 }}>
              {s.v}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function App() {
  const [mode, setMode] = useState("forward");
  const [persons, setPersons] = useState(() => [mkPerson(1)]);
  const [wRate, setWRate] = useState(4);
  const [taxRate, setTaxRate] = useState(22);
  const [ltcgRate, setLtcgRate] = useState(15);
  const [chartTab, setChartTab] = useState("accum");
  const [pension, setPension] = useState({ on: false, monthly: 2000, startAge: 65, cola: 2 });
  const [ss, setSS] = useState({ on: false, monthly: 1800, startAge: 67, cola: 2.5 });

  const updP = (id, p) => setPersons((ps) => ps.map((x) => (x.id === id ? p : x)));
  const delP = (id) => setPersons((ps) => ps.filter((x) => x.id !== id));
  const addP = () => setPersons((ps) => [...ps, mkPerson(ps.length + 1)]);
  const updA = useCallback(
    (pid, aid, a) =>
      setPersons((ps) =>
        ps.map((p) => (p.id !== pid ? p : { ...p, accounts: p.accounts.map((x) => (x.id === aid ? a : x)) }))
      ),
    []
  );
  const delA = useCallback(
    (pid, aid) =>
      setPersons((ps) =>
        ps.map((p) => (p.id !== pid ? p : { ...p, accounts: p.accounts.filter((x) => x.id !== aid) }))
      ),
    []
  );
  const addA = (pid, type) => {
    const a = mkAcct(type, pid);
    setPersons((ps) => ps.map((p) => (p.id !== pid ? p : { ...p, accounts: [...p.accounts, a] })));
  };

  const allA = useMemo(() => persons.flatMap((p) => p.accounts.map((a) => ({ ...a, _p: p }))), [persons]);
  const totalSal = persons.reduce((s, p) => s + p.salary, 0);
  const maxRetYrs = Math.max(...persons.map((p) => Math.max(p.retireAge - p.age, 1)));
  const maxLifeYrs = Math.max(...persons.map((p) => Math.max(p.lifeExp - p.age, maxRetYrs + 2)));
  const p0 = persons[0];

  const streams = useMemo(() => {
    let pt = 0;
    let rt = 0;
    let tx = 0;
    allA.forEach((a) => {
      const s = acctStreams(a, a._p.salary);
      pt += s.pt;
      rt += s.rt;
      tx += s.tx;
    });
    return { pt, rt, tx, total: pt + rt + tx };
  }, [allA]);

  const savRate = totalSal > 0 ? (streams.total * 12 * 100) / totalSal : 0;

  const accumRows = useMemo(() => {
    const Nyrs = maxRetYrs;
    const rows = Array.from({ length: Nyrs + 1 }, (_, y) => ({ year: y }));
    let ptY = new Array(Nyrs + 1).fill(0);
    let rtY = new Array(Nyrs + 1).fill(0);
    let txY = new Array(Nyrs + 1).fill(0);

    allA.forEach((a) => {
      const s = acctStreams(a, a._p.salary);
      const g = a.growth || 7;
      const tot = Math.max(s.total, 0.001);
      const ptR = s.pt / tot;
      const rtR = s.rt / tot;
      const txR = s.tx / tot;
      const b = a.balance || 0;
      const ptA = projectYears(b * ptR, s.pt, g, Nyrs);
      const rtA = projectYears(b * rtR, s.rt, g, Nyrs);
      const txA = projectYears(b * txR, s.tx, g, Nyrs);

      ptA.forEach((v, y) => {
        rows[y][`pt_${a.id}`] = v;
        ptY[y] += v;
      });
      rtA.forEach((v, y) => {
        rows[y][`rt_${a.id}`] = v;
        rtY[y] += v;
      });
      txA.forEach((v, y) => {
        rows[y][`tx_${a.id}`] = v;
        txY[y] += v;
      });
    });

    rows.forEach((r, y) => {
      r.PT = ptY[y];
      r.RT = rtY[y];
      r.TX = txY[y];
      r.TOT = ptY[y] + rtY[y] + txY[y];
    });

    return rows;
  }, [allA, maxRetYrs]);

  const last = accumRows[accumRows.length - 1] || {};
  const basePT = last.PT || 0;
  const baseRT = last.RT || 0;
  const baseTX = last.TX || 0;
  const baseTotal = last.TOT || 0;

  const lifeRows = useMemo(() => {
    if (!accumRows.length) return [];
    const retY = maxRetYrs;
    const totY = Math.max(maxLifeYrs, retY + 2);
    const rows = [];

    for (let y = 0; y <= retY; y++) {
      const r = accumRows[y] || {};
      rows.push({
        age: p0.age + y,
        PT: r.PT || 0,
        RT: r.RT || 0,
        TX: r.TX || 0,
        TOT: r.TOT || 0,
      });
    }

    const dY = totY - retY;
    const ptD = drawdown(basePT, wRate * (basePT / Math.max(baseTotal, 1)), 5, dY);
    const rtD = drawdown(baseRT, wRate * (baseRT / Math.max(baseTotal, 1)), 5, dY);
    const txD = drawdown(baseTX, wRate * (baseTX / Math.max(baseTotal, 1)), 5, dY);

    for (let k = 1; k <= dY; k++) {
      rows.push({
        age: p0.age + retY + k,
        PT: ptD[k] || 0,
        RT: rtD[k] || 0,
        TX: txD[k] || 0,
        TOT: (ptD[k] || 0) + (rtD[k] || 0) + (txD[k] || 0),
      });
    }

    return rows;
  }, [accumRows, p0, wRate, basePT, baseRT, baseTX, baseTotal, maxRetYrs, maxLifeYrs]);

  const pensionMo = pension.on ? pension.monthly * Math.pow(1 + pension.cola / 100, Math.max(0, pension.startAge - p0.age)) : 0;
  const ssMo = ss.on ? ss.monthly * Math.pow(1 + ss.cola / 100, Math.max(0, ss.startAge - p0.age)) : 0;

  const portIncome = useMemo(() => {
    const tot = baseTotal;
    if (!tot) return { pt: 0, rt: 0, tx: 0, net: 0 };
    const gPT = tot * (wRate / 100) * (basePT / tot);
    const gRT = tot * (wRate / 100) * (baseRT / tot);
    const gTX = tot * (wRate / 100) * (baseTX / tot);
    const nPT = gPT * (1 - taxRate / 100);
    const nRT = gRT;
    const nTX = gTX * (1 - ltcgRate / 100);
    return { pt: nPT, rt: nRT, tx: nTX, net: nPT + nRT + nTX };
  }, [baseTotal, basePT, baseRT, baseTX, wRate, taxRate, ltcgRate]);

  const totalNetAnnual = portIncome.net + pensionMo * 12 + ssMo * 12;
  const totalNetMonthly = totalNetAnnual / 12;

  const chartRows = chartTab === "accum" ? accumRows : lifeRows;
  const xKey = chartTab === "accum" ? "year" : "age";
  const xFmt = (v) => (chartTab === "accum" ? `${CY + Number(v)}` : `Age ${v}`);
  const xInt = Math.max(1, Math.floor((chartTab === "accum" ? maxRetYrs : maxLifeYrs) / 8));

  const css = `
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{--N:${N};--B:${B};--S:${S};--BD:${BD};--MU:${MU};--TX:${TX}}
body{background:#EEF2FA;color:${TX};font-family:'DM Sans',sans-serif;font-size:15px;min-height:100vh}
.app{max-width:1380px;margin:0 auto;padding:0 1.5rem 5rem}
.topbar{background:${N};position:sticky;top:0;z-index:200;box-shadow:0 2px 16px rgba(0,38,119,.3)}
.topbar-inner{max-width:1380px;margin:0 auto;padding:.7rem 1.5rem;display:flex;align-items:center;gap:1rem;justify-content:space-between}
.logo-box{display:flex;align-items:center;gap:.75rem}
.logo-sq{width:34px;height:34px;background:#fff;border-radius:6px;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:14px;color:${N};letter-spacing:-.5px;flex-shrink:0}
.logo-text{color:#fff;font-weight:700;font-size:1rem}
.logo-sub{color:rgba(255,255,255,.5);font-size:.72rem;margin-top:1px}
.mode-toggle{display:flex;background:rgba(255,255,255,.12);border-radius:8px;overflow:hidden;border:1px solid rgba(255,255,255,.2)}
.mode-btn{background:none;border:none;color:rgba(255,255,255,.65);padding:.45rem 1.1rem;font-size:.82rem;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif;transition:all .15s;white-space:nowrap}
.mode-btn.active{background:#fff;color:${N}}
.layout{display:grid;grid-template-columns:400px 1fr;gap:1.5rem;margin-top:1.5rem;align-items:start}
@media(max-width:1024px){.layout{grid-template-columns:1fr}}
.left-col,.right-col{display:flex;flex-direction:column}
.ni{display:flex;align-items:stretch;background:#fff;border:1.5px solid ${BD};border-radius:7px;overflow:hidden;transition:border-color .15s}
.ni:focus-within{border-color:${B}}
.ni-a,.ni-b{padding:0 .55rem;background:${S};color:${MU};font-family:'JetBrains Mono',monospace;font-size:.75rem;display:flex;align-items:center;white-space:nowrap;flex-shrink:0}
.ni-a{border-right:1.5px solid ${BD}}.ni-b{border-left:1.5px solid ${BD}}
.ni input{background:transparent;border:none;outline:none;color:${TX};font-family:'JetBrains Mono',monospace;font-size:.88rem;padding:.42rem .55rem;width:100%;min-width:0;font-weight:500}
input[type=range]{-webkit-appearance:none;width:100%;height:4px;border-radius:2px;outline:none;cursor:pointer;background:linear-gradient(to right,var(--c,${B}) 0%,var(--c,${B}) var(--p,50%),${BD} var(--p,50%),${BD} 100%)}
input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:16px;height:16px;border-radius:50%;background:var(--c,${B});border:2.5px solid #fff;box-shadow:0 0 0 2px var(--c,${B})44,0 1px 4px rgba(0,0,0,.1)}
label.fld{display:flex;flex-direction:column;gap:.3rem;font-size:.7rem;color:${MU};font-weight:600;letter-spacing:.03em;text-transform:uppercase}
.seg{display:inline-flex;background:${S};border:1.5px solid ${BD};border-radius:7px;overflow:hidden}
.sb{background:none;border:none;color:${MU};padding:.28rem .65rem;font-size:.74rem;cursor:pointer;font-family:'DM Sans',sans-serif;font-weight:500}
.sb.on{background:${N};color:#fff}
.btn{display:inline-flex;align-items:center;gap:.35rem;padding:.4rem .9rem;border-radius:7px;border:1.5px solid;font-size:.78rem;font-weight:600;cursor:pointer;font-family:'DM Sans',sans-serif}
.btn-ghost{background:transparent;border-color:${BD};color:${MU}}
.btn-rm{background:transparent;border:1.5px solid #FECACA;color:${RD};border-radius:6px;padding:.2rem .6rem;font-size:.7rem;cursor:pointer;font-family:'DM Sans',sans-serif}
.ac{background:#fff;border:1.5px solid ${BD};border-top:3px solid var(--c,${B});border-radius:10px;padding:1rem}
.ac-top{display:flex;align-items:center;gap:.45rem;margin-bottom:.8rem;padding-bottom:.7rem;border-bottom:1px solid ${BD}}
.ac-name{font-weight:700;font-size:.85rem;color:${N}}
.ac-rm{background:none;border:none;color:${MU};cursor:pointer;font-size:.78rem;opacity:.4;padding:1px 4px;margin-left:auto}
.acf{display:grid;grid-template-columns:1fr 1fr;gap:.55rem}
.full{grid-column:1/-1}
.sb2{background:${S};border:1.5px solid ${BD};border-radius:8px;padding:.75rem}
.sb2-hdr{display:flex;align-items:center;justify-content:space-between;margin-bottom:.55rem}
.stat{background:#fff;border:1.5px solid ${BD};border-radius:9px;padding:.85rem 1rem}
.sl{font-size:.67rem;color:${MU};text-transform:uppercase;letter-spacing:.05em;font-weight:600}
.sv{font-family:'JetBrains Mono',monospace;font-size:1.15rem;font-weight:700;margin-top:.22rem;color:${TX}}
.sbar2{height:3px;background:${BD};border-radius:2px;margin-top:.45rem;overflow:hidden}
.sbar2f{height:100%;border-radius:2px}
.chart-tabs{display:flex;background:${S};border:1.5px solid ${BD};border-radius:7px;overflow:hidden}
.chart-tab{background:none;border:none;color:${MU};padding:.35rem .9rem;font-size:.76rem;cursor:pointer;font-family:'DM Sans',sans-serif;font-weight:500}
.chart-tab.on{background:${N};color:#fff}
.grand{background:${N};border-radius:12px;padding:1.25rem 1.5rem;display:grid;grid-template-columns:repeat(3,1fr);gap:1rem}
@media(max-width:600px){.grand{grid-template-columns:1fr}}
.ib{border-radius:10px;padding:1rem 1.1rem;border:1.5px solid}
.ib-l{font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em}
.ib-g{font-size:.75rem;color:${MU};margin-top:.25rem}
.ib-n{font-family:'JetBrains Mono',monospace;font-size:1.25rem;font-weight:700;margin-top:.1rem}
.ib-s{font-size:.67rem;color:${MU};margin-top:.15rem}
.add-row{display:flex;gap:.4rem;flex-wrap:wrap;margin-top:.65rem;align-items:center}
.add-lbl{font-size:.68rem;color:${MU};text-transform:uppercase;letter-spacing:.04em;font-weight:600}
.psec{margin-bottom:1.2rem}
.pname{font-weight:700;font-size:.88rem;color:${N};display:flex;align-items:center;gap:.4rem;margin-bottom:.65rem}
.pdot{width:8px;height:8px;border-radius:50%}
.pc-name{background:transparent;border:none;border-bottom:2px solid ${BD};color:${N};font-family:'DM Sans',sans-serif;font-size:1.1rem;font-weight:700;padding:.2rem 0;outline:none;flex:1;width:100%}
.pfields{display:grid;grid-template-columns:1fr 1fr;gap:.65rem;margin-top:.9rem}
.eic{background:#fff;border:1.5px solid ${BD};border-radius:10px;padding:1rem}
.eic-hdr{display:flex;align-items:center;gap:.7rem;margin-bottom:.75rem}
.eic-f{display:grid;grid-template-columns:1fr 1fr 1fr;gap:.55rem}
.footer{text-align:center;color:${MU};font-size:.68rem;margin-top:1.5rem;padding:1.25rem;background:#fff;border:1px solid ${BD};border-radius:10px;line-height:1.8}
.g2{display:grid;grid-template-columns:1fr 1fr;gap:.75rem}
@media(max-width:680px){.g2{grid-template-columns:1fr}}
`;

  return (
    <>
      <style>{css}</style>

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
            <button className={"mode-btn" + (mode === "forward" ? " active" : "")} onClick={() => setMode("forward")}>
              📈 What Can I Afford?
            </button>
            <button className={"mode-btn" + (mode === "backward" ? " active" : "")} onClick={() => setMode("backward")}>
              🎯 What Do I Need?
            </button>
          </div>

          <div style={{ color: "rgba(255,255,255,.4)", fontSize: ".72rem", textAlign: "right" }}>
            Personal use only
            <br />
            Not financial advice
          </div>
        </div>
      </div>

      <div style={{ background: "#EEF2FA", minHeight: "100vh", paddingBottom: "3rem" }}>
        <div className="app">
          <div
            style={{
              background: "#fff",
              border: `1px solid ${BD}`,
              borderRadius: 10,
              padding: ".9rem 1.25rem",
              marginTop: "1.25rem",
              marginBottom: "-.25rem",
              display: "flex",
              alignItems: "center",
              gap: "1rem",
              flexWrap: "wrap",
            }}
          >
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: "1rem", color: N }}>
                {mode === "forward" ? "Forward Planning — What Can I Afford?" : "Backward Planning — What Do I Need?"}
              </div>
              <div style={{ fontSize: ".78rem", color: MU, marginTop: 2 }}>
                {mode === "forward"
                  ? "Enter everything you have and are doing. We’ll show you what retirement could look like."
                  : "Start with your income goal. We’ll show you what it requires."}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <div className="stat" style={{ padding: ".6rem 1rem", textAlign: "center" }}>
                <div className="sl">Projected Portfolio</div>
                <div className="sv" style={{ color: N, fontSize: "1.1rem" }}>
                  {fmtK(baseTotal)}
                </div>
              </div>
              <div className="stat" style={{ padding: ".6rem 1rem", textAlign: "center" }}>
                <div className="sl">Net Monthly Income</div>
                <div className="sv" style={{ color: GR, fontSize: "1.1rem" }}>
                  {fmt(totalNetMonthly)}
                </div>
              </div>
            </div>
          </div>

          <div className="layout">
            <div className="left-col">
              <Card
                title="Your Profile"
                accent={B}
                right={
                  persons.length < 3 && (
                    <button className="btn btn-ghost" style={{ fontSize: ".72rem", padding: ".25rem .65rem" }} onClick={addP}>
                      + Add Person
                    </button>
                  )
                }
              >
                {persons.map((p, pi) => (
                  <div key={p.id} style={{ marginBottom: pi < persons.length - 1 ? "1rem" : 0 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <input className="pc-name" value={p.name} onChange={(e) => updP(p.id, { ...p, name: e.target.value })} />
                      {persons.length > 1 && (
                        <button className="btn-rm" onClick={() => delP(p.id)}>
                          ✕
                        </button>
                      )}
                    </div>
                    <div className="pfields">
                      <label className="fld">
                        Age
                        <NI value={p.age} min={18} max={79} step={1} onChange={(v) => updP(p.id, { ...p, age: cl(v, 18, 79) })} />
                      </label>
                      <label className="fld">
                        Retire At
                        <NI value={p.retireAge} min={p.age + 1} max={80} step={1} suffix="yrs" onChange={(v) => updP(p.id, { ...p, retireAge: cl(v, p.age + 1, 80) })} />
                      </label>
                      <label className="fld">
                        Life Expect.
                        <NI value={p.lifeExp} min={p.retireAge + 1} max={110} step={1} suffix="yrs" onChange={(v) => updP(p.id, { ...p, lifeExp: cl(v, p.retireAge + 1, 110) })} />
                      </label>
                      <label className="fld">
                        Annual Salary
                        <NI value={p.salary} min={0} step={1000} prefix="$" onChange={(v) => updP(p.id, { ...p, salary: v })} />
                      </label>
                    </div>
                  </div>
                ))}
              </Card>

              <Card title="Investment Accounts" accent={PT}>
                {persons.map((p, pi) => (
                  <div className="psec" key={p.id}>
                    {persons.length > 1 && (
                      <div className="pname">
                        <span className="pdot" style={{ background: [B, "#7C3AED", "#EC4899"][pi % 3] }} />
                        {p.name}
                      </div>
                    )}

                    <div style={{ display: "flex", flexDirection: "column", gap: ".75rem" }}>
                      {p.accounts.map((a) => {
                        const cfg = ATYPES[a.type];
                        return (
                          <div className="ac" key={a.id} style={{ "--c": cfg.color }}>
                            <div className="ac-top">
                              <span style={{ width: 8, height: 8, borderRadius: 2, background: cfg.color, flexShrink: 0, display: "inline-block" }} />
                              <span className="ac-name">{a.label}</span>
                              <button className="ac-rm" onClick={() => delA(p.id, a.id)}>
                                ✕
                              </button>
                            </div>

                            {a.type === "401k" ? (
                              <div className="acf">
                                <label className="fld full">
                                  Balance
                                  <NI value={a.balance} min={0} step={1000} prefix="$" onChange={(v) => updA(p.id, a.id, { ...a, balance: v })} />
                                </label>

                                <div className="sb2 full">
                                  <div className="sb2-hdr">
                                    <span style={{ fontSize: ".68rem", fontWeight: 700, color: N, textTransform: "uppercase", letterSpacing: ".04em" }}>
                                      Your Contributions
                                    </span>
                                  </div>

                                  <div className="g2">
                                    <div>
                                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: ".3rem" }}>
                                        <span style={{ fontSize: ".65rem", fontWeight: 700, color: PT, textTransform: "uppercase", letterSpacing: ".04em", background: PT + "18", padding: "1px 6px", borderRadius: 3 }}>
                                          Pre-Tax
                                        </span>
                                        <Seg opts={[{ v: "pct", l: "%" }, { v: "dollar", l: "$" }]} val={a.empPreTaxMode} onChange={(v) => updA(p.id, a.id, { ...a, empPreTaxMode: v })} sm />
                                      </div>
                                      {a.empPreTaxMode === "pct" ? (
                                        <SlN value={a.empPreTaxPct} min={0} max={50} step={0.5} suffix="% sal" color={PT} onChange={(v) => updA(p.id, a.id, { ...a, empPreTaxPct: v })} />
                                      ) : (
                                        <SlN value={a.empPreTaxDollar} min={0} max={3000} step={25} prefix="$" suffix="/mo" color={PT} onChange={(v) => updA(p.id, a.id, { ...a, empPreTaxDollar: v })} />
                                      )}
                                    </div>

                                    <div>
                                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: ".3rem" }}>
                                        <span style={{ fontSize: ".65rem", fontWeight: 700, color: RT, textTransform: "uppercase", letterSpacing: ".04em", background: RT + "18", padding: "1px 6px", borderRadius: 3 }}>
                                          Roth
                                        </span>
                                        <Seg opts={[{ v: "pct", l: "%" }, { v: "dollar", l: "$" }]} val={a.empRothMode} onChange={(v) => updA(p.id, a.id, { ...a, empRothMode: v })} sm />
                                      </div>
                                      {a.empRothMode === "pct" ? (
                                        <SlN value={a.empRothPct} min={0} max={50} step={0.5} suffix="% sal" color={RT} onChange={(v) => updA(p.id, a.id, { ...a, empRothPct: v })} />
                                      ) : (
                                        <SlN value={a.empRothDollar} min={0} max={3000} step={25} prefix="$" suffix="/mo" color={RT} onChange={(v) => updA(p.id, a.id, { ...a, empRothDollar: v })} />
                                      )}
                                    </div>
                                  </div>
                                </div>

                                <div className="sb2 full">
                                  <div className="sb2-hdr">
                                    <span style={{ fontSize: ".68rem", fontWeight: 700, color: N, textTransform: "uppercase", letterSpacing: ".04em" }}>
                                      Employer Match
                                    </span>
                                    <div style={{ display: "flex", gap: ".35rem", alignItems: "center" }}>
                                      <span style={{ fontSize: ".65rem", color: MU }}>As:</span>
                                      <Seg opts={[{ v: "pretax", l: "Pre-Tax" }, { v: "roth", l: "Roth" }]} val={a.erTax} onChange={(v) => updA(p.id, a.id, { ...a, erTax: v })} sm />
                                    </div>
                                  </div>

                                  <div className="g2">
                                    <label className="fld">
                                      Match Rate
                                      <NI value={a.erPct} min={0} max={200} step={5} suffix="%" onChange={(v) => updA(p.id, a.id, { ...a, erPct: v })} />
                                    </label>
                                    <label className="fld">
                                      Up to
                                      <NI value={a.erCap} min={0} max={20} step={0.5} suffix="% sal" onChange={(v) => updA(p.id, a.id, { ...a, erCap: v })} />
                                    </label>
                                  </div>
                                </div>

                                <label className="fld">
                                  Return
                                  <NI value={a.growth} min={0} max={20} step={0.1} suffix="%/yr" onChange={(v) => updA(p.id, a.id, { ...a, growth: v })} />
                                </label>
                              </div>
                            ) : (
                              <div className="acf">
                                {a.type !== "brok" && (
                                  <div className="full">
                                    <div style={{ fontSize: ".68rem", color: MU, textTransform: "uppercase", letterSpacing: ".04em", fontWeight: 600, marginBottom: ".3rem" }}>
                                      Tax Treatment
                                    </div>
                                    <Seg opts={[{ v: "pretax", l: "Pre-Tax" }, { v: "roth", l: "Roth" }]} val={a.taxType} onChange={(v) => updA(p.id, a.id, { ...a, taxType: v })} />
                                  </div>
                                )}

                                <label className="fld full">
                                  Balance
                                  <NI value={a.balance} min={0} step={1000} prefix="$" onChange={(v) => updA(p.id, a.id, { ...a, balance: v })} />
                                </label>

                                <label className="fld full">
                                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                    <span>Contribution</span>
                                    <Seg opts={[{ v: "dollar", l: "$/mo" }, { v: "pct", l: "% sal" }]} val={a.mode} onChange={(v) => updA(p.id, a.id, { ...a, mode: v })} sm />
                                  </div>

                                  {a.mode === "dollar" ? (
                                    <SlN value={a.contribDollar} min={0} max={3000} step={25} prefix="$" suffix="/mo" color={cfg.color} onChange={(v) => updA(p.id, a.id, { ...a, contribDollar: v })} />
                                  ) : (
                                    <SlN value={a.contribPct} min={0} max={50} step={0.5} suffix="% salary" color={cfg.color} onChange={(v) => updA(p.id, a.id, { ...a, contribPct: v })} />
                                  )}
                                </label>

                               
