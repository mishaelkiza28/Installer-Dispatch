export type WorkOrderStatus =
  | "unassigned"
  | "dispatched"
  | "acknowledged"
  | "in_progress"
  | "completed"
  | "verified"
  | "cancelled";

export type WorkOrderPriority = "low" | "normal" | "urgent";

export type NotificationChannel = "sms" | "whatsapp" | "email";

export interface Technician {
  id: string;
  name: string;
  phone_e164: string;
  whatsapp_opt_in: boolean;
  email: string | null;
  active: boolean;
  created_at: string;
}

export interface WorkOrder {
  id: string;
  title: string;
  description: string | null;
  site_address: string | null;
  priority: WorkOrderPriority;
  status: WorkOrderStatus;
  assigned_to: string | null;
  created_at: string;
  dispatched_at: string | null;
  acknowledged_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  verified_at: string | null;
  technicians?: Technician | null;
}

export interface NotificationLogEntry {
  id: string;
  work_order_id: string | null;
  technician_id: string | null;
  channel: NotificationChannel;
  direction: "outbound" | "inbound";
  body: string;
  provider_message_id: string | null;
  status: "queued" | "sent" | "delivered" | "failed" | "received";
  created_at: string;
}
