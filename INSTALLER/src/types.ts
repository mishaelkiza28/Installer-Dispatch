export type WorkOrderStatus =
  | "unassigned"
  | "dispatched"
  | "accepted"
  | "on_site"
  | "completed"
  | "verified"
  | "cancelled";

export type Priority = "low" | "normal" | "urgent";

export interface Installer {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  area: string | null;
  notes: string | null;
  active: boolean;
  created_at: string;
}

export interface WorkOrder {
  id: string;
  ref_no: number;
  title: string;
  job_type: string | null;
  client_name: string | null;
  client_phone: string | null;
  site_address: string | null;
  district: string | null;
  scheduled_for: string | null;
  priority: Priority;
  description: string | null;
  status: WorkOrderStatus;
  assigned_to: string | null;
  installer_token: string | null;
  completion_note: string | null;
  last_declined_by: string | null;
  last_decline_reason: string | null;
  source: "console" | "import";
  created_at: string;
  updated_at: string;
  dispatched_at: string | null;
  accepted_at: string | null;
  on_site_at: string | null;
  completed_at: string | null;
  verified_at: string | null;
  cancelled_at: string | null;
  assignee?: Pick<Installer, "id" | "name" | "email" | "active"> | null;
  decliner?: Pick<Installer, "name"> | null;
}

/** Fields a dispatcher can write directly. */
export type WorkOrderInput = Pick<
  WorkOrder,
  | "title"
  | "job_type"
  | "client_name"
  | "client_phone"
  | "site_address"
  | "district"
  | "scheduled_for"
  | "priority"
  | "description"
  | "assigned_to"
>;

export interface WorkOrderEvent {
  id: number;
  work_order_id: string;
  kind: string;
  actor: "office" | "installer" | "system";
  actor_name: string | null;
  message: string | null;
  created_at: string;
}

export interface AppSettings {
  company_name: string;
  office_phone: string | null;
  office_emails: string[];
  app_url: string | null;
}

/** What the installer's job page gets back — no internal ids or tokens. */
export interface PublicJob {
  ref_no: number;
  title: string;
  job_type: string | null;
  client_name: string | null;
  client_phone: string | null;
  site_address: string | null;
  district: string | null;
  scheduled_for: string | null;
  priority: Priority;
  description: string | null;
  status: WorkOrderStatus;
  completion_note: string | null;
  installer_name: string | null;
  dispatched_at: string | null;
  accepted_at: string | null;
  on_site_at: string | null;
  completed_at: string | null;
}
