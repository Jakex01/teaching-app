output "ip_address" {
  description = "Point app.<domain> and sync.<domain> here (Terraform does it when domain and dns_zone are set)."
  value       = google_compute_address.web.address
}

output "ssh" {
  description = "SSH through Identity-Aware Proxy."
  value       = "gcloud compute ssh ${google_compute_instance.app.name} --zone ${var.zone} --tunnel-through-iap"
}

output "backup_bucket" {
  value = google_storage_bucket.backups.name
}
