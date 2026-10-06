variable "project_id" {
  description = "Google Cloud project id."
  type        = string
}

variable "region" {
  description = "Warsaw: lowest latency for Polish users and data stays in the EU."
  type        = string
  default     = "europe-central2"
}

variable "zone" {
  type    = string
  default = "europe-central2-a"
}

variable "machine_type" {
  description = "e2-medium (2 vCPU, 4 GB) runs web, sync, Postgres and Caddy comfortably."
  type        = string
  default     = "e2-medium"
}

variable "disk_size_gb" {
  type    = number
  default = 30
}

variable "domain" {
  description = "The app's domain, e.g. doodleboard.pl. Empty until it is bought: then no DNS records are made."
  type        = string
  default     = ""
}

variable "dns_zone" {
  description = "Name of the Cloud DNS zone for the domain (Cloud Domains creates one when you buy the domain)."
  type        = string
  default     = ""
}

variable "billing_account" {
  description = "Billing account id (XXXXXX-XXXXXX-XXXXXX) for the budget alert. Empty: no budget."
  type        = string
  default     = ""
}

variable "monthly_budget_pln" {
  description = "Monthly budget; e-mails go to billing admins at 50%, 90% and 100%."
  type        = number
  default     = 200
}

variable "backup_retention_days" {
  type    = number
  default = 30
}
