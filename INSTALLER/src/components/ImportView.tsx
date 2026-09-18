import { useMemo, useRef, useState } from "react";
import Papa from "papaparse";
import { Download, FileSpreadsheet, Upload } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { WORK_ORDER_SELECT } from "../hooks/useData";
import type { Actions } from "../hooks/useActions";
import { fmtDate, ref } from "../lib/format";
import type { Installer, Priority, WorkOrder, WorkOrderInput } from "../types";
import { Button, Select, Textarea, useToast } from "./ui";

type FieldKey =
  | "title"
  | "job_type"
  | "client_name"
  | "client_phone"
  | "site_address"
  | "district"
  | "scheduled_for"
  | "priority"
  | "description"
  | "installer";

const FIELDS: { key: FieldKey; label: string; synonyms: string[] }[] = [
  { key: "title", label: "Title", synonyms: ["title", "job", "job title", "task", "work order", "job description", "work"] },
  { key: "job_type", label: "Job type", synonyms: ["job type", "type", "category", "service", "work type"] },
  { key: "client_name", label: "Client name", synonyms: ["client name", "client", "customer name", "customer", "name", "beneficiary"] },
  {
    key: "client_phone",
    label: "Client phone",
    synonyms: ["client phone", "phone", "phone number", "telephone", "tel", "mobile", "contact", "customer phone", "msisdn"],
  },
  { key: "site_address", label: "Site / address", synonyms: ["site address", "address", "site", "location", "village", "plot", "landmark"] },
  { key: "district", label: "District / area", synonyms: ["district", "area", "region", "town", "city", "sub county", "subcounty", "parish"] },
  {
    key: "scheduled_for",
    label: "Scheduled date",
    synonyms: ["scheduled date", "scheduled", "date", "install date", "installation date", "visit date", "due date", "due"],
  },
  { key: "priority", label: "Priority", synonyms: ["priority", "urgency"] },
  { key: "description", label: "Notes", synonyms: ["notes", "note", "description", "details", "comments", "instructions", "remarks"] },
  {
    key: "installer",
    label: "Installer (email or name)",
    synonyms: ["installer email", "installer", "technician email", "technician", "assigned to", "assign to", "assignee"],
  },
];

const MAX_ROWS = 1000;

