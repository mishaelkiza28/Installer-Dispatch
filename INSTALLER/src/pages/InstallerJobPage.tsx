import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { CalendarDays, CheckCircle2, MapPin, Phone, User, Wrench } from "lucide-react";
import { installerAction } from "../lib/api";
import { fmtDate, fmtDateTime, isUrl, mapsUrl, ref, siteText, telHref } from "../lib/format";
import type { PublicJob, WorkOrderStatus } from "../types";

type Action = "accept" | "decline" | "on_site" | "done";

interface Company {
  name: string;
  phone: string | null;
}

interface ViewResponse {
  ok: boolean;
  code?: string;
  error?: string;
  job?: PublicJob;
  company?: Company;
  declined?: boolean;
}

const AVAILABLE: Partial<Record<WorkOrderStatus, Action[]>> = {
  dispatched: ["accept", "decline"],
  accepted: ["on_site", "done", "decline"],
  on_site: ["done"],
};

const ACTION_UI: Record<
  Action,
  { button: string; confirmTitle: string; confirmBody: string; cta: string; noteLabel?: string; style: string; done: string }
> = {
  accept: {
    button: "Accept job",
    confirmTitle: "Accept this job?",
    confirmBody: "The office will see that you're taking it.",
    cta: "Yes, accept",
    style: "bg-[#2F8F5E] text-white",
    done: "Accepted — the office has been told. Use the buttons below when you arrive and when you finish.",
  },
  decline: {
    button: "Can't take it",
    confirmTitle: "Decline this job?",
    confirmBody: "The office will give it to someone else. Your links for this job will stop working.",
    cta: "Decline job",
    noteLabel: "Reason (optional)",
    style: "bg-white text-[#b3453b] border-2 border-[#e2b1ab]",
    done: "You've declined this job. The office will reassign it — thanks for letting them know.",
  },
  on_site: {
    button: "I'm on site",
    confirmTitle: "Mark yourself on site?",
    confirmBody: "Lets the office know work has started.",
    cta: "Yes, I'm on site",
    style: "bg-[#2d7fb0] text-white",
    done: "Marked on site. Tap Job done when you finish.",
  },
  done: {
    button: "Job done",
    confirmTitle: "Mark the job as done?",
    confirmBody: "The office will check and close it.",
    cta: "Mark as done",
    noteLabel: "Anything the office should know? (optional)",
    style: "bg-[#1c2126] text-white",
    done: "Marked done — thank you! The office will verify the work.",
  },
};

const STATUS_TEXT: Record<WorkOrderStatus, string> = {
  unassigned: "Not assigned",
  dispatched: "Waiting for your reply",
  accepted: "Accepted",
  on_site: "On site",
  completed: "Done",
  verified: "Verified by office",
  cancelled: "Cancelled",
};

