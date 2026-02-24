// ─── AGENT SUBSYSTEM ────────────────────────────────────────────────────────

export type AgentStatus = 'active' | 'sleeping' | 'suspended' | 'terminated'

export interface Agent {
  agent_id: string
  role_name: string
  display_name: string
  system_prompt: string
  operational_status: AgentStatus
  financial_authority_limit: number
  database_role: string
  avatar_emoji: string
  created_at: string
  updated_at: string
}

export interface AgentSkill {
  skill_id: string
  agent_id: string
  skill_name: string
  domain_knowledge: string
  activation_condition: Record<string, unknown>
  created_at: string
}

export interface McpTool {
  tool_id: string
  tool_name: string
  semantic_description: string
  input_schema: Record<string, unknown>
  execution_handler: 'plpgsql_function' | 'edge_function' | 'external_api'
  target_endpoint: string
  is_active: boolean
  created_at: string
}

export interface AgentConstraint {
  constraint_id: string
  target_agent_role: string
  target_table: string
  triggering_operation: 'INSERT' | 'UPDATE' | 'DELETE'
  logic_ast: Record<string, unknown>
  violation_message: string
  is_active: boolean
  created_at: string
}

export interface TaskEvent {
  event_id: string
  event_type: string
  target_agent: string | null
  payload: Record<string, unknown>
  status: 'pending' | 'processing' | 'completed' | 'failed'
  priority: number
  error_message: string | null
  created_at: string
  processed_at: string | null
}

// ─── FINANCE ─────────────────────────────────────────────────────────────────

export type AccountClassification = 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Expense'

export interface Account {
  account_id: string
  account_code: string
  account_name: string
  account_classification: AccountClassification
  parent_account_id: string | null
  currency_code: string
  is_active: boolean
  description: string | null
  created_at: string
}

export interface FinancialTransaction {
  transaction_id: string
  executing_agent_id: string
  posted_timestamp: string
  semantic_description: string
  source_document_type: string | null
  source_document_reference: string | null
  currency_code: string
  is_reversed: boolean
  created_at: string
}

export interface JournalEntry {
  entry_id: string
  transaction_id: string
  account_id: string
  absolute_amount: number
  is_credit_entry: boolean
  memo: string | null
  created_at: string
}

// ─── SUPPLY CHAIN ─────────────────────────────────────────────────────────────

export interface Product {
  product_id: string
  stock_keeping_unit: string
  product_name: string
  category: string | null
  standard_unit_cost: number
  standard_sale_price: number
  requires_refrigeration: boolean
  unit_of_measure: string
  is_active: boolean
  description: string | null
  created_at: string
  updated_at: string
}

export interface Warehouse {
  warehouse_id: string
  facility_name: string
  location_address: string | null
  is_climate_controlled: boolean
  maximum_capacity_volume: number
  current_used_volume: number
  is_active: boolean
  created_at: string
}

export interface Inventory {
  inventory_record_id: string
  product_id: string
  warehouse_id: string
  current_quantity_available: number
  reorder_point: number
  calculated_safety_stock: number
  max_stock_level: number
  last_counted_at: string
}

export interface InventoryWithDetails extends Inventory {
  product_name: string
  stock_keeping_unit: string
  requires_refrigeration: boolean
  category: string | null
  facility_name: string
  is_climate_controlled: boolean
  standard_unit_cost: number
}

export interface Supplier {
  supplier_id: string
  company_name: string
  contact_email: string | null
  contact_phone: string | null
  payment_terms: string
  lead_time_days: number
  reliability_score: number
  is_preferred: boolean
  is_active: boolean
  notes: string | null
  created_at: string
  updated_at: string
}

export interface PurchaseOrder {
  purchase_order_id: string
  supplier_id: string
  executing_agent_id: string
  order_status: string
  expected_delivery_date: string | null
  total_order_value: number
  currency_code: string
  notes: string | null
  created_at: string
  updated_at: string
}

// ─── SALES ────────────────────────────────────────────────────────────────────

export type CustomerTier = 'standard' | 'silver' | 'gold' | 'platinum'

export interface Customer {
  customer_id: string
  customer_name: string
  company_name: string | null
  contact_email: string | null
  contact_phone: string | null
  billing_address: string | null
  maximum_credit_limit: number
  current_balance: number
  account_status: 'active' | 'on_hold' | 'suspended' | 'closed'
  customer_tier: CustomerTier
  created_at: string
  updated_at: string
}

export interface SalesOrder {
  sales_order_id: string
  customer_id: string
  closing_agent_id: string
  order_status: string
  total_invoice_value: number
  discount_percent: number
  currency_code: string
  shipping_address: string | null
  order_creation_date: string
  required_delivery_date: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

// ─── HR ───────────────────────────────────────────────────────────────────────

export interface Department {
  department_id: string
  department_name: string
  department_code: string
  parent_dept_id: string | null
  cost_center: string | null
  budget_annual: number
  head_agent_id: string | null
  created_at: string
}

export interface Employee {
  employee_id: string
  department_id: string
  reporting_manager_id: string | null
  first_name: string
  last_name: string
  email: string
  job_title: string | null
  employment_type: 'full_time' | 'part_time' | 'contractor' | 'intern'
  employment_status: 'active' | 'on_leave' | 'suspended' | 'terminated'
  annual_base_salary: number
  hourly_rate: number | null
  official_hire_date: string
  termination_date: string | null
  created_at: string
  updated_at: string
}

export interface Timesheet {
  timesheet_record_id: string
  employee_id: string
  date_of_labor: string
  hours_worked: number
  overtime_hours: number
  work_description: string | null
  approval_status: 'pending' | 'approved' | 'rejected'
  approved_by: string | null
  created_at: string
}

export interface PayrollManifest {
  manifest_id: string
  payroll_agent_id: string
  pay_period_start: string
  pay_period_end: string
  total_gross_pay: number
  total_tax_withheld: number
  total_net_pay: number
  employee_count: number
  status: 'draft' | 'computed' | 'approved' | 'disbursed' | 'cancelled'
  finance_tx_id: string | null
  notes: string | null
  created_at: string
  disbursed_at: string | null
}