interface ParsedRow {
  line: number;
  input: WorkOrderInput | null;
  installerName: string | null;
  errors: string[];
  warnings: string[];
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function autoMap(headers: string[]): (FieldKey | "")[] {
  const result: (FieldKey | "")[] = headers.map(() => "");
  const used = new Set<FieldKey>();
  const h = headers.map(norm);
  // Longest synonyms first, so "Installer name" goes to Installer rather than Client name.
  const all = FIELDS.flatMap((f) => f.synonyms.map((syn) => ({ key: f.key, syn }))).sort(
    (a, b) => b.syn.length - a.syn.length,
  );
  for (const pass of ["exact", "contains"] as const) {
    for (const { key, syn } of all) {
      if (used.has(key)) continue;
      const idx = h.findIndex(
        (x, i) =>
          result[i] === "" && (pass === "exact" ? x === syn : syn.length > 3 && ` ${x} `.includes(` ${syn} `)),
      );
      if (idx >= 0) {
        result[idx] = key;
        used.add(key);
      }
    }
  }
  return result;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** Accepts 2026-09-21, 21/09/2026, 21-9-26, 21.09.2026, Excel serials and "21 Sep 2026". Day-first, as in Uganda. */
export function parseDate(v: string): string | null | "invalid" {
  const s = v.trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return valid(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    return valid(y, +m[2], +m[1]);
  }
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    const serial = Math.floor(+s);
    if (serial > 20000 && serial < 80000) {
      const d = new Date(Date.UTC(1899, 11, 30) + serial * 86400e3);
      return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
    }
  }
  const t = Date.parse(s);
  if (!isNaN(t)) {
    const d = new Date(t);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  return "invalid";

  function valid(y: number, mo: number, d: number): string | "invalid" {
    const dt = new Date(Date.UTC(y, mo - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return "invalid";
    return `${y}-${pad(mo)}-${pad(d)}`;
  }
}

function parsePriority(v: string): Priority {
  const s = v.trim().toLowerCase();
  if (/urgent|high|asap|emergency|critical/.test(s)) return "urgent";
  if (/low/.test(s)) return "low";
  return "normal";
}

function matchInstaller(v: string, installers: Installer[]): Installer | null {
  const s = v.trim().toLowerCase();
  if (!s) return null;
  const byEmail = installers.find((i) => i.email.toLowerCase() === s);
  if (byEmail) return byEmail;
  const byName = installers.filter((i) => i.name.toLowerCase() === s);
  if (byName.length === 1) return byName[0];
  const starts = installers.filter((i) => i.name.toLowerCase().startsWith(s));
  return starts.length === 1 ? starts[0] : null;
}

function cellToString(c: unknown): string {
  if (c == null) return "";
  if (c instanceof Date) {
    return `${c.getUTCFullYear()}-${pad(c.getUTCMonth() + 1)}-${pad(c.getUTCDate())}`;
  }
  return String(c).trim();
}

function downloadTemplate() {
  const rows = [
    ["Title", "Job type", "Client name", "Client phone", "Site address", "District", "Scheduled date", "Priority", "Notes", "Installer email"],
    [
      "Install 200W plug-and-play kit",
      "Plug-and-play install",
      "Brenda Nakato",
      "+256772000000",
      "Plot 14, Ntinda Road",
      "Kampala",
      "21/09/2026",
      "Normal",
      "Kit serial PP-2031. Client prefers mornings.",
      "",
    ],
    ["Inverter not charging", "Repair / fault", "St. Mary's Clinic", "+256701000000", "Opposite the market", "Gulu", "22/09/2026", "Urgent", "", ""],
  ];
  const csv = Papa.unparse(rows);
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "work-orders-template.csv";
  a.click();
  URL.revokeObjectURL(a.href);
}

interface Props {
  installers: Installer[];
  actions: Actions;
  onImported: () => void;
  goToBoard: () => void;
}

export function ImportView({ installers, actions, onImported, goToBoard }: Props) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [table, setTable] = useState<string[][] | null>(null);
  const [mapping, setMapping] = useState<(FieldKey | "")[]>([]);
  const [paste, setPaste] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [done, setDone] = useState<WorkOrder[] | null>(null);
  const [dragging, setDragging] = useState(false);

  function loadTable(rows: string[][], name: string) {
    const clean = rows.map((r) => r.map(cellToString)).filter((r) => r.some((c) => c !== ""));
    if (clean.length < 2) {
      setLoadError("Couldn't find a header row and at least one job row.");
      return;
    }
    if (clean.length - 1 > MAX_ROWS) {
      setLoadError(`That's ${clean.length - 1} rows — import at most ${MAX_ROWS} at a time.`);
      return;
    }
    const width = Math.max(...clean.map((r) => r.length));
    const padded = clean.map((r) => [...r, ...Array(width - r.length).fill("")]);
    setLoadError(null);
    setDone(null);
    setFileName(name);
    setTable(padded);
    setMapping(autoMap(padded[0]));
  }

  async function onFile(file: File) {
    setLoadError(null);
    try {
      if (/\.xlsx$/i.test(file.name)) {
        const { readSheet } = await import("read-excel-file/browser");
        const data = await readSheet(file);
        loadTable(data as unknown as string[][], file.name);
      } else if (/\.(csv|txt|tsv)$/i.test(file.name)) {
        const text = await file.text();
        const res = Papa.parse<string[]>(text.replace(/^\ufeff/, ""), { skipEmptyLines: "greedy" });
        loadTable(res.data, file.name);
      } else if (/\.xls$/i.test(file.name)) {
        setLoadError("Old .xls files aren't supported — in Excel use File → Save As → .xlsx or CSV.");
      } else {
        setLoadError("Use a .xlsx or .csv file.");
      }
    } catch (e) {
      setLoadError("Couldn't read that file: " + (e instanceof Error ? e.message : String(e)));
    }
  }

  function onPaste() {
    const res = Papa.parse<string[]>(paste.trim(), { skipEmptyLines: "greedy" });
    loadTable(res.data, "Pasted rows");
  }

  const parsed: ParsedRow[] = useMemo(() => {
    if (!table) return [];
    const col = (key: FieldKey) => mapping.indexOf(key);
    const get = (row: string[], key: FieldKey) => {
      const i = col(key);
      return i >= 0 ? (row[i] ?? "").trim() : "";
    };
    return table.slice(1).map((row, idx) => {
      const errors: string[] = [];
      const warnings: string[] = [];
      const jobType = get(row, "job_type");
      const client = get(row, "client_name");
      let title = get(row, "title");
      if (!title && (jobType || client)) title = [jobType || "Job", client].filter(Boolean).join(" — ");
      if (!title) errors.push("No title (or job type / client to build one from)");

      let scheduled: string | null = null;
      const rawDate = get(row, "scheduled_for");
      if (rawDate) {
        const d = parseDate(rawDate);
        if (d === "invalid") warnings.push(`Date “${rawDate}” not understood — left blank`);
        else scheduled = d;
      }

      let installer: Installer | null = null;
      const rawInst = get(row, "installer");
      if (rawInst) {
        installer = matchInstaller(rawInst, installers);
        if (!installer) warnings.push(`Installer “${rawInst}” not found — left unassigned`);
        else if (!installer.active) {
          warnings.push(`${installer.name} is inactive — left unassigned`);
          installer = null;
        }
      }

      const input: WorkOrderInput | null = errors.length
        ? null
        : {
            title: title.slice(0, 300),
            job_type: jobType || null,
            client_name: client || null,
            client_phone: get(row, "client_phone") || null,
            site_address: get(row, "site_address") || null,
            district: get(row, "district") || null,
            scheduled_for: scheduled,
            priority: parsePriority(get(row, "priority")),
            description: get(row, "description") || null,
            assigned_to: installer?.id ?? null,
          };
      return { line: idx + 2, input, installerName: installer?.name ?? null, errors, warnings };
    });
  }, [table, mapping, installers]);

  const good = parsed.filter((p) => p.input);
  const bad = parsed.length - good.length;
  const titleMapped = mapping.includes("title") || mapping.includes("job_type") || mapping.includes("client_name");

  async function runImport() {
    setImporting(true);
    const created: WorkOrder[] = [];
    const rows = good.map((p) => ({ ...p.input!, source: "import" as const }));
    for (let i = 0; i < rows.length; i += 200) {
      const { data, error } = await supabase.from("work_orders").insert(rows.slice(i, i + 200)).select(WORK_ORDER_SELECT);
      if (error) {
        toast("error", `Import stopped after ${created.length} rows: ${error.message}`);
        break;
      }
      created.push(...((data ?? []) as WorkOrder[]));
    }
    setImporting(false);
    if (created.length) {
      created.sort((a, b) => a.ref_no - b.ref_no);
      toast("success", `${created.length} work orders imported (${ref(created[0].ref_no)}–${ref(created[created.length - 1].ref_no)})`);
      setDone(created);
      setTable(null);
      setPaste("");
      onImported();
    }
  }

  function setMap(i: number, key: FieldKey | "") {
    setMapping((m) => m.map((v, j) => (j === i ? key : key && v === key ? "" : v)));
  }

  if (done) {
    const ready = done.filter((w) => w.assigned_to);
    return (
      <div className="max-w-xl bg-surface border border-border rounded-lg p-5 space-y-4">
        <h2 className="font-display text-base">Imported {done.length} work orders</h2>
        <p className="text-sm text-muted">
          {ready.length
            ? `${ready.length} already have an installer and are ready to email. The rest are waiting in Unassigned.`
            : "They're waiting in the Unassigned column — assign installers there, then email the jobs."}
        </p>
        <div className="flex flex-wrap gap-2">
          {ready.length > 0 && (
            <Button
              variant="primary"
              onClick={() => {
                actions.dispatch(ready);
                goToBoard();
              }}
            >
              Email {ready.length} assigned job{ready.length === 1 ? "" : "s"} now
            </Button>
          )}
          <Button onClick={goToBoard}>Go to the board</Button>
          <Button variant="ghost" onClick={() => setDone(null)}>
            Import more
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {!table && (
        <div className="grid lg:grid-cols-2 gap-4">
          <div
            className={`bg-surface border-2 border-dashed rounded-lg p-6 text-center space-y-3 transition-colors ${
              dragging ? "border-accent" : "border-border"
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const f = e.dataTransfer.files?.[0];
              if (f) onFile(f);
            }}
          >
            <FileSpreadsheet className="mx-auto text-muted" size={28} />
            <p className="text-sm">Drop an Excel (.xlsx) or CSV file here</p>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.csv,.tsv,.txt"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onFile(f);
                e.target.value = "";
              }}
            />
            <div className="flex justify-center gap-2 flex-wrap">
              <Button variant="primary" onClick={() => fileRef.current?.click()}>
                <Upload size={14} /> Choose file
              </Button>
              <Button onClick={downloadTemplate}>
                <Download size={14} /> Template
              </Button>
            </div>
            <p className="text-[11px] text-muted">
              First row must be column headings. Only the first sheet is read. Up to {MAX_ROWS} rows.
            </p>
          </div>

          <div className="bg-surface border border-border rounded-lg p-4 space-y-3">
            <p className="text-sm">…or paste rows copied from Excel / Google Sheets</p>
            <Textarea
              rows={6}
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              placeholder={"Title\tClient name\tDistrict\tScheduled date\nInstall 200W kit\tBrenda Nakato\tKampala\t21/09/2026"}
              className="font-mono text-xs"
            />
            <Button onClick={onPaste} disabled={!paste.trim()}>
              Preview pasted rows
            </Button>
          </div>
        </div>
      )}

      {loadError && <p className="text-sm text-[#e7877e]">{loadError}</p>}

      {table && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-base">{fileName}</h2>
              <p className="text-xs text-muted">
                {parsed.length} rows · {good.length} ready{bad ? ` · ${bad} will be skipped` : ""}
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setTable(null)}>
                Start over
              </Button>
              <Button variant="primary" onClick={runImport} disabled={importing || !good.length || !titleMapped}>
                {importing ? "Importing…" : `Import ${good.length} work order${good.length === 1 ? "" : "s"}`}
              </Button>
            </div>
          </div>

          <div className="bg-surface border border-border rounded-lg p-4">
            <h3 className="text-xs text-muted mb-3">Match your columns</h3>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {table[0].map((h, i) => (
                <label key={i} className="flex items-center gap-2 text-sm">
                  <span className="w-32 truncate text-muted" title={h}>
                    {h || `Column ${i + 1}`}
                  </span>
                  <Select value={mapping[i] ?? ""} onChange={(e) => setMap(i, e.target.value as FieldKey | "")} className="py-1.5">
                    <option value="">— ignore —</option>
                    {FIELDS.map((f) => (
                      <option key={f.key} value={f.key}>
                        {f.label}
                      </option>
                    ))}
                  </Select>
                </label>
              ))}
            </div>
            {!titleMapped && <p className="text-xs text-[#e7877e] mt-3">Map a column to Title (or at least Job type / Client name).</p>}
          </div>

          <div className="overflow-x-auto bg-surface border border-border rounded-lg">
            <table className="w-full text-xs">
              <thead className="text-muted text-left">
                <tr className="border-b border-border">
                  <th className="px-3 py-2 font-normal">Row</th>
                  <th className="px-3 py-2 font-normal">Title</th>
                  <th className="px-3 py-2 font-normal">Client</th>
                  <th className="px-3 py-2 font-normal">Site</th>
                  <th className="px-3 py-2 font-normal">Date</th>
                  <th className="px-3 py-2 font-normal">Priority</th>
                  <th className="px-3 py-2 font-normal">Installer</th>
                  <th className="px-3 py-2 font-normal">Check</th>
                </tr>
              </thead>
              <tbody>
                {parsed.slice(0, 200).map((p) => (
                  <tr key={p.line} className="border-b border-border/60 align-top">
                    <td className="px-3 py-2 font-mono text-muted">{p.line}</td>
                    <td className="px-3 py-2">{p.input?.title ?? <span className="text-muted">—</span>}</td>
                    <td className="px-3 py-2">
                      {p.input?.client_name}
                      {p.input?.client_phone && <div className="text-muted">{p.input.client_phone}</div>}
                    </td>
                    <td className="px-3 py-2">{[p.input?.site_address, p.input?.district].filter(Boolean).join(", ")}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{fmtDate(p.input?.scheduled_for)}</td>
                    <td className="px-3 py-2">{p.input && p.input.priority !== "normal" ? p.input.priority : ""}</td>
                    <td className="px-3 py-2">{p.installerName}</td>
                    <td className="px-3 py-2">
                      {p.errors.map((e) => (
                        <div key={e} className="text-[#e7877e]">
                          ✕ {e}
                        </div>
                      ))}
                      {p.warnings.map((w) => (
                        <div key={w} className="text-[#e7b36e]">
                          ! {w}
                        </div>
                      ))}
                      {!p.errors.length && !p.warnings.length && <span className="text-status-completed">OK</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {parsed.length > 200 && <p className="text-xs text-muted px-3 py-2">Showing the first 200 of {parsed.length} rows.</p>}
          </div>
        </>
      )}
    </div>
  );
}