export function InstallerJobPage({ token, initialAction }: { token: string; initialAction: string | null }) {
  const [state, setState] = useState<"loading" | "ready" | "inactive" | "error">("loading");
  const [job, setJob] = useState<PublicJob | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [confirming, setConfirming] = useState<Action | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "warn" | "error"; text: string } | null>(null);
  const [finished, setFinished] = useState(false); // declined — nothing more to do

  useEffect(() => {
    document.title = "Job details";
    let cancelled = false;
    installerAction<ViewResponse>(token, "view").then((res) => {
      if (cancelled) return;
      const data = res.data;
      if (data?.company) setCompany(data.company);
      if (res.ok && data?.job) {
        setJob(data.job);
        setState("ready");
        document.title = `${ref(data.job.ref_no)} · ${data.job.title}`;
        const wanted = initialAction as Action | null;
        if (wanted && ACTION_UI[wanted]) {
          if (AVAILABLE[data.job.status]?.includes(wanted)) setConfirming(wanted);
          else setMessage({ kind: "warn", text: `This job is already “${STATUS_TEXT[data.job.status]}”.` });
        }
      } else if (data?.code === "inactive") {
        setState("inactive");
      } else {
        setState("error");
        setMessage({ kind: "error", text: res.error ?? "Something went wrong" });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [token, initialAction]);

  async function run(action: Action) {
    setBusy(true);
    setMessage(null);
    const res = await installerAction<ViewResponse>(token, action, note.trim() || undefined);
    setBusy(false);
    // Drop "?a=…" so a refresh doesn't ask again
    history.replaceState(null, "", `#/job/${token}`);
    if (res.ok && res.data?.job) {
      setJob(res.data.job);
      setConfirming(null);
      setNote("");
      setMessage({ kind: "ok", text: ACTION_UI[action].done });
      if (res.data.declined) setFinished(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else if (res.data?.code === "inactive") {
      setState("inactive");
    } else {
      setConfirming(null);
      setMessage({ kind: "error", text: res.error ?? "That didn't work — please try again." });
    }
  }

  const office = company?.phone ? (
    <a href={telHref(company.phone) ?? undefined} className="font-semibold text-[#1a5fb4] underline">
      {company.phone}
    </a>
  ) : null;

  return (
    <div className="min-h-screen bg-[#f2f3f5] text-[#1c2126] font-sans">
      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
        <header className="flex items-center justify-between">
          <p className="text-xs uppercase tracking-wider text-[#6b7680]">{company?.name ?? "Job"}</p>
          {job && <p className="font-mono text-xs text-[#6b7680]">{ref(job.ref_no)}</p>}
        </header>

        {state === "loading" && <Card>Loading job…</Card>}

        {state === "inactive" && (
          <Card>
            <h1 className="text-lg font-bold">This job link is no longer active</h1>
            <p className="mt-2 text-[15px] text-[#48525a]">
              The job may have been reassigned, cancelled or declined. If you think this is a mistake, contact the office
              {office ? <> on {office}</> : null}.
            </p>
          </Card>
        )}

        {state === "error" && (
          <Card>
            <h1 className="text-lg font-bold">Couldn't load the job</h1>
            <p className="mt-2 text-[15px] text-[#48525a]">{message?.text} — check your internet connection and reload.</p>
          </Card>
        )}

        {state === "ready" && job && (
          <>
            {message && (
              <div
                className={`rounded-xl px-4 py-3 text-[15px] flex gap-2 ${
                  message.kind === "ok"
                    ? "bg-[#e6f4ec] text-[#1f5f3f]"
                    : message.kind === "warn"
                    ? "bg-[#fdf3e2] text-[#7a4f0f]"
                    : "bg-[#fbe9e7] text-[#8c2f26]"
                }`}
                role="status"
              >
                {message.kind === "ok" && <CheckCircle2 size={20} className="shrink-0 mt-0.5" />}
                <span>{message.text}</span>
              </div>
            )}

            <Card>
              <div className="flex items-center gap-2 flex-wrap">
                <StatusPill status={finished ? "unassigned" : job.status} declined={finished} />
                {job.priority === "urgent" && (
                  <span className="text-xs font-bold bg-[#E8A33D] text-[#171208] rounded-full px-2.5 py-1">URGENT</span>
                )}
              </div>
              <h1 className="text-xl font-bold mt-3 leading-snug">{job.title}</h1>
              {job.installer_name && <p className="text-sm text-[#6b7680] mt-1">Assigned to {job.installer_name}</p>}

              <div className="mt-4 space-y-3 text-[15px]">
                {job.job_type && <Line icon={<Wrench size={18} />}>{job.job_type}</Line>}
                {job.client_name && <Line icon={<User size={18} />}>{job.client_name}</Line>}
                {job.client_phone && (
                  <Line icon={<Phone size={18} />}>
                    <a href={telHref(job.client_phone) ?? undefined} className="text-[#1a5fb4] font-semibold underline">
                      {job.client_phone}
                    </a>
                  </Line>
                )}
                {(job.site_address || job.district) && (
                  <Line icon={<MapPin size={18} />}>
                    {siteText(job.site_address, job.district)}
                    {mapsUrl(job.site_address, job.district) && (
                      <>
                        {" "}
                        <a
                          href={mapsUrl(job.site_address, job.district)!}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[#1a5fb4] underline whitespace-nowrap font-semibold"
                        >
                          {isUrl(job.site_address) ? "Open pinned location" : "Open map"}
                        </a>
                      </>
                    )}
                  </Line>
                )}
                {job.scheduled_for && <Line icon={<CalendarDays size={18} />}>{fmtDate(job.scheduled_for)}</Line>}
              </div>

              {job.description && (
                <div className="mt-4 bg-[#f6f7f8] rounded-lg px-3 py-2.5 text-[15px] whitespace-pre-wrap">{job.description}</div>
              )}
            </Card>

            {!finished && confirming && (
              <Card>
                <h2 className="text-lg font-bold">{ACTION_UI[confirming].confirmTitle}</h2>
                <p className="text-[15px] text-[#48525a] mt-1">{ACTION_UI[confirming].confirmBody}</p>
                {ACTION_UI[confirming].noteLabel && (
                  <label className="block mt-3">
                    <span className="text-sm text-[#6b7680]">{ACTION_UI[confirming].noteLabel}</span>
                    <textarea
                      rows={3}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-[#d5d9de] px-3 py-2 text-[15px] focus:outline-none focus:border-[#2d7fb0]"
                    />
                  </label>
                )}
                <div className="mt-4 grid gap-2">
                  <BigButton className={ACTION_UI[confirming].style} disabled={busy} onClick={() => run(confirming)}>
                    {busy ? "Sending…" : ACTION_UI[confirming].cta}
                  </BigButton>
                  <button
                    className="py-3 text-[15px] text-[#6b7680]"
                    onClick={() => {
                      setConfirming(null);
                      history.replaceState(null, "", `#/job/${token}`);
                    }}
                    disabled={busy}
                  >
                    Back
                  </button>
                </div>
              </Card>
            )}

            {!finished && !confirming && (AVAILABLE[job.status]?.length ?? 0) > 0 && (
              <div className="grid gap-2">
                {AVAILABLE[job.status]!.map((a) => (
                  <BigButton key={a} className={ACTION_UI[a].style} onClick={() => setConfirming(a)}>
                    {a === "decline" && job.status === "accepted" ? "Can't do it any more" : ACTION_UI[a].button}
                  </BigButton>
                ))}
              </div>
            )}

            {!finished && (job.status === "completed" || job.status === "verified") && !message && (
              <Card>
                <p className="text-[15px]">
                  {job.status === "verified" ? "The office has verified this job. Nothing more to do." : "You marked this job done. The office will verify it."}
                </p>
                {job.completion_note && <p className="text-sm text-[#6b7680] mt-2">Your note: “{job.completion_note}”</p>}
              </Card>
            )}

            {!finished && (
              <ol className="text-xs text-[#6b7680] space-y-1 px-1">
                {job.dispatched_at && <li>Sent to you · {fmtDateTime(job.dispatched_at)}</li>}
                {job.accepted_at && <li>Accepted · {fmtDateTime(job.accepted_at)}</li>}
                {job.on_site_at && <li>On site · {fmtDateTime(job.on_site_at)}</li>}
                {job.completed_at && <li>Done · {fmtDateTime(job.completed_at)}</li>}
              </ol>
            )}

            {office && <p className="text-sm text-[#6b7680] px-1">Questions about this job? Call the office on {office}.</p>}
          </>
        )}
      </div>
    </div>
  );
}

function Card({ children }: { children: ReactNode }) {
  return <div className="bg-white rounded-xl border border-[#e1e4e8] p-5 shadow-sm">{children}</div>;
}

function Line({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="text-[#8a949c] mt-0.5 shrink-0">{icon}</span>
      <span>{children}</span>
    </div>
  );
}

function BigButton({
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { className?: string }) {
  return (
    <button
      {...props}
      className={`w-full rounded-xl py-4 text-[17px] font-bold shadow-sm active:scale-[0.99] transition disabled:opacity-60 ${className}`}
    />
  );
}

function StatusPill({ status, declined }: { status: WorkOrderStatus; declined?: boolean }) {
  const colors: Record<string, string> = {
    dispatched: "bg-[#fdf3e2] text-[#7a4f0f]",
    accepted: "bg-[#e3f1f9] text-[#1d5a80]",
    on_site: "bg-[#ecebfb] text-[#3d3f93]",
    completed: "bg-[#e6f4ec] text-[#1f5f3f]",
    verified: "bg-[#e6f4ec] text-[#1f5f3f]",
  };
  return (
    <span className={`text-xs font-semibold rounded-full px-2.5 py-1 ${declined ? "bg-[#fbe9e7] text-[#8c2f26]" : colors[status] ?? "bg-[#eef0f2]"}`}>
      {declined ? "Declined" : STATUS_TEXT[status]}
    </span>
  );
}
